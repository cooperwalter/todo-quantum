import { describe, expect, it } from 'vitest';
import { serializeTask } from './serialize';
import { parse } from './parser';
import { addDays, todayStr } from './dates';
import type { Recurrence, Task } from './types';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Write report',
    status: 'open',
    dueDate: null,
    dueTime: null,
    list: null,
    priority: null,
    recurrence: null,
    createdAt: '2026-06-10T12:00:00.000Z',
    completedAt: null,
    order: 0,
    ...overrides,
  };
}

function makeRecurrence(overrides: Partial<Recurrence> = {}): Recurrence {
  return { freq: 'daily', interval: 1, byWeekday: null, byMonthDay: null, ...overrides };
}

// A fixed clock pinned away from month/year boundaries so that "+30d" and the
// explicit-year cases land deterministically.
const NOW = new Date(2026, 5, 10, 9, 0, 0); // 2026-06-10 local

describe('serializeTask token order', () => {
  it('places tokens as title, date, time, recurrence, list, priority single-space separated', () => {
    const task = makeTask({
      title: 'Send report',
      dueDate: addDays(todayStr(NOW), 1),
      dueTime: '15:00',
      recurrence: makeRecurrence({ freq: 'weekly', interval: 2, byWeekday: null }),
      list: 'work',
      priority: 1,
    });
    const { text } = serializeTask(task, NOW);
    expect(text).toBe('Send report tomorrow 3pm every 2 weeks #work !p1');
  });

  it('emits only the title when no token fields are set', () => {
    const { text, revertedRanges } = serializeTask(makeTask({ title: 'Buy milk' }), NOW);
    expect(text).toBe('Buy milk');
    expect(revertedRanges).toEqual([]);
  });
});

describe('serializeTask date forms', () => {
  it('serializes dueDate = now-1 as "yesterday"', () => {
    const task = makeTask({ dueDate: addDays(todayStr(NOW), -1) });
    expect(serializeTask(task, NOW).text).toBe('Write report yesterday');
  });

  it('serializes dueDate = now as "today"', () => {
    const task = makeTask({ dueDate: todayStr(NOW) });
    expect(serializeTask(task, NOW).text).toBe('Write report today');
  });

  it('serializes dueDate = now+1 as "tomorrow"', () => {
    const task = makeTask({ dueDate: addDays(todayStr(NOW), 1) });
    expect(serializeTask(task, NOW).text).toBe('Write report tomorrow');
  });

  it('serializes a date within the next 12 months as bare "<mon> <day>"', () => {
    const task = makeTask({ dueDate: '2026-06-12' });
    expect(serializeTask(task, NOW).text).toBe('Write report jun 12');
  });

  it('serializes a date more than 12 months ahead with an explicit year', () => {
    const task = makeTask({ dueDate: addDays(todayStr(NOW), 370) });
    const { text } = serializeTask(task, NOW);
    expect(text).toMatch(/^Write report jun 15 2027$/);
  });

  it('serializes a past date (beyond yesterday) with an explicit year', () => {
    const task = makeTask({ dueDate: addDays(todayStr(NOW), -370) });
    const { text } = serializeTask(task, NOW);
    expect(text).toBe('Write report jun 5 2025');
  });
});

describe('serializeTask time forms', () => {
  it('serializes an on-the-hour afternoon time as "3pm"', () => {
    expect(serializeTask(makeTask({ dueTime: '15:00' }), NOW).text).toBe('Write report 3pm');
  });

  it('serializes a half-past afternoon time as "3:30pm"', () => {
    expect(serializeTask(makeTask({ dueTime: '15:30' }), NOW).text).toBe('Write report 3:30pm');
  });

  it('serializes midnight as "12am"', () => {
    expect(serializeTask(makeTask({ dueTime: '00:00' }), NOW).text).toBe('Write report 12am');
  });

  it('serializes noon as "12pm"', () => {
    expect(serializeTask(makeTask({ dueTime: '12:00' }), NOW).text).toBe('Write report 12pm');
  });

  it('serializes an early-morning time with minutes as "9:05am"', () => {
    expect(serializeTask(makeTask({ dueTime: '09:05' }), NOW).text).toBe('Write report 9:05am');
  });
});

