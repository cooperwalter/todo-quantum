import { describe, expect, it } from 'vitest';
import { nextOccurrence } from './recurrence';
import type { Recurrence } from './types';

function makeRec(overrides: Partial<Recurrence> = {}): Recurrence {
  return { freq: 'daily', interval: 1, byWeekday: null, byMonthDay: null, ...overrides };
}

describe('nextOccurrence: daily', () => {
  it('advances one day when completed on the due date (interval 1)', () => {
    expect(nextOccurrence(makeRec(), '2026-06-09', '2026-06-09')).toBe('2026-06-10');
  });

  it('advances three days from the anchor with interval 3', () => {
    expect(nextOccurrence(makeRec({ interval: 3 }), '2026-06-09', '2026-06-09')).toBe('2026-06-12');
  });

  it('preserves anchor parity when completed overdue (interval 3, anchor Jun 9, today Jun 14 -> Jun 15)', () => {
    expect(nextOccurrence(makeRec({ interval: 3 }), '2026-06-09', '2026-06-14')).toBe('2026-06-15');
  });

  it('advances from today, not the anchor, when the task is long overdue (no back-dated avalanche)', () => {
    const result = nextOccurrence(makeRec(), '2026-01-01', '2026-06-09');
    expect(result).toBe('2026-06-10');
  });
});

describe('nextOccurrence: weekly', () => {
  it('returns the next Monday after today when byWeekday is [1], anchored Monday, completed Wednesday (FR-28)', () => {
    const rec = makeRec({ freq: 'weekly', byWeekday: [1] });
    expect(nextOccurrence(rec, '2026-06-08', '2026-06-10')).toBe('2026-06-15');
  });

  it('returns the soonest listed weekday with multi-day byWeekday [1,4] (anchor Mon Jun 8 -> Thu Jun 11)', () => {
    const rec = makeRec({ freq: 'weekly', byWeekday: [1, 4] });
    expect(nextOccurrence(rec, '2026-06-08', '2026-06-08')).toBe('2026-06-11');
  });

  it('repeats on the anchor weekday when byWeekday is null (anchor Tue Jun 9 -> Tue Jun 16)', () => {
    const rec = makeRec({ freq: 'weekly' });
    expect(nextOccurrence(rec, '2026-06-09', '2026-06-09')).toBe('2026-06-16');
  });

  it('preserves anchor parity for every-2-weeks (anchor Tue Jun 9, today Jun 10 -> Jun 23 = anchor + 14)', () => {
    const rec = makeRec({ freq: 'weekly', interval: 2 });
    expect(nextOccurrence(rec, '2026-06-09', '2026-06-10')).toBe('2026-06-23');
  });

  it('preserves anchor parity for every-2-weeks completed long overdue (anchor Jun 9, today Jun 25 -> Jul 7 = anchor + 28)', () => {
    const rec = makeRec({ freq: 'weekly', interval: 2 });
    expect(nextOccurrence(rec, '2026-06-09', '2026-06-25')).toBe('2026-07-07');
  });

  it('crosses the spring-forward DST week to a calendar-correct date (anchor Mon Mar 2, today Sat Mar 7 -> Mon Mar 9)', () => {
    const rec = makeRec({ freq: 'weekly', byWeekday: [1] });
    expect(nextOccurrence(rec, '2026-03-02', '2026-03-07')).toBe('2026-03-09');
  });

  it('crosses the fall-back DST week to a calendar-correct date (anchor Mon Oct 26, today Sat Oct 31 -> Mon Nov 2)', () => {
    const rec = makeRec({ freq: 'weekly', byWeekday: [1] });
    expect(nextOccurrence(rec, '2026-10-26', '2026-10-31')).toBe('2026-11-02');
  });
});

describe('nextOccurrence: monthly', () => {
  it('clamps byMonthDay 31 to Feb 28 in a non-leap year (anchor 2026-01-31 -> 2026-02-28)', () => {
    const rec = makeRec({ freq: 'monthly', byMonthDay: 31 });
    expect(nextOccurrence(rec, '2026-01-31', '2026-01-31')).toBe('2026-02-28');
  });

  it('returns to byMonthDay 31 in a 31-day month after a clamped month (today 2026-02-28 -> 2026-03-31)', () => {
    const rec = makeRec({ freq: 'monthly', byMonthDay: 31 });
    expect(nextOccurrence(rec, '2026-01-31', '2026-02-28')).toBe('2026-03-31');
  });

  it('advances to the same day next month for byMonthDay 1 (2026-06-01 -> 2026-07-01)', () => {
    const rec = makeRec({ freq: 'monthly', byMonthDay: 1 });
    expect(nextOccurrence(rec, '2026-06-01', '2026-06-01')).toBe('2026-07-01');
  });

  it('advances from today when completed overdue (byMonthDay 15, anchor Jun 15, today Jun 20 -> Jul 15)', () => {
    const rec = makeRec({ freq: 'monthly', byMonthDay: 15 });
    expect(nextOccurrence(rec, '2026-06-15', '2026-06-20')).toBe('2026-07-15');
  });

  it("falls back to the anchor's day-of-month when byMonthDay is null (anchor Jun 9 -> Jul 9)", () => {
    const rec = makeRec({ freq: 'monthly' });
    expect(nextOccurrence(rec, '2026-06-09', '2026-06-09')).toBe('2026-07-09');
  });

  it('respects interval 2 months (anchor Jun 9 -> Aug 9)', () => {
    const rec = makeRec({ freq: 'monthly', interval: 2, byMonthDay: 9 });
    expect(nextOccurrence(rec, '2026-06-09', '2026-06-09')).toBe('2026-08-09');
  });

  it('respects interval 12 months crossing a year (anchor 2026-06-09 -> 2027-06-09)', () => {
    const rec = makeRec({ freq: 'monthly', interval: 12, byMonthDay: 9 });
    expect(nextOccurrence(rec, '2026-06-09', '2026-06-09')).toBe('2027-06-09');
  });

  it('clamps to leap-day Feb 29 in a leap year (byMonthDay 31, anchor 2028-01-31 -> 2028-02-29)', () => {
    const rec = makeRec({ freq: 'monthly', byMonthDay: 31 });
    expect(nextOccurrence(rec, '2028-01-31', '2028-01-31')).toBe('2028-02-29');
  });
});

describe('nextOccurrence: completion semantics', () => {
  it('always returns a date strictly after max(anchor, today) even when today is before the anchor', () => {
    const rec = makeRec();
    expect(nextOccurrence(rec, '2026-06-20', '2026-06-09')).toBe('2026-06-21');
  });

  it('treats interval 1 as the minimum (interval 1 weekly equals every week)', () => {
    const rec = makeRec({ freq: 'weekly', interval: 1 });
    expect(nextOccurrence(rec, '2026-06-09', '2026-06-09')).toBe('2026-06-16');
  });
});

describe('Review fixes: corrupt recurrence guards (F-008)', () => {
  it('throws on interval 0 instead of looping forever', () => {
    expect(() =>
      nextOccurrence({ freq: 'daily', interval: 0, byWeekday: null, byMonthDay: null }, '2026-06-09', '2026-06-09'),
    ).toThrow(/invalid recurrence interval/);
  });

  it('throws on an empty byWeekday array instead of looping forever', () => {
    expect(() =>
      nextOccurrence({ freq: 'weekly', interval: 1, byWeekday: [], byMonthDay: null }, '2026-06-09', '2026-06-09'),
    ).toThrow(/byWeekday/);
  });
});
