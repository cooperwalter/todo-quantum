// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskRow } from './TaskRow';
import { AppProvider, useApp } from '../state/AppContext';
import * as serializeModule from '../lib/serialize';
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

// A metadata-free task serializes to exactly its title, so these title-only
// regression tests stay deterministic without a frozen clock.
function makePlainTask(overrides: Partial<Task> = {}): Task {
  return makeTask({ dueDate: null, dueTime: null, list: null, ...overrides });
}

describe('TaskRow inline edit', () => {
  it('opens a pre-filled inline edit input when the title is clicked', async () => {
    const user = userEvent.setup();
    renderRow(makePlainTask());
    await user.click(screen.getByText('Send report'));
    const edit = screen.getByRole('textbox', { name: /edit task/i });
    expect((edit as HTMLInputElement).value).toBe('Send report');
  });

  it('Enter saves the edited title via the edit action', async () => {
    const user = userEvent.setup();
    renderRow(makePlainTask());
    await user.click(screen.getByText('Send report'));
    const edit = screen.getByRole('textbox', { name: /edit task/i });
    await user.clear(edit);
    await user.type(edit, 'Send the Q2 report{Enter}');
    expect(probedTasks()[0].title).toBe('Send the Q2 report');
    expect(screen.queryByRole('textbox', { name: /edit task/i })).toBeNull();
  });

  it('Esc cancels the inline edit without dispatching', async () => {
    const user = userEvent.setup();
    renderRow(makePlainTask());
    await user.click(screen.getByText('Send report'));
    const edit = screen.getByRole('textbox', { name: /edit task/i });
    await user.clear(edit);
    await user.type(edit, 'Changed{Escape}');
    expect(probedTasks()[0].title).toBe('Send report');
    expect(screen.getByText('Send report')).toBeTruthy();
  });
});

describe('TaskRow edit close returns selection to the row', () => {
  function renderRowWithSelect(task: Task) {
    const onSelect = vi.fn();
    window.localStorage.setItem(
      'todo-quantum.v1',
      JSON.stringify({ schemaVersion: 1, tasks: [task] }),
    );
    render(
      <AppProvider>
        <TaskRow task={task} onSelect={onSelect} />
        <TasksProbe />
      </AppProvider>,
    );
    return onSelect;
  }

  function rowElement(task: Task): HTMLElement {
    return document.querySelector(`[data-task-id="${task.id}"]`) as HTMLElement;
  }

  it('Esc-cancelling an edit selects the edited row and moves focus onto it', async () => {
    const user = userEvent.setup();
    const task = makePlainTask();
    const onSelect = renderRowWithSelect(task);
    await user.click(screen.getByText('Send report'));
    await user.keyboard('{Escape}');
    expect(onSelect).toHaveBeenLastCalledWith(task.id);
    expect(document.activeElement).toBe(rowElement(task));
  });

  it('saving an edit with Enter selects the edited row and moves focus onto it', async () => {
    const user = userEvent.setup();
    const task = makePlainTask();
    const onSelect = renderRowWithSelect(task);
    await user.click(screen.getByText('Send report'));
    const edit = screen.getByRole('textbox', { name: /edit task/i });
    await user.clear(edit);
    await user.type(edit, 'Send the Q2 report{Enter}');
    expect(probedTasks()[0].title).toBe('Send the Q2 report');
    expect(onSelect).toHaveBeenLastCalledWith(task.id);
    expect(document.activeElement).toBe(rowElement(task));
  });

  it('saving an edit via blur does not pull focus back onto the row', async () => {
    const user = userEvent.setup();
    const task = makePlainTask();
    const onSelect = renderRowWithSelect(task);
    await user.click(screen.getByText('Send report'));
    const edit = screen.getByRole('textbox', { name: /edit task/i });
    await user.clear(edit);
    await user.type(edit, 'Send quarterly report');
    onSelect.mockClear();
    fireEvent.blur(edit);
    expect(probedTasks()[0].title).toBe('Send quarterly report');
    expect(onSelect).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(rowElement(task));
  });
});

describe('TaskRow keyboard-first surface (US-107)', () => {
  it('renders no overflow options button and no snooze menu for an open task', () => {
    renderRow(makeTask());
    expect(screen.queryByRole('button', { name: /task options/i })).toBeNull();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.queryByRole('menuitem')).toBeNull();
  });
});

describe('Review fixes: inline edit blur (F-015)', () => {
  it('clicking away from an inline edit saves the draft instead of discarding it', async () => {
    const user = userEvent.setup();
    renderRow(makePlainTask());
    await user.click(screen.getByText('Send report'));
    const edit = screen.getByRole('textbox', { name: /edit task/i });
    await user.clear(edit);
    await user.type(edit, 'Send quarterly report');
    fireEvent.blur(edit);
    expect(probedTasks()[0].title).toBe('Send quarterly report');
  });
});

