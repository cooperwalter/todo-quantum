// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UsernameGate } from './UsernameGate';

function makeGate() {
  const onSubmit = vi.fn();
  render(<UsernameGate onSubmit={onSubmit} />);
  return { onSubmit, user: userEvent.setup() };
}

afterEach(cleanup);

describe('UsernameGate', () => {
  it('should submit the trimmed lowercase username when the form is submitted', async () => {
    const { onSubmit, user } = makeGate();
    await user.type(screen.getByRole('textbox'), '  Cooper ');
    await user.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenCalledWith('cooper');
  });

  it('should show validation copy and not submit for a username with spaces', async () => {
    const { onSubmit, user } = makeGate();
    await user.type(screen.getByRole('textbox'), 'coo per');
    await user.keyboard('{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.queryByText('Use letters, numbers, - or _ (max 32)')).not.toBeNull();
  });

  it('should not submit an empty username', async () => {
    const { onSubmit, user } = makeGate();
    await user.keyboard('{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('should focus the username input on mount', () => {
    makeGate();
    expect(document.activeElement).toBe(screen.getByRole('textbox'));
  });

  it('should associate the visible label with the input for screen readers', () => {
    makeGate();
    expect(screen.getByLabelText(/who/i)).toBe(screen.getByRole('textbox'));
  });

  it('should clear the validation copy once the user edits the username again', async () => {
    const { user } = makeGate();
    await user.type(screen.getByRole('textbox'), 'coo per');
    await user.keyboard('{Enter}');
    expect(screen.queryByText('Use letters, numbers, - or _ (max 32)')).not.toBeNull();
    await user.type(screen.getByRole('textbox'), 'x');
    expect(screen.queryByText('Use letters, numbers, - or _ (max 32)')).toBeNull();
  });
});
