import { describe, expect, it } from 'vitest';
import { initialStoreState, reducer } from './store';
import type { StoreState } from './store';
import type { AppData, Task } from './types';

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

function makeState(tasks: Task[] = []): StoreState {
  return initialStoreState(makeAppData(tasks));
}

function newTaskPayload(overrides: Partial<Omit<Task, 'order'>> = {}): Omit<Task, 'order'> {
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
    createdAt: '2026-06-09T08:00:00.000Z',
    completedAt: null,
    ...overrides,
  };
}

describe('add', () => {
  it('assigns the task order = min existing order - 1 so it sorts to the top', () => {
    const existing = makeTask({ order: 7 });
    const state = makeState([existing]);
    const next = reducer(state, { type: 'add', task: newTaskPayload({ id: 'new-1' }) });
    const added = next.data.tasks.find((t) => t.id === 'new-1');
    expect(added?.order).toBe(6);
  });

  it('assigns order 1 to the first task in an empty list', () => {
    const next = reducer(makeState(), { type: 'add', task: newTaskPayload({ id: 'new-1' }) });
    expect(next.data.tasks[0].order).toBe(1);
  });

  it('undo after add removes the added task restoring deep-equal prior data', () => {
    const state = makeState([makeTask()]);
    const afterAdd = reducer(state, { type: 'add', task: newTaskPayload() });
    const afterUndo = reducer(afterAdd, { type: 'undo' });
    expect(afterUndo.data).toEqual(state.data);
  });
});

describe('complete (non-recurring)', () => {
  it('marks the task done with the provided completedAt', () => {
    const task = makeTask();
    const state = makeState([task]);
    const next = reducer(state, {
      type: 'complete', id: task.id, completedAt: '2026-06-09T10:00:00.000Z',
      today: '2026-06-09', newId: 'spawn-x',
    });
    const done = next.data.tasks.find((t) => t.id === task.id);
    expect(done?.status).toBe('done');
    expect(done?.completedAt).toBe('2026-06-09T10:00:00.000Z');
  });

  it('does not spawn a new task when the task has no recurrence', () => {
    const task = makeTask();
    const next = reducer(makeState([task]), {
      type: 'complete', id: task.id, completedAt: '2026-06-09T10:00:00.000Z',
      today: '2026-06-09', newId: 'spawn-x',
    });
    expect(next.data.tasks).toHaveLength(1);
  });

  it('undo after complete restores deep-equal prior data', () => {
    const task = makeTask();
    const state = makeState([task]);
    const afterComplete = reducer(state, {
      type: 'complete', id: task.id, completedAt: '2026-06-09T10:00:00.000Z',
      today: '2026-06-09', newId: 'spawn-x',
    });
    const afterUndo = reducer(afterComplete, { type: 'undo' });
    expect(afterUndo.data).toEqual(state.data);
  });

  it('is a no-op for a nonexistent id', () => {
    const state = makeState([makeTask()]);
    const next = reducer(state, {
      type: 'complete', id: 'ghost', completedAt: '2026-06-09T10:00:00.000Z',
      today: '2026-06-09', newId: 'spawn-x',
    });
    expect(next).toEqual(state);
  });
});

describe('uncomplete', () => {
  it('restores a done task to open with completedAt null', () => {
    const task = makeTask({ status: 'done', completedAt: '2026-06-08T10:00:00.000Z' });
    const next = reducer(makeState([task]), { type: 'uncomplete', id: task.id });
    const reopened = next.data.tasks.find((t) => t.id === task.id);
    expect(reopened?.status).toBe('open');
    expect(reopened?.completedAt).toBeNull();
  });

  it('undo after uncomplete restores done status and the original completedAt', () => {
    const task = makeTask({ status: 'done', completedAt: '2026-06-08T10:00:00.000Z' });
    const state = makeState([task]);
    const afterUncomplete = reducer(state, { type: 'uncomplete', id: task.id });
    const afterUndo = reducer(afterUncomplete, { type: 'undo' });
    expect(afterUndo.data).toEqual(state.data);
  });
});

