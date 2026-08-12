import { useCallback, useMemo, useState } from 'react';
import './CommandBar.css';
import { ParsedInput } from './ParsedInput';
import { COMMANDS, fuzzyMatch } from '../lib/commands';
import type { ParseResult } from '../lib/parser';
import { useApp } from '../state/AppContext';
import { clearUsername } from '../lib/username';

export function CommandBar({ now, openCheatsheet }: { now?: Date; openCheatsheet?: () => void }) {
  const { barText, setBarText, dispatch, setView, barRef, storage } = useApp();
  const [error, setError] = useState<string | null>(null);
  const [selectedCommand, setSelectedCommand] = useState(0);

  const switchUser = useCallback(() => {
    clearUsername(storage);
    window.location.reload();
  }, [storage]);

  const commandMode = barText.startsWith('>');
  const commandQuery = commandMode ? barText.slice(1).trim() : '';
  const commandMatches = useMemo(
    () => (commandMode ? fuzzyMatch(commandQuery, COMMANDS) : []),
    [commandMode, commandQuery],
  );
  const activeCommand = Math.min(selectedCommand, Math.max(commandMatches.length - 1, 0));

  function handleChange(value: string) {
    setBarText(value);
    setError(null);
    setSelectedCommand(0);
  }

  /** Command-mode key handling. Returns true when command mode consumes the key. */
  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): boolean {
    if (!commandMode) return false;
    // Command mode owns these keys end-to-end: stop propagation so the
    // document-level keymap never sees them (React flushes our state update
    // at #root before the event reaches document, so without this the
    // keymap acts on the post-update bar and steals focus — FR-15/FR-17).
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      setSelectedCommand((prev) => Math.min(prev + 1, commandMatches.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      setSelectedCommand((prev) => Math.max(prev - 1, 0));
    } else if (event.key === 'Enter') {
      event.stopPropagation();
      const command = commandMatches[activeCommand];
      if (command === undefined) {
        setError('no matching command');
        return true;
      }
      command.run({
        setView,
        dispatch,
        openCheatsheet: openCheatsheet ?? (() => {}),
        switchUser,
      });
      setBarText('');
      setSelectedCommand(0);
    } else if (event.key === 'Escape') {
      // FR-17: exiting command mode is ONE precedence step — clear the
      // input, keep focus in the bar.
      event.preventDefault();
      event.stopPropagation();
      setBarText('');
      setSelectedCommand(0);
    }
    return true;
  }

  function handleSubmit(parsed: ParseResult) {
    if (!parsed.valid) {
      setError('nothing to capture');
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
    setError(null);
    barRef.current?.focus();
  }

  return (
    <div className="command-bar-region">
      <div
        className={`command-bar${error ? ' command-bar--error' : ''}${commandMode ? ' command-bar--command' : ''}`}
      >
        <span className="command-bar-prompt" aria-hidden="true">
          <span className="prompt-bar" />
          {commandMode && <span className="prompt-bar" />}
        </span>
        <ParsedInput
          value={barText}
          onChange={handleChange}
          onSubmit={handleSubmit}
          onKeyDown={handleKeyDown}
          parseEnabled={!commandMode}
          now={now}
          inputRef={barRef}
          ariaLabel="Capture a task"
          inputProps={{
            id: 'capture-input',
            name: 'capture',
            autoFocus: true,
            'aria-controls': commandMode ? 'command-bar-listbox' : undefined,
            'aria-activedescendant':
              commandMode && commandMatches.length > 0
                ? `command-option-${activeCommand}`
                : undefined,
          }}
        />
      </div>
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
                command.run({
                  setView,
                  dispatch,
                  openCheatsheet: openCheatsheet ?? (() => {}),
                  switchUser,
                });
                setBarText('');
                setSelectedCommand(0);
              }}
            >
              {command.label}
            </li>
          ))}
        </ul>
      )}
      {error !== null && <p className="command-bar-error">{error}</p>}
    </div>
  );
}
