// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskList } from './TaskList';
import type { TaskListSection } from './TaskList';
import { AppProvider } from '../state/AppContext';
import type { Task } from '../lib/types';

let counter = 0;
function makeTask(overrides: Partial<Task> = {}): Task {
  counter += 1;
  return {
    id: `list-task-${counter}`,
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

function renderList(sections: TaskListSection[]) {
  return render(
    <AppProvider username="testuser">
      <TaskList sections={sections} />
    </AppProvider>,
  );
}

beforeEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('TaskList sections', () => {
  it('renders mono uppercase section labels with their rows', () => {
    const a = makeTask({ title: 'Rollover item' });
    const b = makeTask({ title: 'Today item' });
    renderList([
      { label: 'Rollover', tasks: [a], rollover: true },
      { label: 'Due today', tasks: [b] },
    ]);
    const labels = Array.from(document.querySelectorAll('.task-section-label')).map((el) => el.textContent);
    expect(labels).toEqual(['Rollover', 'Due today']);
    expect(screen.getByText('Rollover item')).toBeTruthy();
    expect(screen.getByText('Today item')).toBeTruthy();
  });

  it('omits sections with no tasks', () => {
    const a = makeTask();
    renderList([
      { label: 'Rollover', tasks: [] },
      { label: 'Due today', tasks: [a] },
    ]);
    const labels = Array.from(document.querySelectorAll('.task-section-label')).map((el) => el.textContent);
    expect(labels).toEqual(['Due today']);
  });

  it("renders the italic empty state 'Nothing on deck — type to capture.' when every section is empty", () => {
    renderList([{ label: 'Due today', tasks: [] }]);
    expect(screen.getByText('Nothing on deck — type to capture.')).toBeTruthy();
  });
});

describe('TaskList selection (FR-46)', () => {
  it('selects at most one row at a time on click', async () => {
    const user = userEvent.setup();
    const a = makeTask({ title: 'First' });
    const b = makeTask({ title: 'Second' });
    renderList([{ label: 'Due today', tasks: [a, b] }]);
    await user.click(screen.getByText('Second').closest('.task-row') as HTMLElement);
    expect(document.querySelectorAll('.task-row--selected')).toHaveLength(1);
    await user.click(screen.getByText('First').closest('.task-row') as HTMLElement);
    const selected = document.querySelectorAll('.task-row--selected');
    expect(selected).toHaveLength(1);
    expect(selected[0].textContent).toContain('First');
  });

  it('gives the selected row tabIndex 0 and all others -1 (roving tabindex)', async () => {
    const user = userEvent.setup();
    const a = makeTask({ title: 'First' });
    const b = makeTask({ title: 'Second' });
    renderList([{ label: 'Due today', tasks: [a, b] }]);
    await user.click(screen.getByText('Second').closest('.task-row') as HTMLElement);
    const rows = Array.from(document.querySelectorAll('.task-row'));
    expect(rows.map((r) => (r as HTMLElement).tabIndex)).toEqual([-1, 0]);
  });

  it('gives the first row tabIndex 0 when nothing is selected so the list stays keyboard-reachable', () => {
    const a = makeTask();
    const b = makeTask();
    renderList([{ label: 'Due today', tasks: [a, b] }]);
    const rows = Array.from(document.querySelectorAll('.task-row'));
    expect(rows.map((r) => (r as HTMLElement).tabIndex)).toEqual([0, -1]);
  });
});

describe('TaskList controlled selection', () => {
  it('honors a controlled selectedId and reports clicks through onSelect', async () => {
    const user = userEvent.setup();
    const a = makeTask({ title: 'First' });
    const b = makeTask({ title: 'Second' });
    const selections: (string | null)[] = [];
    render(
      <AppProvider username="testuser">
        <TaskList
          sections={[{ label: 'Due today', tasks: [a, b] }]}
          selectedId={a.id}
          onSelect={(id) => selections.push(id)}
        />
      </AppProvider>,
    );
    expect(document.querySelector('.task-row--selected')?.textContent).toContain('First');
    await user.click(screen.getByText('Second').closest('.task-row') as HTMLElement);
    expect(selections).toEqual([b.id]);
  });
});
