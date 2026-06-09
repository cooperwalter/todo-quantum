import type { AppData, LoadResult, SaveResult, StorageLike } from './types';

export const STORAGE_KEY = 'todo-quantum.v1';
export const RECOVERY_PREFIX = 'todo-quantum.recovery.';

const EMPTY: AppData = { schemaVersion: 1, tasks: [] };

function emptyData(): AppData {
  return { schemaVersion: EMPTY.schemaVersion, tasks: [] };
}

function isAppData(value: unknown): value is AppData {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.schemaVersion === 1 && Array.isArray(candidate.tasks);
}

function isQuotaError(err: unknown): boolean {
  return err instanceof Error && err.name === 'QuotaExceededError';
}

export function load(storage: StorageLike, now: Date = new Date()): LoadResult {
  const raw = storage.getItem(STORAGE_KEY);
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
  } catch (err) {
    if (isQuotaError(err)) {
      return { ok: false, reason: 'quota' };
    }
    return { ok: false, reason: 'unavailable' };
  }
  const verification = storage.getItem(STORAGE_KEY);
  if (verification !== serialized) {
    return { ok: false, reason: 'unavailable' };
  }
  return { ok: true };
}
