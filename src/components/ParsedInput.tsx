import { useMemo, useState } from 'react';
import './ParsedInput.css';
import { parse } from '../lib/parser';
import type { Chip, ParseResult, Range } from '../lib/parser';

export interface ParsedInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (result: ParseResult) => void;
  onCancel?: () => void;
  parseEnabled: boolean;
  initialReverts?: Range[];
  now?: Date;
  inputRef?: React.Ref<HTMLInputElement>;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => boolean;
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
  ariaLabel: string;
}

function announcementFor(chip: Chip): string {
  switch (chip.kind) {
    case 'date':
      return `due ${chip.display}`;
    case 'time':
      return `at ${chip.display}`;
    case 'list':
      return `list ${chip.display}`;
    case 'priority':
      return `priority ${chip.display}`;
    case 'recurrence':
      return `repeats ${chip.display}`;
  }
}

interface MirrorSegment {
  text: string;
  chip: boolean;
  key: string;
}

function mirrorSegments(input: string, chips: Chip[]): MirrorSegment[] {
  const segments: MirrorSegment[] = [];
  let cursor = 0;
  const ordered = [...chips].sort((a, b) => a.start - b.start);
  for (const chip of ordered) {
    if (chip.start > cursor) {
      segments.push({ text: input.slice(cursor, chip.start), chip: false, key: `t${cursor}` });
    }
    segments.push({ text: input.slice(chip.start, chip.end), chip: true, key: `c${chip.start}` });
    cursor = chip.end;
  }
  if (cursor < input.length) {
    segments.push({ text: input.slice(cursor), chip: false, key: `t${cursor}` });
  }
  return segments;
}

export function ParsedInput({
  value,
  onChange,
  onSubmit,
  onCancel,
  parseEnabled,
  initialReverts,
  now,
  inputRef,
  onKeyDown,
  inputProps,
  ariaLabel,
}: ParsedInputProps) {
  const [reverts, setReverts] = useState<Range[]>(initialReverts ?? []);

  const parsed = useMemo(
    () => parse(value, now ?? new Date(), parseEnabled ? reverts : []),
    [value, now, reverts, parseEnabled],
  );

  function handleChange(next: string) {
    // Reverted ranges are scoped to the input they were reverted in — carrying
    // them across captures silently strips valid chips from later text.
    if (next === '') setReverts([]);
    onChange(next);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    // Caller-first: command mode (or any consumer) gets the key before the
    // capture path. Returning true means the consumer handled it.
    if (onKeyDown?.(event) === true) return;

    if (event.key === 'Enter') {
      onSubmit(parsed);
      setReverts([]);
      return;
    }
    if (event.key === 'Escape') {
      if (parseEnabled && parsed.chips.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        const last = [...parsed.chips].sort((a, b) => a.start - b.start)[parsed.chips.length - 1];
        setReverts((prev) => [...prev, { start: last.start, end: last.end }]);
        return;
      }
      onCancel?.();
    }
  }

  const chips = parseEnabled ? parsed.chips : [];
  const announcement = chips.map(announcementFor).join(', ');

  return (
    <>
      <div className="command-bar-field">
        <div className="command-bar-mirror" aria-hidden="true">
          {mirrorSegments(value, chips).map((seg) =>
            seg.chip ? (
              <span key={seg.key} className="command-bar-chip">
                {seg.text}
              </span>
            ) : (
              <span key={seg.key}>{seg.text}</span>
            ),
          )}
        </div>
        <input
          ref={inputRef}
          className="command-bar-input"
          type="text"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label={ariaLabel}
          aria-describedby="command-bar-announcement"
          autoComplete="off"
          spellCheck={false}
          {...inputProps}
        />
      </div>
      <span id="command-bar-announcement" className="visually-hidden">
        {announcement}
      </span>
    </>
  );
}
