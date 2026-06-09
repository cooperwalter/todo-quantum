import { useCallback, useEffect, useRef, useState } from 'react';
import { STORAGE_KEY, load, save } from '../lib/persistence';
import { useApp } from '../state/AppContext';
import type { AppData, StorageLike } from '../lib/types';

const SAVE_DEBOUNCE_MS = 250;

export interface UsePersistenceResult {
  saveFailed: boolean;
  dismissSaveFailure: () => void;
}

export function usePersistence(storage: StorageLike = window.localStorage): UsePersistenceResult {
  const { state, dispatch, recovered, showToast } = useApp();
  const [saveFailed, setSaveFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingData = useRef<AppData | null>(null);
  const storageRef = useRef(storage);
  const mounted = useRef(false);

  useEffect(() => {
    storageRef.current = storage;
  }, [storage]);

  const flush = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (pendingData.current === null) return;
    const result = save(storageRef.current, pendingData.current);
    pendingData.current = null;
    setSaveFailed(!result.ok);
  }, []);

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
      if (event.key !== STORAGE_KEY || event.newValue === null) return;
      const result = load(storageRef.current);
      dispatch({ type: 'externalReload', data: result.data });
      pendingData.current = null;
      showToast('List updated in another tab');
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [dispatch, showToast]);

  useEffect(() => {
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      flush();
    };
  }, [flush]);

  const dismissSaveFailure = useCallback(() => setSaveFailed(false), []);

  return { saveFailed, dismissSaveFailure };
}
