// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { StorageBanner } from './StorageBanner';

describe('StorageBanner', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the offline copy when the reason is offline', () => {
    render(<StorageBanner reason="offline" onDismiss={() => {}} />);
    expect(screen.getByRole('alert').textContent).toContain(
      'Offline — changes are saved on this device and will sync when the connection returns.',
    );
  });

  it('renders the storage-full copy when the reason is quota', () => {
    render(<StorageBanner reason="quota" onDismiss={() => {}} />);
    expect(screen.getByRole('alert').textContent).toContain(
      "Changes aren't being saved — this browser's storage is full.",
    );
  });

  it('renders the storage-unavailable copy when the reason is unavailable', () => {
    render(<StorageBanner reason="unavailable" onDismiss={() => {}} />);
    expect(screen.getByRole('alert').textContent).toContain(
      "Changes aren't being saved — this browser's storage is unavailable.",
    );
  });

  it('calls onDismiss when the dismiss button is clicked', () => {
    const onDismiss = vi.fn();
    render(<StorageBanner reason="offline" onDismiss={onDismiss} />);
    screen.getByLabelText('Dismiss storage warning').click();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
