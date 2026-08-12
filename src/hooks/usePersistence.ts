import { useCallback, useEffect, useRef, useState } from 'react';
import { load, save } from '../lib/persistence';
import { fetchRemote, pushRemote } from '../lib/remote';
import { syncKeyFor } from '../lib/username';
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

  const pushCurrent = useCallback(
    async (data: AppData): Promise<void> => {
      let result: RemotePushResult;
      try {
        result = await pushRemote(usernameRef.current, data, fetchRef.current ?? undefined);
      } catch {
        result = { ok: false };
      }
      if (result.ok) {
        rememberSyncedAt(result.updatedAt);
        setSaveFailed((prev) => (prev === 'offline' ? false : prev));
        return;
      }
      // Same contract as the quota path: hold the payload and retry, so a dead
      // connection delays the upload rather than losing the change.
      if (pendingData.current === null) pendingData.current = data;
      setSaveFailed((prev) => (prev === false ? 'offline' : prev));
      if (timer.current === null) {
        timer.current = setTimeout(() => flushRef.current(), SAVE_RETRY_MS);
      }
    },
    [rememberSyncedAt],
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
      pendingData.current = null;
      setSaveFailed(false);
      void pushCurrent(data);
      return true;
    }
    // Keep the unsaved payload and retry: a quota error can clear (user frees
    // space, another tab trims) and the change must not be silently dropped.
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

  useEffect(() => {
    // One reconciliation per mount: the ref survives StrictMode's double
    // invoke, which would otherwise fetch (and possibly upload) twice.
    if (syncedOnce.current) return;
    syncedOnce.current = true;
    void (async () => {
      let result: RemoteFetchResult;
      try {
        result = await fetchRemote(usernameRef.current, fetchRef.current ?? undefined);
      } catch {
        result = { status: 'error' };
      }
      if (result.status === 'error') {
        setSaveFailed((prev) => (prev === false ? 'offline' : prev));
        return;
      }
      if (result.status === 'missing') {
        // First sync for this username: seed the server from this device,
        // but never write an empty list over a list we simply haven't got.
        if (dataRef.current.tasks.length > 0) await pushCurrent(dataRef.current);
        return;
      }
      if (storageRef.current.getItem(syncKeyFor(usernameRef.current)) === result.updatedAt) return;
      dispatch({ type: 'externalReload', data: result.data });
      save(storageRef.current, result.data, storageKeyRef.current);
      rememberSyncedAt(result.updatedAt);
      showToast('List updated from server');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
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
