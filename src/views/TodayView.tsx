import { TaskList } from '../components/TaskList';
import { todayStr } from '../lib/dates';
import { todayItems } from '../lib/selectors';
import { useApp } from '../state/AppContext';

export function TodayView() {
  const { state } = useApp();
  const today = todayStr(new Date());
  const sections = todayItems(state.data, today);
  return (
    <TaskList
      sections={[
        { label: 'Rollover', tasks: sections.rollover, rollover: true },
        { label: 'Due today', tasks: sections.dueToday },
        { label: 'Anytime', tasks: sections.anytime },
      ]}
    />
  );
}