describe('edit', () => {
  it('applies partial changes to the task', () => {
    const task = makeTask({ title: 'Old title' });
    const next = reducer(makeState([task]), {
      type: 'edit', id: task.id, changes: { title: 'New title', priority: 2 },
    });
    const edited = next.data.tasks.find((t) => t.id === task.id);
    expect(edited?.title).toBe('New title');
    expect(edited?.priority).toBe(2);
  });

  it('undo after edit restores the previous field values deep-equal', () => {
    const task = makeTask({ title: 'Old title', priority: 1 });
    const state = makeState([task]);
    const afterEdit = reducer(state, {
      type: 'edit', id: task.id, changes: { title: 'New title', priority: null },
    });
    const afterUndo = reducer(afterEdit, { type: 'undo' });
    expect(afterUndo.data).toEqual(state.data);
  });

  it('is a no-op for a nonexistent id (no undo entry pushed)', () => {
    const state = makeState([makeTask()]);
    const next = reducer(state, { type: 'edit', id: 'ghost', changes: { title: 'x' } });
    expect(next).toEqual(state);
    expect(next.undoStack).toHaveLength(0);
  });

  it('applies a single multi-field edit changing dueDate, list, priority, and title at once', () => {
    const task = makeTask({
      title: 'Old title',
      dueDate: '2026-06-09',
      list: 'work',
      priority: 1,
    });
    const next = reducer(makeState([task]), {
      type: 'edit',
      id: task.id,
      changes: { title: 'New title', dueDate: '2026-06-12', list: null, priority: 3 },
    });
    const edited = next.data.tasks.find((t) => t.id === task.id);
    expect(edited?.title).toBe('New title');
    expect(edited?.dueDate).toBe('2026-06-12');
    expect(edited?.list).toBeNull();
    expect(edited?.priority).toBe(3);
  });

  it('restores dueDate, list, priority, and title together with one undo after a multi-field edit', () => {
    const task = makeTask({
      title: 'Old title',
      dueDate: '2026-06-09',
      list: 'work',
      priority: 1,
    });
    const state = makeState([task]);
    const afterEdit = reducer(state, {
      type: 'edit',
      id: task.id,
      changes: { title: 'New title', dueDate: '2026-06-12', list: null, priority: 3 },
    });
    const afterUndo = reducer(afterEdit, { type: 'undo' });
    expect(afterUndo.data).toEqual(state.data);
  });

  it('restores a cleared list (list:null) on undo of a multi-field edit', () => {
    const task = makeTask({ title: 'Pay rent', list: 'home', priority: 2 });
    const state = makeState([task]);
    const afterEdit = reducer(state, {
      type: 'edit',
      id: task.id,
      changes: { title: 'Pay the rent', list: null, priority: 1 },
    });
    const afterUndoTask = reducer(afterEdit, { type: 'undo' }).data.tasks.find((t) => t.id === task.id);
    expect(afterUndoTask?.list).toBe('home');
    expect(afterUndoTask?.priority).toBe(2);
    expect(afterUndoTask?.title).toBe('Pay rent');
  });

  it('leaves state unchanged and pushes no inverse for a multi-field edit on a missing id', () => {
    const state = makeState([makeTask()]);
    const next = reducer(state, {
      type: 'edit',
      id: 'ghost',
      changes: { title: 'x', dueDate: '2026-06-12', list: null, priority: 2 },
    });
    expect(next).toEqual(state);
    expect(next.undoStack).toHaveLength(0);
  });
});

describe('delete', () => {
  it('removes the task', () => {
    const task = makeTask();
    const next = reducer(makeState([task]), { type: 'delete', id: task.id });
    expect(next.data.tasks).toHaveLength(0);
  });

  it('undo after delete restores the task with its original order value', () => {
    const task = makeTask({ order: 42 });
    const state = makeState([task, makeTask({ order: 50 })]);
    const afterDelete = reducer(state, { type: 'delete', id: task.id });
    const afterUndo = reducer(afterDelete, { type: 'undo' });
    expect(afterUndo.data.tasks.find((t) => t.id === task.id)?.order).toBe(42);
    expect(afterUndo.data).toEqual(state.data);
  });
});

describe('snooze', () => {
  it('sets dueDate to the explicit target date', () => {
    const task = makeTask({ dueDate: '2026-06-01' });
    const next = reducer(makeState([task]), {
      type: 'snooze', id: task.id, dueDate: '2026-06-10',
    });
    expect(next.data.tasks[0].dueDate).toBe('2026-06-10');
  });

  it('assigns a date to a previously undated task', () => {
    const task = makeTask({ dueDate: null });
    const next = reducer(makeState([task]), {
      type: 'snooze', id: task.id, dueDate: '2026-06-10',
    });
    expect(next.data.tasks[0].dueDate).toBe('2026-06-10');
  });

  it('undo after snooze restores the previous dueDate deep-equal', () => {
    const task = makeTask({ dueDate: '2026-06-01' });
    const state = makeState([task]);
    const afterSnooze = reducer(state, { type: 'snooze', id: task.id, dueDate: '2026-06-10' });
    const afterUndo = reducer(afterSnooze, { type: 'undo' });
    expect(afterUndo.data).toEqual(state.data);
  });
});

