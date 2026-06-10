import './StorageBanner.css';

export interface StorageBannerProps {
  reason: 'quota' | 'unavailable';
  onDismiss: () => void;
}

const COPY: Record<StorageBannerProps['reason'], string> = {
  quota:
    "Changes aren't being saved — this browser's storage is full. Delete done tasks or clear site data to free space.",
  unavailable: "Changes aren't being saved — this browser's storage is unavailable.",
};

export function StorageBanner({ reason, onDismiss }: StorageBannerProps) {
  return (
    <div className="storage-banner" role="alert">
      <span className="storage-banner-text">{COPY[reason]}</span>
      <button
        type="button"
        className="storage-banner-dismiss"
        aria-label="Dismiss storage warning"
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  );
}
