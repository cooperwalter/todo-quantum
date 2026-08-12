// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { usePersistence } from './usePersistence';
import { StorageBanner } from '../components/StorageBanner';
import { storageKeyFor, syncKeyFor } from '../lib/username';
import { AppProvider, useApp } from '../state/AppContext';
import type { AppData, StorageLike, Task } from '../lib/types';

const STORAGE_KEY = storageKeyFor('testuser');
const SYNC_KEY = syncKeyFor('testuser');
const DATA_URL = '/api/users/testuser/data';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Send report',
    status: 'open',
    dueDate: null,
    dueTime: null,
    list: null,
    priority: null,
    recurrence: null,
    createdAt: '2026-06-01T08:00:00.000Z',
    completedAt: null,
    order: 1,
    ...overrides,
  };
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

function makeQuotaFailingStorage(): StorageLike {
  return {
    getItem: () => null,
    setItem: () => {
      const err = new Error('quota exceeded');
      err.name = 'QuotaExceededError';
      throw err;
    },
    removeItem: () => {},
  };
}

interface FetchCall {
  url: string;
  method: string;
  body: AppData | null;
}

type FakeFetch = typeof fetch & { calls: FetchCall[] };

function fakeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function makeFakeFetch(
  handlers: {
    get?: () => Response | Promise<Response>;
    put?: () => Response | Promise<Response>;
  } = {},
): FakeFetch {
  const calls: FetchCall[] = [];
  const fn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? 'GET';
    calls.push({
      url: String(input),
      method,
      body: typeof init?.body === 'string' ? (JSON.parse(init.body) as AppData) : null,
    });
    if (method === 'PUT') {
      return handlers.put === undefined
        ? fakeResponse({ updatedAt: '2026-06-09T12:00:00.000Z' })
        : handlers.put();
    }
    return handlers.get === undefined ? fakeResponse(null, 404) : handlers.get();
  };
  return Object.assign(fn as unknown as typeof fetch, { calls });
}

// Async work started by the sync layer settles on the microtask queue, which
// fake timers never advance — drain it inside act() so React sees the updates.
async function settleSync() {
  await act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });
}

function Harness({ storage, fetchFn }: { storage: StorageLike; fetchFn: typeof fetch }) {
  const { saveFailed, dismissSaveFailure } = usePersistence(storage, fetchFn);
  const { state, dispatch, toast } = useApp();
  return (
    <div>
      {saveFailed !== false && <StorageBanner reason={saveFailed} onDismiss={dismissSaveFailure} />}
      <pre data-testid="save-failed">{String(saveFailed)}</pre>
      <pre data-testid="tasks">{JSON.stringify(state.data.tasks)}</pre>
      <pre data-testid="undo-depth">{state.undoStack.length}</pre>
      <pre data-testid="toast">{toast?.message ?? ''}</pre>
      <button
        onClick={() =>
          dispatch({
            type: 'add',
            task: { ...makeTask({ id: 'added-1', title: 'Captured in memory' }), order: undefined } as unknown as Omit<Task, 'order'>,
          })
        }
      >
        do-add
      </button>
    </div>
  );
}

function renderHarness(storage: StorageLike, fetchFn: typeof fetch = makeFakeFetch()) {
  return render(
    <AppProvider username="testuser">
      <Harness storage={storage} fetchFn={fetchFn} />
    </AppProvider>,
  );
}