describe('serializeTask recurrence grammar forms', () => {
  it('serializes daily interval 1 as "every day"', () => {
    const r = makeRecurrence({ freq: 'daily', interval: 1 });
    expect(serializeTask(makeTask({ recurrence: r }), NOW).text).toContain('every day');
  });

  it('serializes daily interval 3 as "every 3 days"', () => {
    const r = makeRecurrence({ freq: 'daily', interval: 3 });
    expect(serializeTask(makeTask({ recurrence: r }), NOW).text).toContain('every 3 days');
  });

  it('serializes weekly interval 1 with no weekday as "every week"', () => {
    const r = makeRecurrence({ freq: 'weekly', interval: 1, byWeekday: null });
    expect(serializeTask(makeTask({ recurrence: r }), NOW).text).toContain('every week');
  });

  it('serializes weekly interval 2 as "every 2 weeks"', () => {
    const r = makeRecurrence({ freq: 'weekly', interval: 2, byWeekday: null });
    expect(serializeTask(makeTask({ recurrence: r }), NOW).text).toContain('every 2 weeks');
  });

  it('serializes weekly on Monday as "every monday"', () => {
    const r = makeRecurrence({ freq: 'weekly', interval: 1, byWeekday: [1] });
    expect(serializeTask(makeTask({ recurrence: r }), NOW).text).toContain('every monday');
  });

  it('serializes weekly Mon-Fri as "every weekday"', () => {
    const r = makeRecurrence({ freq: 'weekly', interval: 1, byWeekday: [1, 2, 3, 4, 5] });
    expect(serializeTask(makeTask({ recurrence: r }), NOW).text).toContain('every weekday');
  });

  it('serializes monthly interval 1 as "every month"', () => {
    const r = makeRecurrence({ freq: 'monthly', interval: 1 });
    expect(serializeTask(makeTask({ recurrence: r }), NOW).text).toContain('every month');
  });

  it('serializes monthly interval 4 as "every 4 months"', () => {
    const r = makeRecurrence({ freq: 'monthly', interval: 4 });
    expect(serializeTask(makeTask({ recurrence: r }), NOW).text).toContain('every 4 months');
  });
});

describe('serializeTask list and priority', () => {
  it('serializes a list as "#work"', () => {
    expect(serializeTask(makeTask({ list: 'work' }), NOW).text).toBe('Write report #work');
  });

  it('serializes priority 1 as "!p1"', () => {
    expect(serializeTask(makeTask({ priority: 1 }), NOW).text).toBe('Write report !p1');
  });

  it('serializes priority 3 as "!p3"', () => {
    expect(serializeTask(makeTask({ priority: 3 }), NOW).text).toBe('Write report !p3');
  });
});

describe('serializeTask title-literal detection (revertedRanges)', () => {
  it('reverts the word "tomorrow" inside the title "Plan tomorrow standup"', () => {
    const task = makeTask({ title: 'Plan tomorrow standup' });
    const { text, revertedRanges } = serializeTask(task, NOW);
    expect(text).toBe('Plan tomorrow standup');
    const start = text.indexOf('tomorrow');
    expect(revertedRanges).toContainEqual({ start, end: start + 'tomorrow'.length });
  });

  it('keeps the literal title intact when parsed back with revertedRanges', () => {
    const task = makeTask({ title: 'Plan tomorrow standup' });
    const { text, revertedRanges } = serializeTask(task, NOW);
    const result = parse(text, NOW, revertedRanges);
    expect(result.title).toBe('Plan tomorrow standup');
    expect(result.dueDate).toBeNull();
  });

  it('reverts a list-like word "#invoices" inside the title', () => {
    const task = makeTask({ title: 'Email #invoices tomorrow' });
    const { text, revertedRanges } = serializeTask(task, NOW);
    const result = parse(text, NOW, revertedRanges);
    expect(result.title).toBe('Email #invoices tomorrow');
    expect(result.list).toBeNull();
    expect(result.dueDate).toBeNull();
  });

  it('returns an empty revertedRanges array for a plain title with no token-like words', () => {
    const { revertedRanges } = serializeTask(makeTask({ title: 'Buy groceries' }), NOW);
    expect(revertedRanges).toEqual([]);
  });

  it('reverts token-like words while still emitting real token fields after the title', () => {
    const task = makeTask({
      title: 'Plan tomorrow standup',
      dueDate: addDays(todayStr(NOW), 1),
      list: 'work',
    });
    const { text, revertedRanges } = serializeTask(task, NOW);
    expect(text).toBe('Plan tomorrow standup tomorrow #work');
    const result = parse(text, NOW, revertedRanges);
    expect(result.title).toBe('Plan tomorrow standup');
    expect(result.dueDate).toBe(addDays(todayStr(NOW), 1));
    expect(result.list).toBe('work');
  });
});

describe('serializeTask edge cases', () => {
  it('handles an empty title with all token fields present', () => {
    const task = makeTask({
      title: '',
      dueDate: todayStr(NOW),
      dueTime: '15:00',
      list: 'work',
      priority: 2,
    });
    const { text, revertedRanges } = serializeTask(task, NOW);
    expect(text).toBe('today 3pm #work !p2');
    expect(revertedRanges).toEqual([]);
  });

  it('ignores Recurrence.byMonthDay (no grammar form) when serializing monthly', () => {
    const r = makeRecurrence({ freq: 'monthly', interval: 1, byMonthDay: 15 });
    expect(serializeTask(makeTask({ recurrence: r }), NOW).text).toContain('every month');
  });

  it('serializes a title containing many token-like words at scale', () => {
    const words = Array.from({ length: 100 }, () => 'tomorrow').join(' ');
    const task = makeTask({ title: words });
    const { text, revertedRanges } = serializeTask(task, NOW);
    expect(revertedRanges).toHaveLength(100);
    const result = parse(text, NOW, revertedRanges);
    expect(result.title).toBe(words);
  });
});

