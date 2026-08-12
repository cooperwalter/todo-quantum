import { useCallback, useEffect, useRef, useState } from 'react';
import { load, save } from '../lib/persistence';
import { fetchRemote, pushRemote } from '../lib/remote';
import { dirtyKeyFor, syncKeyFor } from '../lib/username';
import { useApp } from '../state/AppContext';
import type { RemoteFetchResult, RemotePushResult } from '../lib/remote';
import type { AppData, StorageLike } from '../lib/types';

const SAVE_DEBOUNCE_MS = 250;
const SAVE_RETRY_MS = 5000;

export type SaveFailure = false | 'quota' | 'unavailable' | 'offline';

export interface UsePersistenceResult {
  saveFailed: SaveFailure;
  dismissSaveFailure: () => void;
}

export function usePersistence(
  storageOverride?: StorageLike,
  fetchOverride?: typeof fetch,
): UsePersistenceResult {
  const {
    state,
    dispatch,
    recovered,
    showToast,
    storage,
    storageUnavailable,
    storageKey,
    username,
  } = useApp();
  const [saveFailed, setSaveFailed] = useState<SaveFailure>(
    storageUnavailable ? 'unavailable' : false,
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingData = useRef<AppData | null>(null);
  const storageRef = useRef(storageOverride ?? storage);
  const fetchRef = useRef(fetchOverride);
  const mounted = useRef(false);
  const syncedOnce = useRef(false);
  const skipNextSave = useRef(false);
  const reconciled = useRef(false);
  const reconcileInFlight = useRef<Promise<void> | null>(null);
  const reconcileRef = useRef<() => Promise<void>>(async () => {});
  const localSaveFailed = useRef(false);

  useEffect(() => {
    storageRef.current = storageOverride ?? storage;
  }, [storageOverride, storage]);

  useEffect(() => {
    fetchRef.current = fetchOverride;
  }, [fetchOverride]);

  const storageKeyRef = useRef(storageKey);

  useEffect(() => {
    storageKeyRef.current = storageKey;
  }, [storageKey]);

  const usernameRef = useRef(username);

  useEffect(() => {
    usernameRef.current = username;
  }, [username]);

  const dataRef = useRef(state.data);

  useEffect(() => {
    dataRef.current = state.data;
  }, [state.data]);

  const flushRef = useRef<() => boolean>(() => true);

  // The sync marker is a cache of the server's clock, never user data — a
  // storage failure here must not take down the save that just succeeded.
  const rememberSyncedAt = useCallback((updatedAt: string) => {
    try {
      storageRef.current.setItem(syncKeyFor(usernameRef.current), updatedAt);
    } catch {
      // ignored: the next sync just re-fetches instead of short-circuiting
    }
  }, []);

  // The dirty marker records that this device holds edits the server has not
  // acknowledged. Like the sync marker it is a hint, not user data, so a
  // storage failure here must never take down the save or the push.
  const setDirty = useCallback((dirty: boolean) => {
    try {
      const key = dirtyKeyFor(usernameRef.current);
      if (dirty) storageRef.current.setItem(key, '1');
      else storageRef.current.removeItem(key);
    } catch {
      // ignored: at worst the next mount pushes a blob the server already has
    }
  }, []);

  const isDirty = useCallback((): boolean => {
    try {
      return storageRef.current.getItem(dirtyKeyFor(usernameRef.current)) !== null;
    } catch {
      return false;
    }
  }, []);

  // Same contract as the quota path: hold the payload and retry, so a dead
  // connection delays the upload rather than losing the change. A push that
  // loses the race to a later one is dead weight — its payload is already
  // superseded, so it must neither be re-armed nor raise an offline flag.
  const holdForRetry = useCallback((data: AppData, raiseOffline = true) => {
    if (pendingData.current === null && dataRef.current === data) pendingData.current = data;
    if (pendingData.current === null) return;
    if (raiseOffline) setSaveFailed((prev) => (prev === false ? 'offline' : prev));
    if (timer.current === null) {
      timer.current = setTimeout(() => flushRef.current(), SAVE_RETRY_MS);
    }
  }, []);

  const pushCurrent = useCallback(
    async (data: AppData): Promise<void> => {
      // From here until the server acknowledges, this device's copy is the
      // newer one — recorded before the request so a tab closed mid-flight
      // still knows that on its next mount.
      setDirty(true);
      if (!reconciled.current) {
        // Uploading before the mount fetch resolved would let a device that has
        // never seen the server's row overwrite it (an empty list wipes it).
        // Hold the payload and retry the reconcile; the push follows it. A
        // reconcile still in flight is not evidence of a bad connection — only
        // the reconcile itself raises 'offline', once it actually fails.
        holdForRetry(data, false);
        void reconcileRef.current();
        return;
      }
      let result: RemotePushResult;
      try {
        result = await pushRemote(usernameRef.current, data, fetchRef.current ?? undefined);
      } catch {
        result = { ok: false };
      }
      if (result.ok) {
        setDirty(false);
        rememberSyncedAt(result.updatedAt);
        // Only drop the held payload when it is already on disk: a concurrent
        // quota failure re-arms the same object and still needs its retry.
        if (pendingData.current === data && !localSaveFailed.current) pendingData.current = null;
        setSaveFailed((prev) => (prev === 'offline' ? false : prev));
        return;
      }
      holdForRetry(data);
    },
    [holdForRetry, rememberSyncedAt, setDirty],
  );

  const flush = useCallback((): boolean => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (pendingData.current === null) return true;
    const data = pendingData.current;
    const result = save(storageRef.current, data, storageKeyRef.current);
    if (result.ok) {
      localSaveFailed.current = false;
      pendingData.current = null;
      // A local save says nothing about the connection: only a successful push
      // clears 'offline', otherwise the banner blinks on every debounce cycle.
      setSaveFailed((prev) => (prev === 'offline' ? prev : false));
      void pushCurrent(data);
      return true;
    }
    // Keep the unsaved payload and retry: a quota error can clear (user frees
    // space, another tab trims) and the change must not be silently dropped.
    localSaveFailed.current = true;
    setSaveFailed(result.reason);
    timer.current = setTimeout(() => flushRef.current(), SAVE_RETRY_MS);
    return false;
  }, [pushCurrent]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  useEffect(() => {
    if (recovered) showToast('Saved data was unreadable — starting fresh');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reconcile = useCallback(async (): Promise<void> => {
    let result: RemoteFetchResult;
    try {
      result = await fetchRemote(usernameRef.current, fetchRef.current ?? undefined);
    } catch {
      result = { status: 'error' };
    }
    if (result.status === 'error') {
      // The gate stays shut: an unreconciled device must not push, so this
      // stays 'offline' until a later attempt resolves the server's copy.
      setSaveFailed((prev) => (prev === false ? 'offline' : prev));
      return;
    }
    reconciled.current = true;
    if (isDirty()) {
      // Edits this device never managed to upload: under last-write-wins the
      // local blob is the newer one, so it goes up before anything comes down.
      await pushCurrent(dataRef.current);
      return;
    }
    if (result.status === 'missing') {
      // First sync for this username: seed the server from this device,
      // but never write an empty list over a list we simply haven't got.
      if (dataRef.current.tasks.length > 0) await pushCurrent(dataRef.current);
      return;
    }
    if (storageRef.current.getItem(syncKeyFor(usernameRef.current)) === result.updatedAt) return;
    // The reload is written locally right here, so the save cycle it would
    // otherwise trigger is skipped: echoing the blob back would bump the
    // server's updatedAt and toast every other device for nothing.
    skipNextSave.current = true;
    dispatch({ type: 'externalReload', data: result.data });
    save(storageRef.current, result.data, storageKeyRef.current);
    rememberSyncedAt(result.updatedAt);
    showToast('List updated from server');
  }, [dispatch, isDirty, pushCurrent, rememberSyncedAt, showToast]);

  // Collapses concurrent attempts onto one in-flight fetch, so a retry kicked
  // off by a blocked push never doubles up with the mount reconciliation.
  const ensureReconciled = useCallback((): Promise<void> => {
    if (reconcileInFlight.current === null) {
      reconcileInFlight.current = reconcile().finally(() => {
        reconcileInFlight.current = null;
      });
    }
    return reconcileInFlight.current;
  }, [reconcile]);

  useEffect(() => {
    reconcileRef.current = ensureReconciled;
  }, [ensureReconciled]);

  useEffect(() => {
    // One reconciliation per mount: the ref survives StrictMode's double
    // invoke, which would otherwise fetch (and possibly upload) twice.
    if (syncedOnce.current) return;
    syncedOnce.current = true;
    void ensureReconciled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    pendingData.current = state.data;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
  }, [state.data, flush]);

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      // key === null means storage.clear() in another tab; newValue === null
      // means our key was removed. Both are external writes this tab must
      // honor (FR-43) — ignoring them resurrects deleted data on the next save.
      if (event.key !== null && event.key !== storageKey) return;
      const result = load(storageRef.current, new Date(), storageKey);
      // Already on disk, written by the other tab — same suppression the
      // server reload uses, so honoring it doesn't echo a PUT straight back.
      skipNextSave.current = true;
      dispatch({ type: 'externalReload', data: result.data });
      pendingData.current = null;
      showToast(
        result.recovered
          ? 'Saved data was unreadable — starting fresh'
          : 'List updated in another tab',
      );
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [dispatch, showToast, storageKey]);

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!flush()) {
        // FR-40's flush guarantee failed — surface the browser's leave
        // confirmation rather than silently dropping the final change.
        event.preventDefault();
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      flush();
    };
  }, [flush]);

  const dismissSaveFailure = useCallback(() => setSaveFailed(false), []);

  return { saveFailed, dismissSaveFailure };
}
