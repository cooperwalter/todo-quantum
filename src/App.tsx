import { useState } from 'react';
import './App.css';
import { formatKanjiDate } from './lib/kanji-date';
import { Cheatsheet } from './components/Cheatsheet';
import { CommandBar } from './components/CommandBar';
import { StorageBanner } from './components/StorageBanner';
import { Toast } from './components/Toast';
import { ViewTabs } from './components/ViewTabs';
import { useKeymap } from './hooks/useKeymap';
import { usePersistence } from './hooks/usePersistence';
import { todayStr } from './lib/dates';
import { AppProvider, useApp } from './state/AppContext';
import { AllView } from './views/AllView';
import { DoneView } from './views/DoneView';
import { TodayView } from './views/TodayView';
import { UpcomingView } from './views/UpcomingView';

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

function Masthead() {
  const now = new Date();
  return (
    <header className="masthead">
      <div className="masthead-head">
        <h1 className="masthead-date-kanji">{formatKanjiDate(now)}</h1>
        <p className="masthead-date-en">{DATE_FORMAT.format(now)}</p>
      </div>
      <div className="masthead-rule" aria-hidden="true" />
    </header>
  );
}

function ActiveView() {
  const { view } = useApp();
  switch (view) {
    case 'today':
      return <TodayView />;
    case 'upcoming':
      return <UpcomingView />;
    case 'all':
      return <AllView />;
    case 'done':
      return <DoneView />;
  }
}

function Shell() {
  const { dispatch, setView, setBarText, barRef, selectedTaskId, setSelectedTaskId } = useApp();
  const { saveFailed, dismissSaveFailure } = usePersistence();
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);

  useKeymap({
    barRef,
    getRowIds: () =>
      Array.from(document.querySelectorAll<HTMLElement>('.task-row[data-task-id]')).map(
        (el) => el.dataset.taskId as string,
      ),
    selectedId: selectedTaskId,
    setSelectedId: setSelectedTaskId,
    onComplete: (id) =>
      dispatch({
        type: 'complete',
        id,
        completedAt: new Date().toISOString(),
        today: todayStr(new Date()),
        newId: crypto.randomUUID(),
      }),
    onEdit: (id) =>
      document.querySelector<HTMLElement>(`[data-task-id="${id}"] .task-row-title`)?.click(),
    onDelete: (id) => dispatch({ type: 'delete', id }),
    onSnooze: (id, dueDate) => dispatch({ type: 'snooze', id, dueDate }),
    onUndo: () => dispatch({ type: 'undo' }),
    onRedo: () => dispatch({ type: 'redo' }),
    onTypeahead: (ch) => setBarText((prev) => prev + ch),
    setView,
    openCheatsheet: () => setCheatsheetOpen(true),
  });

  return (
    <div className="shell-column">
      <Masthead />
      {saveFailed !== false && <StorageBanner reason={saveFailed} onDismiss={dismissSaveFailure} />}
      <CommandBar openCheatsheet={() => setCheatsheetOpen(true)} />
      <ViewTabs />
      <main className="view-region">
        <ActiveView />
      </main>
      <Toast />
      {cheatsheetOpen && <Cheatsheet onClose={() => setCheatsheetOpen(false)} />}
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}

export default App;
