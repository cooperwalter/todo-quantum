// @vitest-environment jsdom
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ParsedInput } from './ParsedInput';
import type { ParseResult, Range } from '../lib/parser';

// 2026-06-09 is a Tuesday.
const NOW = new Date(2026, 5, 9, 10, 0, 0);

interface HarnessProps {
  initial?: string;
  onSubmit?: (result: ParseResult) => void;
  parseEnabled?: boolean;
  initialReverts?: Range[];
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => boolean;
}

function Harness({
  initial = '',
  onSubmit = () => {},
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

function announcementText(): string {
  return document.getElementById('command-bar-announcement')?.textContent ?? '';
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
    const input = screen.getByRole('textbox') as HTMLInputElement;
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
