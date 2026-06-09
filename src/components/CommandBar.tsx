import { useMemo, useRef, useState } from 'react';
import './CommandBar.css';
import { COMMANDS, fuzzyMatch } from '../lib/commands';
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

export function CommandBar({ now, openCheatsheet }: { now?: Date; openCheatsheet?: () => void }) {
  const { barText, setBarText, dispatch, setView } = useApp();
  const [reverted, setReverted] = useState<RevertedToken[]>([]);
  const [error, setError] = useState(false);
  const [selectedCommand, setSelectedCommand] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commandMode = barText.startsWith('>');
  const commandQuery = commandMode ? barText.slice(1).trim() : '';
  const commandMatches = useMemo(
    () => (commandMode ? fuzzyMatch(commandQuery, COMMANDS) : []),
    [commandMode, commandQuery],
  );
  const activeCommand = Math.min(selectedCommand, Math.max(commandMatches.length - 1, 0));

  const parsed = useMemo(() => {
    const raw = parse(barText, now ?? new Date());
    return applyReverts(barText, raw, reverted);
  }, [barText, now, reverted]);

  function handleChange(value: string) {
    setBarText(value);
    setError(false);
    setSelectedCommand(0);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (commandMode) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedCommand((prev) => Math.min(prev + 1, commandMatches.length - 1));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedCommand((prev) => Math.max(prev - 1, 0));
      } else if (event.key === 'Enter') {
        const command = commandMatches[activeCommand];
        if (command !== undefined) {
          command.run({
            setView,
            dispatch,
            openCheatsheet: openCheatsheet ?? (() => {}),
          });
        }
        setBarText('');
        setSelectedCommand(0);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        setBarText('');
        setSelectedCommand(0);
      }
      return;
    }
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

  const announcement = commandMode ? '' : parsed.chips.map(announcementFor).join(', ');
  const chips = commandMode ? [] : parsed.chips;

  return (
    <div className="command-bar-region">
      <div
        className={`command-bar${error ? ' command-bar--error' : ''}${commandMode ? ' command-bar--command' : ''}`}
      >
        <span className="command-bar-prompt" aria-hidden="true">
          {commandMode ? '❯' : '▸'}
        </span>
        <div className="command-bar-field">
          <div className="command-bar-mirror" aria-hidden="true">
            {mirrorSegments(barText, chips).map((seg) =>
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
            aria-controls={commandMode ? 'command-bar-listbox' : undefined}
            aria-activedescendant={
              commandMode && commandMatches.length > 0 ? `command-option-${activeCommand}` : undefined
            }
            autoFocus
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </div>
      <span id="command-bar-announcement" className="visually-hidden">
        {announcement}
      </span>
      {commandMode && commandMatches.length > 0 && (
        <ul id="command-bar-listbox" className="command-bar-listbox" role="listbox" aria-label="Commands">
          {commandMatches.map((command, index) => (
            <li
              key={command.id}
              id={`command-option-${index}`}
              role="option"
              aria-selected={index === activeCommand}
              className={`command-bar-option${index === activeCommand ? ' command-bar-option--active' : ''}`}
              onMouseDown={(event) => {
                event.preventDefault();
                command.run({ setView, dispatch, openCheatsheet: openCheatsheet ?? (() => {}) });
                setBarText('');
                setSelectedCommand(0);
              }}
            >
              {command.label}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="command-bar-error">nothing to capture</p>}
    </div>
  );
}
