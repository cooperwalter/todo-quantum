// @vitest-environment jsdom
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ParsedInput } from './ParsedInput';
import { parse } from '../lib/parser';
import type { ParseResult, Range } from '../lib/parser';

// 2026-06-09 is a Tuesday.
const NOW = new Date(2026, 5, 9, 10, 0, 0);

interface HarnessProps {
  initial?: string;
  onSubmit?: (result: ParseResult) => void;
  onCancel?: () => void;
  parseEnabled?: boolean;
  initialReverts?: Range[];
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => boolean;
}

function Harness({
  initial = '',
  onSubmit = () => {},
  onCancel,
  parseEnabled = true,
  initialReverts,
  onKeyDown,
}: HarnessProps) {
  const [value, setValue] = useState(initial);
  return (
    <ParsedInput
      value={value}
      onChange={setValue}
      onSubmit={onSubmit}
      onCancel={onCancel}
      parseEnabled={parseEnabled}
      initialReverts={initialReverts}
      onKeyDown={onKeyDown}
      now={NOW}
      ariaLabel="Capture a task"
    />
  );
}

function chipTexts(): string[] {
  return Array.from(document.querySelectorAll('.command-bar-chip')).map((el) => el.textContent ?? '');
}

function demotedTexts(): string[] {
  return Array.from(document.querySelectorAll('.command-bar-demoted')).map((el) => el.textContent ?? '');
}

function announcementText(): string {
  return document.getElementById('command-bar-announcement')?.textContent ?? '';
}

function input(): HTMLTextAreaElement {
  return screen.getByRole('textbox') as HTMLTextAreaElement;
}

beforeEach(() => {
  cleanup();
});

describe('ParsedInput chip rendering', () => {
  it('renders a chip for each parsed token of "report tomorrow #work !p1"', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole('textbox'), 'report tomorrow #work !p1');
    expect(chipTexts()).toEqual(['tomorrow', '#work', '!p1']);
  });

  it('renders zero chips for plain literal text', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole('textbox'), 'pay the rent');
    expect(chipTexts()).toEqual([]);
  });
});

describe('ParsedInput Esc revert', () => {
  it('demotes the last chip to literal text on Escape, leaving earlier chips', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole('textbox'), 'report tomorrow #work !p1{Escape}');
    expect(chipTexts()).toEqual(['tomorrow', '#work']);
  });

  it('removes the reverted token from the chip announcement', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole('textbox');
    await user.type(input, 'report tomorrow #work !p1');
    expect(announcementText()).toContain('priority P1');
    await user.type(input, '{Escape}');
    expect(announcementText()).not.toContain('priority P1');
    expect(announcementText()).toContain('list #work');
  });
});

describe('ParsedInput submit', () => {
  it('calls onSubmit with the current ParseResult on Enter', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    await user.type(screen.getByRole('textbox'), 'report tomorrow #work !p1{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const result = onSubmit.mock.calls[0][0] as ParseResult;
    expect(result).toMatchObject({
      title: 'report',
      dueDate: '2026-06-10',
      list: 'work',
      priority: 1,
    });
  });
});

describe('ParsedInput initialReverts', () => {
  it('suppresses chipping of ranges covered by initialReverts', async () => {
    const user = userEvent.setup();
    // "report tomorrow #work" — revert the "tomorrow" range (chars 7..15).
    render(<Harness initial="report tomorrow #work" initialReverts={[{ start: 7, end: 15 }]} />);
    // Touch the input so the controlled value is established without altering text.
    await user.click(screen.getByRole('textbox'));
    expect(chipTexts()).toEqual(['#work']);
  });
});

