// @vitest-environment jsdom
// TZ is pinned suite-wide to America/New_York in vite.config.ts (test.env.TZ).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { useToday } from './useToday';

function Probe() {
  const today = useToday();
  return <pre data-testid="today">{today}</pre>;
}

function renderedToday(): string {
  return screen.getByTestId('today').textContent ?? '';
}

describe('useToday', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('returns the local date string for the current moment on first render', () => {
    vi.setSystemTime(new Date(2026, 5, 9, 13, 30, 0));
    render(<Probe />);
    expect(renderedToday()).toBe('2026-06-09');
  });

  it('recomputes the date when the window regains focus after midnight passed while unfocused', () => {
    vi.setSystemTime(new Date(2026, 5, 9, 13, 30, 0));
    render(<Probe />);
    expect(renderedToday()).toBe('2026-06-09');
    vi.setSystemTime(new Date(2026, 5, 10, 9, 0, 0));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(renderedToday()).toBe('2026-06-10');
  });

  it('fires the midnight timer exactly at the next local midnight, not before', () => {
    vi.setSystemTime(new Date(2026, 5, 9, 22, 0, 0));
    render(<Probe />);
    act(() => {
      vi.advanceTimersByTime(2 * 3600_000 - 1);
    });
    expect(renderedToday()).toBe('2026-06-09');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(renderedToday()).toBe('2026-06-10');
  });

  it('re-arms after firing so the date keeps advancing across consecutive midnights', () => {
    vi.setSystemTime(new Date(2026, 5, 9, 23, 0, 0));
    render(<Probe />);
    act(() => {
      vi.advanceTimersByTime(1 * 3600_000);
    });
    expect(renderedToday()).toBe('2026-06-10');
    act(() => {
      vi.advanceTimersByTime(24 * 3600_000);
    });
    expect(renderedToday()).toBe('2026-06-11');
  });

  it('re-arms across the 2026-11-01 fall-back (25h day) firing at local midnight, not 24h after arm', () => {
    vi.setSystemTime(new Date(2026, 9, 31, 23, 0, 0));
    render(<Probe />);
    expect(renderedToday()).toBe('2026-10-31');
    act(() => {
      vi.advanceTimersByTime(1 * 3600_000);
    });
    expect(renderedToday()).toBe('2026-11-01');
    act(() => {
      vi.advanceTimersByTime(24 * 3600_000);
    });
    expect(renderedToday()).toBe('2026-11-01');
    act(() => {
      vi.advanceTimersByTime(1 * 3600_000);
    });
    expect(renderedToday()).toBe('2026-11-02');
  });

  it('fires at local midnight across the 2026-03-08 spring-forward (23h day), not 24h after arm', () => {
    vi.setSystemTime(new Date(2026, 2, 8, 1, 0, 0));
    render(<Probe />);
    expect(renderedToday()).toBe('2026-03-08');
    act(() => {
      vi.advanceTimersByTime(22 * 3600_000 - 1);
    });
    expect(renderedToday()).toBe('2026-03-08');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(renderedToday()).toBe('2026-03-09');
  });

  it('clears the midnight timer and the focus listener on unmount', () => {
    vi.setSystemTime(new Date(2026, 5, 9, 22, 0, 0));
    const { unmount } = render(<Probe />);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
