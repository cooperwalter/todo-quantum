import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { snoozeNextWeek, snoozeTomorrow, snoozeWeekend, todayStr } from '../lib/dates';

export type KeymapViewId = 'today' | 'upcoming' | 'all' | 'done';

export interface UseKeymapConfig {
  barRef: RefObject<HTMLInputElement | null>;
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
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          moveToList(cfg);
        } else if (event.key === 'Escape' && bar.value === '') {
          event.preventDefault();
          moveToList(cfg);
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
        case 'k':
        case 'ArrowUp': {
          event.preventDefault();
          if (rows.length === 0) return;
          const idx = selected !== null ? rows.indexOf(selected) : 0;
          const prev = rows[Math.max(idx - 1, 0)];
          cfg.setSelectedId(prev);
          focusRow(prev);
          return;
        }
        case 'x':
        case ' ':
          if (selected !== null) {
            event.preventDefault();
            cfg.onComplete(selected);
          }
          return;
        case 'e':
        case 'Enter':
          if (selected !== null) {
            event.preventDefault();
            cfg.onEdit(selected);
          }
          return;
        case 'Delete':
        case 'Backspace':
          if (selected !== null) {
            event.preventDefault();
            cfg.onDelete(selected);
          }
          return;
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
          return;
        default: {
          if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
            event.preventDefault();
            bar?.focus();
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
