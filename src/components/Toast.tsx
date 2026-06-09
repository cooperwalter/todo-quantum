import './Toast.css';
import { useApp } from '../state/AppContext';

export function Toast() {
  const { toast, dispatch } = useApp();
  return (
    <div className="toast-region" aria-live="polite">
      {toast !== null && (
        <div className="toast">
          <span className="toast-message">{toast}</span>
          <button type="button" className="toast-undo" onClick={() => dispatch({ type: 'undo' })}>
            Undo <span className="toast-keycap">⌘Z</span>
          </button>
        </div>
      )}
    </div>
  );
}
