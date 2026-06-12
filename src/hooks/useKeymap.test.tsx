// @vitest-environment jsdom
import { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useKeymap } from './useKeymap';

const ROW_IDS = ['t1', 't2', 't3'];

function Harness({ calls }: { calls: string[] }) {
  const barRef = useRef<HTMLTextAreaElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  useKeymap({
    barRef,
    getRowIds: () => ROW_IDS,
    selectedId: selected,
    setSelectedId: setSelected,
    onComplete: (id) => calls.push(`complete:${id}`),
    onEdit: (id) => calls.push(`edit:${id}`),
    onDelete: (id) => calls.push(`delete:${id}`),
    onSnooze: (id, dueDate) => calls.push(`snooze:${id}:${dueDate}`),
    onUndo: () => calls.push('undo'),
    onRedo: () => calls.push('redo'),
    onTypeahead: (ch) => calls.push(`typeahead:${ch}`),
    setView: (view) => calls.push(`view:${view}`),
    openCheatsheet: () => calls.push('cheatsheet'),
    today: '2026-06-09',
  });
  return (
    <div>
      <textarea ref={barRef} aria-label="bar" />
      <input aria-label="inline-edit" />
      {ROW_IDS.map((id) => (
        <div key={id} tabIndex={-1} data-task-id={id} data-testid={id} data-selected={selected === id}>
          {id}
        </div>
      ))}
    </div>
  );
}

let calls: string[];

function renderHarness() {
  calls = [];
  render(<Harness calls={calls} />);
}

function bar(): HTMLTextAreaElement {
  return screen.getByLabelText('bar') as HTMLTextAreaElement;
}

function row(id: string): HTMLElement {
  return screen.getByTestId(id);
}

beforeEach(() => {
  renderHarness();
});

afterEach(() => {
  cleanup();
});

