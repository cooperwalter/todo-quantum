import { describe, expect, it } from 'vitest';
import {
  addDays,
  compareDates,
  isoWeekStart,
  nextSaturdayAfter,
  nextWeekdayAfter,
  snoozeNextWeek,
  snoozeTomorrow,
  snoozeWeekend,
  todayStr,
} from './dates';

describe('todayStr', () => {
  it('returns the local date as YYYY-MM-DD ignoring the time of day', () => {
    expect(todayStr(new Date(2026, 5, 9, 15, 30, 45))).toBe('2026-06-09');
  });

  it('zero-pads single-digit months and days', () => {
    expect(todayStr(new Date(2026, 0, 5, 0, 0, 0))).toBe('2026-01-05');
  });

  it('returns the local date even one minute before midnight', () => {
    expect(todayStr(new Date(2026, 11, 31, 23, 59, 59))).toBe('2026-12-31');
  });
});

describe('addDays', () => {
  it('adds one day within a month', () => {
    expect(addDays('2026-06-09', 1)).toBe('2026-06-10');
  });

  it('crosses a month boundary forward (Jan 31 + 1 = Feb 1)', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
  });

  it('crosses a year boundary forward (Dec 31 + 1 = Jan 1 next year)', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('lands on leap day when adding into Feb 29 of a leap year', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('skips Feb 29 in a non-leap year (Feb 28 + 1 = Mar 1)', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('adds one day across the 23-hour spring-forward DST day 2026-03-08', () => {
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
  });

  it('adds one day across the 25-hour fall-back DST day 2026-11-01', () => {
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
  });

  it('adds seven days across the spring-forward DST week without drift', () => {
    expect(addDays('2026-03-07', 7)).toBe('2026-03-14');
  });

  it('subtracts days when given a negative count (Mar 1 - 1 = Feb 28)', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('returns the same date when adding zero days', () => {
    expect(addDays('2026-06-09', 0)).toBe('2026-06-09');
  });
});

describe('compareDates', () => {
  it('returns a negative number when the first date is earlier', () => {
    expect(compareDates('2026-06-09', '2026-06-10')).toBeLessThan(0);
  });

  it('returns a positive number when the first date is later', () => {
    expect(compareDates('2027-01-01', '2026-12-31')).toBeGreaterThan(0);
  });

  it('returns zero for equal dates', () => {
    expect(compareDates('2026-06-09', '2026-06-09')).toBe(0);
  });
});

describe('nextWeekdayAfter', () => {
  // 2026-06-09 is a Tuesday (ISO weekday 2).
  it('returns the next day when the requested weekday is tomorrow (Tue -> Wed)', () => {
    expect(nextWeekdayAfter('2026-06-09', 3)).toBe('2026-06-10');
  });

  it('returns a date strictly after today when the requested weekday IS today (Tue -> next Tue)', () => {
    expect(nextWeekdayAfter('2026-06-09', 2)).toBe('2026-06-16');
  });

  it('wraps around the week when the requested weekday already passed (Tue -> next Mon)', () => {
    expect(nextWeekdayAfter('2026-06-09', 1)).toBe('2026-06-15');
  });

  it('finds the next Sunday using ISO weekday 7 (Tue -> Sun)', () => {
    expect(nextWeekdayAfter('2026-06-09', 7)).toBe('2026-06-14');
  });

  it('crosses the spring-forward DST transition to the calendar-correct date (Sat 2026-03-07 -> Sun 2026-03-08)', () => {
    expect(nextWeekdayAfter('2026-03-07', 7)).toBe('2026-03-08');
  });

  it('crosses the fall-back DST transition to the calendar-correct date (Sat 2026-10-31 -> Sun 2026-11-01)', () => {
    expect(nextWeekdayAfter('2026-10-31', 7)).toBe('2026-11-01');
  });

  it('crosses a year boundary (Thu 2026-12-31 -> Fri 2027-01-01)', () => {
    expect(nextWeekdayAfter('2026-12-31', 5)).toBe('2027-01-01');
  });
});

describe('nextSaturdayAfter', () => {
  it('returns the upcoming Saturday from a midweek date (Tue Jun 9 -> Sat Jun 13)', () => {
    expect(nextSaturdayAfter('2026-06-09')).toBe('2026-06-13');
  });

  it('returns the FOLLOWING Saturday when today is already Saturday (Jun 13 -> Jun 20)', () => {
    expect(nextSaturdayAfter('2026-06-13')).toBe('2026-06-20');
  });

  it('returns the next-day Saturday from a Friday (Jun 12 -> Jun 13)', () => {
    expect(nextSaturdayAfter('2026-06-12')).toBe('2026-06-13');
  });
});

describe('isoWeekStart', () => {
  it('returns the preceding Monday for a midweek date (Tue Jun 9 -> Mon Jun 8)', () => {
    expect(isoWeekStart('2026-06-09')).toBe('2026-06-08');
  });

  it('returns the same date when given a Monday', () => {
    expect(isoWeekStart('2026-06-08')).toBe('2026-06-08');
  });

  it('returns the Monday six days earlier when given a Sunday (Jun 14 -> Jun 8)', () => {
    expect(isoWeekStart('2026-06-14')).toBe('2026-06-08');
  });

  it('crosses a month boundary backwards (Wed 2026-07-01 -> Mon 2026-06-29)', () => {
    expect(isoWeekStart('2026-07-01')).toBe('2026-06-29');
  });

  it('crosses a year boundary backwards (Fri 2027-01-01 -> Mon 2026-12-28)', () => {
    expect(isoWeekStart('2027-01-01')).toBe('2026-12-28');
  });
});

describe('snoozeTomorrow', () => {
  it('returns today plus one day', () => {
    expect(snoozeTomorrow('2026-06-09')).toBe('2026-06-10');
  });

  it('crosses a month boundary (Jun 30 -> Jul 1)', () => {
    expect(snoozeTomorrow('2026-06-30')).toBe('2026-07-01');
  });
});

describe('snoozeNextWeek', () => {
  it('returns today plus seven days', () => {
    expect(snoozeNextWeek('2026-06-09')).toBe('2026-06-16');
  });

  it('crosses a month boundary (Jun 29 -> Jul 6)', () => {
    expect(snoozeNextWeek('2026-06-29')).toBe('2026-07-06');
  });
});

describe('snoozeWeekend', () => {
  it('returns the next Saturday strictly after a midweek today (Tue Jun 9 -> Sat Jun 13)', () => {
    expect(snoozeWeekend('2026-06-09')).toBe('2026-06-13');
  });

  it('returns the following Saturday when today is Saturday (Jun 13 -> Jun 20)', () => {
    expect(snoozeWeekend('2026-06-13')).toBe('2026-06-20');
  });
});
