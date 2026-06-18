import { addDays, compareDates, isoWeekday, isoWeekStart } from './dates';
import type { AppData, Task } from './types';

export interface TodaySections {
  rollover: Task[];
  dueToday: Task[];
  anytime: Task[];
}

export interface UpcomingGroup {
  kind: 'day' | 'week';
  start: string;
  label: string;
  tasks: Task[];
}

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthDayLabel(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${MONTH_SHORT[m - 1]} ${d}`;
}

function dayLabel(date: string): string {
  return `${WEEKDAY_SHORT[isoWeekday(date) - 1]} ${monthDayLabel(date)}`;
}

function byOrder(a: Task, b: Task): number {
  return a.order - b.order;
}

function byTimeThenOrder(a: Task, b: Task): number {
  if (a.dueTime !== null && b.dueTime !== null && a.dueTime !== b.dueTime) {
    return a.dueTime < b.dueTime ? -1 : 1;
  }
  if (a.dueTime === null && b.dueTime !== null) return 1;
  if (a.dueTime !== null && b.dueTime === null) return -1;
  return byOrder(a, b);
}

function openTasks(data: AppData): Task[] {
  return data.tasks.filter((t) => t.status === 'open');
}

export function todayItems(data: AppData, today: string): TodaySections {
  const open = openTasks(data);
  const rollover = open
    .filter((t) => t.dueDate !== null && compareDates(t.dueDate, today) < 0)
    .sort((a, b) => {
      const cmp = compareDates(a.dueDate as string, b.dueDate as string);
      return cmp !== 0 ? cmp : byOrder(a, b);
    });
  const dueToday = open.filter((t) => t.dueDate === today).sort(byTimeThenOrder);
  const anytime = open.filter((t) => t.dueDate === null).sort(byOrder);
  return { rollover, dueToday, anytime };
}

export function upcomingGroups(data: AppData, today: string): UpcomingGroup[] {
  const horizon = addDays(today, 7);
  const upcoming = openTasks(data).filter(
    (t) => t.dueDate !== null && compareDates(t.dueDate, today) > 0,
  );

  const groups: UpcomingGroup[] = [];

  for (let k = 1; k <= 7; k++) {
    const date = addDays(today, k);
    const tasks = upcoming.filter((t) => t.dueDate === date).sort(byTimeThenOrder);
    if (tasks.length > 0) {
      groups.push({ kind: 'day', start: date, label: dayLabel(date), tasks });
    }
  }

  const beyond = upcoming.filter((t) => compareDates(t.dueDate as string, horizon) > 0);
  const weekStarts = [...new Set(beyond.map((t) => isoWeekStart(t.dueDate as string)))].sort();
  for (const weekStart of weekStarts) {
    const tasks = beyond
      .filter((t) => isoWeekStart(t.dueDate as string) === weekStart)
      .sort((a, b) => {
        const cmp = compareDates(a.dueDate as string, b.dueDate as string);
        return cmp !== 0 ? cmp : byTimeThenOrder(a, b);
      });
    groups.push({ kind: 'week', start: weekStart, label: `Week of ${monthDayLabel(weekStart)}`, tasks });
  }

  return groups;
}

export function allItems(data: AppData, filterText: string): Task[] {
  const needle = filterText.trim().toLowerCase();
  const open = openTasks(data).filter((t) => {
    if (needle === '') return true;
    if (t.title.toLowerCase().includes(needle)) return true;
    return t.list !== null && t.list.toLowerCase().includes(needle);
  });
  const dated = open
    .filter((t) => t.dueDate !== null)
    .sort((a, b) => {
      const cmp = compareDates(a.dueDate as string, b.dueDate as string);
      return cmp !== 0 ? cmp : byTimeThenOrder(a, b);
    });
  const anytime = open.filter((t) => t.dueDate === null).sort(byOrder);
  return [...dated, ...anytime];
}

export function doneItems(data: AppData): Task[] {
  return data.tasks
    .filter((t) => t.status === 'done')
    .sort((a, b) => {
      const ac = a.completedAt ?? '';
      const bc = b.completedAt ?? '';
      return ac < bc ? 1 : ac > bc ? -1 : 0;
    });
}

export interface TodayProgress {
  done: number;
  total: number;
}

// The masthead hanko seal's source of truth: how many of today's dated tasks
// (due today plus rollovers — anything dated on or before today) are done.
// Anytime/undated tasks are excluded (§6: "every task due today, incl. rollovers").
export function selectTodayProgress(data: AppData, today: string): TodayProgress {
  const dated = data.tasks.filter(
    (t) => t.dueDate !== null && compareDates(t.dueDate, today) <= 0,
  );
  const done = dated.filter((t) => t.status === 'done').length;
  return { done, total: dated.length };
}