describe('undo/redo stack mechanics', () => {
  it('undo on an empty stack is a no-op', () => {
    const state = makeState([makeTask()]);
    expect(reducer(state, { type: 'undo' })).toEqual(state);
  });

  it('redo on an empty stack is a no-op', () => {
    const state = makeState([makeTask()]);
    expect(reducer(state, { type: 'redo' })).toEqual(state);
  });

  it('redo re-applies the undone action', () => {
    const task = makeTask({ title: 'Original' });
    const state = makeState([task]);
    const afterEdit = reducer(state, { type: 'edit', id: task.id, changes: { title: 'Edited' } });
    const afterUndo = reducer(afterEdit, { type: 'undo' });
    const afterRedo = reducer(afterUndo, { type: 'redo' });
    expect(afterRedo.data).toEqual(afterEdit.data);
  });

  it('a new mutation after undo clears the redo stack (FR-38)', () => {
    const task = makeTask({ title: 'Original' });
    const state = makeState([task]);
    const afterEdit = reducer(state, { type: 'edit', id: task.id, changes: { title: 'Edited' } });
    const afterUndo = reducer(afterEdit, { type: 'undo' });
    expect(afterUndo.redoStack).toHaveLength(1);
    const afterNewMutation = reducer(afterUndo, {
      type: 'edit', id: task.id, changes: { title: 'Different' },
    });
    expect(afterNewMutation.redoStack).toHaveLength(0);
  });

  it('caps the undo stack at 50 entries, evicting the oldest (FR-36)', () => {
    const task = makeTask({ title: 'v0' });
    let state = makeState([task]);
    for (let i = 1; i <= 51; i++) {
      state = reducer(state, { type: 'edit', id: task.id, changes: { title: `v${i}` } });
    }
    expect(state.undoStack).toHaveLength(50);
    for (let i = 0; i < 50; i++) {
      state = reducer(state, { type: 'undo' });
    }
    expect(state.undoStack).toHaveLength(0);
    expect(state.data.tasks[0].title).toBe('v1');
  });
});

describe('complete (recurring, FR-28/FR-39)', () => {
  const REC = { freq: 'weekly', interval: 1, byWeekday: [1], byMonthDay: null } as const;

  function makeRecurring(overrides: Partial<Task> = {}): Task {
    return makeTask({
      title: 'Weekly review',
      dueDate: '2026-06-08',
      list: 'work',
      priority: 2,
      recurrence: { ...REC, byWeekday: [...REC.byWeekday] },
      ...overrides,
    });
  }

  function completeAction(id: string) {
    return {
      type: 'complete' as const,
      id,
      completedAt: '2026-06-10T09:00:00.000Z',
      today: '2026-06-10',
      newId: 'spawned-1',
    };
  }

  it('spawns exactly one new open task with the injected id and the nextOccurrence-computed dueDate', () => {
    const task = makeRecurring();
    const next = reducer(makeState([task]), completeAction(task.id));
    expect(next.data.tasks).toHaveLength(2);
    const spawned = next.data.tasks.find((t) => t.id === 'spawned-1');
    expect(spawned?.status).toBe('open');
    expect(spawned?.dueDate).toBe('2026-06-15');
  });

  it('copies title, list, priority, and recurrence onto the spawned task', () => {
    const task = makeRecurring();
    const next = reducer(makeState([task]), completeAction(task.id));
    const spawned = next.data.tasks.find((t) => t.id === 'spawned-1');
    expect(spawned?.title).toBe('Weekly review');
    expect(spawned?.list).toBe('work');
    expect(spawned?.priority).toBe(2);
    expect(spawned?.recurrence).toEqual(task.recurrence);
    expect(spawned?.completedAt).toBeNull();
  });

  it('assigns the spawned task a fresh order value (max existing + 1)', () => {
    const task = makeRecurring({ order: 5 });
    const next = reducer(makeState([task]), completeAction(task.id));
    const spawned = next.data.tasks.find((t) => t.id === 'spawned-1');
    expect(spawned?.order).toBe(6);
  });

  it('undo of a recurring completion removes the spawned task AND reopens the original (FR-39)', () => {
    const task = makeRecurring();
    const state = makeState([task]);
    const afterComplete = reducer(state, completeAction(task.id));
    const afterUndo = reducer(afterComplete, { type: 'undo' });
    expect(afterUndo.data).toEqual(state.data);
  });

  it('redo after undo re-spawns the same task deterministically', () => {
    const task = makeRecurring();
    const state = makeState([task]);
    const afterComplete = reducer(state, completeAction(task.id));
    const afterUndo = reducer(afterComplete, { type: 'undo' });
    const afterRedo = reducer(afterUndo, { type: 'redo' });
    expect(afterRedo.data).toEqual(afterComplete.data);
  });

  it('keeps exactly one open task per chain after repeated complete cycles', () => {
    const task = makeRecurring();
    let state = makeState([task]);
    state = reducer(state, completeAction(task.id));
    state = reducer(state, {
      type: 'complete', id: 'spawned-1',
      completedAt: '2026-06-15T09:00:00.000Z', today: '2026-06-15', newId: 'spawned-2',
    });
    const open = state.data.tasks.filter((t) => t.status === 'open');
    expect(open).toHaveLength(1);
    expect(open[0].id).toBe('spawned-2');
    expect(open[0].dueDate).toBe('2026-06-22');
  });
});

