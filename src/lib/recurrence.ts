import { addDays, compareDates, isoWeekday, isoWeekStart } from './dates';
import type { Recurrence } from './types';

function noon(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

function daysBetween(a: string, b: string): number {
  return Math.round((noon(b).getTime() - noon(a).getTime()) / 86_400_000);
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function nextDaily(interval: number, anchor: string, start: string): string {
  let candidate = anchor;
  const behind = daysBetween(candidate, start);
  if (behind > 0) {
    candidate = addDays(candidate, Math.floor(behind / interval) * interval);
  }
  while (compareDates(candidate, start) <= 0) {
    candidate = addDays(candidate, interval);
  }
  return candidate;
}

function nextWeekly(rec: Recurrence, anchor: string, start: string): string {
  const weekdays = rec.byWeekday ?? [isoWeekday(anchor)];
  const anchorWeek = isoWeekStart(anchor);
  let candidate = addDays(start, 1);
  for (;;) {
    if (weekdays.includes(isoWeekday(candidate))) {
      const weeksFromAnchor = daysBetween(anchorWeek, isoWeekStart(candidate)) / 7;
      if (weeksFromAnchor % rec.interval === 0) return candidate;
    }
    candidate = addDays(candidate, 1);
  }
}

function nextMonthly(rec: Recurrence, anchor: string, start: string): string {
  const [anchorYear, anchorMonth, anchorDay] = anchor.split('-').map(Number);
  const dayTarget = rec.byMonthDay ?? anchorDay;
  const anchorMonths = anchorYear * 12 + (anchorMonth - 1);
  for (let k = 0; ; k++) {
    const months = anchorMonths + k * rec.interval;
    const year = Math.floor(months / 12);
    const month = months % 12 + 1;
    const day = Math.min(dayTarget, daysInMonth(year, month));
    const candidate = `${year}-${pad2(month)}-${pad2(day)}`;
    if (compareDates(candidate, start) > 0) return candidate;
  }
}

export function nextOccurrence(rec: Recurrence, anchor: string, today: string): string {
  if (!Number.isInteger(rec.interval) || rec.interval < 1) {
    throw new Error(`invalid recurrence interval: ${rec.interval}`);
  }
  if (rec.byWeekday !== null && rec.byWeekday.length === 0) {
    throw new Error('invalid recurrence: byWeekday must be null or non-empty');
  }
  const start = compareDates(anchor, today) >= 0 ? anchor : today;
  switch (rec.freq) {
    case 'daily':
      return nextDaily(rec.interval, anchor, start);
    case 'weekly':
      return nextWeekly(rec, anchor, start);
    case 'monthly':
      return nextMonthly(rec, anchor, start);
  }
}
