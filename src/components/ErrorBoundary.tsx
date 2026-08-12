import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import './ErrorBoundary.css';
import { RECOVERY_PREFIX, STORAGE_KEY, getLocalStorage } from '../lib/persistence';
import { getStoredUsername, storageKeyFor } from '../lib/username';

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Last line of defense for FR-41/FR-42: a render crash must never become a
 * silent permanent white screen. Offers a reload and, because a crash loop is
 * most likely corrupt stored data, a reset that stashes the current blob under
 * the recovery prefix before clearing the app key.
 */
interface ErrorBoundaryProps {
  children: ReactNode;
  reload?: () => void;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unrecoverable render error', error, info.componentStack);
  }

  doReload = () => {
    (this.props.reload ?? (() => window.location.reload()))();
  };

  resetData = () => {
    const storage = getLocalStorage();
    if (storage !== null) {
      const username = getStoredUsername(storage);
      const key = username === null ? STORAGE_KEY : storageKeyFor(username);
      const raw = storage.getItem(key);
      if (raw !== null) {
        try {
          storage.setItem(RECOVERY_PREFIX + new Date().toISOString(), raw);
        } catch {
          // Best-effort stash; reset must proceed regardless.
        }
        storage.removeItem(key);
      }
    }
    this.doReload();
  };

  render() {
    if (this.state.error === null) return this.props.children;
    return (
      <div className="error-boundary" role="alert">
        <h1 className="error-boundary-title">Something went wrong</h1>
        <p className="error-boundary-body">
          The app hit an unexpected error. Reloading usually fixes it. If it keeps happening, your
          saved list may be unreadable — &ldquo;Reset data&rdquo; preserves a recovery copy in this
          browser before starting fresh.
        </p>
        <p className="error-boundary-detail">{this.state.error.message}</p>
        <div className="error-boundary-actions">
          <button type="button" className="error-boundary-reload" onClick={this.doReload}>
            Reload
          </button>
          <button type="button" className="error-boundary-reset" onClick={this.resetData}>
            Reset data (keeps a recovery copy)
          </button>
        </div>
      </div>
    );
  }
}
