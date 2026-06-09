import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Dispatch, ReactNode, RefObject, SetStateAction } from 'react';
import { formatDateDisplay } from '../lib/parser';
import { load } from '../lib/persistence';
import { nextOccurrence } from '../lib/recurrence';
import { initialStoreState, reducer } from '../lib/store';
import type { Action, StoreState } from '../lib/store';
import type { AppData } from '../lib/types';

export type View = 'today' | 'upcoming' | 'all' | 'done';

const TOAST_DISMISS_MS = 4800;

interface AppContextValue {
  state: StoreState;
  dispatch: Dispatch<Action>;
  view: View;
  setView: (view: View) => void;
  barText: string;
  setBarText: Dispatch<SetStateAction<string>>;
  barRef: RefObject<HTMLInputElement | null>;
  selectedTaskId: string | null;
  setSelectedTaskId: (id: string | null) => void;
  recovered: boolean;
  toast: string | null;
  showToast: (message: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function toastMessageFor(action: Action, data: AppData): string | null {
  switch (action.type) {
    case 'add':
      return 'Captured';
    case 'complete': {
      const task = data.tasks.find((t) => t.id === action.id);
      if (task === undefined || task.status === 'done') return null;
      if (task.recurrence !== null) {
        const anchor = task.dueDate ?? action.today;
        const next = nextOccurrence(task.recurrence, anchor, action.today);
        return `Done — next ${formatDateDisplay(next)}`;
      }
      return 'Completed';
    }
    case 'uncomplete':
      return 'Reopened';
    case 'edit':
      return 'Saved';
    case 'delete':
      return data.tasks.some((t) => t.id === action.id) ? 'Deleted' : null;
    case 'snooze': {
      const task = data.tasks.find((t) => t.id === action.id);
      if (task === undefined) return null;
      return task.dueDate === null ? 'Scheduled' : `Snoozed to ${formatDateDisplay(action.dueDate)}`;
    }
    case 'undo':
      return 'Undone';
    case 'redo':
      return 'Redone';
    default:
      return null;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const loadResult = useMemo(() => load(window.localStorage), []);
  const [state, rawDispatch] = useReducer(reducer, loadResult.data, initialStoreState);
  const [view, setView] = useState<View>('today');
  const [barText, setBarText] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const barRef = useRef<HTMLInputElement | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const showToast = useCallback((message: string) => {
    if (toastTimer.current !== null) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_DISMISS_MS);
  }, []);

  const dispatch = useCallback(
    (action: Action) => {
      const message = toastMessageFor(action, stateRef.current.data);
      rawDispatch(action);
      if (message !== null) showToast(message);
    },
    [showToast],
  );

  const value = useMemo(
    () => ({
      state,
      dispatch,
      view,
      setView,
      barText,
      setBarText,
      barRef,
      selectedTaskId,
      setSelectedTaskId,
      recovered: loadResult.recovered,
      toast,
      showToast,
    }),
    [state, dispatch, view, barText, selectedTaskId, loadResult.recovered, toast, showToast],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (ctx === null) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return ctx;
}