describe('usePersistence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 9, 13, 0, 0));
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it('a mutation schedules a debounced save that lands 250ms later, not before', () => {
    const storage = makeMemoryStorage();
    renderHarness(storage);
    fireEvent.click(screen.getByText('do-add'));
    act(() => {
      vi.advanceTimersByTime(249);
    });
    expect(storage.store.get(STORAGE_KEY)).toBeUndefined();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    const written = JSON.parse(storage.store.get(STORAGE_KEY) ?? 'null') as {
      tasks: Task[];
    } | null;
    expect(written?.tasks.map((t) => t.id)).toEqual(['added-1']);
  });

  it('rapid consecutive mutations coalesce into a single save 250ms after the last one', () => {
    const storage = makeMemoryStorage();
    const setItem = vi.spyOn(storage, 'setItem');
    renderHarness(storage);
    fireEvent.click(screen.getByText('do-add'));
    act(() => {
      vi.advanceTimersByTime(200);
    });
    fireEvent.click(screen.getByText('do-add'));
    act(() => {
      vi.advanceTimersByTime(249);
    });
    expect(setItem).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(setItem).toHaveBeenCalledTimes(1);
  });

  it('a quota-failing save shows the storage banner with the exact danger copy', () => {
    const storage = makeQuotaFailingStorage();
    renderHarness(storage);
    fireEvent.click(screen.getByText('do-add'));
    act(() => {
      vi.advanceTimersByTime(250);
    });
    const banner = document.querySelector('.storage-banner');
    expect(banner?.textContent).toContain(
      "Changes aren't being saved — this browser's storage is full.",
    );
  });

  it('capture keeps working in memory while storage is failing', () => {
    const storage = makeQuotaFailingStorage();
    renderHarness(storage);
    fireEvent.click(screen.getByText('do-add'));
    act(() => {
      vi.advanceTimersByTime(250);
    });
    const tasks = JSON.parse(screen.getByTestId('tasks').textContent ?? '[]') as Task[];
    expect(tasks.map((t) => t.title)).toContain('Captured in memory');
  });

  it('dismissing the banner hides it until a later save fails again', () => {
    const storage = makeQuotaFailingStorage();
    renderHarness(storage);
    fireEvent.click(screen.getByText('do-add'));
    act(() => {
      vi.advanceTimersByTime(250);
    });
    fireEvent.click(screen.getByLabelText('Dismiss storage warning'));
    expect(document.querySelector('.storage-banner')).toBeNull();
    fireEvent.click(screen.getByText('do-add'));
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(document.querySelector('.storage-banner')).not.toBeNull();
  });

  it('a storage event for the app key replaces state, clears the undo stack, and toasts', () => {
    const storage = makeMemoryStorage();
    renderHarness(storage);
    fireEvent.click(screen.getByText('do-add'));
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(Number(screen.getByTestId('undo-depth').textContent)).toBeGreaterThan(0);

    const external = JSON.stringify({
      schemaVersion: 1,
      tasks: [makeTask({ id: 'other-tab-1', title: 'From another tab' })],
    });
    storage.setItem(STORAGE_KEY, external);
    act(() => {
      fireEvent(window, new StorageEvent('storage', { key: STORAGE_KEY, newValue: external }));
    });
    const tasks = JSON.parse(screen.getByTestId('tasks').textContent ?? '[]') as Task[];
    expect(tasks.map((t) => t.id)).toEqual(['other-tab-1']);
    expect(screen.getByTestId('undo-depth').textContent).toBe('0');
    expect(screen.getByTestId('toast').textContent).toBe('List updated in another tab');
  });

  it('ignores storage events for unrelated keys', () => {
    const storage = makeMemoryStorage();
    renderHarness(storage);
    act(() => {
      fireEvent(window, new StorageEvent('storage', { key: 'other-app', newValue: '{}' }));
    });
    expect(screen.getByTestId('toast').textContent).toBe('');
  });

  it('beforeunload flushes a pending debounced save immediately', () => {
    const storage = makeMemoryStorage();
    renderHarness(storage);
    fireEvent.click(screen.getByText('do-add'));
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(storage.store.get(STORAGE_KEY)).toBeUndefined();
    act(() => {
      fireEvent(window, new Event('beforeunload'));
    });
    const written = JSON.parse(storage.store.get(STORAGE_KEY) ?? 'null') as {
      tasks: Task[];
    } | null;
    expect(written?.tasks.map((t) => t.id)).toEqual(['added-1']);
  });

  it('shows the recovery notice toast when load() recovered from unreadable data', () => {
    window.localStorage.setItem(STORAGE_KEY, 'not json {{{');
    const storage = makeMemoryStorage();
    renderHarness(storage);
    expect(screen.getByTestId('toast').textContent).toBe(
      'Saved data was unreadable — starting fresh',
    );
  });
});

