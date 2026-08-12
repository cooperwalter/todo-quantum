import type { AppData, LoadResult, SaveResult, StorageLike } from './types';
import { isAppData } from './validate';

export const STORAGE_KEY = 'todo-quantum.v1';
export const RECOVERY_PREFIX = 'todo-quantum.recovery.';

const EMPTY: AppData = { schemaVersion: 1, tasks: [] };

function emptyData(): AppData {
  return { schemaVersion: EMPTY.schemaVersion, tasks: [] };
}

function isQuotaError(err: unknown): boolean {
  if (typeof DOMException !== 'undefined' && err instanceof DOMException && err.code === 22) return true;
  return (
    err instanceof Error &&
    (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  );
}

/**
 * Acquire window.localStorage behind a guard: in storage-blocked contexts the
 * property ACCESS itself throws SecurityError (FR-41's "unavailable" case).
 * Returns null when storage is unreachable so callers can fall back to memory.
 */
export function getLocalStorage(
  accessor: () => StorageLike = () => window.localStorage,
): StorageLike | null {
  try {
    const storage = accessor();
    storage.getItem(STORAGE_KEY);
    return storage;
  } catch {
    return null;
  }
}

/** In-memory StorageLike fallback for storage-blocked sessions (FR-41). */
export function memoryStorage(): StorageLike {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
}

export function load(storage: StorageLike, now: Date = new Date()): LoadResult {
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { ok: true, data: emptyData(), recovered: false };
  }
  if (raw === null) {
    return { ok: true, data: emptyData(), recovered: false };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = undefined;
  }
  if (!isAppData(parsed)) {
    try {
      storage.setItem(RECOVERY_PREFIX + now.toISOString(), raw);
    } catch {
      // Recovery stash is best-effort; a full store must not block the fresh start.
    }
    return { ok: true, data: emptyData(), recovered: true };
  }
  return { ok: true, data: parsed, recovered: false };
}

export function save(storage: StorageLike, data: AppData): SaveResult {
  const serialized = JSON.stringify(data);
  try {
    storage.setItem(STORAGE_KEY, serialized);
    const verification = storage.getItem(STORAGE_KEY);
    if (verification !== serialized) {
      return { ok: false, reason: 'unavailable' };
    }
  } catch (err) {
    if (isQuotaError(err)) {
      return { ok: false, reason: 'quota' };
    }
    return { ok: false, reason: 'unavailable' };
  }
  return { ok: true };
}
