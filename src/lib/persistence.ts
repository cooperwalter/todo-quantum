import type { AppData, LoadResult, Recurrence, SaveResult, StorageLike, Task } from './types';

export const STORAGE_KEY = 'todo-quantum.v1';
export const RECOVERY_PREFIX = 'todo-quantum.recovery.';

const EMPTY: AppData = { schemaVersion: 1, tasks: [] };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const FREQS = ['daily', 'weekly', 'monthly'];

function emptyData(): AppData {
  return { schemaVersion: EMPTY.schemaVersion, tasks: [] };
}

function isRecurrence(value: unknown): value is Recurrence {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  if (typeof r.freq !== 'string' || !FREQS.includes(r.freq)) return false;
  if (typeof r.interval !== 'number' || !Number.isInteger(r.interval) || r.interval < 1) return false;
  if (r.byWeekday !== null) {
    if (!Array.isArray(r.byWeekday) || r.byWeekday.length === 0) return false;
    if (!r.byWeekday.every((d) => Number.isInteger(d) && d >= 1 && d <= 7)) return false;
  }
  if (r.byMonthDay !== null) {
    if (typeof r.byMonthDay !== 'number' || !Number.isInteger(r.byMonthDay)) return false;
    if (r.byMonthDay < 1 || r.byMonthDay > 31) return false;
  }
  return true;
}

function isTask(value: unknown): value is Task {
  if (typeof value !== 'object' || value === null) return false;
  const t = value as Record<string, unknown>;
  if (typeof t.id !== 'string' || t.id.length === 0) return false;
  if (typeof t.title !== 'string') return false;
  if (t.status !== 'open' && t.status !== 'done') return false;
  if (t.dueDate !== null && (typeof t.dueDate !== 'string' || !DATE_RE.test(t.dueDate))) return false;
  if (t.dueTime !== null && (typeof t.dueTime !== 'string' || !TIME_RE.test(t.dueTime))) return false;
  if (t.list !== null && typeof t.list !== 'string') return false;
  if (t.priority !== null && t.priority !== 1 && t.priority !== 2 && t.priority !== 3) return false;
  if (t.recurrence !== null && !isRecurrence(t.recurrence)) return false;
  if (typeof t.createdAt !== 'string') return false;
  if (t.completedAt !== null && typeof t.completedAt !== 'string') return false;
  if (typeof t.order !== 'number' || !Number.isFinite(t.order)) return false;
  return true;
}

function isAppData(value: unknown): value is AppData {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== 1 || !Array.isArray(candidate.tasks)) return false;
  return candidate.tasks.every(isTask);
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