describe('ParsedInput onKeyDown consumption', () => {
  it('does not change the input value when onKeyDown returns true for Enter', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} onKeyDown={() => true} />);
    const input = screen.getByRole('textbox') as HTMLTextAreaElement;
    await user.type(input, 'report tomorrow');
    await user.type(input, '{Enter}');
    expect(input.value).toBe('report tomorrow');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('proceeds to the capture path when onKeyDown returns false', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} onKeyDown={() => false} />);
    await user.type(screen.getByRole('textbox'), 'report tomorrow{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe('ParsedInput keystroke containment (document-level keymap must not see handled keys)', () => {
  function listenOnDocument(key: string): { calls: () => number; dispose: () => void } {
    let count = 0;
    const listener = (e: KeyboardEvent) => {
      if (e.key === key) count += 1;
    };
    document.addEventListener('keydown', listener);
    return { calls: () => count, dispose: () => document.removeEventListener('keydown', listener) };
  }

  it('stops the submit Enter from propagating to document-level listeners', async () => {
    const user = userEvent.setup();
    const probe = listenOnDocument('Enter');
    render(<Harness onSubmit={vi.fn()} />);
    await user.type(screen.getByRole('textbox'), 'report{Enter}');
    expect(probe.calls()).toBe(0);
    probe.dispose();
  });

  it('stops a cancelling Escape from propagating when onCancel is provided', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const probe = listenOnDocument('Escape');
    render(<Harness onCancel={onCancel} />);
    await user.type(screen.getByRole('textbox'), 'report{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(probe.calls()).toBe(0);
    probe.dispose();
  });

  it('lets Escape propagate when there is nothing to cancel (no session chips, no onCancel — bar behavior)', async () => {
    const user = userEvent.setup();
    const probe = listenOnDocument('Escape');
    render(<Harness />);
    await user.type(screen.getByRole('textbox'), 'report{Escape}');
    expect(probe.calls()).toBe(1);
    probe.dispose();
  });
});

describe('ParsedInput sealed displacement — text preservation while unsealed', () => {
  it('never removes the existing date text while typing "satchel" character-by-character after it', async () => {
    const user = userEvent.setup();
    // Start with a date chip already present, caret at the end.
    render(<Harness initial="report friday " />);
    const el = input();
    await user.click(el);
    // Move caret to the very end (after the trailing space).
    el.setSelectionRange(el.value.length, el.value.length);
    for (const ch of 'satchel') {
      await user.type(el, ch);
      // The literal "friday" text must survive every single keystroke.
      expect(el.value).toContain('friday');
    }
    expect(el.value).toBe('report friday satchel');
  });

  it('re-activates the displaced date chip once the transient prefix stops being a date parse', async () => {
    const user = userEvent.setup();
    render(<Harness initial="report friday " />);
    const el = input();
    await user.click(el);
    el.setSelectionRange(el.value.length, el.value.length);
    // "sat" parses as Saturday — friday is displaced (demoted), not a chip.
    await user.type(el, 'sat');
    expect(el.value).toBe('report friday sat');
    expect(chipTexts()).toEqual(['sat']);
    expect(demotedTexts()).toEqual(['friday']);
    // Continue to "satchel" — no longer a date, so friday returns as the chip.
    await user.type(el, 'chel');
    expect(el.value).toBe('report friday satchel');
    expect(chipTexts()).toEqual(['friday']);
    expect(demotedTexts()).toEqual([]);
  });

  it('renders the displaced range as demoted plain text (not a chip) while the displacing token is unsealed', async () => {
    const user = userEvent.setup();
    render(<Harness initial="report friday " />);
    const el = input();
    await user.click(el);
    el.setSelectionRange(el.value.length, el.value.length);
    await user.type(el, 'monday');
    // "monday" is the live (unsealed) token; "friday" is demoted, not deleted.
    expect(el.value).toBe('report friday monday');
    expect(chipTexts()).toEqual(['monday']);
    expect(demotedTexts()).toEqual(['friday']);
  });
});

