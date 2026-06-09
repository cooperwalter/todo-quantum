import './StorageBanner.css';

export interface StorageBannerProps {
  onDismiss: () => void;
}

export function StorageBanner({ onDismiss }: StorageBannerProps) {
  return (
    <div className="storage-banner" role="alert">
      <span className="storage-banner-text">
        Changes aren&apos;t being saved — this browser&apos;s storage is unavailable.
      </span>
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
