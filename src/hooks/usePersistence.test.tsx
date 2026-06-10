// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { usePersistence } from './usePersistence';
import { StorageBanner } from '../components/StorageBanner';
import { STORAGE_KEY } from '../lib/persistence';
import { AppProvider, useApp } from '../state/AppContext';
import type { StorageLike, Task } from '../lib/types';

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

function Harness({ storage }: { storage: StorageLike }) {
  const { saveFailed, dismissSaveFailure } = usePersistence(storage);
  const { state, dispatch, toast } = useApp();
  return (
    <div>
      {saveFailed !== false && <StorageBanner reason={saveFailed} onDismiss={dismissSaveFailure} />}
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

function renderHarness(storage: StorageLike) {
  return render(
    <AppProvider>
      <Harness storage={storage} />
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