describe('ParsedInput sealed displacement — seal-on-space removal and seam collapse', () => {
  it('removes the displaced "friday" text and collapses the seam to one space when a space seals "monday"', async () => {
    const user = userEvent.setup();
    render(<Harness initial="report friday " />);
    const el = input();
    await user.click(el);
    el.setSelectionRange(el.value.length, el.value.length);
    await user.type(el, 'monday ');
    // friday removed; exactly one space between "report" and "monday"; live trailing space preserved.
    expect(el.value).toBe('report monday ');
  });

  it('leaves no double space at the seam after a seal-on-space removal', async () => {
    const user = userEvent.setup();
    render(<Harness initial="report friday " />);
    const el = input();
    await user.click(el);
    el.setSelectionRange(el.value.length, el.value.length);
    await user.type(el, 'monday ');
    expect(el.value).not.toMatch(/ {2,}/);
  });

  it('reaches a displacement fixpoint — after the seal-on-space removal, re-parsing the new value yields displaced: []', async () => {
    const user = userEvent.setup();
    render(<Harness initial="report friday " />);
    const el = input();
    await user.click(el);
    el.setSelectionRange(el.value.length, el.value.length);
    await user.type(el, 'monday ');
    expect(parse(el.value, NOW).displaced).toEqual([]);
  });
});

describe('ParsedInput sealed displacement — seal-on-submit removal', () => {
  it('strips the displaced range before submit even when the displacing token was never sealed by a space', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness initial="report friday " onSubmit={onSubmit} />);
    const el = input();
    await user.click(el);
    el.setSelectionRange(el.value.length, el.value.length);
    // "monday" with no trailing space — unsealed in the field, sealed by submit.
    await user.type(el, 'monday');
    await user.type(el, '{Enter}');
    expect(el.value).toBe('report monday');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const result = onSubmit.mock.calls[0][0] as ParseResult;
    expect(result.displaced).toEqual([]);
    expect(result.dueDate).toBe('2026-06-15');
    expect(result.title).toBe('report');
  });
});

describe('ParsedInput sealed displacement — caret rule', () => {
  it('shifts the caret offset down by the removed length when the removal is left of the caret', async () => {
    const user = userEvent.setup();
    // "friday" is to the LEFT of the caret which sits after "monday".
    render(<Harness initial="report friday " />);
    const el = input();
    await user.click(el);
    el.setSelectionRange(el.value.length, el.value.length);
    await user.type(el, 'monday ');
    // Value is "report monday " (len 14); caret was at end of "report friday monday " (21),
    // "friday " (7 chars) removed to the left, so caret lands at 21 - 7 = 14.
    expect(el.value).toBe('report monday ');
    expect(el.selectionStart).toBe(14);
    expect(el.selectionEnd).toBe(14);
  });

  // Right-of-caret: the displaced (removed) token sits to the LEFT of the active
  // token but the caret is parked even further left. jsdom resets the native caret
  // to end-of-field on every controlled value write, so the "caret stays put" half
  // of the rule cannot be faithfully driven through fireEvent here. We instead assert
  // the VALUE outcome of a removal whose source is entirely right of "report" — the
  // seam still collapses correctly and the live field is never trimmed. The caret
  // arithmetic (down-by-removed-length on the left, untouched on the right) is exercised
  // for the left case by the integration test above.
  it('removes a displaced token to the right of earlier text and collapses the seam to one space', async () => {
    const user = userEvent.setup();
    // "report monday friday" — friday (rightmost) is the active date; monday is displaced.
    render(<Harness initial="report monday friday" />);
    const el = input();
    await user.click(el);
    el.setSelectionRange(el.value.length, el.value.length);
    // Seal friday with a trailing space; the displaced "monday" is removed.
    await user.type(el, ' ');
    expect(el.value).toBe('report friday ');
    expect(el.value).not.toMatch(/ {2,}/);
    expect(parse(el.value, NOW).displaced).toEqual([]);
  });
});

