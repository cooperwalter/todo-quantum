import { describe, expect, it } from 'vitest';
import { parse } from './parser';

// 2026-06-09 is a Tuesday.
const NOW = new Date(2026, 5, 9, 10, 0, 0);

describe('parse: date tokens (FR-1)', () => {
  it("recognizes 'today' as the current local date", () => {
    const r = parse('Pay rent today', NOW);
    expect(r.dueDate).toBe('2026-06-09');
    expect(r.title).toBe('Pay rent');
  });

  it("recognizes 'tomorrow' as the next local date", () => {
    const r = parse('Send report tomorrow', NOW);
    expect(r.dueDate).toBe('2026-06-10');
    expect(r.title).toBe('Send report');
  });

  it("recognizes 'yesterday' as the previous local date (the only allowed past date)", () => {
    const r = parse('Log standup yesterday', NOW);
    expect(r.dueDate).toBe('2026-06-08');
  });

  it('recognizes a bare full weekday name as the next such weekday strictly after today (Tue -> friday = Jun 12)', () => {
    expect(parse('Review friday', NOW).dueDate).toBe('2026-06-12');
  });

  it('recognizes a bare 3-letter weekday as the next such weekday strictly after today (Tue -> tue = Jun 16)', () => {
    expect(parse('Standup tue', NOW).dueDate).toBe('2026-06-16');
  });

  it('is case-insensitive for date tokens (Tomorrow)', () => {
    expect(parse('Send report Tomorrow', NOW).dueDate).toBe('2026-06-10');
  });

  it("recognizes 'next <weekday>' as that weekday in the following ISO week (Tue Jun 9 -> next friday = Jun 19)", () => {
    const r = parse('Plan next friday', NOW);
    expect(r.dueDate).toBe('2026-06-19');
    expect(r.title).toBe('Plan');
  });

  it("recognizes '<monthname> <D>' as the next future occurrence (jun 12 -> 2026-06-12)", () => {
    expect(parse('Invoice jun 12', NOW).dueDate).toBe('2026-06-12');
  });

  it("recognizes '<D> <monthname>' as the next future occurrence (12 jun -> 2026-06-12)", () => {
    expect(parse('Invoice 12 jun', NOW).dueDate).toBe('2026-06-12');
  });

  it("rolls '<monthname> <D>' already passed this year into next year (jan 5 -> 2027-01-05)", () => {
    expect(parse('Renew jan 5', NOW).dueDate).toBe('2027-01-05');
  });

  it("recognizes full month names (january 5 -> 2027-01-05)", () => {
    expect(parse('Renew january 5', NOW).dueDate).toBe('2027-01-05');
  });

  it("recognizes 'in N days' (in 3 days -> 2026-06-12)", () => {
    const r = parse('Follow up in 3 days', NOW);
    expect(r.dueDate).toBe('2026-06-12');
    expect(r.title).toBe('Follow up');
  });

  it("recognizes 'in N weeks' (in 2 weeks -> 2026-06-23)", () => {
    expect(parse('Check in 2 weeks', NOW).dueDate).toBe('2026-06-23');
  });
});

describe('parse: literal fallbacks for date lookalikes (FR-2)', () => {
  it("'Pay May invoice' has zero chips and the full literal title (no <monthname> <D> pattern)", () => {
    const r = parse('Pay May invoice', NOW);
    expect(r.chips).toHaveLength(0);
    expect(r.title).toBe('Pay May invoice');
    expect(r.dueDate).toBeNull();
  });

  it("'meet monday-ish' keeps monday-ish literal (whole-word matching only)", () => {
    const r = parse('meet monday-ish', NOW);
    expect(r.dueDate).toBeNull();
    expect(r.title).toBe('meet monday-ish');
  });

  it("'feb 30' stays literal (not a real calendar day)", () => {
    const r = parse('Audit feb 30', NOW);
    expect(r.dueDate).toBeNull();
    expect(r.title).toBe('Audit feb 30');
  });

  it("'in 400 days' stays literal (N outside 1-365)", () => {
    const r = parse('Plan in 400 days', NOW);
    expect(r.dueDate).toBeNull();
    expect(r.title).toBe('Plan in 400 days');
  });
});

