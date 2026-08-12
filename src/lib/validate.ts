import type { AppData, Recurrence, Task } from './types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const FREQS = ['daily', 'weekly', 'monthly'];

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

export function isAppData(value: unknown): value is AppData {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== 1 || !Array.isArray(candidate.tasks)) return false;
  return candidate.tasks.every(isTask);
}
