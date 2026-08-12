import { useEffect, useRef, useState } from 'react';
import './UsernameGate.css';
import { normalizeUsername } from '../lib/username';

export interface UsernameGateProps {
  onSubmit: (username: string) => void;
}

export function UsernameGate({ onSubmit }: UsernameGateProps) {
  const [value, setValue] = useState('');
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const username = normalizeUsername(value);
    if (username === null) {
      setInvalid(true);
      return;
    }
    onSubmit(username);
  }

  return (
    <main className="username-gate">
      <form className="username-gate-form" onSubmit={handleSubmit}>
        <span className="username-gate-glyph" aria-hidden="true">
          ◯
        </span>
        <label className="username-gate-label" htmlFor="username-input">
          Who&rsquo;s at the desk?
        </label>
        <div className="username-gate-rule" aria-hidden="true" />
        <input
          className="username-gate-input"
          id="username-input"
          name="username"
          ref={inputRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setInvalid(false);
          }}
          autoComplete="username"
          spellCheck={false}
          aria-invalid={invalid}
          aria-describedby={invalid ? 'username-gate-error' : undefined}
        />
        {invalid && (
          <p className="username-gate-error" id="username-gate-error" role="alert">
            Use letters, numbers, - or _ (max 32)
          </p>
        )}
        <button className="username-gate-submit" type="submit">
          Begin
        </button>
      </form>
    </main>
  );
}
