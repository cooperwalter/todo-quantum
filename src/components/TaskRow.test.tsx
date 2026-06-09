// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskRow } from './TaskRow';
import { AppProvider, useApp } from '../state/AppContext';
import type { Task } from '../lib/types';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'row-task-1',
    title: 'Send report',
    status: 'open',
    dueDate: '2026-06-09',
    dueTime: '15:00',
    list: 'work',
    priority: null,
    recurrence: null,
    createdAt: '2026-06-01T08:00:00.000Z',
    completedAt: null,
    order: 1,
    ...overrides,
  };
}

function TasksProbe() {
  const { state } = useApp();
  return <pre data-testid="tasks-probe">{JSON.stringify(state.data.tasks)}</pre>;
}

function renderRow(task: Task, extra: { rollover?: boolean } = {}) {
  window.localStorage.setItem(
    'todo-quantum.v1',
    JSON.stringify({ schemaVersion: 1, tasks: [task] }),
  );
  return render(
    <AppProvider>
      <TaskRow task={task} rollover={extra.rollover ?? false} />
      <TasksProbe />
    </AppProvider>,
  );
}

function probedTasks(): Task[] {
  return JSON.parse(screen.getByTestId('tasks-probe').textContent ?? '[]');
}

beforeEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('TaskRow rendering', () => {
  it('renders the task title and mono metadata (time and list)', () => {
    renderRow(makeTask());
    expect(screen.getByText('Send report')).toBeTruthy();
    const meta = document.querySelector('.task-row-meta');
    expect(meta?.textContent).toContain('3:00 PM');
    expect(meta?.textContent).toContain('#work');
  });

  it('marks a priority-1 row with the accent left-rule class', () => {
    renderRow(makeTask({ priority: 1 }));
    expect(document.querySelector('.task-row--p1')).toBeTruthy();
  });

  it('does not mark non-priority-1 rows with the accent class', () => {
    renderRow(makeTask({ priority: 2 }));
    expect(document.querySelector('.task-row--p1')).toBeNull();
  });

  it("renders an italic muted '— since {weekday}' annotation for rollover rows, never danger", () => {
    renderRow(makeTask({ dueDate: '2026-06-08' }), { rollover: true });
    const since = document.querySelector('.task-row-since');
    expect(since?.textContent).toBe('— since Mon');
    expect(since?.className).not.toContain('danger');
  });
});

describe('TaskRow completion', () => {
  it('dispatches complete on checkbox click and the row reflects the done strike state', async () => {
    const user = userEvent.setup();
    renderRow(makeTask());
    await user.click(screen.getByRole('checkbox', { name: /complete send report/i }));
    expect(probedTasks()[0].status).toBe('done');
  });
});

describe('TaskRow inline edit', () => {
  it('opens a pre-filled inline edit input when the title is clicked', async () => {
    const user = userEvent.setup();
    renderRow(makeTask());
    await user.click(screen.getByText('Send report'));
    const edit = screen.getByRole('textbox', { name: /edit task title/i });
    expect((edit as HTMLInputElement).value).toBe('Send report');
  });

  it('Enter saves the edited title via the edit action', async () => {
    const user = userEvent.setup();
    renderRow(makeTask());
    await user.click(screen.getByText('Send report'));
    const edit = screen.getByRole('textbox', { name: /edit task title/i });
    await user.clear(edit);
    await user.type(edit, 'Send the Q2 report{Enter}');
    expect(probedTasks()[0].title).toBe('Send the Q2 report');
    expect(screen.queryByRole('textbox', { name: /edit task title/i })).toBeNull();
  });

  it('Esc cancels the inline edit without dispatching', async () => {
    const user = userEvent.setup();
    renderRow(makeTask());
    await user.click(screen.getByText('Send report'));
    const edit = screen.getByRole('textbox', { name: /edit task title/i });
    await user.clear(edit);
    await user.type(edit, 'Changed{Escape}');
    expect(probedTasks()[0].title).toBe('Send report');
    expect(screen.getByText('Send report')).toBeTruthy();
  });
});
