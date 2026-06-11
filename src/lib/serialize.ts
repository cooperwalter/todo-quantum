import { addDays, todayStr } from './dates';
import { parse } from './parser';
import type { Range } from './parser';
import type { Recurrence, Task } from './types';

export interface SerializeResult {
  text: string;
  revertedRanges: Range[];
}

const MONTH_LOWER = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
];

const WEEKDAY_LOWER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

// Mirror of parser.ts resolveMonthDay: the bare "<mon> <day>" form resolves to
// the first occurrence at-or-after today. We emit the bare form only when that
// resolution reproduces the exact date; otherwise we fall back to explicit year.
function resolvesToDate(month: number, day: number, today: string, target: string): boolean {
  if (day < 1 || day > 31) return false;
  const thisYear = Number(today.slice(0, 4));
  for (const year of [thisYear, thisYear + 1]) {
    if (day > daysInMonth(year, month)) continue;
    const candidate = `${year}-${pad2(month)}-${pad2(day)}`;
    if (candidate >= today) return candidate === target;
  }
  return false;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function serializeDate(date: string, now: Date): string {
  const today = todayStr(now);
  if (date === addDays(today, -1)) return 'yesterday';
  if (date === today) return 'today';
  if (date === addDays(today, 1)) return 'tomorrow';

  const [year, month, day] = date.split('-').map(Number);
  if (resolvesToDate(month, day, today, date)) {
    return `${MONTH_LOWER[month - 1]} ${day}`;
  }
  return `${MONTH_LOWER[month - 1]} ${day} ${year}`;
}

function serializeTime(time: string): string {
  const [h, mm] = time.split(':').map(Number);
  const suffix = h < 12 ? 'am' : 'pm';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  if (mm === 0) return `${hour12}${suffix}`;
  return `${hour12}:${pad2(mm)}${suffix}`;
}

function isWeekdaySet(byWeekday: number[] | null): byWeekday is number[] {
  return byWeekday !== null && byWeekday.length > 0;
}

function sameWeekdays(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  return sa.every((v, i) => v === sb[i]);
}

// byMonthDay is intentionally ignored: no grammar form exists for it (FR-108/109),
// so the serializer reduces monthly recurrences to their interval form only.
function serializeRecurrence(rec: Recurrence): string {
  if (rec.freq === 'daily') {
    return rec.interval === 1 ? 'every day' : `every ${rec.interval} days`;
  }
  if (rec.freq === 'monthly') {
    return rec.interval === 1 ? 'every month' : `every ${rec.interval} months`;
  }
  // weekly
  if (isWeekdaySet(rec.byWeekday)) {
    if (rec.interval === 1 && sameWeekdays(rec.byWeekday, [1, 2, 3, 4, 5])) {
      return 'every weekday';
    }
    if (rec.interval === 1 && rec.byWeekday.length === 1) {
      return `every ${WEEKDAY_LOWER[rec.byWeekday[0] - 1]}`;
    }
  }
  return rec.interval === 1 ? 'every week' : `every ${rec.interval} weeks`;
}

export function serializeTask(task: Task, now: Date): SerializeResult {
  const parts: string[] = [];
  if (task.title.length > 0) parts.push(task.title);
  if (task.dueDate !== null) parts.push(serializeDate(task.dueDate, now));
  if (task.dueTime !== null) parts.push(serializeTime(task.dueTime));
  if (task.recurrence !== null) parts.push(serializeRecurrence(task.recurrence));
  if (task.list !== null) parts.push(`#${task.list}`);
  if (task.priority !== null) parts.push(`!p${task.priority}`);

  const text = parts.join(' ');

  // Any substring of the bare title that the parser would otherwise treat as a
  // token must be reverted so the title survives a round-trip. The title is the
  // prefix of `text` (offset 0), so ranges parsed from the title map directly.
  const revertedRanges: Range[] = [];
  if (task.title.length > 0) {
    const titleParse = parse(task.title, now);
    for (const chip of titleParse.chips) {
      revertedRanges.push({ start: chip.start, end: chip.end });
    }
    for (const range of titleParse.displaced) {
      revertedRanges.push({ start: range.start, end: range.end });
    }
    revertedRanges.sort((a, b) => a.start - b.start);
  }

  return { text, revertedRanges };
}
