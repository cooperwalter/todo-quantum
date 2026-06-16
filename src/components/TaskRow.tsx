import { useLayoutEffect, useRef, useState } from 'react';
import './TaskList.css';
import { isoWeekday, todayStr } from '../lib/dates';
import { formatTimeDisplay, parse } from '../lib/parser';
import type { ParseResult } from '../lib/parser';
import { serializeTask } from '../lib/serialize';
import { BrushStroke } from './BrushStroke';
import { ParsedInput } from './ParsedInput';
import { useApp } from '../state/AppContext';
import type { Task } from '../lib/types';

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Priority renders as a small mono caps mark after the title. Crimson is reserved
// for priority 1 (the §1/§3 "seal" discipline); 2 and 3 are muted ink.
const PRIORITY_LABEL: Record<1 | 2 | 3, string> = { 1: 'P1', 2: 'P2', 3: 'P3' };

export interface TaskRowProps {
  task: Task;
  rollover?: boolean;
  selected?: boolean;
  tabIndex?: number;
  onSelect?: (id: string) => void;
}

// The task fields the editor round-trips through the parser. Order matters only
// for the round-trip comparison loop below.
const PARSED_FIELDS = ['title', 'dueDate', 'dueTime', 'list', 'priority', 'recurrence'] as const;

// True when the parse of the serialized text reproduces every parsed field of the
// task. A mismatch means the serializer emitted text the parser reads differently,
// so we must not present token chips the user could accidentally mangle.
function roundTrips(task: Task, result: ParseResult): boolean {
  for (const field of PARSED_FIELDS) {
    const expected = task[field];
    const actual = result[field];
    if (field === 'recurrence') {
      if (JSON.stringify(expected) !== JSON.stringify(actual)) return false;
    } else if (expected !== actual) {
      return false;
    }
  }
  return true;
}

