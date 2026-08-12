import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Dispatch, ReactNode, RefObject, SetStateAction } from 'react';
import { formatDateDisplay } from '../lib/parser';
import { getLocalStorage, load, memoryStorage } from '../lib/persistence';
import { nextOccurrence } from '../lib/recurrence';
import { initialStoreState, reducer } from '../lib/store';
import type { Action, StoreState } from '../lib/store';
import type { StorageLike } from '../lib/types';
import { migrateLegacyData, storageKeyFor } from '../lib/username';

export type View = 'today' | 'upcoming' | 'all' | 'done';

const TOAST_DISMISS_MS = 4800;

export interface ToastState {
  message: string;
  undoable: boolean;
}

interface AppContextValue {
  state: StoreState;
  dispatch: Dispatch<Action>;
  view: View;
  setView: (view: View) => void;
  barText: string;
  setBarText: Dispatch<SetStateAction<string>>;
  barRef: RefObject<HTMLTextAreaElement | null>;
  selectedTaskId: string | null;
  setSelectedTaskId: (id: string | null) => void;
  recovered: boolean;
  storage: StorageLike;
  username: string;
  storageKey: string;
  storageUnavailable: boolean;
  toast: ToastState | null;
  showToast: (message: string, undoable?: boolean) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

/**
 * Toast copy derives from the SAME state the reducer will act on (stacks
 * included) so a no-op action never claims success — "Undone" on an empty
 * stack is a lie, and G-4 forbids lying about user data.
 */
function toastFor(action: Action, state: StoreState): ToastState | null {
  const data = state.data;
  switch (action.type) {
    case 'add':
      return { message: 'Captured', undoable: true };
    case 'complete': {
      const task = data.tasks.find((t) => t.id === action.id);
      if (task === undefined || task.status === 'done') return null;
      if (task.recurrence !== null) {
        const anchor = task.dueDate ?? action.today;
        const next = nextOccurrence(task.recurrence, anchor, action.today);
        return { message: `Done — next ${formatDateDisplay(next)}`, undoable: true };
      }
      return { message: 'Completed', undoable: true };
    }
    case 'uncomplete': {
      const task = data.tasks.find((t) => t.id === action.id);
      if (task === undefined || task.status !== 'done') return null;
      return { message: 'Reopened', undoable: true };
    }
    case 'edit': {
      if (!data.tasks.some((t) => t.id === action.id)) return null;
      return { message: 'Task updated', undoable: true };
    }
    case 'delete':
      return data.tasks.some((t) => t.id === action.id)
        ? { message: 'Deleted', undoable: true }
        : null;
    case 'snooze': {
      const task = data.tasks.find((t) => t.id === action.id);
      if (task === undefined) return null;
      return task.dueDate === null
        ? { message: 'Scheduled', undoable: true }
        : { message: `Snoozed to ${formatDateDisplay(action.dueDate)}`, undoable: true };
    }
    case 'undo':
      return state.undoStack.length === 0
        ? { message: 'Nothing to undo', undoable: false }
        : { message: 'Undone', undoable: false };
    case 'redo':
      return state.redoStack.length === 0
        ? { message: 'Nothing to redo', undoable: false }
        : { message: 'Redone', undoable: false };
    default:
      return null;
  }
}

export function AppProvider({ username, children }: { username: string; children: ReactNode }) {
  const storageHandle = useMemo(() => {
    const real = getLocalStorage();
    return { storage: real ?? memoryStorage(), unavailable: real === null };
  }, []);
  const storageKey = storageKeyFor(username);
  const loadResult = useMemo(() => {
    migrateLegacyData(storageHandle.storage, username);
    return load(storageHandle.storage, new Date(), storageKeyFor(username));
  }, [storageHandle, username]);
  const [state, rawDispatch] = useReducer(reducer, loadResult.data, initialStoreState);
  const [view, setView] = useState<View>('today');
  const [barText, setBarText] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const barRef = useRef<HTMLTextAreaElement | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const showToast = useCallback((message: string, undoable = false) => {
    if (toastTimer.current !== null) clearTimeout(toastTimer.current);
    setToast({ message, undoable });
    toastTimer.current = setTimeout(() => setToast(null), TOAST_DISMISS_MS);
  }, []);

  const dispatch = useCallback(
    (action: Action) => {
      const message = toastFor(action, stateRef.current);
      rawDispatch(action);
      if (message !== null) showToast(message.message, message.undoable);
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
      storage: storageHandle.storage,
      storageUnavailable: storageHandle.unavailable,
      username,
      storageKey,
      toast,
      showToast,
    }),
    [
      state,
      dispatch,
      view,
      barText,
      selectedTaskId,
      loadResult.recovered,
      storageHandle,
      username,
      storageKey,
      toast,
      showToast,
    ],
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
