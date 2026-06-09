// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { UpcomingView } from './UpcomingView';
import { AppProvider } from '../state/AppContext';
import type { Task } from '../lib/types';

const STORAGE_KEY = 'todo-quantum.v1';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Send report',
    status: 'open',
    dueDate: '2026-06-10',
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

function seedTasks(tasks: Task[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, tasks }));
}

function renderUpcoming() {
  return render(
    <AppProvider>
      <UpcomingView />
    </AppProvider>,
  );
}

function sectionLabels(): string[] {
  return Array.from(document.querySelectorAll('.task-section-label')).map(
    (el) => el.textContent ?? '',
  );
}

describe('UpcomingView', () => {
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

  it("renders the day-group header 'Wed Jun 10' for a task due tomorrow", () => {
    seedTasks([makeTask({ id: 't1', dueDate: '2026-06-10' })]);
    renderUpcoming();
    expect(sectionLabels()).toEqual(['Wed Jun 10']);
  });

  it("renders the week-group header 'Week of Jun 22' for a task due 2026-06-24, beyond the 7-day horizon", () => {
    seedTasks([makeTask({ id: 't1', dueDate: '2026-06-24' })]);
    renderUpcoming();
    expect(sectionLabels()).toEqual(['Week of Jun 22']);
  });

  it('orders day groups tomorrow-first before week groups and places each task in its own group', () => {
    seedTasks([
      makeTask({ id: 'wk2', title: 'Renew passport', dueDate: '2026-06-24', order: 1 }),
      makeTask({ id: 'day2', title: 'Dentist', dueDate: '2026-06-13', order: 2 }),
      makeTask({ id: 'day1', title: 'Send report', dueDate: '2026-06-10', order: 3 }),
      makeTask({ id: 'wk1', title: 'File taxes', dueDate: '2026-06-17', order: 4 }),
    ]);
    renderUpcoming();
    expect(sectionLabels()).toEqual(['Wed Jun 10', 'Sat Jun 13', 'Week of Jun 15', 'Week of Jun 22']);
    const rowTitles = Array.from(document.querySelectorAll('.task-row-title')).map(
      (el) => el.textContent,
    );
    expect(rowTitles).toEqual(['Send report', 'Dentist', 'File taxes', 'Renew passport']);
  });

  it('omits tasks due today or earlier so Upcoming starts at tomorrow', () => {
    seedTasks([
      makeTask({ id: 'today', title: 'Due today', dueDate: '2026-06-09', order: 1 }),
      makeTask({ id: 'past', title: 'Overdue', dueDate: '2026-06-01', order: 2 }),
      makeTask({ id: 'future', title: 'Tomorrow task', dueDate: '2026-06-10', order: 3 }),
    ]);
    renderUpcoming();
    const rowTitles = Array.from(document.querySelectorAll('.task-row-title')).map(
      (el) => el.textContent,
    );
    expect(rowTitles).toEqual(['Tomorrow task']);
  });

  it("renders the italic empty state 'Nothing ahead — type to capture.' when no open task is due after today", () => {
    seedTasks([]);
    renderUpcoming();
    const empty = document.querySelector('.empty-state');
    expect(empty?.textContent).toBe('Nothing ahead — type to capture.');
  });

  it('renders rows as TaskRow elements and clicking a row selects it', () => {
    seedTasks([
      makeTask({ id: 't1', title: 'Send report', dueDate: '2026-06-10', order: 1 }),
      makeTask({ id: 't2', title: 'Dentist', dueDate: '2026-06-11', order: 2 }),
    ]);
    renderUpcoming();
    const row = document.querySelector<HTMLElement>('.task-row[data-task-id="t2"]');
    expect(row).not.toBeNull();
    fireEvent.click(row as HTMLElement);
    expect((row as HTMLElement).className).toContain('task-row--selected');
  });

  it('completing a task via its checkbox removes it from the Upcoming list', () => {
    seedTasks([makeTask({ id: 't1', title: 'Send report', dueDate: '2026-06-10' })]);
    renderUpcoming();
    fireEvent.click(screen.getByLabelText('Complete Send report'));
    expect(document.querySelectorAll('.task-row')).toHaveLength(0);
    expect(document.querySelector('.empty-state')?.textContent).toBe(
      'Nothing ahead — type to capture.',
    );
  });
});
