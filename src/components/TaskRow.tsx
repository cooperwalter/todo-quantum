import { useState } from 'react';
import './TaskList.css';
import { isoWeekday, snoozeNextWeek, snoozeTomorrow, snoozeWeekend, todayStr } from '../lib/dates';
import { formatTimeDisplay } from '../lib/parser';
import { useApp } from '../state/AppContext';
import type { Task } from '../lib/types';

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export interface TaskRowProps {
  task: Task;
  rollover?: boolean;
  selected?: boolean;
  tabIndex?: number;
  onSelect?: (id: string) => void;
}

export function TaskRow({ task, rollover = false, selected = false, tabIndex = -1, onSelect }: TaskRowProps) {
  const { dispatch } = useApp();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const [menuOpen, setMenuOpen] = useState(false);

  const snoozeOptions: { label: string; target: (today: string) => string }[] = [
    { label: 'Tomorrow', target: snoozeTomorrow },
    { label: 'Next week', target: snoozeNextWeek },
    { label: 'Weekend', target: snoozeWeekend },
  ];

  function snoozeTo(target: (today: string) => string) {
    dispatch({ type: 'snooze', id: task.id, dueDate: target(todayStr(new Date())) });
    setMenuOpen(false);
  }

  function complete() {
    dispatch({
      type: 'complete',
      id: task.id,
      completedAt: new Date().toISOString(),
      today: todayStr(new Date()),
      newId: crypto.randomUUID(),
    });
  }

  function openEdit() {
    setDraft(task.title);
    setEditing(true);
  }

  function saveEdit() {
    const title = draft.trim();
    if (title.length > 0 && title !== task.title) {
      dispatch({ type: 'edit', id: task.id, changes: { title } });
    }
    setEditing(false);
  }

  const classes = [
    'task-row',
    task.priority === 1 ? 'task-row--p1' : '',
    rollover ? 'task-row--rollover' : '',
    selected ? 'task-row--selected' : '',
    task.status === 'done' ? 'task-row--done' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const sinceLabel =
    rollover && task.dueDate !== null ? `— since ${WEEKDAY_SHORT[isoWeekday(task.dueDate) - 1]}` : null;

  return (
    <li
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
        <input
          className="task-row-edit"
          type="text"
          value={draft}
          aria-label="Edit task title"
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.stopPropagation();
              saveEdit();
            } else if (e.key === 'Escape') {
              e.stopPropagation();
              setEditing(false);
            }
          }}
          onBlur={saveEdit}
        />
      ) : (
        <span
          className="task-row-title"
          onClick={(e) => {
            e.stopPropagation();
            if (task.status === 'open') openEdit();
          }}
        >
          {task.title}
        </span>
      )}
      {sinceLabel !== null && <span className="task-row-since">{sinceLabel}</span>}
      {task.status === 'open' && (
        <span className="task-row-overflow">
          <button
            type="button"
            className="task-row-overflow-button"
            aria-label={`Task options for ${task.title}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((prev) => !prev);
            }}
          >
            ⋯
          </button>
          {menuOpen && (
            <span className="task-row-menu" role="menu" aria-label="Snooze">
              {snoozeOptions.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  role="menuitem"
                  className="task-row-menu-item"
                  onClick={(e) => {
                    e.stopPropagation();
                    snoozeTo(option.target);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </span>
          )}
        </span>
      )}
      <span className="task-row-meta">
        {task.dueTime !== null && <span className="task-row-time">{formatTimeDisplay(task.dueTime)}</span>}
        {task.list !== null && <span className="task-row-list">#{task.list}</span>}
      </span>
    </li>
  );
}
