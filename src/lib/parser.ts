import { addDays, isoWeekday, isoWeekStart, nextWeekdayAfter, todayStr } from './dates';
import { nextOccurrence } from './recurrence';
import type { Recurrence } from './types';

export interface Range {
  start: number;
  end: number;
}

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
  displaced: Range[];
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

function wordInReverted(w: Word, reverted: Range[]): boolean {
  for (const r of reverted) {
    if (w.start < r.end && w.end > r.start) return true;
  }
  return false;
}

function tokenRange(wordsArr: Word[], t: Token): Range {
  return { start: wordsArr[t.firstWord].start, end: wordsArr[t.lastWord].end };
}

export function parse(input: string, now: Date, reverted: Range[] = []): ParseResult {
  const today = todayStr(now);
  const wordsArr = splitWords(input);
  // `skip` words are unavailable to matchers: either they fall inside a reverted
  // range or they have already been consumed by a matched token. `used` is the
  // subset consumed by tokens — the only words excluded from the title. Reverted
  // words are skipped by matchers yet stay as literal title text.
  const skip: boolean[] = wordsArr.map((w) => wordInReverted(w, reverted));
  const used: boolean[] = wordsArr.map(() => false);
  const consume = (from: number, to: number): void => {
    for (let j = from; j <= to; j++) {
      skip[j] = true;
      used[j] = true;
    }
  };
  const tokens: Token[] = [];
  const displaced: Range[] = [];

  let dueDate: string | null = null;
  let dueTime: string | null = null;
  let recurrence: Recurrence | null = null;
  let list: string | null = null;
  let priority: 1 | 2 | 3 | null = null;
  let dateToken: Token | null = null;
  let timeToken: Token | null = null;

  const recurrenceOcc: Array<{ token: Token; recurrence: Recurrence }> = [];
  for (let i = 0; i < wordsArr.length; i++) {
    if (skip[i]) continue;
    const match = matchRecurrenceAt(wordsArr, i, skip);
    if (match !== null) {
      consume(match.firstWord, match.lastWord);
      recurrenceOcc.push({
        token: {
          kind: 'recurrence',
          firstWord: match.firstWord,
          lastWord: match.lastWord,
          display: wordsArr
            .slice(match.firstWord, match.lastWord + 1)
            .map((w) => w.lower)
            .join(' '),
        },
        recurrence: match.recurrence,
      });
      i = match.lastWord;
    }
  }
  if (recurrenceOcc.length > 0) {
    const last = recurrenceOcc[recurrenceOcc.length - 1];
    recurrence = last.recurrence;
    tokens.push(last.token);
    for (const earlier of recurrenceOcc.slice(0, -1)) {
      displaced.push(tokenRange(wordsArr, earlier.token));
    }
  }

  const dateOcc: Array<{ token: Token; date: string }> = [];
  for (let i = 0; i < wordsArr.length; i++) {
    if (skip[i]) continue;
    const match = matchDateAt(wordsArr, i, skip, today);
    if (match !== null) {
      consume(match.firstWord, match.lastWord);
      dateOcc.push({
        token: {
          kind: 'date',
          firstWord: match.firstWord,
          lastWord: match.lastWord,
          display: formatDateDisplay(match.date, now),
        },
        date: match.date,
      });
      i = match.lastWord;
    }
  }
  if (dateOcc.length > 0) {
    const last = dateOcc[dateOcc.length - 1];
    dueDate = last.date;
    dateToken = last.token;
    for (const earlier of dateOcc.slice(0, -1)) {
      displaced.push(tokenRange(wordsArr, earlier.token));
    }
  }

  const timeOcc: Array<{ token: Token; time: string }> = [];
  for (let i = 0; i < wordsArr.length; i++) {
    if (skip[i]) continue;
    const match = matchTime(wordsArr[i].lower);
    if (match !== null && (!match.needsDate || dueDate !== null)) {
      consume(i, i);
      timeOcc.push({
        token: { kind: 'time', firstWord: i, lastWord: i, display: formatTimeDisplay(match.time) },
        time: match.time,
      });
    }
  }
  if (timeOcc.length > 0) {
    const last = timeOcc[timeOcc.length - 1];
    dueTime = last.time;
    timeToken = last.token;
    for (const earlier of timeOcc.slice(0, -1)) {
      displaced.push(tokenRange(wordsArr, earlier.token));
    }
  }

  const listOcc: Token[] = [];
  for (let i = 0; i < wordsArr.length; i++) {
    if (skip[i]) continue;
    const m = /^#(\w{1,32})$/.exec(wordsArr[i].text);
    if (m !== null) {
      consume(i, i);
      listOcc.push({ kind: 'list', firstWord: i, lastWord: i, display: `#${m[1]}` });
    }
  }
  if (listOcc.length > 0) {
    const last = listOcc[listOcc.length - 1];
    list = /^#(\w{1,32})$/.exec(wordsArr[last.firstWord].text)![1];
    tokens.push(last);
    for (const earlier of listOcc.slice(0, -1)) {
      displaced.push(tokenRange(wordsArr, earlier));
    }
  }

  const priorityOcc: Token[] = [];
  for (let i = 0; i < wordsArr.length; i++) {
    if (skip[i]) continue;
    const m = /^!p([123])$/.exec(wordsArr[i].lower);
    if (m !== null) {
      consume(i, i);
      priorityOcc.push({ kind: 'priority', firstWord: i, lastWord: i, display: `P${m[1]}` });
    }
  }
  if (priorityOcc.length > 0) {
    const last = priorityOcc[priorityOcc.length - 1];
    priority = Number(/^!p([123])$/.exec(wordsArr[last.firstWord].lower)![1]) as 1 | 2 | 3;
    tokens.push(last);
    for (const earlier of priorityOcc.slice(0, -1)) {
      displaced.push(tokenRange(wordsArr, earlier));
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

  displaced.sort((a, b) => a.start - b.start);

  return {
    valid: title.length > 0,
    title,
    dueDate,
    dueTime,
    list,
    priority,
    recurrence,
    chips,
    displaced,
  };
}
