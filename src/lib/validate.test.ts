import { describe, expect, it } from 'vitest';
import { isAppData } from './validate';
import type { AppData, Task } from './types';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'Water the pine',
    status: 'open',
    dueDate: null,
    dueTime: null,
    list: null,
    priority: null,
    recurrence: null,
    createdAt: '2026-08-11T00:00:00.000Z',
    completedAt: null,
    order: 1,
    ...overrides,
  };
}

function makeData(tasks: Task[] = []): AppData {
  return { schemaVersion: 1, tasks };
}

describe('isAppData', () => {
  it('should accept an empty task list at schemaVersion 1', () => {
    expect(isAppData(makeData())).toBe(true);
  });
  it('should accept a fully populated task', () => {
    expect(
      isAppData(
        makeData([
          makeTask({
            dueDate: '2026-08-12',
            dueTime: '09:30',
            list: 'garden',
            priority: 2,
            recurrence: { freq: 'weekly', interval: 1, byWeekday: [1, 3], byMonthDay: null },
            completedAt: '2026-08-11T01:00:00.000Z',
          }),
        ]),
      ),
    ).toBe(true);
  });
  it('should reject a schemaVersion other than 1', () => {
    expect(isAppData({ schemaVersion: 2, tasks: [] })).toBe(false);
  });
  it('should reject non-object values', () => {
    expect(isAppData(null)).toBe(false);
    expect(isAppData('[]')).toBe(false);
  });
  it('should reject a task whose dueDate is not YYYY-MM-DD', () => {
    expect(isAppData(makeData([makeTask({ dueDate: '12/08/2026' })]))).toBe(false);
  });
  it('should reject a task whose status is neither open nor done', () => {
    expect(isAppData(makeData([{ ...makeTask(), status: 'archived' } as unknown as Task]))).toBe(false);
  });
  it('should reject a recurrence with an empty byWeekday array', () => {
    expect(
      isAppData(
        makeData([
          makeTask({
            recurrence: { freq: 'weekly', interval: 1, byWeekday: [], byMonthDay: null },
          }),
        ]),
      ),
    ).toBe(false);
  });
  it('should reject a task with a non-finite order', () => {
    expect(isAppData(makeData([makeTask({ order: Number.NaN })]))).toBe(false);
  });
});
