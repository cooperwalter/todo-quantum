import { useEffect, useRef } from 'react';
import './Cheatsheet.css';

export interface CheatsheetProps {
  onClose: () => void;
}

const BINDINGS: [string, string][] = [
  ['type', 'capture into the bar'],
  ['enter', 'capture the task'],
  ['>', 'command mode'],
  ['↓ / esc', 'focus the list (bar empty)'],
  ['j / ↓', 'next task'],
  ['k / ↑', 'previous task'],
  ['x / space', 'complete'],
  ['e / enter', 'edit title'],
  ['del / ⌫', 'delete'],
  ['1', 'snooze to tomorrow'],
  ['2', 'snooze to next week'],
  ['3', 'snooze to the weekend'],
  ['g t', 'go to Today'],
  ['g u', 'go to Upcoming'],
  ['g a', 'go to All'],
  ['g d', 'go to Done'],
  ['?', 'open this cheatsheet'],
  ['esc', 'close / clear selection'],
  ['⌘Z', 'undo'],
  ['⇧⌘Z', 'redo'],
];

export function Cheatsheet({ onClose }: CheatsheetProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocused = useRef<Element | null>(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement;
    dialogRef.current?.focus();
    return () => {
      if (previouslyFocused.current instanceof HTMLElement) {
        previouslyFocused.current.focus();
      }
    };
  }, []);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'Tab') {
      const focusables = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const onDialogItself = document.activeElement === dialogRef.current;
      if (event.shiftKey && (document.activeElement === first || onDialogItself)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  return (
    <div className="cheatsheet-scrim">
      <div
        ref={dialogRef}
        className="cheatsheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cheatsheet-title"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <header className="cheatsheet-header">
          <h2 id="cheatsheet-title" className="cheatsheet-title">
            Keyboard
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="cheatsheet-close"
            aria-label="Close cheatsheet"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <dl className="cheatsheet-table">
          {BINDINGS.map(([key, action]) => (
            <div key={key} className="cheatsheet-row">
              <dt className="cheatsheet-key">{key}</dt>
              <dd className="cheatsheet-action">{action}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
