function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number);
  return [y, m, d];
}

function format(y: number, m: number, d: number): string {
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

export function todayStr(now: Date): string {
  return format(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = parts(date);
  const next = new Date(y, m - 1, d + n, 12);
  return format(next.getFullYear(), next.getMonth() + 1, next.getDate());
}

export function compareDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isoWeekday(date: string): number {
  const [y, m, d] = parts(date);
  const js = new Date(y, m - 1, d, 12).getDay();
  return js === 0 ? 7 : js;
}

export function nextWeekdayAfter(today: string, weekday: number): string {
  const current = isoWeekday(today);
  const delta = ((weekday - current + 7 - 1) % 7) + 1;
  return addDays(today, delta);
}

export function nextSaturdayAfter(today: string): string {
  return nextWeekdayAfter(today, 6);
}

export function isoWeekStart(date: string): string {
  return addDays(date, 1 - isoWeekday(date));
}

export function snoozeTomorrow(today: string): string {
  return addDays(today, 1);
}

export function snoozeNextWeek(today: string): string {
  return addDays(today, 7);
}

export function snoozeWeekend(today: string): string {
  return nextSaturdayAfter(today);
}
