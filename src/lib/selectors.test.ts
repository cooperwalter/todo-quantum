import { describe, expect, it } from 'vitest';
import { allItems, doneItems, todayItems, upcomingGroups } from './selectors';
import type { AppData, Task } from './types';

const TODAY = '2026-06-09';

let counter = 0;
function makeTask(overrides: Partial<Task> = {}): Task {
  counter += 1;
  return {
    id: `task-${counter}`,
    title: `Task ${counter}`,
    status: 'open',
    dueDate: null,
    dueTime: null,
    list: null,
    priority: null,
    recurrence: null,
    createdAt: '2026-06-01T08:00:00.000Z',
    completedAt: null,
    order: counter,
    ...overrides,
  };
}

function makeAppData(tasks: Task[] = []): AppData {
  return { schemaVersion: 1, tasks };
}

describe('todayItems', () => {
  it('puts open tasks with dueDate before today into rollover, ascending by dueDate', () => {
    const older = makeTask({ dueDate: '2026-06-01' });
    const newer = makeTask({ dueDate: '2026-06-08' });
    const sections = todayItems(makeAppData([newer, older]), TODAY);
    expect(sections.rollover.map((t) => t.id)).toEqual([older.id, newer.id]);
  });

  it('excludes done tasks from rollover even when their dueDate passed', () => {
    const done = makeTask({ dueDate: '2026-06-01', status: 'done', completedAt: '2026-06-02T10:00:00.000Z' });
    const sections = todayItems(makeAppData([done]), TODAY);
    expect(sections.rollover).toEqual([]);
  });

  it('orders due-today tasks by dueTime ascending with null times last, then by order', () => {
    const nineAm = makeTask({ dueDate: TODAY, dueTime: '09:00' });
    const threePm = makeTask({ dueDate: TODAY, dueTime: '15:00' });
    const noTimeFirst = makeTask({ dueDate: TODAY });
    const noTimeSecond = makeTask({ dueDate: TODAY });
    const sections = todayItems(makeAppData([noTimeSecond, threePm, noTimeFirst, nineAm]), TODAY);
    expect(sections.dueToday.map((t) => t.id)).toEqual([
      nineAm.id, threePm.id, noTimeFirst.id, noTimeSecond.id,
    ].sort((a, b) => {
      const ids = [nineAm.id, threePm.id, noTimeFirst.id, noTimeSecond.id];
      return ids.indexOf(a) - ids.indexOf(b);
    }));
  });

  it('puts open undated tasks into anytime sorted by order', () => {
    const second = makeTask({ order: 20 });
    const first = makeTask({ order: 10 });
    const sections = todayItems(makeAppData([second, first]), TODAY);
    expect(sections.anytime.map((t) => t.id)).toEqual([first.id, second.id]);
  });

  it('excludes future-dated tasks from all three sections', () => {
    const future = makeTask({ dueDate: '2026-06-15' });
    const sections = todayItems(makeAppData([future]), TODAY);
    expect(sections.rollover).toEqual([]);
    expect(sections.dueToday).toEqual([]);
    expect(sections.anytime).toEqual([]);
  });

  it('returns three empty sections for empty AppData', () => {
    const sections = todayItems(makeAppData(), TODAY);
    expect(sections).toEqual({ rollover: [], dueToday: [], anytime: [] });
  });
});

