import { useApp } from '../state/AppContext';
import type { View } from '../state/AppContext';

const TABS: { view: View; label: string; keycap: string }[] = [
  { view: 'today', label: 'Today', keycap: 'g t' },
  { view: 'upcoming', label: 'Upcoming', keycap: 'g u' },
  { view: 'all', label: 'All', keycap: 'g a' },
  { view: 'done', label: 'Done', keycap: 'g d' },
];

export function ViewTabs() {
  const { view, setView } = useApp();
  return (
    <nav className="view-tabs" aria-label="Views">
      {TABS.map((tab) => (
        <button
          key={tab.view}
          type="button"
          className="view-tab"
          aria-current={view === tab.view ? 'page' : undefined}
          onClick={() => setView(tab.view)}
        >
          {tab.label}
          <span className="keycap" aria-hidden="true">
            {tab.keycap}
          </span>
        </button>
      ))}
    </nav>
  );
}
