import { useCallback, useEffect, useRef, useState } from 'react';
import { load, save } from '../lib/persistence';
import { useApp } from '../state/AppContext';
import type { AppData, StorageLike } from '../lib/types';

const SAVE_DEBOUNCE_MS = 250;
const SAVE_RETRY_MS = 5000;

export type SaveFailure = false | 'quota' | 'unavailable';

export interface UsePersistenceResult {
  saveFailed: SaveFailure;
  dismissSaveFailure: () => void;
}

export function usePersistence(storageOverride?: StorageLike): UsePersistenceResult {
  const { state, dispatch, recovered, showToast, storage, storageUnavailable, storageKey } =
    useApp();
  const [saveFailed, setSaveFailed] = useState<SaveFailure>(
    storageUnavailable ? 'unavailable' : false,
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingData = useRef<AppData | null>(null);
  const storageRef = useRef(storageOverride ?? storage);
  const mounted = useRef(false);

  useEffect(() => {
    storageRef.current = storageOverride ?? storage;
  }, [storageOverride, storage]);

  const storageKeyRef = useRef(storageKey);

  useEffect(() => {
    storageKeyRef.current = storageKey;
  }, [storageKey]);

  const flushRef = useRef<() => boolean>(() => true);

  const flush = useCallback((): boolean => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (pendingData.current === null) return true;
    const result = save(storageRef.current, pendingData.current, storageKeyRef.current);
    if (result.ok) {
      pendingData.current = null;
      setSaveFailed(false);
      return true;
    }
    // Keep the unsaved payload and retry: a quota error can clear (user frees
    // space, another tab trims) and the change must not be silently dropped.
    setSaveFailed(result.reason);
    timer.current = setTimeout(() => flushRef.current(), SAVE_RETRY_MS);
    return false;
  }, []);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  useEffect(() => {
    if (recovered) showToast('Saved data was unreadable — starting fresh');
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
