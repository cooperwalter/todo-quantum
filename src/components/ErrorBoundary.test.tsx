// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';
import { RECOVERY_PREFIX, STORAGE_KEY } from '../lib/persistence';

function Bomb(): never {
  throw new Error('corrupt task exploded');
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

  it('Reset data stashes the stored blob under a recovery key before clearing the app key', () => {
    const blob = '{"schemaVersion":1,"tasks":[null]}';
    window.localStorage.setItem(STORAGE_KEY, blob);
    const reload = vi.fn();
    render(
      <ErrorBoundary reload={reload}>
        <Bomb />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByText('Reset data (keeps a recovery copy)'));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    const recoveryKeys = Object.keys(window.localStorage).filter((k) => k.startsWith(RECOVERY_PREFIX));
    expect(recoveryKeys).toHaveLength(1);
    expect(window.localStorage.getItem(recoveryKeys[0])).toBe(blob);
    expect(reload).toHaveBeenCalled();
  });
});