describe('Review fixes: persistence resilience (F-010, F-016, F-017)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 10, 13, 0, 0));
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('a storage event with newValue null (key deleted in another tab) reloads and toasts', () => {
    const storage = makeMemoryStorage();
    renderHarness(storage);
    fireEvent.click(screen.getByText('do-add'));
    act(() => {
      vi.advanceTimersByTime(250);
    });
    storage.removeItem(STORAGE_KEY);
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: null }));
    });
    expect(JSON.parse(screen.getByTestId('tasks').textContent ?? '[]')).toEqual([]);
    expect(screen.getByTestId('toast').textContent).toBe('List updated in another tab');
  });

  it('a failed save keeps the payload and retries 5s later, succeeding once storage recovers', () => {
    let failing = true;
    const inner = makeMemoryStorage();
    const storage: StorageLike = {
      getItem: (k) => inner.getItem(k),
      setItem: (k, v) => {
        if (failing) {
          const err = new Error('full');
          err.name = 'QuotaExceededError';
          throw err;
        }
        inner.setItem(k, v);
      },
      removeItem: (k) => inner.removeItem(k),
    };
    renderHarness(storage);
    fireEvent.click(screen.getByText('do-add'));
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(document.querySelector('.storage-banner')).toBeTruthy();
    expect(inner.getItem(STORAGE_KEY)).toBeNull();
    failing = false;
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(inner.getItem(STORAGE_KEY)).not.toBeNull();
    expect(document.querySelector('.storage-banner')).toBeNull();
  });
});

