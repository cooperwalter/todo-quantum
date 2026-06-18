// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { usePointerMode } from './usePointerMode';

function Harness() {
  usePointerMode();
  return null;
}

beforeEach(() => {
  render(<Harness />);
});

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.pointer;
});

describe('usePointerMode', () => {
  it('starts in mouse mode so hover affordances work before any input', () => {
    expect(document.documentElement.dataset.pointer).toBe('mouse');
  });

  it('switches to keyboard mode on keydown (typing suppresses hover affordances)', () => {
    fireEvent.keyDown(window, { key: 'a' });
    expect(document.documentElement.dataset.pointer).toBe('keyboard');
  });

  it('switches back to mouse mode when the pointer moves', () => {
    fireEvent.keyDown(window, { key: 'a' });
    expect(document.documentElement.dataset.pointer).toBe('keyboard');
    fireEvent.pointerMove(window);
    expect(document.documentElement.dataset.pointer).toBe('mouse');
  });

  it('switches to mouse mode on pointer down', () => {
    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.pointerDown(window);
    expect(document.documentElement.dataset.pointer).toBe('mouse');
  });
});
