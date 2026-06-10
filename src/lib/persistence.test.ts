import { describe, expect, it } from 'vitest';
import { getLocalStorage, load, memoryStorage, save, STORAGE_KEY, RECOVERY_PREFIX } from './persistence';
import type { AppData, StorageLike, Task } from './types';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Send report',
    status: 'open',
    dueDate: '2026-06-10',
    dueTime: '15:00',
    list: 'work',
    priority: 1,
    recurrence: null,
    createdAt: '2026-06-09T12:00:00.000Z',
    completedAt: null,
    order: 1,
    ...overrides,
  };
}

function makeAppData(tasks: Task[] = []): AppData {
  return { schemaVersion: 1, tasks };
}

function makeMemoryStorage(initial: Record<string, string> = {}): StorageLike & {
  store: Map<string, string>;
} {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    store,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
}

function makeQuotaThrowingStorage(): StorageLike {
  return {
    getItem: () => null,
    setItem: () => {
      const err = new DOMException('quota exceeded', 'QuotaExceededError');
      throw err;
    },
    removeItem: () => {},
  };
}

describe('save', () => {
  it('writes the serialized AppData under the key todo-quantum.v1', () => {
    const storage = makeMemoryStorage();
    const data = makeAppData([makeTask()]);
    save(storage, data);
    expect(storage.store.get('todo-quantum.v1')).toBe(JSON.stringify(data));
  });

  it('returns ok true after verifying the written value re-parses to the saved data', () => {
    const storage = makeMemoryStorage();
    expect(save(storage, makeAppData([makeTask()]))).toEqual({ ok: true });
  });

  it('returns {ok: false, reason: quota} without throwing when setItem throws QuotaExceededError', () => {
    const storage = makeQuotaThrowingStorage();
    expect(() => save(storage, makeAppData())).not.toThrow();
    expect(save(storage, makeAppData())).toEqual({ ok: false, reason: 'quota' });
  });

  it('returns {ok: false, reason: unavailable} when setItem throws a non-quota error', () => {
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('storage disabled');
      },
      removeItem: () => {},
    };
    expect(save(storage, makeAppData())).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('returns {ok: false, reason: unavailable} when the re-read does not match what was written', () => {
    const storage: StorageLike = {
      getItem: () => '{"schemaVersion":1,"tasks":[]}',
      setItem: () => {},
      removeItem: () => {},
    };
    expect(save(storage, makeAppData([makeTask()]))).toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });
});

describe('load', () => {
  it('round-trips: load after save returns deep-equal data with recovered false', () => {
    const storage = makeMemoryStorage();
    const data = makeAppData([makeTask(), makeTask({ id: 'task-2', order: 2 })]);
    save(storage, data);
    expect(load(storage)).toEqual({ ok: true, data, recovered: false });
  });

  it('round-trips an empty tasks array', () => {
    const storage = makeMemoryStorage();
    save(storage, makeAppData());
    expect(load(storage)).toEqual({ ok: true, data: makeAppData(), recovered: false });
  });

  it('round-trips 100+ tasks', () => {
    const storage = makeMemoryStorage();
    const tasks = Array.from({ length: 120 }, (_, i) =>
      makeTask({ id: `task-${i}`, order: i }),
    );
    save(storage, makeAppData(tasks));
    const result = load(storage);
    expect(result.data.tasks).toHaveLength(120);
    expect(result.data.tasks).toEqual(tasks);
  });

  it('returns empty AppData with recovered false when the key is missing', () => {
    const storage = makeMemoryStorage();
    expect(load(storage)).toEqual({
      ok: true,
      data: { schemaVersion: 1, tasks: [] },
      recovered: false,
    });
  });

  it('stashes corrupt JSON under todo-quantum.recovery.<ISO> and returns recovered true', () => {
    const blob = '{not json at all';
    const storage = makeMemoryStorage({ 'todo-quantum.v1': blob });
    const now = new Date('2026-06-09T12:00:00.000Z');
    const result = load(storage, now);
    expect(result).toEqual({
      ok: true,
      data: { schemaVersion: 1, tasks: [] },
      recovered: true,
    });
    expect(storage.store.get('todo-quantum.recovery.2026-06-09T12:00:00.000Z')).toBe(blob);
  });

  it('treats schema-invalid JSON (wrong schemaVersion type) as corrupt and stashes it', () => {
    const blob = '{"schemaVersion":"one","tasks":[]}';
    const storage = makeMemoryStorage({ 'todo-quantum.v1': blob });
    const now = new Date('2026-06-09T12:00:00.000Z');
    const result = load(storage, now);
    expect(result.recovered).toBe(true);
    expect(result.data).toEqual({ schemaVersion: 1, tasks: [] });
    expect(storage.store.get('todo-quantum.recovery.2026-06-09T12:00:00.000Z')).toBe(blob);
  });

  it('treats JSON whose tasks field is not an array as corrupt and stashes it', () => {
    const blob = '{"schemaVersion":1,"tasks":"nope"}';
    const storage = makeMemoryStorage({ 'todo-quantum.v1': blob });
    const result = load(storage, new Date('2026-06-09T12:00:00.000Z'));
    expect(result.recovered).toBe(true);
    expect(result.data.tasks).toEqual([]);
  });

  it('exports the contract storage key and recovery prefix values', () => {
    expect(STORAGE_KEY).toBe('todo-quantum.v1');
    expect(RECOVERY_PREFIX).toBe('todo-quantum.recovery.');
  });
});