describe('TaskRow token edit integration (US-106)', () => {
  // Freeze the clock so the edit session's serializeTask/parse use a fixed `now`.
  // 2026-06-10 is a Wednesday; the default task is due 2026-06-09 (yesterday) at 3pm.
  const FROZEN = new Date(2026, 5, 10, 12, 0, 0);

  function setupUser() {
    return userEvent.setup();
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(FROZEN);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function editInput(): HTMLInputElement {
    return screen.getByRole('textbox', { name: /edit task/i }) as HTMLInputElement;
  }

  function chipTexts(): string[] {
    return Array.from(document.querySelectorAll('.command-bar-chip')).map((el) => el.textContent ?? '');
  }

  function announcementText(): string {
    return document.getElementById('command-bar-announcement')?.textContent ?? '';
  }

  it('opens the editor on a metadata task seeded with serialized text and chip mirror', async () => {
    const user = setupUser();
    renderRow(makeTask());
    await user.click(screen.getByText('Send report'));
    expect(editInput().value).toBe('Send report yesterday 3pm #work');
    expect(chipTexts()).toContain('#work');
    expect(chipTexts().some((t) => /3pm/i.test(t))).toBe(true);
  });

  it('renders the chip announcement live region with baseline chips at mount', async () => {
    const user = setupUser();
    renderRow(makeTask());
    await user.click(screen.getByText('Send report'));
    const region = document.getElementById('command-bar-announcement');
    expect(region).not.toBeNull();
    expect(region?.className).toContain('visually-hidden');
    expect(announcementText()).toContain('list #work');
  });

  it('updates the chip announcement when a new token is typed during the edit', async () => {
    const user = setupUser();
    renderRow(makeTask());
    await user.click(screen.getByText('Send report'));
    await user.type(editInput(), ' !p1');
    expect(announcementText()).toContain('priority P1');
  });

  it('Enter saves every changed field in a single edit action when a token is added', async () => {
    const user = setupUser();
    renderRow(makeTask());
    await user.click(screen.getByText('Send report'));
    await user.type(editInput(), ' !p1{Enter}');
    const saved = probedTasks()[0];
    expect(saved.priority).toBe(1);
    expect(saved.title).toBe('Send report');
    expect(saved.list).toBe('work');
    expect(saved.dueDate).toBe('2026-06-09');
  });

  it('erasing the #work token saves the list cleared to null', async () => {
    const user = setupUser();
    renderRow(makeTask());
    await user.click(screen.getByText('Send report'));
    const edit = editInput();
    await user.clear(edit);
    await user.type(edit, 'Send report yesterday 3pm{Enter}');
    const saved = probedTasks()[0];
    expect(saved.list).toBeNull();
    expect(saved.title).toBe('Send report');
  });

  it('blur saves the edit exactly like Enter', async () => {
    const user = setupUser();
    renderRow(makeTask());
    await user.click(screen.getByText('Send report'));
    await user.type(editInput(), ' !p2');
    fireEvent.blur(editInput());
    expect(probedTasks()[0].priority).toBe(2);
  });

  it('blur with an empty extracted title cancels instead of saving', async () => {
    const user = setupUser();
    renderRow(makeTask());
    await user.click(screen.getByText('Send report'));
    const edit = editInput();
    await user.clear(edit);
    await user.type(edit, '#work');
    fireEvent.blur(edit);
    expect(probedTasks()[0].title).toBe('Send report');
    expect(screen.getByText('Send report')).toBeTruthy();
  });

  it('Enter with an empty extracted title blocks save and shows inline feedback', async () => {
    const user = setupUser();
    renderRow(makeTask());
    await user.click(screen.getByText('Send report'));
    const edit = editInput();
    await user.clear(edit);
    await user.type(edit, '#work{Enter}');
    expect(probedTasks()[0].title).toBe('Send report');
    expect(screen.getByRole('textbox', { name: /edit task/i })).toBeTruthy();
    expect(document.querySelector('.task-row-edit-error')?.textContent).toMatch(/title/i);
  });

  it('falls back to title-only editing with a console error when serialized text does not round-trip', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(serializeModule, 'serializeTask').mockReturnValue({
      text: 'totally different text that loses fields',
      revertedRanges: [],
    });
    const user = setupUser();
    renderRow(makeTask());
    await user.click(screen.getByText('Send report'));
    const edit = editInput();
    expect(edit.value).toBe('Send report');
    expect(document.querySelectorAll('.command-bar-chip').length).toBe(0);
    expect(consoleError).toHaveBeenCalled();
    await user.clear(edit);
    await user.type(edit, 'Renamed only{Enter}');
    const saved = probedTasks()[0];
    expect(saved.title).toBe('Renamed only');
    expect(saved.list).toBe('work');
  });

  it('does not open the editor when Enter or a title click lands on a done task (FR-120)', async () => {
    const user = setupUser();
    renderRow(makeTask({ status: 'done', completedAt: '2026-06-10T09:00:00.000Z' }));
    await user.click(screen.getByText('Send report'));
    expect(screen.queryByRole('textbox', { name: /edit task/i })).toBeNull();
    const row = document.querySelector('.task-row') as HTMLElement;
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(screen.queryByRole('textbox', { name: /edit task/i })).toBeNull();
  });
});
