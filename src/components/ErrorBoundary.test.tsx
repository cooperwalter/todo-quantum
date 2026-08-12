// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';
import { RECOVERY_PREFIX, STORAGE_KEY } from '../lib/persistence';
import { USERNAME_KEY, storageKeyFor } from '../lib/username';

function Bomb(): never {
  throw new Error('corrupt task exploded');
}

function renderCrashed(reload: () => void) {
  return render(
    <ErrorBoundary reload={reload}>
      <Bomb />
    </ErrorBoundary>,
  );
}

function recoveryEntries(): string[] {
  return Object.keys(window.localStorage)
    .filter((k) => k.startsWith(RECOVERY_PREFIX))
    .map((k) => window.localStorage.getItem(k) ?? '');
}

beforeEach(() => {
  window.localStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ErrorBoundary (F-001 last line of defense)', () => {
  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>all good</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('all good')).toBeTruthy();
  });

  it('replaces a crashing subtree with the fallback instead of a white screen', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByText('corrupt task exploded')).toBeTruthy();
  });

  it('should quarantine and remove the legacy todo-quantum.v1 key when no username is stored', () => {
    const blob = '{"schemaVersion":1,"tasks":[null]}';
    window.localStorage.setItem(STORAGE_KEY, blob);
    const reload = vi.fn();
    renderCrashed(reload);
    fireEvent.click(screen.getByText('Reset data (keeps a recovery copy)'));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(recoveryEntries()).toEqual([blob]);
    expect(reload).toHaveBeenCalled();
  });

  it('should quarantine and remove the per-user data key when a username is stored', () => {
    const blob = '{"schemaVersion":1,"tasks":[null]}';
    window.localStorage.setItem(USERNAME_KEY, 'cooper');
    window.localStorage.setItem(storageKeyFor('cooper'), blob);
    const reload = vi.fn();
    renderCrashed(reload);
    fireEvent.click(screen.getByText('Reset data (keeps a recovery copy)'));
    expect(window.localStorage.getItem(storageKeyFor('cooper'))).toBeNull();
    expect(recoveryEntries()).toEqual([blob]);
    expect(reload).toHaveBeenCalled();
  });

  it('should leave another user’s data untouched when resetting the current user', () => {
    const other = '{"schemaVersion":1,"tasks":[]}';
    window.localStorage.setItem(USERNAME_KEY, 'cooper');
    window.localStorage.setItem(storageKeyFor('cooper'), '{"schemaVersion":1,"tasks":[null]}');
    window.localStorage.setItem(storageKeyFor('dana'), other);
    renderCrashed(vi.fn());
    fireEvent.click(screen.getByText('Reset data (keeps a recovery copy)'));
    expect(window.localStorage.getItem(storageKeyFor('dana'))).toBe(other);
  });
});