export function TaskRow({ task, rollover = false, selected = false, tabIndex = -1, onSelect }: TaskRowProps) {
  const { dispatch } = useApp();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const [editError, setEditError] = useState<string | null>(null);
  // Frozen clock for the edit session: the same Date drives serializeTask, the
  // ParsedInput `now` prop, and the save-time parse. Captured at openEdit.
  const [frozen, setFrozen] = useState<Date>(() => new Date());
  // The ranges the serializer reverted so the title survives a round-trip; fed to
  // ParsedInput so its baseline parse matches what serializeTask intended.
  const [initialReverts, setInitialReverts] = useState<{ start: number; end: number }[]>([]);
  // When the serialized text does not round-trip, fall back to plain title-only
  // editing (parse disabled) so the user never sees misleading chips.
  const [parseEnabled, setParseEnabled] = useState(true);
  const rowRef = useRef<HTMLLIElement | null>(null);
  // Set by keyboard-driven closes (Esc/Enter); consumed after the editor unmounts
  // so the focus lands on the row element, not the removed textarea.
  const pendingRowFocus = useRef(false);
  // The sumi brushstroke draws on a fresh completion (set from the complete
  // handler — a user event), then settles to muted via onDrawn. A row that mounts
  // already-done (Done/All view on load) keeps justCompleted=false and shows the
  // settled stroke.
  const [justCompleted, setJustCompleted] = useState(false);

  useLayoutEffect(() => {
    if (!editing && pendingRowFocus.current) {
      pendingRowFocus.current = false;
      rowRef.current?.focus();
    }
  }, [editing]);

  function complete() {
    setJustCompleted(true);
    dispatch({
      type: 'complete',
      id: task.id,
      completedAt: new Date().toISOString(),
      today: todayStr(new Date()),
      newId: crypto.randomUUID(),
    });
  }

  function openEdit() {
    if (task.status !== 'open') return;
    const now = new Date();
    const { text, revertedRanges } = serializeTask(task, now);
    const reparsed = parse(text, now, revertedRanges);
    setFrozen(now);
    setEditError(null);
    if (roundTrips(task, reparsed)) {
      setInitialReverts(revertedRanges);
      setDraft(text);
      setParseEnabled(true);
    } else {
      console.error(
        `serializeTask round-trip mismatch for task ${task.id}; falling back to title-only editing`,
      );
      setInitialReverts([]);
      setDraft(task.title);
      setParseEnabled(false);
    }
    setEditing(true);
  }

  // Closing the editor via the KEYBOARD (Esc cancel, Enter save) hands selection
  // and focus back to the row so j/k navigation continues from the edited task.
  // Blur closes must NOT do this — blur means focus deliberately went elsewhere,
  // and pulling it back would steal the user's click target.
  function closeEdit(refocusRow = false) {
    setEditing(false);
    setEditError(null);
    if (refocusRow) {
      onSelect?.(task.id);
      pendingRowFocus.current = true;
    }
  }

  // Diff a ParseResult against the task into the minimal set of changed fields,
  // using null for cleared ones, and dispatch a SINGLE edit action.
  function saveParsed(result: ParseResult, refocusRow = false) {
    const title = result.title.trim();
    if (title.length === 0) {
      setEditError('Enter a task title');
      return;
    }
    const changes: Partial<Omit<Task, 'id'>> = {};
    if (title !== task.title) changes.title = title;
    if (result.dueDate !== task.dueDate) changes.dueDate = result.dueDate;
    if (result.dueTime !== task.dueTime) changes.dueTime = result.dueTime;
    if (result.list !== task.list) changes.list = result.list;
    if (result.priority !== task.priority) changes.priority = result.priority;
    if (JSON.stringify(result.recurrence) !== JSON.stringify(task.recurrence)) {
      changes.recurrence = result.recurrence;
    }
    if (Object.keys(changes).length > 0) {
      dispatch({ type: 'edit', id: task.id, changes });
    }
    closeEdit(refocusRow);
  }

  // Title-only save for the round-trip-fallback path: only the title can change.
  function saveTitleOnly(refocusRow = false) {
    const title = draft.trim();
    if (title.length === 0) {
      setEditError('Enter a task title');
      return;
    }
    if (title !== task.title) {
      dispatch({ type: 'edit', id: task.id, changes: { title } });
    }
    closeEdit(refocusRow);
  }

  // Blur resolves the current draft through the same parse, then decides: an empty
  // extracted title cancels (discard), otherwise it saves exactly like Enter.
  function handleBlur() {
    if (!editing) return;
    if (!parseEnabled) {
      if (draft.trim().length === 0) {
        closeEdit();
        return;
      }
      saveTitleOnly();
      return;
    }
    const result = parse(draft, frozen, initialReverts);
    if (result.title.trim().length === 0) {
      closeEdit();
      return;
    }
    saveParsed(result);
  }

  const classes = [
    'task-row',
    task.priority === 1 ? 'task-row--p1' : '',
    rollover ? 'task-row--rollover' : '',
    selected ? 'task-row--selected' : '',
    task.status === 'done' ? 'task-row--done' : '',
    editing ? 'task-row--editing' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const sinceLabel =
    rollover && task.dueDate !== null ? `— since ${WEEKDAY_SHORT[isoWeekday(task.dueDate) - 1]}` : null;

  return (
    <li
      ref={rowRef}
      className={classes}
      data-task-id={task.id}
      tabIndex={tabIndex}
      onClick={() => onSelect?.(task.id)}
      aria-current={selected ? 'true' : undefined}
    >
      <input
        type="checkbox"
        className="task-row-checkbox"
        checked={task.status === 'done'}
        onChange={complete}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Complete ${task.title}`}
        disabled={task.status === 'done'}
      />
      {editing ? (
        <div className="task-row-edit" onClick={(e) => e.stopPropagation()}>
          <ParsedInput
            value={draft}
            onChange={(value) => {
              setDraft(value);
              setEditError(null);
            }}
            now={frozen}
            initialReverts={initialReverts}
            parseEnabled={parseEnabled}
            onSubmit={parseEnabled ? (result) => saveParsed(result, true) : () => saveTitleOnly(true)}
            onCancel={() => closeEdit(true)}
            ariaLabel="Edit task"
            inputProps={{
              autoFocus: true,
              onBlur: handleBlur,
            }}
          />
          {editError !== null && (
            <p className="task-row-edit-error" role="alert">
              {editError}
            </p>
          )}
        </div>
      ) : (
        <span
          className="task-row-title"
          onClick={(e) => {
            e.stopPropagation();
            openEdit();
          }}
        >
          {task.title}
          {task.status === 'done' && (
            <BrushStroke drawing={justCompleted} onDrawn={() => setJustCompleted(false)} />
          )}
        </span>
      )}
      {!editing && task.priority !== null && (
        <span
          className={`task-priority ${task.priority === 1 ? 'task-priority--1' : 'task-priority--muted'}`}
          aria-label={`priority ${task.priority}`}
        >
          {PRIORITY_LABEL[task.priority]}
        </span>
      )}
      {sinceLabel !== null && <span className="task-row-since">{sinceLabel}</span>}
      <span className="task-row-meta">
        {task.dueTime !== null && <span className="task-row-time">{formatTimeDisplay(task.dueTime)}</span>}
        {task.list !== null && <span className="task-row-list">#{task.list}</span>}
      </span>
    </li>
  );
}