describe('parse: time tokens (FR-3)', () => {
  it("recognizes 'H(am|pm)' with a date present (tomorrow 3pm -> 15:00)", () => {
    const r = parse('Send report tomorrow 3pm', NOW);
    expect(r.dueTime).toBe('15:00');
    expect(r.dueDate).toBe('2026-06-10');
  });

  it("recognizes 'H:MM(am|pm)' (tomorrow 3:30pm -> 15:30)", () => {
    expect(parse('Call tomorrow 3:30pm', NOW).dueTime).toBe('15:30');
  });

  it("recognizes am times ('9am' -> 09:00) without a date because of the am suffix", () => {
    const r = parse('Gym 9am', NOW);
    expect(r.dueTime).toBe('09:00');
    expect(r.dueDate).toBeNull();
  });

  it("recognizes 24h 'HH:MM' only when a date token is also present (tomorrow 15:00)", () => {
    expect(parse('Send tomorrow 15:00', NOW).dueTime).toBe('15:00');
  });

  it("keeps 24h 'HH:MM' literal when no date token is present", () => {
    const r = parse('Call at 15:00', NOW);
    expect(r.dueTime).toBeNull();
    expect(r.title).toBe('Call at 15:00');
  });

  it("converts '12am' to 00:00 and '12pm' to 12:00", () => {
    expect(parse('Sleep tomorrow 12am', NOW).dueTime).toBe('00:00');
    expect(parse('Lunch tomorrow 12pm', NOW).dueTime).toBe('12:00');
  });

  it("never treats a bare number as a time ('Buy 3 apples')", () => {
    const r = parse('Buy 3 apples', NOW);
    expect(r.dueTime).toBeNull();
    expect(r.title).toBe('Buy 3 apples');
  });

  it("keeps '25:00' literal (outside 00:00-23:59)", () => {
    const r = parse('Run tomorrow 25:00', NOW);
    expect(r.dueTime).toBeNull();
    expect(r.title).toBe('Run 25:00');
  });

  it("keeps '13pm' literal (12-hour clock hour out of range)", () => {
    const r = parse('Run tomorrow 13pm', NOW);
    expect(r.dueTime).toBeNull();
    expect(r.title).toBe('Run 13pm');
  });
});

describe('parse: date+time chip merging (FR-8 display)', () => {
  it("merges adjacent date and time tokens into one chip with display like 'Wed Jun 10, 3:00 PM'", () => {
    const r = parse('Send report tomorrow 3pm', NOW);
    expect(r.chips).toHaveLength(1);
    expect(r.chips[0].kind).toBe('date');
    expect(r.chips[0].display).toBe('Wed Jun 10, 3:00 PM');
  });

  it('keeps non-adjacent date and time tokens as separate chips', () => {
    const r = parse('tomorrow buy milk 3pm', NOW);
    expect(r.chips).toHaveLength(2);
    expect(r.chips[0].kind).toBe('date');
    expect(r.chips[1].kind).toBe('time');
  });
});

describe('parse: list tokens (FR-4)', () => {
  it("recognizes '#work' as the list and removes it from the title", () => {
    const r = parse('Send report #work', NOW);
    expect(r.list).toBe('work');
    expect(r.title).toBe('Send report');
  });

  it('keeps later # tokens literal when a list is already set (first wins)', () => {
    const r = parse('a #work b #home', NOW);
    expect(r.list).toBe('work');
    expect(r.title).toBe('a b #home');
  });

  it('keeps a # token longer than 32 word characters literal', () => {
    const long = '#' + 'x'.repeat(33);
    const r = parse(`Task ${long}`, NOW);
    expect(r.list).toBeNull();
    expect(r.title).toBe(`Task ${long}`);
  });

  it("keeps a bare '#' literal", () => {
    const r = parse('Issue # tracker', NOW);
    expect(r.list).toBeNull();
    expect(r.title).toBe('Issue # tracker');
  });
});

describe('parse: priority tokens (FR-5)', () => {
  it("recognizes '!p1' as priority 1", () => {
    const r = parse('Fix bug !p1', NOW);
    expect(r.priority).toBe(1);
    expect(r.title).toBe('Fix bug');
  });

  it("recognizes '!p2' and '!p3'", () => {
    expect(parse('a !p2', NOW).priority).toBe(2);
    expect(parse('a !p3', NOW).priority).toBe(3);
  });

  it("keeps '!p4' literal (only p1-p3 exist)", () => {
    const r = parse('Fix !p4', NOW);
    expect(r.priority).toBeNull();
    expect(r.title).toBe('Fix !p4');
  });

  it("keeps '!urgent' literal", () => {
    const r = parse('Fix !urgent', NOW);
    expect(r.priority).toBeNull();
    expect(r.title).toBe('Fix !urgent');
  });

  it('keeps a second priority token literal (first wins)', () => {
    const r = parse('Fix !p1 also !p2', NOW);
    expect(r.priority).toBe(1);
    expect(r.title).toBe('Fix also !p2');
  });
});

