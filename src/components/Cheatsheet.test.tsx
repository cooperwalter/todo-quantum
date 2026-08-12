// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import type { Task } from '../lib/types';
import { USERNAME_KEY } from '../lib/username';

const STORAGE_KEY = 'todo-quantum.v1.testuser';

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

function seedOneTask() {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ schemaVersion: 1, tasks: [makeTask()] }),
  );
}

function focusFirstRow(): HTMLElement {
  const bar = document.querySelector<HTMLInputElement>('.command-bar-input');
  if (bar === null) throw new Error('bar not found');
  bar.focus();
  fireEvent.keyDown(bar, { key: 'ArrowDown' });
  const row = document.querySelector<HTMLElement>('.task-row[data-task-id="task-1"]');
  if (row === null) throw new Error('row not found');
  return row;
}

describe('Cheatsheet', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem(USERNAME_KEY, 'testuser');
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it('pressing ? in LIST context opens the modal dialog', () => {
    seedOneTask();
    render(<App />);
    const row = focusFirstRow();
    fireEvent.keyDown(row, { key: '?' });
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it("running the >help command opens the modal dialog", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByRole('textbox'), '>help{Enter}');
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('lists every US-010 binding in the key table', () => {
    seedOneTask();
    render(<App />);
    fireEvent.keyDown(focusFirstRow(), { key: '?' });
    const text = screen.getByRole('dialog').textContent ?? '';
    for (const key of ['j / ↓', 'k / ↑', 'x / space', 'e / enter', 'del', '1', '2', '3', 'g t', 'g u', 'g a', 'g d', '?', '⌘Z', '⇧⌘Z', 'esc', '>']) {
      expect(text).toContain(key);
    }
  });

  it('moves focus into the dialog when it opens', () => {
    seedOneTask();
    render(<App />);
    fireEvent.keyDown(focusFirstRow(), { key: '?' });
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  });

  it('Tab from the last focusable element cycles focus back inside the dialog', () => {
    seedOneTask();
    render(<App />);
    fireEvent.keyDown(focusFirstRow(), { key: '?' });
    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Tab' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Tab', shiftKey: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('typing a printable character inside the dialog does not move focus to the command bar', () => {
    seedOneTask();
    render(<App />);
    fireEvent.keyDown(focusFirstRow(), { key: '?' });
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'a' });
    const bar = document.querySelector<HTMLInputElement>('.command-bar-input');
    expect(document.activeElement).not.toBe(bar);
    expect(bar?.value).toBe('');
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('Esc closes the dialog and returns focus to the previously focused row', () => {
    seedOneTask();
    render(<App />);
    const row = focusFirstRow();
    fireEvent.keyDown(row, { key: '?' });
    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(row);
    expect(dialog).toBeTruthy();
  });
});
