import { addDays, isoWeekday, isoWeekStart, nextWeekdayAfter, todayStr } from './dates';
import { nextOccurrence } from './recurrence';
import type { Recurrence } from './types';

export interface Chip {
  start: number;
  end: number;
  kind: 'date' | 'time' | 'list' | 'priority' | 'recurrence';
  display: string;
}

export interface ParseResult {
  valid: boolean;
  title: string;
  dueDate: string | null;
  dueTime: string | null;
  list: string | null;
  priority: 1 | 2 | 3 | null;
  recurrence: Recurrence | null;
  chips: Chip[];
}

interface Word {
  text: string;
  lower: string;
  start: number;
  end: number;
}

interface Token {
  kind: Chip['kind'];
  firstWord: number;
  lastWord: number;
  display: string;
}

const WEEKDAY_NAMES: Record<string, number> = {
  monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7,
  mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7,
};

const MONTH_NAMES: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function splitWords(input: string): Word[] {
  const out: Word[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    out.push({ text: m[0], lower: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length });
  }
  return out;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function formatDateDisplay(date: string, now?: Date): string {
  const [y, m, d] = date.split('-').map(Number);
  const base = `${WEEKDAY_SHORT[isoWeekday(date) - 1]} ${MONTH_SHORT[m - 1]} ${d}`;
  if (now !== undefined && y !== now.getFullYear()) return `${base}, ${y}`;
  return base;
}

export function formatTimeDisplay(time: string): string {
  const [h, mm] = time.split(':').map(Number);
  const suffix = h < 12 ? 'AM' : 'PM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(mm).padStart(2, '0')} ${suffix}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

interface DateMatch {
  date: string;
  firstWord: number;
  lastWord: number;
}

function matchDateAt(wordsArr: Word[], i: number, used: boolean[], today: string): DateMatch | null {
  const w = wordsArr[i];
  const next = wordsArr[i + 1];
  const nextFree = next !== undefined && !used[i + 1];

  if (w.lower === 'next' && nextFree && WEEKDAY_NAMES[next.lower] !== undefined) {
    const wd = WEEKDAY_NAMES[next.lower];
    return { date: addDays(isoWeekStart(today), 7 + wd - 1), firstWord: i, lastWord: i + 1 };
  }

  if (w.lower === 'in' && nextFree && /^\d+$/.test(next.lower)) {
    const unit = wordsArr[i + 2];
    if (unit !== undefined && !used[i + 2]) {
      const n = Number(next.lower);
      if (n >= 1 && n <= 365) {
        if (unit.lower === 'day' || unit.lower === 'days') {
          return { date: addDays(today, n), firstWord: i, lastWord: i + 2 };
        }
        if (unit.lower === 'week' || unit.lower === 'weeks') {
          return { date: addDays(today, n * 7), firstWord: i, lastWord: i + 2 };
        }
      }
    }
  }

  if (MONTH_NAMES[w.lower] !== undefined && nextFree && /^\d{1,2}$/.test(next.lower)) {
    const explicit = matchExplicitYear(wordsArr, i, used, MONTH_NAMES[w.lower], Number(next.lower));
    if (explicit !== null) return explicit;
    const date = resolveMonthDay(MONTH_NAMES[w.lower], Number(next.lower), today);
    if (date !== null) return { date, firstWord: i, lastWord: i + 1 };
  }

  if (/^\d{1,2}$/.test(w.lower) && nextFree && MONTH_NAMES[next.lower] !== undefined) {
    const explicit = matchExplicitYear(wordsArr, i, used, MONTH_NAMES[next.lower], Number(w.lower));
    if (explicit !== null) return explicit;
    const date = resolveMonthDay(MONTH_NAMES[next.lower], Number(w.lower), today);
    if (date !== null) return { date, firstWord: i, lastWord: i + 1 };
  }

  if (w.lower === 'today') return { date: today, firstWord: i, lastWord: i };
  if (w.lower === 'tomorrow') return { date: addDays(today, 1), firstWord: i, lastWord: i };
  if (w.lower === 'yesterday') return { date: addDays(today, -1), firstWord: i, lastWord: i };

  if (WEEKDAY_NAMES[w.lower] !== undefined) {
    return { date: nextWeekdayAfter(today, WEEKDAY_NAMES[w.lower]), firstWord: i, lastWord: i };
  }

  return null;
}

function matchExplicitYear(
  wordsArr: Word[],
  i: number,
  used: boolean[],
  month: number,
  day: number,
): DateMatch | null {
  const yearWord = wordsArr[i + 2];
  if (yearWord === undefined || used[i + 2]) return null;
  if (!/^\d{4}$/.test(yearWord.lower)) return null;
  const year = Number(yearWord.lower);
  if (year < 1970 || year > 2100) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { date: `${year}-${pad2(month)}-${pad2(day)}`, firstWord: i, lastWord: i + 2 };
}

function resolveMonthDay(month: number, day: number, today: string): string | null {
  if (day < 1 || day > 31) return null;
  const thisYear = Number(today.slice(0, 4));
  for (const year of [thisYear, thisYear + 1]) {
    if (day > daysInMonth(year, month)) continue;
    const candidate = `${year}-${pad2(month)}-${pad2(day)}`;
    if (candidate >= today) return candidate;
  }
  return null;
}

interface TimeMatch {
  time: string;
  needsDate: boolean;
}

function matchTime(lower: string): TimeMatch | null {
  let m = /^(\d{1,2})(am|pm)$/.exec(lower);
  if (m !== null) {
    const h = Number(m[1]);
    if (h >= 1 && h <= 12) return { time: to24h(h, 0, m[2]), needsDate: false };
    return null;
  }
  m = /^(\d{1,2}):(\d{2})(am|pm)$/.exec(lower);
  if (m !== null) {
    const h = Number(m[1]);
    const mm = Number(m[2]);
    if (h >= 1 && h <= 12 && mm <= 59) return { time: to24h(h, mm, m[3]), needsDate: false };
    return null;
  }
  m = /^(\d{1,2}):(\d{2})$/.exec(lower);
  if (m !== null) {
    const h = Number(m[1]);
    const mm = Number(m[2]);
    if (h <= 23 && mm <= 59) return { time: `${pad2(h)}:${pad2(mm)}`, needsDate: true };
    return null;
  }
  return null;
}

function to24h(hour12: number, minutes: number, suffix: string): string {
  let h = hour12 % 12;
  if (suffix === 'pm') h += 12;
  return `${pad2(h)}:${pad2(minutes)}`;
}

interface RecurrenceMatch {
  recurrence: Recurrence;
  firstWord: number;
  lastWord: number;
}

const FREQ_BY_UNIT: Record<string, Recurrence['freq']> = {
  day: 'daily', days: 'daily',
  week: 'weekly', weeks: 'weekly',
  month: 'monthly', months: 'monthly',
};

function makeRecurrence(freq: Recurrence['freq'], interval: number, byWeekday: number[] | null): Recurrence {
  return { freq, interval, byWeekday, byMonthDay: null };
}

function matchRecurrenceAt(wordsArr: Word[], i: number, used: boolean[]): RecurrenceMatch | null {
  const w = wordsArr[i];
  if (w.lower === 'daily') return { recurrence: makeRecurrence('daily', 1, null), firstWord: i, lastWord: i };
  if (w.lower === 'weekly') return { recurrence: makeRecurrence('weekly', 1, null), firstWord: i, lastWord: i };
  if (w.lower === 'monthly') return { recurrence: makeRecurrence('monthly', 1, null), firstWord: i, lastWord: i };

  if (w.lower !== 'every') return null;
  const next = wordsArr[i + 1];
  if (next === undefined || used[i + 1]) return null;

  if (next.lower === 'day' || next.lower === 'week' || next.lower === 'month') {
    return { recurrence: makeRecurrence(FREQ_BY_UNIT[next.lower], 1, null), firstWord: i, lastWord: i + 1 };
  }
  if (next.lower === 'weekday') {
    return { recurrence: makeRecurrence('weekly', 1, [1, 2, 3, 4, 5]), firstWord: i, lastWord: i + 1 };
  }
  if (WEEKDAY_NAMES[next.lower] !== undefined) {
    return {
      recurrence: makeRecurrence('weekly', 1, [WEEKDAY_NAMES[next.lower]]),
      firstWord: i,
      lastWord: i + 1,
    };
  }
  if (/^\d+$/.test(next.lower)) {
    const unit = wordsArr[i + 2];
    const n = Number(next.lower);
    if (unit !== undefined && !used[i + 2] && n >= 1 && FREQ_BY_UNIT[unit.lower] !== undefined) {
      if (unit.lower === 'days' || unit.lower === 'weeks' || unit.lower === 'months') {
        return { recurrence: makeRecurrence(FREQ_BY_UNIT[unit.lower], n, null), firstWord: i, lastWord: i + 2 };
      }
    }
  }
  return null;
}

export function parse(input: string, now: Date): ParseResult {
  const today = todayStr(now);
  const wordsArr = splitWords(input);
  const used: boolean[] = wordsArr.map(() => false);
  const tokens: Token[] = [];

  let dueDate: string | null = null;
  let dueTime: string | null = null;
  let recurrence: Recurrence | null = null;
  let list: string | null = null;
  let priority: 1 | 2 | 3 | null = null;
  let dateToken: Token | null = null;
  let timeToken: Token | null = null;

  for (let i = 0; i < wordsArr.length; i++) {
    if (used[i]) continue;
    const match = matchRecurrenceAt(wordsArr, i, used);
    if (match !== null) {
      recurrence = match.recurrence;
      for (let j = match.firstWord; j <= match.lastWord; j++) used[j] = true;
      tokens.push({
        kind: 'recurrence',
        firstWord: match.firstWord,
        lastWord: match.lastWord,
        display: wordsArr
          .slice(match.firstWord, match.lastWord + 1)
          .map((w) => w.lower)
          .join(' '),
      });
      break;
    }
  }

  for (let i = 0; i < wordsArr.length; i++) {
    if (used[i]) continue;
    const match = matchDateAt(wordsArr, i, used, today);
    if (match !== null) {
      dueDate = match.date;
      for (let j = match.firstWord; j <= match.lastWord; j++) used[j] = true;
      dateToken = {
        kind: 'date',
        firstWord: match.firstWord,
        lastWord: match.lastWord,
        display: formatDateDisplay(match.date, now),
      };
      break;
    }
  }

  for (let i = 0; i < wordsArr.length; i++) {
    if (used[i]) continue;
    const match = matchTime(wordsArr[i].lower);
    if (match !== null && (!match.needsDate || dueDate !== null)) {
      dueTime = match.time;
      used[i] = true;
      timeToken = { kind: 'time', firstWord: i, lastWord: i, display: formatTimeDisplay(match.time) };
      break;
    }
  }

  for (let i = 0; i < wordsArr.length; i++) {
    if (used[i]) continue;
    const m = /^#(\w{1,32})$/.exec(wordsArr[i].text);
    if (m !== null) {
      list = m[1];
      used[i] = true;
      tokens.push({ kind: 'list', firstWord: i, lastWord: i, display: `#${m[1]}` });
      break;
    }
  }

  for (let i = 0; i < wordsArr.length; i++) {
    if (used[i]) continue;
    const m = /^!p([123])$/.exec(wordsArr[i].lower);
    if (m !== null) {
      priority = Number(m[1]) as 1 | 2 | 3;
      used[i] = true;
      tokens.push({ kind: 'priority', firstWord: i, lastWord: i, display: `P${m[1]}` });
      break;
    }
  }

  if (dateToken !== null && timeToken !== null) {
    const adjacent =
      timeToken.firstWord === dateToken.lastWord + 1 || dateToken.firstWord === timeToken.lastWord + 1;
    if (adjacent) {
      const merged: Token = {
        kind: 'date',
        firstWord: Math.min(dateToken.firstWord, timeToken.firstWord),
        lastWord: Math.max(dateToken.lastWord, timeToken.lastWord),
        display: `${dateToken.display}, ${timeToken.display}`,
      };
      tokens.push(merged);
    } else {
      tokens.push(dateToken, timeToken);
    }
  } else {
    if (dateToken !== null) tokens.push(dateToken);
    if (timeToken !== null) tokens.push(timeToken);
  }

  // A recurrence without an explicit date schedules its first occurrence —
  // "water plants every monday" belongs on next Monday, not in Anytime.
  if (recurrence !== null && dueDate === null) {
    dueDate = nextOccurrence(recurrence, today, today);
  }

  const titleWords = wordsArr.filter((_, i) => !used[i]).map((w) => w.text);
  const title = titleWords.join(' ').trim();

  const chips: Chip[] = tokens
    .map((t) => ({
      start: wordsArr[t.firstWord].start,
      end: wordsArr[t.lastWord].end,
      kind: t.kind,
      display: t.display,
    }))
    .sort((a, b) => a.start - b.start);

  return {
    valid: title.length > 0,
    title,
    dueDate,
    dueTime,
    list,
    priority,
    recurrence,
    chips,
  };
}
