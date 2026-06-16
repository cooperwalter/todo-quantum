import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { snoozeNextWeek, snoozeTomorrow, snoozeWeekend, todayStr } from '../lib/dates';

export type KeymapViewId = 'today' | 'upcoming' | 'all' | 'done';

export interface UseKeymapConfig {
  barRef: RefObject<HTMLTextAreaElement | null>;
  getRowIds: () => string[];
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  onComplete: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onSnooze: (id: string, dueDate: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onTypeahead: (ch: string) => void;
  setView: (view: KeymapViewId) => void;
  openCheatsheet: () => void;
  today?: string;
}

const G_SEQUENCE_TIMEOUT_MS = 1000;

const G_VIEWS: Record<string, KeymapViewId> = {
  t: 'today',
  u: 'upcoming',
  a: 'all',
  d: 'done',
};

function isEditableTarget(el: Element | null): boolean {
  if (el === null) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable;
}

export function useKeymap(config: UseKeymapConfig) {
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);
  const pendingG = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function focusRow(id: string | null) {
      if (id === null) return;
      const el = document.querySelector<HTMLElement>(`[data-task-id="${id}"]`);
      el?.focus();
    }

    // Completing or deleting removes the row from every open-task view, so the
    // selection must move on: prefer the row below, fall back to the row above
    // when acting on the last row, clear when it was the only one.
    function neighborOf(id: string, rows: string[]): string | null {
      const idx = rows.indexOf(id);
      return rows[idx + 1] ?? rows[idx - 1] ?? null;
    }

    function moveToList(cfg: UseKeymapConfig) {
      const rows = cfg.getRowIds();
      if (rows.length === 0) return;
      const target = cfg.selectedId !== null && rows.includes(cfg.selectedId) ? cfg.selectedId : rows[0];
      cfg.setSelectedId(target);
      focusRow(target);
    }

    function handleKeyDown(event: KeyboardEvent) {
      const cfg = configRef.current;
      const bar = cfg.barRef.current;
      const active = document.activeElement;
      const inBar = bar !== null && active === bar;

      if (!inBar && isEditableTarget(active)) return; // inline edit / other field safety

      const undoKey = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z';
      if (undoKey) {
        if (inBar && bar.value !== '') return; // native text-field undo untouched
        event.preventDefault();
        if (event.shiftKey) cfg.onRedo();
        else cfg.onUndo();
        return;
      }

      if (inBar) {
        // Command mode owns every key (FR-18/FR-19); CommandBar also stops
        // propagation, but guard here so a future bypass can't steal focus.
        if (bar.value.startsWith('>')) return;
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          moveToList(cfg);
        } else if (event.key === 'Escape' && bar.value === '') {
          // Esc backs out of the bar without grabbing a task — ArrowDown is the
          // deliberate way into the list.
          event.preventDefault();
          bar.blur();
        }
        return; // every other key types into the bar
      }

      // LIST context.
      const rows = cfg.getRowIds();
      const today = cfg.today ?? todayStr(new Date());
      const selected =
        cfg.selectedId !== null && rows.includes(cfg.selectedId)
          ? cfg.selectedId
          : ((active as HTMLElement | null)?.dataset?.taskId ?? null);

