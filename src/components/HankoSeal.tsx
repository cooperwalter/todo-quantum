import './HankoSeal.css';
import { useToday } from '../hooks/useToday';
import { selectTodayProgress } from '../lib/selectors';
import { useApp } from '../state/AppContext';

// The masthead's ceremonial mark: a rotated stamp that fills crimson with a
// checkmark when every task due today (including rollovers) is done; an empty
// outline otherwise. Informative only — a status region, never focusable or
// clickable. State is derived from the store on every render, so adding a task or
// reopening one reverts it instantly.
export function HankoSeal() {
  const { state } = useApp();
  const today = useToday();
  const { done, total } = selectTodayProgress(state.data, today);
  const filled = total > 0 && done === total;

  return (
    <div
      className={`hanko-seal${filled ? ' hanko-seal--filled' : ''}`}
      role="status"
      aria-label={`${done} of ${total} tasks done today`}
    >
      {filled && (
        <span className="hanko-seal-mark" aria-hidden="true">
          ✓
        </span>
      )}
    </div>
  );
}