describe('parse: recurrence tokens (FR-6)', () => {
  it("parses 'every day' as daily interval 1", () => {
    const r = parse('Standup every day', NOW);
    expect(r.recurrence).toEqual({ freq: 'daily', interval: 1, byWeekday: null, byMonthDay: null });
    expect(r.title).toBe('Standup');
  });

  it("parses 'daily' as daily interval 1", () => {
    expect(parse('Standup daily', NOW).recurrence).toEqual({
      freq: 'daily', interval: 1, byWeekday: null, byMonthDay: null,
    });
  });

  it("parses 'every week'/'weekly' as weekly interval 1", () => {
    const expected = { freq: 'weekly', interval: 1, byWeekday: null, byMonthDay: null };
    expect(parse('Review every week', NOW).recurrence).toEqual(expected);
    expect(parse('Review weekly', NOW).recurrence).toEqual(expected);
  });

  it("parses 'every month'/'monthly' as monthly interval 1", () => {
    const expected = { freq: 'monthly', interval: 1, byWeekday: null, byMonthDay: null };
    expect(parse('Invoice every month', NOW).recurrence).toEqual(expected);
    expect(parse('Invoice monthly', NOW).recurrence).toEqual(expected);
  });

  it("parses 'every 2 weeks' as weekly interval 2", () => {
    expect(parse('Sync every 2 weeks', NOW).recurrence).toEqual({
      freq: 'weekly', interval: 2, byWeekday: null, byMonthDay: null,
    });
  });

  it("parses 'every 3 days' and 'every 2 months'", () => {
    expect(parse('a every 3 days', NOW).recurrence).toEqual({
      freq: 'daily', interval: 3, byWeekday: null, byMonthDay: null,
    });
    expect(parse('a every 2 months', NOW).recurrence).toEqual({
      freq: 'monthly', interval: 2, byWeekday: null, byMonthDay: null,
    });
  });

  it("parses 'every monday' as weekly on Monday (byWeekday [1])", () => {
    const r = parse('Plan every monday', NOW);
    expect(r.recurrence).toEqual({ freq: 'weekly', interval: 1, byWeekday: [1], byMonthDay: null });
    expect(r.dueDate).toBe('2026-06-15');
    expect(r.title).toBe('Plan');
  });

  it("parses 'every weekday' as weekly Mon-Fri (byWeekday [1,2,3,4,5])", () => {
    expect(parse('Standup every weekday', NOW).recurrence).toEqual({
      freq: 'weekly', interval: 1, byWeekday: [1, 2, 3, 4, 5], byMonthDay: null,
    });
  });

  it("keeps 'every' with no valid continuation literal", () => {
    const r = parse('Check every corner', NOW);
    expect(r.recurrence).toBeNull();
    expect(r.title).toBe('Check every corner');
  });
});

describe('parse: same-kind conflicts (FR-9)', () => {
  it('keeps a second date token literal (first wins)', () => {
    const r = parse('Ship tomorrow friday', NOW);
    expect(r.dueDate).toBe('2026-06-10');
    expect(r.title).toBe('Ship friday');
  });

  it('keeps a second time token literal (first wins)', () => {
    const r = parse('Call tomorrow 3pm 4pm', NOW);
    expect(r.dueTime).toBe('15:00');
    expect(r.title).toBe('Call 4pm');
  });
});

describe('parse: title residue and validity (FR-7, FR-13)', () => {
  it('collapses whitespace in the residual title', () => {
    const r = parse('  Send   report   tomorrow  ', NOW);
    expect(r.title).toBe('Send report');
  });

  it('yields valid false when the input is only tokens (empty title)', () => {
    const r = parse('tomorrow 3pm #work !p1', NOW);
    expect(r.valid).toBe(false);
    expect(r.title).toBe('');
  });

  it('yields valid false for empty input', () => {
    expect(parse('', NOW).valid).toBe(false);
  });
});

describe('parse: canonical example (US-002 AC)', () => {
  it("parses 'Send report tomorrow 3pm #work !p1' into all fields with 3 chips", () => {
    const input = 'Send report tomorrow 3pm #work !p1';
    const r = parse(input, NOW);
    expect(r.valid).toBe(true);
    expect(r.title).toBe('Send report');
    expect(r.dueDate).toBe('2026-06-10');
    expect(r.dueTime).toBe('15:00');
    expect(r.list).toBe('work');
    expect(r.priority).toBe(1);
    expect(r.recurrence).toBeNull();
    expect(r.chips).toHaveLength(3);

    const [dateChip, listChip, priorityChip] = r.chips;
    expect(dateChip.kind).toBe('date');
    expect(input.slice(dateChip.start, dateChip.end)).toBe('tomorrow 3pm');
    expect(dateChip.display).toBe('Wed Jun 10, 3:00 PM');
    expect(listChip.kind).toBe('list');
    expect(input.slice(listChip.start, listChip.end)).toBe('#work');
    expect(priorityChip.kind).toBe('priority');
    expect(input.slice(priorityChip.start, priorityChip.end)).toBe('!p1');
  });

  it('chips carry exact source ranges for a recurrence token', () => {
    const input = 'Sync every 2 weeks';
    const r = parse(input, NOW);
    expect(r.chips).toHaveLength(1);
    expect(r.chips[0].kind).toBe('recurrence');
    expect(input.slice(r.chips[0].start, r.chips[0].end)).toBe('every 2 weeks');
  });
});
