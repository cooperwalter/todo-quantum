// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { AllView } from './AllView';
import { CommandBar } from '../components/CommandBar';
import { AppProvider } from '../state/AppContext';
import type { Task } from '../lib/types';

const STORAGE_KEY = 'todo-quantum.v1';

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

function seedTasks(tasks: Task[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, tasks }));
}

function renderAll() {
  return render(
    <AppProvider>
      <CommandBar />
      <AllView />
    </AppProvider>,
  );
}

function rowTitles(): (string | null)[] {
  return Array.from(document.querySelectorAll('.task-row-title')).map((el) => el.textContent);
}

function barInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('.command-bar-input');
  if (input === null) throw new Error('command bar input not found');
  return input;
}

describe('AllView', () => {
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

  it('lists every open task with dated tasks (dueDate ascending) before anytime tasks (by order)', () => {
    seedTasks([
      makeTask({ id: 'any2', title: 'Anytime second', dueDate: null, order: 5 }),
      makeTask({ id: 'dated2', title: 'Dated later', dueDate: '2026-06-20', order: 1 }),
      makeTask({ id: 'any1', title: 'Anytime first', dueDate: null, order: 2 }),
      makeTask({ id: 'dated1', title: 'Dated sooner', dueDate: '2026-06-10', order: 9 }),
    ]);
    renderAll();
    expect(rowTitles()).toEqual(['Dated sooner', 'Dated later', 'Anytime first', 'Anytime second']);
  });

  it('excludes done tasks from the All view', () => {
    seedTasks([
      makeTask({ id: 'open1', title: 'Still open' }),
      makeTask({ id: 'done1', title: 'Already done', status: 'done', completedAt: '2026-06-08T10:00:00.000Z' }),
    ]);
    renderAll();
    expect(rowTitles()).toEqual(['Still open']);
  });

  it('live-filters the list to rows whose title or list matches the bar text', () => {
    seedTasks([
      makeTask({ id: 't1', title: 'Send report', order: 1 }),
      makeTask({ id: 't2', title: 'Dentist appointment', order: 2 }),
      makeTask({ id: 't3', title: 'Walk dog', list: 'reports', order: 3 }),
    ]);
    renderAll();
    fireEvent.change(barInput(), { target: { value: 'rep' } });
    expect(rowTitles()).toEqual(['Send report', 'Walk dog']);
  });

  it("shows the mono hint 'filtering — Enter captures' while bar text filters the list", () => {
    seedTasks([makeTask()]);
    renderAll();
    fireEvent.change(barInput(), { target: { value: 'rep' } });
    expect(document.querySelector('.filter-hint')?.textContent).toBe('filtering — Enter captures');
  });

  it('hides the filter hint when the bar is empty', () => {
    seedTasks([makeTask()]);
    renderAll();
    expect(document.querySelector('.filter-hint')).toBeNull();
  });

  it("does not filter and shows no hint when bar text starts with '>' (command mode)", () => {
    seedTasks([
      makeTask({ id: 't1', title: 'Send report', order: 1 }),
      makeTask({ id: 't2', title: 'Dentist appointment', order: 2 }),
    ]);
    renderAll();
    fireEvent.change(barInput(), { target: { value: '>done' } });
    expect(rowTitles()).toEqual(['Send report', 'Dentist appointment']);
    expect(document.querySelector('.filter-hint')).toBeNull();
  });

  it('Enter while filtering captures the bar text as a new task and clears the filter', () => {
    seedTasks([
      makeTask({ id: 't1', title: 'Send report', order: 1 }),
      makeTask({ id: 't2', title: 'Dentist appointment', order: 2 }),
    ]);
    renderAll();
    fireEvent.change(barInput(), { target: { value: 'rep' } });
    expect(rowTitles()).toEqual(['Send report']);
    fireEvent.keyDown(barInput(), { key: 'Enter' });
    expect(barInput().value).toBe('');
    expect(document.querySelector('.filter-hint')).toBeNull();
    expect(rowTitles()).toEqual(['Send report', 'Dentist appointment', 'rep']);
  });

  it('renders the italic empty state when no open task matches', () => {
    seedTasks([]);
    renderAll();
    expect(document.querySelector('.empty-state-copy')?.textContent).toBe(
      'Nothing here — type to capture.',
    );
  });
});