      if (pendingG.current !== null && G_VIEWS[event.key] !== undefined) {
        clearTimeout(pendingG.current);
        pendingG.current = null;
        event.preventDefault();
        cfg.setView(G_VIEWS[event.key]);
        return;
      }
      if (pendingG.current !== null && event.key !== 'g') {
        // Any non-continuation key cancels the pending 'g' sequence; a later
        // bare t/u/a/d must not switch views (FR-16).
        clearTimeout(pendingG.current);
        pendingG.current = null;
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
          // The user was typing a word starting with 'g' ("groceries") — the
          // swallowed 'g' belongs in the bar ahead of this key. Moving to the bar
          // ends the list selection, so clear it (else the row keeps its selected
          // styling even though focus has left — same completeness rule as Esc).
          event.preventDefault();
          bar?.focus();
          cfg.setSelectedId(null);
          cfg.onTypeahead('g');
          cfg.onTypeahead(event.key);
          return;
        }
      }

      switch (event.key) {
        case 'j':
        case 'ArrowDown': {
          event.preventDefault();
          if (rows.length === 0) return;
          const idx = selected !== null ? rows.indexOf(selected) : -1;
          const next = rows[Math.min(idx + 1, rows.length - 1)];
          cfg.setSelectedId(next);
          focusRow(next);
          return;
        }
        case 'ArrowUp': {
          event.preventDefault();
          if (rows.length === 0) return;
          const idx = selected !== null ? rows.indexOf(selected) : 0;
          if (idx <= 0) {
            // Topmost row: hand focus back to the capture bar — the inverse of
            // ArrowDown-from-bar (FR-15). Leaving the list clears the selection.
            cfg.setSelectedId(null);
            bar?.focus();
            return;
          }
          const prev = rows[idx - 1];
          cfg.setSelectedId(prev);
          focusRow(prev);
          return;
        }
        case 'k': {
          // Vim nav is list-internal: it clamps at the top rather than exiting to
          // the bar (only the arrow keys cross the bar/list boundary).
          event.preventDefault();
          if (rows.length === 0) return;
          const idx = selected !== null ? rows.indexOf(selected) : 0;
          const prev = rows[Math.max(idx - 1, 0)];
          cfg.setSelectedId(prev);
          focusRow(prev);
          return;
        }
        case 'x':
        case ' ': {
          if (selected !== null) {
            event.preventDefault();
            const next = neighborOf(selected, rows);
            cfg.onComplete(selected);
            cfg.setSelectedId(next);
            focusRow(next);
          }
          return;
        }
        case 'e':
        case 'Enter':
          if (selected !== null) {
            event.preventDefault();
            cfg.onEdit(selected);
          }
          return;
        case 'Delete':
        case 'Backspace': {
          if (selected !== null) {
            event.preventDefault();
            const next = neighborOf(selected, rows);
            cfg.onDelete(selected);
            cfg.setSelectedId(next);
            focusRow(next);
          }
          return;
        }
        case '1':
          if (selected !== null) {
            event.preventDefault();
            cfg.onSnooze(selected, snoozeTomorrow(today));
          }
          return;
        case '2':
          if (selected !== null) {
            event.preventDefault();
            cfg.onSnooze(selected, snoozeNextWeek(today));
          }
          return;
        case '3':
          if (selected !== null) {
            event.preventDefault();
            cfg.onSnooze(selected, snoozeWeekend(today));
          }
          return;
        case 'g':
          event.preventDefault();
          if (pendingG.current !== null) clearTimeout(pendingG.current);
          pendingG.current = setTimeout(() => {
            pendingG.current = null;
          }, G_SEQUENCE_TIMEOUT_MS);
          return;
        case '?':
          event.preventDefault();
          cfg.openCheatsheet();
          return;
        case 'Escape':
          event.preventDefault();
          cfg.setSelectedId(null);
          // Deselection must be complete: clearing selectedId removes the accent
          // left rule, but the row would keep DOM focus and its focus-visible
          // outline — blur it so no selection affordance lingers.
          if (active instanceof HTMLElement && active.dataset.taskId !== undefined) {
            active.blur();
          }
          return;
        default: {
          if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
            // Typing into the bar ends the list selection: focusing the bar drops
            // the row's focus-visible outline, but the --selected styling is driven
            // by selectedId, so it must be cleared too (FR-17 completeness, as Esc).
            event.preventDefault();
            bar?.focus();
            cfg.setSelectedId(null);
            cfg.onTypeahead(event.key);
          }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (pendingG.current !== null) clearTimeout(pendingG.current);
    };
  }, []);
}