describe('focus handoff bar -> list (FR-15)', () => {
  it('ArrowDown from the bar moves focus to the first row and selects it', () => {
    bar().focus();
    fireEvent.keyDown(bar(), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(row('t1'));
    expect(row('t1').dataset.selected).toBe('true');
  });

  it('Esc from an EMPTY bar blurs the bar without focusing or selecting any row', () => {
    bar().focus();
    fireEvent.keyDown(bar(), { key: 'Escape' });
    expect(document.activeElement).not.toBe(bar());
    expect(document.activeElement).not.toBe(row('t1'));
    expect(row('t1').getAttribute('data-selected')).toBe('false');
  });

  it('Esc from a NON-empty bar is left to the bar (no focus move)', () => {
    bar().focus();
    bar().value = 'draft text';
    fireEvent.keyDown(bar(), { key: 'Escape' });
    expect(document.activeElement).toBe(bar());
  });

  it('printable keys in the bar are not intercepted', () => {
    bar().focus();
    fireEvent.keyDown(bar(), { key: 'x' });
    expect(calls).toEqual([]);
    expect(document.activeElement).toBe(bar());
  });
});

describe('list navigation (FR-16)', () => {
  it('j moves selection to the next row and ArrowDown mirrors it', () => {
    bar().focus();
    fireEvent.keyDown(bar(), { key: 'ArrowDown' });
    fireEvent.keyDown(row('t1'), { key: 'j' });
    expect(document.activeElement).toBe(row('t2'));
    fireEvent.keyDown(row('t2'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(row('t3'));
  });

  it('k moves selection to the previous row', () => {
    bar().focus();
    fireEvent.keyDown(bar(), { key: 'ArrowDown' });
    fireEvent.keyDown(row('t1'), { key: 'j' });
    fireEvent.keyDown(row('t2'), { key: 'k' });
    expect(document.activeElement).toBe(row('t1'));
  });

  it('x dispatches complete for the selected row', () => {
    bar().focus();
    fireEvent.keyDown(bar(), { key: 'ArrowDown' });
    fireEvent.keyDown(row('t1'), { key: 'x' });
    expect(calls).toContain('complete:t1');
  });

  it('Space dispatches complete for the selected row', () => {
    bar().focus();
    fireEvent.keyDown(bar(), { key: 'ArrowDown' });
    fireEvent.keyDown(row('t1'), { key: ' ' });
    expect(calls).toContain('complete:t1');
  });

  it('completing with Space hands selection and focus to the row below', () => {
    bar().focus();
    fireEvent.keyDown(bar(), { key: 'ArrowDown' });
    fireEvent.keyDown(row('t1'), { key: ' ' });
    expect(calls).toContain('complete:t1');
    expect(row('t2').getAttribute('data-selected')).toBe('true');
    expect(document.activeElement).toBe(row('t2'));
  });

  it('completing the last row with x hands selection and focus to the row above', () => {
    bar().focus();
    fireEvent.keyDown(bar(), { key: 'ArrowDown' });
    fireEvent.keyDown(row('t1'), { key: 'j' });
    fireEvent.keyDown(row('t2'), { key: 'j' });
    fireEvent.keyDown(row('t3'), { key: 'x' });
    expect(calls).toContain('complete:t3');
    expect(row('t2').getAttribute('data-selected')).toBe('true');
    expect(document.activeElement).toBe(row('t2'));
  });

  it('deleting with Backspace hands selection and focus to the row below', () => {
    bar().focus();
    fireEvent.keyDown(bar(), { key: 'ArrowDown' });
    fireEvent.keyDown(row('t1'), { key: 'Backspace' });
    expect(calls).toContain('delete:t1');
    expect(row('t2').getAttribute('data-selected')).toBe('true');
    expect(document.activeElement).toBe(row('t2'));
  });

  it('e and Enter open inline edit for the selected row', () => {
    bar().focus();
    fireEvent.keyDown(bar(), { key: 'ArrowDown' });
    fireEvent.keyDown(row('t1'), { key: 'e' });
    fireEvent.keyDown(row('t1'), { key: 'Enter' });
    expect(calls.filter((c) => c === 'edit:t1')).toHaveLength(2);
  });

  it('Delete and Backspace each dispatch delete, following the selection as it hands off', () => {
    bar().focus();
    fireEvent.keyDown(bar(), { key: 'ArrowDown' });
    fireEvent.keyDown(row('t1'), { key: 'Delete' });
    fireEvent.keyDown(row('t2'), { key: 'Backspace' });
    expect(calls).toContain('delete:t1');
    expect(calls).toContain('delete:t2');
  });

  it('1/2/3 snooze the selected row to tomorrow / +7 / next Saturday (FR-33)', () => {
    bar().focus();
    fireEvent.keyDown(bar(), { key: 'ArrowDown' });
    fireEvent.keyDown(row('t1'), { key: '1' });
    fireEvent.keyDown(row('t1'), { key: '2' });
    fireEvent.keyDown(row('t1'), { key: '3' });
    expect(calls).toContain('snooze:t1:2026-06-10');
    expect(calls).toContain('snooze:t1:2026-06-16');
    expect(calls).toContain('snooze:t1:2026-06-13');
  });

  it('g then t/u/a/d switches view', () => {
    bar().focus();
    fireEvent.keyDown(bar(), { key: 'ArrowDown' });
    fireEvent.keyDown(row('t1'), { key: 'g' });
    fireEvent.keyDown(row('t1'), { key: 'u' });
    expect(calls).toContain('view:upcoming');
    fireEvent.keyDown(row('t1'), { key: 'g' });
    fireEvent.keyDown(row('t1'), { key: 'd' });
    expect(calls).toContain('view:done');
  });

  it('? opens the cheatsheet slot', () => {
    bar().focus();
    fireEvent.keyDown(bar(), { key: 'ArrowDown' });
    fireEvent.keyDown(row('t1'), { key: '?' });
    expect(calls).toContain('cheatsheet');
  });

  it('an unbound printable character refocuses the bar and types itself (FR-16)', () => {
    bar().focus();
    fireEvent.keyDown(bar(), { key: 'ArrowDown' });
    fireEvent.keyDown(row('t1'), { key: 'b' });
    expect(document.activeElement).toBe(bar());
    expect(calls).toContain('typeahead:b');
  });

  it('Esc in the list clears the selection (FR-17 final step)', () => {
    bar().focus();
    fireEvent.keyDown(bar(), { key: 'ArrowDown' });
    expect(row('t1').dataset.selected).toBe('true');
    fireEvent.keyDown(row('t1'), { key: 'Escape' });
    expect(row('t1').dataset.selected).toBe('false');
  });

  it('Esc in the list also blurs the row so no focus outline lingers after deselection', () => {
    bar().focus();
    fireEvent.keyDown(bar(), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(row('t1'));
    fireEvent.keyDown(row('t1'), { key: 'Escape' });
    expect(document.activeElement).not.toBe(row('t1'));
  });
});

describe('undo-key routing (FR-37)', () => {
  it('LIST focused: Cmd+Z dispatches app undo and Cmd+Shift+Z app redo', () => {
    bar().focus();
    fireEvent.keyDown(bar(), { key: 'ArrowDown' });
    fireEvent.keyDown(row('t1'), { key: 'z', metaKey: true });
    expect(calls).toContain('undo');
    fireEvent.keyDown(row('t1'), { key: 'z', metaKey: true, shiftKey: true });
    expect(calls).toContain('redo');
  });

  it('BAR focused with empty input: Cmd+Z dispatches app undo', () => {
    bar().focus();
    fireEvent.keyDown(bar(), { key: 'z', metaKey: true });
    expect(calls).toContain('undo');
  });

  it('BAR focused with non-empty input: native undo untouched (no preventDefault, no dispatch)', () => {
    bar().focus();
    bar().value = 'typed text';
    const event = fireEvent.keyDown(bar(), { key: 'z', metaKey: true });
    expect(event).toBe(true); // not prevented
    expect(calls).not.toContain('undo');
  });

  it('Ctrl+Z routes the same as Cmd+Z in the list', () => {
    bar().focus();
    fireEvent.keyDown(bar(), { key: 'ArrowDown' });
    fireEvent.keyDown(row('t1'), { key: 'z', ctrlKey: true });
    expect(calls).toContain('undo');
  });
});

describe('inline-edit safety', () => {
  it('never intercepts keys while an input other than the bar is focused', () => {
    const edit = screen.getByLabelText('inline-edit') as HTMLInputElement;
    edit.focus();
    fireEvent.keyDown(edit, { key: 'x' });
    fireEvent.keyDown(edit, { key: '1' });
    fireEvent.keyDown(edit, { key: 'z', metaKey: true });
    expect(calls).toEqual([]);
  });
});

describe('Review fixes: g-sequence cancellation and command-mode guard (F-003, F-006)', () => {
  it('a bound key cancels a pending g so a later bare t does not switch views', () => {
    row('t1').focus();
    fireEvent.keyDown(document.activeElement as Element, { key: 'g' });
    fireEvent.keyDown(document.activeElement as Element, { key: 'j' });
    fireEvent.keyDown(document.activeElement as Element, { key: 't' });
    expect(calls.filter((c) => c.startsWith('view:'))).toEqual([]);
  });

  it("an unbound printable after g replays the swallowed g into the bar (typing 'gr...' keeps its g)", () => {
    row('t1').focus();
    fireEvent.keyDown(document.activeElement as Element, { key: 'g' });
    fireEvent.keyDown(document.activeElement as Element, { key: 'r' });
    expect(calls).toEqual(['typeahead:g', 'typeahead:r']);
  });

  it('g followed by a view key within the window still switches views', () => {
    row('t1').focus();
    fireEvent.keyDown(document.activeElement as Element, { key: 'g' });
    fireEvent.keyDown(document.activeElement as Element, { key: 'u' });
    expect(calls).toEqual(['view:upcoming']);
  });

  it('the keymap ignores every key while the bar is in command mode', () => {
    bar().focus();
    bar().value = '>t';
    fireEvent.keyDown(bar(), { key: 'ArrowDown' });
    fireEvent.keyDown(bar(), { key: 'Escape' });
    expect(document.activeElement).toBe(bar());
    expect(calls).toEqual([]);
  });
});