describe('remote sync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 9, 13, 0, 0));
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    window.localStorage.clear();
  });

  function seedLocalData(tasks: Task[]): AppData {
    const data: AppData = { schemaVersion: 1, tasks };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return data;
  }

  it('should PUT the saved blob to /api/users/<username>/data after a local save', async () => {
    const storage = makeMemoryStorage();
    const fetchFn = makeFakeFetch();
    renderHarness(storage, fetchFn);
    await settleSync();

    fireEvent.click(screen.getByText('do-add'));
    act(() => {
      vi.advanceTimersByTime(250);
    });
    await settleSync();

    const put = fetchFn.calls.find((call) => call.method === 'PUT');
    expect(put?.url).toBe(DATA_URL);
    expect(put?.body?.tasks.map((t) => t.id)).toEqual(['added-1']);
  });

  it('should set saveFailed to offline when the PUT rejects', async () => {
    const storage = makeMemoryStorage();
    const fetchFn = makeFakeFetch({
      put: () => {
        throw new Error('network down');
      },
    });
    renderHarness(storage, fetchFn);
    await settleSync();

    fireEvent.click(screen.getByText('do-add'));
    act(() => {
      vi.advanceTimersByTime(250);
    });
    await settleSync();

    expect(screen.getByTestId('save-failed').textContent).toBe('offline');
  });

  it('should clear the offline failure once a retried PUT succeeds', async () => {
    const storage = makeMemoryStorage();
    let putFailing = true;
    const fetchFn = makeFakeFetch({
      put: () => {
        if (putFailing) throw new Error('network down');
        return fakeResponse({ updatedAt: '2026-06-09T12:00:00.000Z' });
      },
    });
    renderHarness(storage, fetchFn);
    await settleSync();

    fireEvent.click(screen.getByText('do-add'));
    act(() => {
      vi.advanceTimersByTime(250);
    });
    await settleSync();
    expect(screen.getByTestId('save-failed').textContent).toBe('offline');

    putFailing = false;
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    await settleSync();

    expect(screen.getByTestId('save-failed').textContent).toBe('false');
    expect(storage.store.get(SYNC_KEY)).toBe('2026-06-09T12:00:00.000Z');
  });

  it('should reload state from the server when the server updatedAt differs from the last-synced value', async () => {
    const storage = makeMemoryStorage({ [SYNC_KEY]: '2026-06-01T00:00:00.000Z' });
    const serverData: AppData = {
      schemaVersion: 1,
      tasks: [makeTask({ id: 'server-1', title: 'From the server' })],
    };
    const fetchFn = makeFakeFetch({
      get: () => fakeResponse({ data: serverData, updatedAt: '2026-06-09T12:00:00.000Z' }),
    });
    renderHarness(storage, fetchFn);
    await settleSync();

    const tasks = JSON.parse(screen.getByTestId('tasks').textContent ?? '[]') as Task[];
    expect(tasks.map((t) => t.id)).toEqual(['server-1']);
    expect(screen.getByTestId('toast').textContent).toBe('List updated from server');
    expect(storage.store.get(SYNC_KEY)).toBe('2026-06-09T12:00:00.000Z');
    const cached = JSON.parse(storage.store.get(STORAGE_KEY) ?? 'null') as AppData | null;
    expect(cached?.tasks.map((t) => t.id)).toEqual(['server-1']);
  });

  it('should not reload state when the server updatedAt matches the last-synced value', async () => {
    seedLocalData([makeTask({ id: 'local-1', title: 'Local only' })]);
    const storage = makeMemoryStorage({ [SYNC_KEY]: '2026-06-09T12:00:00.000Z' });
    const serverData: AppData = {
      schemaVersion: 1,
      tasks: [makeTask({ id: 'server-1', title: 'From the server' })],
    };
    const fetchFn = makeFakeFetch({
      get: () => fakeResponse({ data: serverData, updatedAt: '2026-06-09T12:00:00.000Z' }),
    });
    renderHarness(storage, fetchFn);
    await settleSync();

    const tasks = JSON.parse(screen.getByTestId('tasks').textContent ?? '[]') as Task[];
    expect(tasks.map((t) => t.id)).toEqual(['local-1']);
    expect(screen.getByTestId('toast').textContent).toBe('');
  });

  it('should push local data up when the server has none for a fresh username', async () => {
    seedLocalData([makeTask({ id: 'local-1', title: 'Local only' })]);
    const storage = makeMemoryStorage();
    const fetchFn = makeFakeFetch({ get: () => fakeResponse(null, 404) });
    renderHarness(storage, fetchFn);
    await settleSync();

    const put = fetchFn.calls.find((call) => call.method === 'PUT');
    expect(put?.url).toBe(DATA_URL);
    expect(put?.body?.tasks.map((t) => t.id)).toEqual(['local-1']);
    expect(storage.store.get(SYNC_KEY)).toBe('2026-06-09T12:00:00.000Z');
  });

  it('should not push anything on mount when the server has no data and the local list is empty', async () => {
    const storage = makeMemoryStorage();
    const fetchFn = makeFakeFetch({ get: () => fakeResponse(null, 404) });
    renderHarness(storage, fetchFn);
    await settleSync();

    expect(fetchFn.calls.filter((call) => call.method === 'PUT')).toEqual([]);
  });

  it('should keep quota precedence over offline in saveFailed', async () => {
    const storage = makeQuotaFailingStorage();
    const fetchFn = makeFakeFetch({
      get: () => {
        throw new Error('network down');
      },
      put: () => {
        throw new Error('network down');
      },
    });
    renderHarness(storage, fetchFn);
    await settleSync();
    expect(screen.getByTestId('save-failed').textContent).toBe('offline');

    fireEvent.click(screen.getByText('do-add'));
    act(() => {
      vi.advanceTimersByTime(250);
    });
    await settleSync();

    expect(screen.getByTestId('save-failed').textContent).toBe('quota');
  });
});
