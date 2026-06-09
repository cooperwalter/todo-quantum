import { useMemo, useRef, useState } from 'react';
import './CommandBar.css';
import { parse } from '../lib/parser';
import type { Chip, ParseResult } from '../lib/parser';
import { useApp } from '../state/AppContext';

interface RevertedToken {
  kind: Chip['kind'];
  text: string;
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

/** Re-parse with reverted tokens demoted back to literal text. */
function applyReverts(input: string, result: ParseResult, reverted: RevertedToken[]): ParseResult {
  const chips = [...result.chips];
  let { dueDate, dueTime, list, priority, recurrence } = result;
  for (const token of reverted) {
    const idx = chips.findIndex(
      (c) => c.kind === token.kind && input.slice(c.start, c.end) === token.text,
    );
    if (idx === -1) continue;
    const [chip] = chips.splice(idx, 1);
    switch (chip.kind) {
      case 'date':
        dueDate = null;
        dueTime = null; // merged date+time chip carries both
        break;
      case 'time':
        dueTime = null;
        break;
      case 'list':
        list = null;
        break;
      case 'priority':
        priority = null;
        break;
      case 'recurrence':
        recurrence = null;
        break;
    }
  }
  let title = '';
  let cursor = 0;
  for (const chip of [...chips].sort((a, b) => a.start - b.start)) {
    title += input.slice(cursor, chip.start);
    cursor = chip.end;
  }
  title += input.slice(cursor);
  title = title.replace(/\s+/g, ' ').trim();
  return { ...result, chips, dueDate, dueTime, list, priority, recurrence, title, valid: title.length > 0 };
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

export function CommandBar({ now }: { now?: Date }) {
  const { barText, setBarText, dispatch } = useApp();
  const [reverted, setReverted] = useState<RevertedToken[]>([]);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => {
    const raw = parse(barText, now ?? new Date());
    return applyReverts(barText, raw, reverted);
  }, [barText, now, reverted]);

  function handleChange(value: string) {
    setBarText(value);
    setError(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      if (!parsed.valid) {
        setError(true);
        return;
      }
      dispatch({
        type: 'add',
        task: {
          id: crypto.randomUUID(),
          title: parsed.title,
          status: 'open',
          dueDate: parsed.dueDate,
          dueTime: parsed.dueTime,
          list: parsed.list,
          priority: parsed.priority,
          recurrence: parsed.recurrence,
          createdAt: (now ?? new Date()).toISOString(),
          completedAt: null,
        },
      });
      setBarText('');
      setReverted([]);
      setError(false);
      inputRef.current?.focus();
    } else if (event.key === 'Escape' && parsed.chips.length > 0) {
      event.preventDefault();
      const last = [...parsed.chips].sort((a, b) => a.start - b.start)[parsed.chips.length - 1];
      setReverted((prev) => [
        ...prev,
        { kind: last.kind, text: barText.slice(last.start, last.end) },
      ]);
    }
  }

  const announcement = parsed.chips.map(announcementFor).join(', ');

  return (
    <div className="command-bar-region">
      <div className={`command-bar${error ? ' command-bar--error' : ''}`}>
        <span className="command-bar-prompt" aria-hidden="true">
          ▸
        </span>
        <div className="command-bar-field">
          <div className="command-bar-mirror" aria-hidden="true">
            {mirrorSegments(barText, parsed.chips).map((seg) =>
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
            value={barText}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Capture a task"
            aria-describedby="command-bar-announcement"
            autoFocus
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </div>
      <span id="command-bar-announcement" className="visually-hidden">
        {announcement}
      </span>
      {error && <p className="command-bar-error">nothing to capture</p>}
    </div>
  );
}
