// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommandBar } from './CommandBar';
import { AppProvider, useApp } from '../state/AppContext';

// 2026-06-09 is a Tuesday.
const NOW = new Date(2026, 5, 9, 10, 0, 0);
const CANONICAL = 'Send report tomorrow 3pm #work !p1';

function TasksProbe() {
  const { state } = useApp();
  return <pre data-testid="tasks-probe">{JSON.stringify(state.data.tasks)}</pre>;
}

function renderBar() {
  return render(
    <AppProvider username="testuser">
      <CommandBar now={NOW} />
      <TasksProbe />
    </AppProvider>,
  );
}

function probedTasks(): { title: string; dueDate: string | null; dueTime: string | null; list: string | null; priority: number | null }[] {
  return JSON.parse(screen.getByTestId('tasks-probe').textContent ?? '[]');
}

function chipTexts(): string[] {
  return Array.from(document.querySelectorAll('.command-bar-chip')).map((el) => el.textContent ?? '');
}

beforeEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('CommandBar chips', () => {
  it('renders exactly 3 accent chips for the canonical string', async () => {
    const user = userEvent.setup();
    renderBar();
    await user.type(screen.getByRole('textbox'), CANONICAL);
    expect(chipTexts()).toEqual(['tomorrow 3pm', '#work', '!p1']);
  });

  it('renders zero chips for plain literal text', async () => {
    const user = userEvent.setup();
    renderBar();
    await user.type(screen.getByRole('textbox'), 'Pay May invoice');
    expect(chipTexts()).toEqual([]);
  });

  it('captures the LAST of two same-kind date tokens (last-wins, friday then monday -> monday chip)', async () => {
    const user = userEvent.setup();
    renderBar();
    await user.type(screen.getByRole('textbox'), 'pay rent friday monday');
    expect(chipTexts()).toEqual(['monday']);
  });
});

describe('CommandBar Enter (FR-12, FR-13)', () => {
  it('dispatches add with the parsed fields on Enter', async () => {
    const user = userEvent.setup();
    renderBar();
    await user.type(screen.getByRole('textbox'), `${CANONICAL}{Enter}`);
    const tasks = probedTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      title: 'Send report',
      dueDate: '2026-06-10',
      dueTime: '15:00',
      list: 'work',
      priority: 1,
    });
  });

  it('clears the input and keeps focus in the bar after a capture', async () => {
    const user = userEvent.setup();
    renderBar();
    const input = screen.getByRole('textbox');
    await user.type(input, `${CANONICAL}{Enter}`);
    expect((input as HTMLInputElement).value).toBe('');
    expect(document.activeElement).toBe(input);
  });

  it("shows 'nothing to capture' and creates no task when Enter leaves an empty title", async () => {
    const user = userEvent.setup();
    renderBar();
    await user.type(screen.getByRole('textbox'), 'tomorrow{Enter}');
    expect(screen.getByText('nothing to capture')).toBeTruthy();
    expect(probedTasks()).toHaveLength(0);
  });

  it('clears the error message on the next input change', async () => {
    const user = userEvent.setup();
    renderBar();
    await user.type(screen.getByRole('textbox'), 'tomorrow{Enter}');
    expect(screen.getByText('nothing to capture')).toBeTruthy();
    await user.type(screen.getByRole('textbox'), 'x');
    expect(screen.queryByText('nothing to capture')).toBeNull();
  });
});

describe('CommandBar Esc chip revert (FR-14)', () => {
  it('reverts the last chip to literal text, leaving earlier chips intact', async () => {
    const user = userEvent.setup();
    renderBar();
    await user.type(screen.getByRole('textbox'), `${CANONICAL}{Escape}`);
    expect(chipTexts()).toEqual(['tomorrow 3pm', '#work']);
  });

  it('drops the reverted token from the parse so Enter captures it as literal title text', async () => {
    const user = userEvent.setup();
    renderBar();
    await user.type(screen.getByRole('textbox'), `${CANONICAL}{Escape}{Enter}`);
    const tasks = probedTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('Send report !p1');
    expect(tasks[0].priority).toBeNull();
    expect(tasks[0].dueDate).toBe('2026-06-10');
  });

  it('reverts chips one at a time on repeated Esc', async () => {
    const user = userEvent.setup();
    renderBar();
    await user.type(screen.getByRole('textbox'), `${CANONICAL}{Escape}{Escape}`);
    expect(chipTexts()).toEqual(['tomorrow 3pm']);
  });
});

describe('CommandBar accessibility (FR-45)', () => {
  it('points aria-describedby at visually-hidden text announcing the parse', async () => {
    const user = userEvent.setup();
    renderBar();
    const input = screen.getByRole('textbox');
    await user.type(input, CANONICAL);
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const announcement = document.getElementById(describedBy as string);
    expect(announcement?.textContent).toContain('due Wed Jun 10, 3:00 PM');
    expect(announcement?.textContent).toContain('list #work');
    expect(announcement?.textContent).toContain('priority P1');
  });
});

function ViewProbe() {
  const { view } = useApp();
  return <span data-testid="view-probe">{view}</span>;
}