describe('externalReload (FR-43)', () => {
  it('replaces data and empties both stacks', () => {
    const task = makeTask({ title: 'Old' });
    let state = makeState([task]);
    state = reducer(state, { type: 'edit', id: task.id, changes: { title: 'Edited' } });
    state = reducer(state, { type: 'undo' });
    expect(state.undoStack.length + state.redoStack.length).toBeGreaterThan(0);
    const incoming = makeAppData([makeTask({ title: 'From other tab' })]);
    const next = reducer(state, { type: 'externalReload', data: incoming });
    expect(next.data).toEqual(incoming);
    expect(next.undoStack).toEqual([]);
    expect(next.redoStack).toEqual([]);
  });
});

describe('scale', () => {
  it('keeps reducer operations correct over a 100-task AppData', () => {
    const tasks = Array.from({ length: 100 }, (_, i) => makeTask({ order: i + 1 }));
    let state = makeState(tasks);
    const target = tasks[57];
    state = reducer(state, { type: 'delete', id: target.id });
    expect(state.data.tasks).toHaveLength(99);
    state = reducer(state, { type: 'undo' });
    expect(state.data.tasks).toHaveLength(100);
    expect(state.data.tasks[57]).toEqual(target);
    state = reducer(state, { type: 'add', task: newTaskPayload({ id: 'added-x' }) });
    expect(state.data.tasks.find((t) => t.id === 'added-x')?.order).toBe(0);
  });
});

describe('snooze targets (FR-33...FR-35, US-012)', () => {
  it('snoozeTomorrow target moves a rollover task to tomorrow and out of the rollover section', async () => {
    const { snoozeTomorrow } = await import('./dates');
    const { todayItems } = await import('./selectors');
    const today = '2026-06-09';
    const task = makeTask({ dueDate: '2026-06-01' });
    let state = makeState([task]);
    expect(todayItems(state.data, today).rollover).toHaveLength(1);
    state = reducer(state, { type: 'snooze', id: task.id, dueDate: snoozeTomorrow(today) });
    expect(state.data.tasks[0].dueDate).toBe('2026-06-10');
    expect(todayItems(state.data, today).rollover).toHaveLength(0);
  });

  it('snoozeNextWeek target crosses a month boundary (2026-06-29 -> 2026-07-06)', async () => {
    const { snoozeNextWeek } = await import('./dates');
    const task = makeTask({ dueDate: '2026-06-29' });
    let state = makeState([task]);
    state = reducer(state, { type: 'snooze', id: task.id, dueDate: snoozeNextWeek('2026-06-29') });
    expect(state.data.tasks[0].dueDate).toBe('2026-07-06');
  });

  it('snoozeWeekend on a Saturday yields the FOLLOWING Saturday (2026-06-13 -> 2026-06-20)', async () => {
    const { snoozeWeekend } = await import('./dates');
    const task = makeTask({ dueDate: '2026-06-13' });
    let state = makeState([task]);
    state = reducer(state, { type: 'snooze', id: task.id, dueDate: snoozeWeekend('2026-06-13') });
    expect(state.data.tasks[0].dueDate).toBe('2026-06-20');
  });

  it('snoozing a dueDate:null task assigns the target date (FR-35)', async () => {
    const { snoozeTomorrow } = await import('./dates');
    const task = makeTask({ dueDate: null });
    let state = makeState([task]);
    state = reducer(state, { type: 'snooze', id: task.id, dueDate: snoozeTomorrow('2026-06-09') });
    expect(state.data.tasks[0].dueDate).toBe('2026-06-10');
  });
});
