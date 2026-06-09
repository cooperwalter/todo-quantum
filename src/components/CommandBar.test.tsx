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
    <AppProvider>
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