function renderBarWithView() {
  return render(
    <AppProvider username="testuser">
      <CommandBar now={NOW} />
      <ViewProbe />
      <TasksProbe />
    </AppProvider>,
  );
}

describe('CommandBar command mode (FR-18, FR-19)', () => {
  it("flips to command mode on a leading '>' (doubled ink-bar prompt and mono class)", async () => {
    const user = userEvent.setup();
    renderBarWithView();
    // Default capture prompt is a single ink bar.
    expect(document.querySelectorAll('.command-bar-prompt .prompt-bar')).toHaveLength(1);
    await user.type(screen.getByRole('textbox'), '>');
    // Command mode doubles the prompt to two ink bars.
    expect(document.querySelectorAll('.command-bar-prompt .prompt-bar')).toHaveLength(2);
    expect(document.querySelector('.command-bar--command')).toBeTruthy();
  });

  it('renders a fuzzy-filtered command list with role=listbox', async () => {
    const user = userEvent.setup();
    renderBarWithView();
    await user.type(screen.getByRole('textbox'), '>');
    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeTruthy();
    expect(screen.getAllByRole('option')).toHaveLength(8);
  });

  it("'>tdy' highlights today and Enter switches the view", async () => {
    const user = userEvent.setup();
    renderBarWithView();
    await user.type(screen.getByRole('textbox'), '>done');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('view-probe').textContent).toBe('done');
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('');
  });

  it("'>tdy' fuzzy-matches today via subsequence", async () => {
    const user = userEvent.setup();
    renderBarWithView();
    await user.type(screen.getByRole('textbox'), '>tdy{Enter}');
    expect(screen.getByTestId('view-probe').textContent).toBe('today');
  });

  it("'>undo' Enter dispatches undo (a captured task is removed)", async () => {
    const user = userEvent.setup();
    renderBarWithView();
    await user.type(screen.getByRole('textbox'), 'Buy milk{Enter}');
    expect(probedTasks()).toHaveLength(1);
    await user.type(screen.getByRole('textbox'), '>undo{Enter}');
    expect(probedTasks()).toHaveLength(0);
  });

  it('moves aria-activedescendant with ArrowDown and ArrowUp', async () => {
    const user = userEvent.setup();
    renderBarWithView();
    const input = screen.getByRole('textbox');
    await user.type(input, '>');
    const first = input.getAttribute('aria-activedescendant');
    await user.keyboard('{ArrowDown}');
    const second = input.getAttribute('aria-activedescendant');
    expect(second).not.toBe(first);
    await user.keyboard('{ArrowUp}');
    expect(input.getAttribute('aria-activedescendant')).toBe(first);
  });

  it('Esc exits command mode leaving an empty input', async () => {
    const user = userEvent.setup();
    renderBarWithView();
    const input = screen.getByRole('textbox');
    await user.type(input, '>tod{Escape}');
    expect((input as HTMLInputElement).value).toBe('');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('never treats text without a leading > as a command (FR-18)', async () => {
    const user = userEvent.setup();
    renderBarWithView();
    await user.type(screen.getByRole('textbox'), 'today undo help');
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

describe('Review fixes: command bar (F-003, F-004, F-005, F-013)', () => {
  it("Enter on '>export' (no matching command) keeps the text and shows 'no matching command'", async () => {
    const user = userEvent.setup();
    renderBar();
    const input = screen.getByRole('textbox') as HTMLInputElement;
    await user.type(input, '>export{Enter}');
    expect(input.value).toBe('>export');
    expect(screen.getByText('no matching command')).toBeTruthy();
    expect(probedTasks()).toEqual([]);
  });

  it('clearing the bar after a chip revert re-enables that token in the next capture', async () => {
    const user = userEvent.setup();
    renderBar();
    const input = screen.getByRole('textbox') as HTMLInputElement;
    await user.type(input, 'call mom tomorrow');
    await user.keyboard('{Escape}');
    expect(chipTexts()).toEqual([]);
    await user.clear(input);
    await user.type(input, 'dentist tomorrow');
    expect(chipTexts()).toEqual(['tomorrow']);
    await user.keyboard('{Enter}');
    const tasks = probedTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].dueDate).toBe('2026-06-10');
  });

  it('Escape in command mode clears to empty and keeps focus in the bar (FR-17: one precedence step)', async () => {
    const user = userEvent.setup();
    renderBar();
    const input = screen.getByRole('textbox') as HTMLInputElement;
    await user.type(input, '>undo');
    await user.keyboard('{Escape}');
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
  });

  it('command-mode navigation keys never propagate to document-level listeners', async () => {
    const user = userEvent.setup();
    const seen: string[] = [];
    const listener = (e: KeyboardEvent) => {
      seen.push(e.key);
    };
    renderBar();
    await user.type(screen.getByRole('textbox'), '>t');
    document.addEventListener('keydown', listener);
    await user.keyboard('{ArrowDown}{ArrowUp}{Escape}');
    document.removeEventListener('keydown', listener);
    expect(seen).toEqual([]);
  });
});
