// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Toast } from './Toast';
import { AppProvider, useApp } from '../state/AppContext';
import type { Task } from '../lib/types';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'toast-task-1',
    title: 'Send report',
    status: 'open',
    dueDate: '2026-06-09',
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

function Harness() {
  const { dispatch, state } = useApp();
  const task = state.data.tasks[0];
  return (
    <div>
      <button onClick={() => dispatch({
        type: 'add',
        task: { ...makeTask({ id: 'added-1' }), order: undefined } as unknown as Omit<Task, 'order'>,
      })}>do-add</button>
      <button onClick={() => dispatch({
        type: 'complete', id: task?.id ?? '', completedAt: '2026-06-09T10:00:00.000Z',
        today: '2026-06-09', newId: 'spawn-1',
      })}>do-complete</button>
      <button onClick={() => dispatch({ type: 'delete', id: task?.id ?? '' })}>do-delete</button>
      <button onClick={() => dispatch({ type: 'snooze', id: task?.id ?? '', dueDate: '2026-06-13' })}>do-snooze</button>
      <button onClick={() => dispatch({ type: 'undo' })}>do-undo</button>
      <pre data-testid="tasks-probe">{JSON.stringify(state.data.tasks)}</pre>
    </div>
  );
}

function renderToast(seed: Task[] = [makeTask()]) {
  window.localStorage.setItem('todo-quantum.v1', JSON.stringify({ schemaVersion: 1, tasks: seed }));
  return render(
    <AppProvider>
      <Toast />
      <Harness />
    </AppProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function click(text: string | RegExp) {
  const el = typeof text === 'string' ? screen.getByText(text) : screen.getByRole('button', { name: text });
  act(() => {
    fireEvent.click(el);
  });
}

describe('Toast messages per action type', () => {
  it("shows 'Captured' after an add", () => {
    renderToast();
    click('do-add');
    expect(screen.getByText('Captured')).toBeTruthy();
  });

  it("shows 'Completed' after completing a non-recurring task", () => {
    renderToast();
    click('do-complete');
    expect(screen.getByText('Completed')).toBeTruthy();
  });

  it("shows 'Done — next Mon Jun 15' after completing a recurring task", () => {
    renderToast([
      makeTask({
        dueDate: '2026-06-08',
        recurrence: { freq: 'weekly', interval: 1, byWeekday: [1], byMonthDay: null },
      }),
    ]);
    click('do-complete');
    expect(screen.getByText('Done — next Mon Jun 15')).toBeTruthy();
  });

  it("shows 'Deleted' after a delete", () => {
    renderToast();
    click('do-delete');
    expect(screen.getByText('Deleted')).toBeTruthy();
  });

  it("shows 'Snoozed to Sat Jun 13' after snoozing a dated task", () => {
    renderToast();
    click('do-snooze');
    expect(screen.getByText('Snoozed to Sat Jun 13')).toBeTruthy();
  });

  it("shows 'Scheduled' after snoozing a previously undated task (FR-35)", () => {
    renderToast([makeTask({ dueDate: null })]);
    click('do-snooze');
    expect(screen.getByText('Scheduled')).toBeTruthy();
  });

  it("shows 'Undone' after an undo", () => {
    renderToast();
    click('do-delete');
    click('do-undo');
    expect(screen.getByText('Undone')).toBeTruthy();
  });
});

describe('Toast lifecycle', () => {
  it('auto-dismisses after 4.8 seconds', () => {
    renderToast();
    click('do-add');
    expect(screen.getByText('Captured')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(4800);
    });
    expect(screen.queryByText('Captured')).toBeNull();
  });

  it('replaces the prior toast so only the latest shows', () => {
    renderToast();
    click('do-add');
    click('do-delete');
    expect(screen.queryByText('Captured')).toBeNull();
    expect(screen.getByText('Deleted')).toBeTruthy();
    expect(document.querySelectorAll('.toast')).toHaveLength(1);
  });

  it('clicking Undo in the toast dispatches undo and the toast updates to Undone', () => {
    renderToast();
    click('do-delete');
    expect(JSON.parse(screen.getByTestId('tasks-probe').textContent ?? '[]')).toHaveLength(0);
    click(/^undo ⌘z$/i);
    expect(JSON.parse(screen.getByTestId('tasks-probe').textContent ?? '[]')).toHaveLength(1);
    expect(screen.getByText('Undone')).toBeTruthy();
  });

  it('renders an aria-live polite container (FR-44)', () => {
    renderToast();
    const region = document.querySelector('[aria-live="polite"]');
    expect(region).toBeTruthy();
  });
});