describe('serializeTask round-trip property grid', () => {
  const today = todayStr(NOW);
  const dueDateOptions: Array<string | null> = [
    null,
    addDays(today, -1), // yesterday
    today, // today
    addDays(today, 1), // tomorrow
    addDays(today, 30), // bare <mon> <day> within 12 months
    addDays(today, -370), // explicit-year past
    addDays(today, 370), // explicit-year future
  ];
  const dueTimeOptions: Array<string | null> = [null, '15:00', '15:30', '00:00', '12:00', '09:05'];
  const listOptions: Array<string | null> = [null, 'work'];
  const priorityOptions: Array<1 | 2 | 3 | null> = [null, 1, 2, 3];
  const recurrenceOptions: Array<Recurrence | null> = [
    null,
    makeRecurrence({ freq: 'daily', interval: 1 }),
    makeRecurrence({ freq: 'daily', interval: 2 }),
    makeRecurrence({ freq: 'weekly', interval: 1, byWeekday: null }),
    makeRecurrence({ freq: 'weekly', interval: 2, byWeekday: null }),
    makeRecurrence({ freq: 'weekly', interval: 1, byWeekday: [1] }),
    makeRecurrence({ freq: 'weekly', interval: 1, byWeekday: [1, 2, 3, 4, 5] }),
    makeRecurrence({ freq: 'monthly', interval: 1 }),
    makeRecurrence({ freq: 'monthly', interval: 3 }),
  ];
  const titleOptions = ['Write report', 'Email invoices', 'call mom sharp'];

  type GridCase = {
    label: string;
    task: Task;
  };

  function buildGrid(): GridCase[] {
    const cases: GridCase[] = [];
    for (const dueDate of dueDateOptions) {
      for (const dueTime of dueTimeOptions) {
        for (const recurrence of recurrenceOptions) {
          for (const list of listOptions) {
            for (const priority of priorityOptions) {
              const title = titleOptions[cases.length % titleOptions.length];
              cases.push({
                label: `title=${title} date=${dueDate} time=${dueTime} rec=${recurrence ? recurrence.freq + recurrence.interval + (recurrence.byWeekday ?? '') : 'none'} list=${list} prio=${priority}`,
                task: makeTask({ title, dueDate, dueTime, recurrence, list, priority }),
              });
            }
          }
        }
      }
    }
    return cases;
  }

  const grid = buildGrid();

  it('generates a grid of at least 2000 task combinations', () => {
    expect(grid.length).toBeGreaterThanOrEqual(2000);
  });

  it.each(grid)('round-trips $label', ({ task }) => {
    const { text, revertedRanges } = serializeTask(task, NOW);
    const result = parse(text, NOW, revertedRanges);

    expect(result.title).toBe(task.title);
    expect(result.dueTime).toBe(task.dueTime);
    expect(result.list).toBe(task.list);
    expect(result.priority).toBe(task.priority);
    expect(result.recurrence).toEqual(task.recurrence);

    if (task.dueDate !== null) {
      expect(result.dueDate).toBe(task.dueDate);
    } else if (task.recurrence === null) {
      expect(result.dueDate).toBeNull();
    }
    // When dueDate is null but recurrence is set, the parser infers a first
    // occurrence; that inference is deterministic parser behavior, not a
    // serializer round-trip concern, so dueDate is intentionally not asserted.
  });
});

describe('serializeTask adversarial token-like titles round-trip', () => {
  const adversarialTitles = [
    'Email #invoices tomorrow',
    'call mom 3pm sharp',
    'review every monday notes',
    'pay !p1 bill today',
    'meet jun 12 friends',
    'plan next week sprint',
    'tomorrow today yesterday',
    'standup at 12pm review',
  ];

  it.each(adversarialTitles)(
    'reverts token-like words in the title %s so the literal title survives a round-trip',
    (title) => {
      const task = makeTask({ title, dueDate: addDays(todayStr(NOW), 1), list: 'work', priority: 2 });
      const { text, revertedRanges } = serializeTask(task, NOW);
      const result = parse(text, NOW, revertedRanges);
      expect(result.title).toBe(title);
      expect(result.dueDate).toBe(addDays(todayStr(NOW), 1));
      expect(result.list).toBe('work');
      expect(result.priority).toBe(2);
    },
  );
});
