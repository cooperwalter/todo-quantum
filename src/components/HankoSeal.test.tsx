// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { HankoSeal } from './HankoSeal';
import { AppProvider } from '../state/AppContext';
import { todayStr } from '../lib/dates';
import type { Task } from '../lib/types';

const TODAY = todayStr(new Date());
const LONG_AGO = '2020-01-02';

function makeTask(overrides: Partial<Task> & { id: string }): Task {
  return {
    title: overrides.id,
    status: 'open',
    dueDate: TODAY,
    dueTime: null,
    list: null,
    priority: null,
    recurrence: null,
    createdAt: '2020-01-01T00:00:00.000Z',
    completedAt: null,
    order: 0,
    ...overrides,
  };
}

function renderSeal(tasks: Task[]) {
  window.localStorage.setItem('todo-quantum.v1', JSON.stringify({ schemaVersion: 1, tasks }));
  return render(
    <AppProvider>
      <HankoSeal />
    </AppProvider>,
  );
}

function seal(): HTMLElement {
  return document.querySelector('.hanko-seal') as HTMLElement;
}

beforeEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('HankoSeal', () => {
  it('renders the 今日 seal as a status region, not an interactive control', () => {
    renderSeal([]);
    expect(seal().textContent).toBe('今日');
    expect(seal().getAttribute('role')).toBe('status');
    expect(seal().hasAttribute('tabindex')).toBe(false);
    expect(seal().getAttribute('onclick')).toBeNull();
  });

  it('stays outline (not filled) when today has zero dated tasks', () => {
    renderSeal([makeTask({ id: 'anytime', dueDate: null })]);
    expect(seal().className).not.toContain('hanko-seal--filled');
    expect(seal().getAttribute('aria-label')).toBe('0 of 0 tasks done today');
  });

  it('fills crimson when every today + rollover task is done', () => {
    renderSeal([
      makeTask({ id: 'a', status: 'done' }),
      makeTask({ id: 'rollover', dueDate: LONG_AGO, status: 'done' }),
    ]);
    expect(seal().className).toContain('hanko-seal--filled');
    expect(seal().getAttribute('aria-label')).toBe('2 of 2 tasks done today');
  });

  it('un-fills when an open today-task is added after the seal would fill', () => {
    renderSeal([
      makeTask({ id: 'a', status: 'done' }),
      makeTask({ id: 'b', status: 'open' }),
    ]);
    expect(seal().className).not.toContain('hanko-seal--filled');
    expect(seal().getAttribute('aria-label')).toBe('1 of 2 tasks done today');
  });

  it('un-fills when a previously-done today-task is reopened', () => {
    renderSeal([makeTask({ id: 'a', status: 'open' })]);
    expect(seal().className).not.toContain('hanko-seal--filled');
    expect(seal().getAttribute('aria-label')).toBe('0 of 1 tasks done today');
  });
});
