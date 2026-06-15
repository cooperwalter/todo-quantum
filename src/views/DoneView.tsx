import { doneItems } from '../lib/selectors';
import { useApp } from '../state/AppContext';

export function DoneView() {
  const { state, dispatch } = useApp();
  const tasks = doneItems(state.data);

  if (tasks.length === 0) {
    return <p className="empty-state">
        <span className="empty-state-glyph" aria-hidden="true">◯</span>
        <span className="empty-state-copy">Nothing done yet — finish something today.</span>
      </p>;
  }

  function reopen(id: string) {
    dispatch({ type: 'uncomplete', id });
  }

  return (
    <div className="task-list">
      <ul className="task-section">
        {tasks.map((task, index) => (
          <li
            key={task.id}
            className="task-row task-row--done"
            data-task-id={task.id}
            tabIndex={index === 0 ? 0 : -1}
            onKeyDown={(e) => {
              if (e.key === 'x' && e.target === e.currentTarget) {
                e.stopPropagation();
                reopen(task.id);
              }
            }}
          >
            <input
              type="checkbox"
              className="task-row-checkbox"
              checked
              onChange={() => reopen(task.id)}
              aria-label={`Reopen ${task.title}`}
            />
            <span className="task-row-title">{task.title}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
