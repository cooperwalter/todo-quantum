import { describe, expect, it } from 'vitest';
import { formatDateDisplay, parse } from './parser';

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

  it("keeps the LAST #list when two are present and displaces the earlier one (last wins, '#work' then '#home' -> home)", () => {
    const input = 'a #work b #home';
    const r = parse(input, NOW);
    expect(r.list).toBe('home');
    expect(r.title).toBe('a b');
    expect(r.displaced).toHaveLength(1);
    expect(input.slice(r.displaced[0].start, r.displaced[0].end)).toBe('#work');
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

  it('keeps the LAST priority when two are present and displaces the earlier one (last wins, !p1 then !p2 -> 2)', () => {
    const input = 'Fix !p1 also !p2';
    const r = parse(input, NOW);
    expect(r.priority).toBe(2);
    expect(r.title).toBe('Fix also');
    expect(r.displaced).toHaveLength(1);
    expect(input.slice(r.displaced[0].start, r.displaced[0].end)).toBe('!p1');
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

describe('parse: same-kind last-wins with displaced ranges (US-102, FR-102 supersedes FR-9)', () => {
  it('keeps the LAST date token and displaces the earlier one (tomorrow then friday -> Friday)', () => {
    const input = 'Ship tomorrow friday';
    const r = parse(input, NOW);
    expect(r.dueDate).toBe('2026-06-12');
    expect(r.title).toBe('Ship');
    expect(r.displaced).toHaveLength(1);
    expect(input.slice(r.displaced[0].start, r.displaced[0].end)).toBe('tomorrow');
  });

  it("'pay rent friday monday' yields the Monday date, a chip on 'monday', friday's range in displaced, and title 'pay rent'", () => {
    const input = 'pay rent friday monday';
    const r = parse(input, NOW);
    expect(r.dueDate).toBe('2026-06-15');
    expect(r.title).toBe('pay rent');
    expect(r.chips).toHaveLength(1);
    expect(r.chips[0].kind).toBe('date');
    expect(input.slice(r.chips[0].start, r.chips[0].end)).toBe('monday');
    expect(r.displaced).toHaveLength(1);
    expect(input.slice(r.displaced[0].start, r.displaced[0].end)).toBe('friday');
  });

  it('keeps the LAST time token and displaces the earlier one (3pm then 4pm -> 16:00)', () => {
    const input = 'Call tomorrow 3pm 4pm';
    const r = parse(input, NOW);
    expect(r.dueTime).toBe('16:00');
    expect(r.title).toBe('Call');
    expect(r.displaced).toHaveLength(1);
    expect(input.slice(r.displaced[0].start, r.displaced[0].end)).toBe('3pm');
  });

  it("displaces pre-merge: 'dinner tomorrow 3pm 4pm' keeps the date, time -> 16:00, displaced is ONLY the 3pm range", () => {
    const input = 'dinner tomorrow 3pm 4pm';
    const r = parse(input, NOW);
    expect(r.dueDate).toBe('2026-06-10');
    expect(r.dueTime).toBe('16:00');
    expect(r.title).toBe('dinner');
    expect(r.displaced).toHaveLength(1);
    expect(input.slice(r.displaced[0].start, r.displaced[0].end)).toBe('3pm');
    expect(r.displaced[0].start).toBe(input.indexOf('3pm'));
  });

  it('applies last-wins to recurrence independently (daily then weekly -> weekly, daily displaced)', () => {
    const input = 'sync daily weekly';
    const r = parse(input, NOW);
    expect(r.recurrence).toEqual({ freq: 'weekly', interval: 1, byWeekday: null, byMonthDay: null });
    expect(r.title).toBe('sync');
    expect(r.displaced).toHaveLength(1);
    expect(input.slice(r.displaced[0].start, r.displaced[0].end)).toBe('daily');
  });

  it('displaces each kind independently when duplicate #list, !p, and recurrence all appear', () => {
    const input = 'a #work #home !p1 !p3 daily weekly';
    const r = parse(input, NOW);
    expect(r.list).toBe('home');
    expect(r.priority).toBe(3);
    expect(r.recurrence).toEqual({ freq: 'weekly', interval: 1, byWeekday: null, byMonthDay: null });
    expect(r.title).toBe('a');
    const displacedTexts = r.displaced.map((d) => input.slice(d.start, d.end)).sort();
    expect(displacedTexts).toEqual(['#work', '!p1', 'daily'].sort());
  });

  it('reports an empty displaced array when no kind is duplicated', () => {
    const r = parse('Send report tomorrow 3pm #work !p1', NOW);
    expect(r.displaced).toEqual([]);
  });

  it('displaces three same-kind tokens down to the last, recording both earlier ranges', () => {
    const input = 'note #a #b #c';
    const r = parse(input, NOW);
    expect(r.list).toBe('c');
    expect(r.title).toBe('note');
    const displacedTexts = r.displaced.map((d) => input.slice(d.start, d.end)).sort();
    expect(displacedTexts).toEqual(['#a', '#b']);
  });
});

describe('parse: reverted ranges make tokens unmatchable (US-102, FR-101)', () => {
  it("with reverted covering 'tomorrow' in 'Email #invoices tomorrow friday' -> Friday date, displaced empty, 'tomorrow' stays in title", () => {
    const input = 'Email #invoices tomorrow friday';
    const start = input.indexOf('tomorrow');
    const r = parse(input, NOW, [{ start, end: start + 'tomorrow'.length }]);
    expect(r.dueDate).toBe('2026-06-12');
    expect(r.title).toBe('Email tomorrow');
    expect(r.list).toBe('invoices');
    expect(r.displaced).toEqual([]);
  });

  it('skips a reverted #list so the next same-kind token wins without displacement', () => {
    const input = 'a #work b #home';
    const start = input.indexOf('#work');
    const r = parse(input, NOW, [{ start, end: start + '#work'.length }]);
    expect(r.list).toBe('home');
    expect(r.title).toBe('a #work b');
    expect(r.displaced).toEqual([]);
  });

  it('keeps every token literal when all of them fall inside reverted ranges', () => {
    const input = 'plan tomorrow';
    const start = input.indexOf('tomorrow');
    const r = parse(input, NOW, [{ start, end: start + 'tomorrow'.length }]);
    expect(r.dueDate).toBeNull();
    expect(r.title).toBe('plan tomorrow');
    expect(r.chips).toEqual([]);
    expect(r.displaced).toEqual([]);
  });

  it('treats a two-arg call as having no reverted ranges (backward compatible)', () => {
    const r = parse('Send report tomorrow', NOW);
    expect(r.dueDate).toBe('2026-06-10');
  });

  it('ignores an empty reverted array exactly like the two-arg form', () => {
    const r = parse('Send report tomorrow', NOW, []);
    expect(r.dueDate).toBe('2026-06-10');
  });
});

describe('parse: last-wins edge and scale cases (US-102)', () => {
  it('returns empty displaced for empty input', () => {
    const r = parse('', NOW);
    expect(r.displaced).toEqual([]);
  });

  it('returns empty displaced for whitespace-only input', () => {
    const r = parse('   ', NOW);
    expect(r.displaced).toEqual([]);
  });

  it("'Pay May invoice' stays literal with empty displaced (ambiguity anchor unchanged)", () => {
    const r = parse('Pay May invoice', NOW);
    expect(r.chips).toHaveLength(0);
    expect(r.title).toBe('Pay May invoice');
    expect(r.dueDate).toBeNull();
    expect(r.displaced).toEqual([]);
  });

  it('keeps only the last of 50 duplicate #list tokens, displacing the first 49 (scale)', () => {
    const tags = Array.from({ length: 50 }, (_, i) => `#t${i}`);
    const input = `bulk ${tags.join(' ')}`;
    const r = parse(input, NOW);
    expect(r.list).toBe('t49');
    expect(r.title).toBe('bulk');
    expect(r.displaced).toHaveLength(49);
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

// 2026-06-10 is a Wednesday.
const NOW_JUN_10 = new Date(2026, 5, 10, 10, 0, 0);

describe('parse: explicit-year dates (US-101, FR-104)', () => {
  it("parses '<monthname> <day> <year>' to that exact past date with no roll-forward ('jun 3 2026' at 2026-06-10 -> 2026-06-03)", () => {
    const input = 'pay rent jun 3 2026';
    const r = parse(input, NOW_JUN_10);
    expect(r.dueDate).toBe('2026-06-03');
    expect(r.title).toBe('pay rent');
    expect(r.chips).toHaveLength(1);
    expect(r.chips[0].kind).toBe('date');
    expect(input.slice(r.chips[0].start, r.chips[0].end)).toBe('jun 3 2026');
  });

  it("parses '<day> <monthname> <year>' to that exact past date ('3 jun 2026' -> 2026-06-03) with the chip covering all three words", () => {
    const input = 'pay rent 3 jun 2026';
    const r = parse(input, NOW_JUN_10);
    expect(r.dueDate).toBe('2026-06-03');
    expect(r.title).toBe('pay rent');
    expect(r.chips).toHaveLength(1);
    expect(input.slice(r.chips[0].start, r.chips[0].end)).toBe('3 jun 2026');
  });

  it("parses an explicit future year with no roll-forward logic ('jun 3 2030' -> 2030-06-03)", () => {
    expect(parse('renew domain jun 3 2030', NOW_JUN_10).dueDate).toBe('2030-06-03');
  });

  it("accepts the lower year boundary ('mar 1 1970' -> 1970-03-01)", () => {
    expect(parse('archive mar 1 1970', NOW_JUN_10).dueDate).toBe('1970-03-01');
  });

  it("accepts the upper year boundary ('mar 1 2100' -> 2100-03-01)", () => {
    expect(parse('archive mar 1 2100', NOW_JUN_10).dueDate).toBe('2100-03-01');
  });

  it("keeps a year below 1970 literal: 'jun 3 1969' rolls 'jun 3' forward and leaves '1969' in the title", () => {
    const r = parse('pay rent jun 3 1969', NOW_JUN_10);
    expect(r.dueDate).toBe('2027-06-03');
    expect(r.title).toBe('pay rent 1969');
  });

  it("keeps a year above 2100 literal: 'jun 3 2101' rolls 'jun 3' forward and leaves '2101' in the title", () => {
    const r = parse('pay rent jun 3 2101', NOW_JUN_10);
    expect(r.dueDate).toBe('2027-06-03');
    expect(r.title).toBe('pay rent 2101');
  });

  it("keeps a non-4-digit trailing number literal: 'jun 3 26' rolls 'jun 3' forward and leaves '26' in the title", () => {
    const r = parse('pay rent jun 3 26', NOW_JUN_10);
    expect(r.dueDate).toBe('2027-06-03');
    expect(r.title).toBe('pay rent 26');
  });

  it("parses 'feb 29 <leap year>' as that real day ('feb 29 2028' -> 2028-02-29)", () => {
    expect(parse('audit feb 29 2028', NOW_JUN_10).dueDate).toBe('2028-02-29');
  });

  it("keeps 'feb 29 <non-leap year>' fully literal ('feb 29 2027' is not a real calendar day)", () => {
    const r = parse('audit feb 29 2027', NOW_JUN_10);
    expect(r.dueDate).toBeNull();
    expect(r.title).toBe('audit feb 29 2027');
    expect(r.chips).toHaveLength(0);
  });

  it("still rolls a no-year '<monthname> <day>' already passed this year into next year ('jun 3' at 2026-06-10 -> 2027-06-03)", () => {
    const r = parse('pay rent jun 3', NOW_JUN_10);
    expect(r.dueDate).toBe('2027-06-03');
    expect(r.title).toBe('pay rent');
  });

  it('merges an explicit-year date with an adjacent time into one chip covering all four words', () => {
    const input = 'pay rent jun 3 2030 3pm';
    const r = parse(input, NOW_JUN_10);
    expect(r.dueDate).toBe('2030-06-03');
    expect(r.dueTime).toBe('15:00');
    expect(r.chips).toHaveLength(1);
    expect(input.slice(r.chips[0].start, r.chips[0].end)).toBe('jun 3 2030 3pm');
  });
});

describe('parse: year-aware chip display (US-101 AC-4)', () => {
  it("renders an explicit-year chip without the year when the resolved year equals now's year ('jun 3 2026' at 2026 -> 'Wed Jun 3')", () => {
    const r = parse('pay rent jun 3 2026', NOW_JUN_10);
    expect(r.chips[0].display).toBe('Wed Jun 3');
  });

  it("renders an explicit-year chip with the year when the resolved year differs from now's year ('jun 3 2030' -> 'Mon Jun 3, 2030')", () => {
    const r = parse('renew domain jun 3 2030', NOW_JUN_10);
    expect(r.chips[0].display).toBe('Mon Jun 3, 2030');
  });

  it("renders a no-year date that rolled forward into next year with the year ('jan 5' at 2026-06-10 -> 'Tue Jan 5, 2027')", () => {
    const r = parse('renew jan 5', NOW_JUN_10);
    expect(r.dueDate).toBe('2027-01-05');
    expect(r.chips[0].display).toBe('Tue Jan 5, 2027');
  });
});

describe('formatDateDisplay: optional now parameter (US-101 AC-4)', () => {
  it("appends ', YYYY' when the date's year differs from now's year (formatDateDisplay('2027-06-03', now in 2026) -> 'Thu Jun 3, 2027')", () => {
    expect(formatDateDisplay('2027-06-03', NOW_JUN_10)).toBe('Thu Jun 3, 2027');
  });

  it("omits the year when the date's year equals now's year (formatDateDisplay('2026-06-12', now in 2026) -> 'Fri Jun 12')", () => {
    expect(formatDateDisplay('2026-06-12', NOW_JUN_10)).toBe('Fri Jun 12');
  });

  it("never shows the year when called without a now argument (formatDateDisplay('2027-06-03') -> 'Thu Jun 3')", () => {
    expect(formatDateDisplay('2027-06-03')).toBe('Thu Jun 3');
  });
});