describe('upcomingGroups', () => {
  it('creates day-groups for today+1 through today+7 and omits empty groups', () => {
    const tomorrow = makeTask({ dueDate: '2026-06-10' });
    const inFive = makeTask({ dueDate: '2026-06-14' });
    const groups = upcomingGroups(makeAppData([tomorrow, inFive]), TODAY);
    expect(groups.map((g) => g.kind)).toEqual(['day', 'day']);
    expect(groups[0].tasks).toEqual([tomorrow]);
    expect(groups[1].tasks).toEqual([inFive]);
  });

  it('groups tasks beyond today+7 into ISO-week groups with stable Week-of labels', () => {
    const nextWeek = makeTask({ dueDate: '2026-06-18' });
    const farOut = makeTask({ dueDate: '2026-06-24' });
    const groups = upcomingGroups(makeAppData([nextWeek, farOut]), TODAY);
    expect(groups.map((g) => g.kind)).toEqual(['week', 'week']);
    expect(groups[0].label).toBe('Week of Jun 15');
    expect(groups[1].label).toBe('Week of Jun 22');
  });

  it('places a task exactly 7 days out in a day-group, 8 days out in a week-group', () => {
    const seventh = makeTask({ dueDate: '2026-06-16' });
    const eighth = makeTask({ dueDate: '2026-06-17' });
    const groups = upcomingGroups(makeAppData([seventh, eighth]), TODAY);
    expect(groups[0].kind).toBe('day');
    expect(groups[0].tasks).toEqual([seventh]);
    expect(groups[1].kind).toBe('week');
    expect(groups[1].tasks).toEqual([eighth]);
  });

  it('labels day groups with weekday and date (Wed Jun 10)', () => {
    const tomorrow = makeTask({ dueDate: '2026-06-10' });
    const groups = upcomingGroups(makeAppData([tomorrow]), TODAY);
    expect(groups[0].label).toBe('Wed Jun 10');
  });

  it('sorts tasks inside a day group by dueTime ascending nulls-last then order', () => {
    const late = makeTask({ dueDate: '2026-06-10', dueTime: '17:00' });
    const early = makeTask({ dueDate: '2026-06-10', dueTime: '08:00' });
    const untimed = makeTask({ dueDate: '2026-06-10' });
    const groups = upcomingGroups(makeAppData([untimed, late, early]), TODAY);
    expect(groups[0].tasks.map((t) => t.id)).toEqual([early.id, late.id, untimed.id]);
  });

  it('sorts tasks inside a week group by dueDate then order', () => {
    const wed = makeTask({ dueDate: '2026-06-24' });
    const mon = makeTask({ dueDate: '2026-06-22' });
    const groups = upcomingGroups(makeAppData([wed, mon]), TODAY);
    expect(groups[0].tasks.map((t) => t.id)).toEqual([mon.id, wed.id]);
  });

  it('excludes done tasks, overdue tasks, today tasks, and undated tasks', () => {
    const done = makeTask({ dueDate: '2026-06-12', status: 'done', completedAt: '2026-06-08T10:00:00.000Z' });
    const overdue = makeTask({ dueDate: '2026-06-01' });
    const today = makeTask({ dueDate: TODAY });
    const undated = makeTask();
    const groups = upcomingGroups(makeAppData([done, overdue, today, undated]), TODAY);
    expect(groups).toEqual([]);
  });

  it('handles tasks dated years ahead without error', () => {
    const far = makeTask({ dueDate: '2030-01-15' });
    const groups = upcomingGroups(makeAppData([far]), TODAY);
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe('week');
    expect(groups[0].tasks).toEqual([far]);
  });
});

describe('allItems', () => {
  it('returns all open tasks for an empty filter, dated (dueDate ascending) before anytime (by order)', () => {
    const anytime = makeTask({ order: 1 });
    const dated = makeTask({ dueDate: '2026-06-20', order: 2 });
    const sooner = makeTask({ dueDate: '2026-06-10', order: 3 });
    const result = allItems(makeAppData([anytime, dated, sooner]), '');
    expect(result.map((t) => t.id)).toEqual([sooner.id, dated.id, anytime.id]);
  });

  it('matches the filter case-insensitively against the title', () => {
    const hit = makeTask({ title: 'Send REPORT now' });
    const miss = makeTask({ title: 'Walk dog' });
    expect(allItems(makeAppData([hit, miss]), 'rep')).toEqual([hit]);
  });

  it('matches the filter case-insensitively against the list name', () => {
    const hit = makeTask({ title: 'Pay bills', list: 'Reports' });
    const miss = makeTask({ title: 'Walk dog', list: 'home' });
    expect(allItems(makeAppData([hit, miss]), 'rep')).toEqual([hit]);
  });

  it('returns an empty array when nothing matches', () => {
    const task = makeTask({ title: 'Walk dog' });
    expect(allItems(makeAppData([task]), 'zzz')).toEqual([]);
  });

  it('excludes done tasks', () => {
    const done = makeTask({ title: 'report', status: 'done', completedAt: '2026-06-08T10:00:00.000Z' });
    expect(allItems(makeAppData([done]), '')).toEqual([]);
  });
});

describe('doneItems', () => {
  it('returns done tasks sorted by completedAt descending', () => {
    const earlier = makeTask({ status: 'done', completedAt: '2026-06-07T10:00:00.000Z' });
    const later = makeTask({ status: 'done', completedAt: '2026-06-08T10:00:00.000Z' });
    const open = makeTask();
    const result = doneItems(makeAppData([earlier, open, later]));
    expect(result.map((t) => t.id)).toEqual([later.id, earlier.id]);
  });

  it('returns an empty array when no tasks are done', () => {
    expect(doneItems(makeAppData([makeTask()]))).toEqual([]);
  });
});

describe('scale', () => {
  it('handles 100+ tasks across all selectors', () => {
    const tasks = Array.from({ length: 150 }, (_, i) =>
      makeTask({
        dueDate: i % 3 === 0 ? '2026-06-01' : i % 3 === 1 ? TODAY : null,
        order: i,
      }),
    );
    const sections = todayItems(makeAppData(tasks), TODAY);
    expect(sections.rollover.length + sections.dueToday.length + sections.anytime.length).toBe(150);
    expect(allItems(makeAppData(tasks), '')).toHaveLength(150);
  });
});