describe('Review fixes: deep validation and storage guards (F-001, F-002, F-010)', () => {
  it('stashes well-shaped JSON whose tasks contain null instead of accepting it', () => {
    const blob = '{"schemaVersion":1,"tasks":[null]}';
    const storage = makeMemoryStorage({ 'todo-quantum.v1': blob });
    const now = new Date('2026-06-10T12:00:00.000Z');
    const result = load(storage, now);
    expect(result.recovered).toBe(true);
    expect(result.data).toEqual({ schemaVersion: 1, tasks: [] });
    expect(storage.store.get('todo-quantum.recovery.2026-06-10T12:00:00.000Z')).toBe(blob);
  });

  it('stashes data whose task has a recurrence interval of 0 (would freeze the recurrence engine)', () => {
    const task = makeTask({ recurrence: { freq: 'daily', interval: 0, byWeekday: null, byMonthDay: null } });
    const blob = JSON.stringify({ schemaVersion: 1, tasks: [task] });
    const storage = makeMemoryStorage({ 'todo-quantum.v1': blob });
    const result = load(storage, new Date('2026-06-10T12:00:00.000Z'));
    expect(result.recovered).toBe(true);
    expect(result.data.tasks).toEqual([]);
  });

  it('stashes data whose task has an empty byWeekday array', () => {
    const task = makeTask({ recurrence: { freq: 'weekly', interval: 1, byWeekday: [], byMonthDay: null } });
    const storage = makeMemoryStorage({ 'todo-quantum.v1': JSON.stringify({ schemaVersion: 1, tasks: [task] }) });
    expect(load(storage, new Date('2026-06-10T12:00:00.000Z')).recovered).toBe(true);
  });

  it('stashes data whose task is missing required fields (no id)', () => {
    const blob = '{"schemaVersion":1,"tasks":[{"title":"x"}]}';
    const storage = makeMemoryStorage({ 'todo-quantum.v1': blob });
    expect(load(storage, new Date('2026-06-10T12:00:00.000Z')).recovered).toBe(true);
  });

  it('accepts a fully valid task untouched', () => {
    const task = makeTask();
    const storage = makeMemoryStorage({ 'todo-quantum.v1': JSON.stringify({ schemaVersion: 1, tasks: [task] }) });
    const result = load(storage);
    expect(result.recovered).toBe(false);
    expect(result.data.tasks).toEqual([task]);
  });

  it("classifies Firefox's legacy NS_ERROR_DOM_QUOTA_REACHED as a quota failure", () => {
    const err = new Error('persistent storage maximum size reached');
    err.name = 'NS_ERROR_DOM_QUOTA_REACHED';
    const storage = makeMemoryStorage();
    storage.setItem = () => {
      throw err;
    };
    expect(save(storage, { schemaVersion: 1, tasks: [] })).toEqual({ ok: false, reason: 'quota' });
  });

  it('returns ok false unavailable when the verification re-read itself throws', () => {
    const storage = makeMemoryStorage();
    storage.getItem = () => {
      throw new Error('SecurityError');
    };
    expect(save(storage, { schemaVersion: 1, tasks: [] })).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('getLocalStorage returns null when the storage accessor throws (storage-blocked browser)', () => {
    expect(
      getLocalStorage(() => {
        throw new Error('SecurityError');
      }),
    ).toBeNull();
  });

  it('memoryStorage round-trips values and supports removal', () => {
    const mem = memoryStorage();
    expect(mem.getItem(STORAGE_KEY)).toBeNull();
    mem.setItem(STORAGE_KEY, 'value');
    expect(mem.getItem(STORAGE_KEY)).toBe('value');
    mem.removeItem(STORAGE_KEY);
    expect(mem.getItem(STORAGE_KEY)).toBeNull();
  });
});
