import './App.css';
import { CommandBar } from './components/CommandBar';
import { ViewTabs } from './components/ViewTabs';
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
  return (
    <header className="masthead">
      <h1 className="masthead-date">{DATE_FORMAT.format(new Date())}</h1>
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
  return (
    <div className="shell-column">
      <Masthead />
      <CommandBar />
      <ViewTabs />
      <main className="view-region">
        <ActiveView />
      </main>
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