describe('ParsedInput sealed displacement — edge cases', () => {
  it('does nothing on an empty field (no displaced ranges, no crash)', async () => {
    const user = userEvent.setup();
    render(<Harness initial="" />);
    const el = input();
    await user.type(el, ' ');
    expect(el.value).toBe(' ');
    expect(demotedTexts()).toEqual([]);
  });

  it('handles a single displaced token sealed at the very start boundary of the field', async () => {
    const user = userEvent.setup();
    render(<Harness initial="friday " />);
    const el = input();
    await user.click(el);
    el.setSelectionRange(el.value.length, el.value.length);
    await user.type(el, 'monday ');
    // Leading "friday " removed; no leading whitespace left in the live field.
    expect(el.value).toBe('monday ');
    expect(el.value).not.toMatch(/^\s/);
  });

  it('collapses every seam to one space when many same-kind tokens are sealed at scale', async () => {
    const user = userEvent.setup();
    // Eight list tokens; the last (#h) wins, the prior seven are displaced.
    render(<Harness initial="log #a #b #c #d #e #f #g #h " />);
    const el = input();
    await user.click(el);
    // Already sealed (trailing space after #h) at mount → on first interaction the
    // seven displaced tokens collapse away, leaving only the live "#h".
    el.setSelectionRange(el.value.length, el.value.length);
    await user.type(el, 'x');
    expect(el.value).toBe('log #h x');
    expect(el.value).not.toMatch(/ {2,}/);
    expect(parse(el.value, NOW).displaced).toEqual([]);
  });
});

describe('ParsedInput session chips — Esc two-tier', () => {
  it('reverts an in-place friday->monday edit on Escape because "monday" is a session chip', async () => {
    const user = userEvent.setup();
    // Mount with a friday date chip as the baseline.
    render(<Harness initial="report friday" />);
    const el = input();
    // Edit friday -> monday in place: select all and retype the changed value.
    await user.click(el);
    await user.clear(el);
    await user.type(el, 'report monday');
    expect(chipTexts()).toEqual(['monday']);
    // monday is absent from the baseline (which had friday) -> session chip -> Esc reverts it.
    await user.type(el, '{Escape}');
    expect(chipTexts()).toEqual([]);
    expect(announcementText()).not.toContain('due Mon');
  });

  it('does NOT revert an untouched baseline chip on Escape (no session chips present)', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<Harness initial="report friday" onCancel={onCancel} />);
    const el = input();
    await user.click(el);
    // The friday chip is part of the mount baseline -> not a session chip.
    expect(chipTexts()).toEqual(['friday']);
    await user.type(el, '{Escape}');
    // Baseline chip stays; Esc falls through to onCancel.
    expect(chipTexts()).toEqual(['friday']);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel on Escape when there are no session chips and a baseline chip exists', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<Harness initial="report friday" onCancel={onCancel} />);
    const el = input();
    await user.click(el);
    await user.type(el, '{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('reverts only the most recent session chip on Escape, leaving an earlier session chip intact', async () => {
    const user = userEvent.setup();
    // Empty baseline -> every chip typed is a session chip.
    render(<Harness initial="" />);
    const el = input();
    await user.type(el, 'report tomorrow #work');
    expect(chipTexts()).toEqual(['tomorrow', '#work']);
    // Most recent session chip is #work.
    await user.type(el, '{Escape}');
    expect(chipTexts()).toEqual(['tomorrow']);
  });

  it('does not throw on Escape when onCancel is undefined and no session chips exist', async () => {
    const user = userEvent.setup();
    render(<Harness initial="report friday" />);
    const el = input();
    await user.click(el);
    await user.type(el, '{Escape}');
    expect(chipTexts()).toEqual(['friday']);
  });
});

describe('ParsedInput session chips — CommandBar-style usage (empty mount baseline)', () => {
  it('treats every chip as a session chip when mounted with an empty value', async () => {
    const user = userEvent.setup();
    render(<Harness initial="" />);
    const el = input();
    await user.type(el, 'report tomorrow');
    expect(chipTexts()).toEqual(['tomorrow']);
    // Esc reverts the (session) tomorrow chip — unchanged from prior behavior.
    await user.type(el, '{Escape}');
    expect(chipTexts()).toEqual([]);
  });

  it('removes any unsealed displaced range before re-parsing on Enter submit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness initial="" onSubmit={onSubmit} />);
    const el = input();
    await user.type(el, 'report friday monday');
    // friday is displaced and unsealed (monday at end, no trailing space).
    expect(demotedTexts()).toEqual(['friday']);
    await user.type(el, '{Enter}');
    expect(el.value).toBe('report monday');
    const result = onSubmit.mock.calls[0][0] as ParseResult;
    expect(result.displaced).toEqual([]);
    expect(result.title).toBe('report');
  });
});
