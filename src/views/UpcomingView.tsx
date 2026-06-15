import { TaskList } from '../components/TaskList';
import { useToday } from '../hooks/useToday';
import { upcomingGroups } from '../lib/selectors';
import { useApp } from '../state/AppContext';

export function UpcomingView() {
  const { state, selectedTaskId, setSelectedTaskId } = useApp();
  const today = useToday();
  const groups = upcomingGroups(state.data, today);

  if (groups.length === 0) {
    return <p className="empty-state">
        <span className="empty-state-glyph" aria-hidden="true">◯</span>
        <span className="empty-state-copy">Nothing ahead — type to capture.</span>
      </p>;
  }

  return (
    <TaskList
      selectedId={selectedTaskId}
      onSelect={setSelectedTaskId}
      sections={groups.map((group) => ({ label: group.label, tasks: group.tasks }))}
    />
  );
}
