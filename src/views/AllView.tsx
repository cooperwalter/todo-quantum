import { TaskList } from '../components/TaskList';
import { allItems } from '../lib/selectors';
import { useApp } from '../state/AppContext';

export function AllView() {
  const { state, barText, selectedTaskId, setSelectedTaskId } = useApp();
  const filtering = barText.trim() !== '' && !barText.startsWith('>');
  const tasks = allItems(state.data, filtering ? barText : '');
  const dated = tasks.filter((t) => t.dueDate !== null);
  const anytime = tasks.filter((t) => t.dueDate === null);

  return (
    <>
      {filtering && <p className="filter-hint">filtering — Enter captures</p>}
      {tasks.length === 0 ? (
        <p className="empty-state">
          <span className="empty-state-glyph" aria-hidden="true">◯</span>
          <span className="empty-state-copy">Nothing here — type to capture.</span>
        </p>
      ) : (
        <TaskList
          selectedId={selectedTaskId}
          onSelect={setSelectedTaskId}
          sections={[
            { label: 'Dated', tasks: dated },
            { label: 'Anytime', tasks: anytime },
          ]}
        />
      )}
    </>
  );
}
