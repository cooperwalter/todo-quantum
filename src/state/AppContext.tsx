import { createContext, useContext, useMemo, useReducer, useState } from 'react';
import type { Dispatch, ReactNode } from 'react';
import { load } from '../lib/persistence';
import { initialStoreState, reducer } from '../lib/store';
import type { Action, StoreState } from '../lib/store';

export type View = 'today' | 'upcoming' | 'all' | 'done';

interface AppContextValue {
  state: StoreState;
  dispatch: Dispatch<Action>;
  view: View;
  setView: (view: View) => void;
  barText: string;
  setBarText: (text: string) => void;
  recovered: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const loadResult = useMemo(() => load(window.localStorage), []);
  const [state, dispatch] = useReducer(reducer, loadResult.data, initialStoreState);
  const [view, setView] = useState<View>('today');
  const [barText, setBarText] = useState('');

  const value = useMemo(
    () => ({ state, dispatch, view, setView, barText, setBarText, recovered: loadResult.recovered }),
    [state, view, barText, loadResult.recovered],
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
