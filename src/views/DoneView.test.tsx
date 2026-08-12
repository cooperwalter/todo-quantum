// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DoneView } from './DoneView';
import { AppProvider, useApp } from '../state/AppContext';
import type { Task } from '../lib/types';

const STORAGE_KEY = 'todo-quantum.v1.testuser';

function makeDoneTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'done-1',
    title: 'Shipped feature',
    status: 'done',
    dueDate: null,
    dueTime: null,
    list: null,
    priority: null,
    recurrence: null,
    createdAt: '2026-06-01T08:00:00.000Z',
    completedAt: '2026-06-08T10:00:00.000Z',
    order: 1,
    ...overrides,
  };
}

function seedTasks(tasks: Task[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, tasks }));
}

function StateProbe() {
  const { state } = useApp();
  return <pre data-testid="state-probe">{JSON.stringify(state.data.tasks)}</pre>;
}

function renderDone() {
  return render(
    <AppProvider username="testuser">
      <DoneView />
      <StateProbe />
    </AppProvider>,
  );
}

function probedTasks(): Task[] {
  return JSON.parse(screen.getByTestId('state-probe').textContent ?? '[]') as Task[];
}

describe('DoneView', () => {
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

  it('lists completed tasks ordered by completedAt descending', () => {
    seedTasks([
      makeDoneTask({ id: 'older', title: 'Older win', completedAt: '2026-06-01T09:00:00.000Z' }),
      makeDoneTask({ id: 'newest', title: 'Newest win', completedAt: '2026-06-09T09:00:00.000Z' }),
      makeDoneTask({ id: 'middle', title: 'Middle win', completedAt: '2026-06-05T09:00:00.000Z' }),
    ]);
    renderDone();
    const titles = Array.from(document.querySelectorAll('.task-row-title')).map((el) => el.textContent);
    expect(titles).toEqual(['Newest win', 'Middle win', 'Older win']);
  });

  it('renders each completed row with the task-row--done strike-through styling class', () => {
    seedTasks([makeDoneTask()]);
    renderDone();
    const row = document.querySelector('.task-row');
    expect(row?.className).toContain('task-row--done');
  });

  it('excludes open tasks from the Done view', () => {
    seedTasks([
      makeDoneTask({ id: 'd1', title: 'Finished' }),
      makeDoneTask({ id: 'o1', title: 'Still open', status: 'open', completedAt: null }),
    ]);
    renderDone();
    const titles = Array.from(document.querySelectorAll('.task-row-title')).map((el) => el.textContent);
    expect(titles).toEqual(['Finished']);
  });

  it('clicking the checkbox restores the task to status open with completedAt null', () => {
    seedTasks([makeDoneTask({ id: 'd1', title: 'Shipped feature' })]);
    renderDone();
    fireEvent.click(screen.getByLabelText('Reopen Shipped feature'));
    const task = probedTasks().find((t) => t.id === 'd1');
    expect(task?.status).toBe('open');
    expect(task?.completedAt).toBeNull();
    expect(document.querySelectorAll('.task-row')).toHaveLength(0);
  });

  it("pressing the x key on a focused done row restores the task to status open with completedAt null", () => {
    seedTasks([makeDoneTask({ id: 'd1', title: 'Shipped feature' })]);
    renderDone();
    const row = document.querySelector<HTMLElement>('.task-row[data-task-id="d1"]');
    expect(row).not.toBeNull();
    (row as HTMLElement).focus();
    fireEvent.keyDown(row as HTMLElement, { key: 'x' });
    const task = probedTasks().find((t) => t.id === 'd1');
    expect(task?.status).toBe('open');
    expect(task?.completedAt).toBeNull();
  });

  it('renders the italic empty state when nothing has been completed', () => {
    seedTasks([]);
    renderDone();
    expect(document.querySelector('.empty-state-copy')?.textContent).toBe(
      'Nothing done yet — finish something today.',
    );
  });
});
