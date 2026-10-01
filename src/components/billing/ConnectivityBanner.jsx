import React from 'react';
import { Wifi, WifiOff, RefreshCw, AlertTriangle } from 'lucide-react';

function Banner({ tone, children }) {
  return (
    <div className={`conn-banner conn-banner--${tone}`}>
      {children}
      <style>{`
        .conn-banner {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 32px;
          font-size: 13px;
          font-weight: 600;
          border-bottom: 1px solid var(--color-border);
        }
        .conn-banner--info { background: var(--color-info-soft); color: var(--color-info); }
        .conn-banner--warning { background: var(--color-warning-soft); color: var(--color-warning); }
        .conn-banner--success { background: var(--color-success-soft); color: var(--color-success); }
        .conn-banner__count { font-weight: 700; }
        .conn-banner__action {
          margin-left: auto;
          background: none;
          border: none;
          color: inherit;
          display: flex;
        }
      `}</style>
    </div>
  );
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default function ConnectivityBanner({
  isOnline, syncing, syncProgress, syncNow, lastSyncResult,
  pendingCount = 0, failedCount = 0, retryFailed,
}) {
  // Failures first: a change that could not be sent needs a person, and must
  // never sit hidden behind a green "synced" message.
  if (failedCount > 0 && !syncing) {
    return (
      <Banner tone="warning">
        <AlertTriangle size={14} />
        {plural(failedCount, 'change')} could not be sent to the server
        {retryFailed && (
          <button className="conn-banner__action" onClick={retryFailed} title="Try sending them again">
            <RefreshCw size={13} />&nbsp;Retry
          </button>
        )}
      </Banner>
    );
  }

  if (syncing) {
    return (
      <Banner tone="info">
        <RefreshCw size={14} className="spin" />
        Sending saved changes to the server…
        <span className="conn-banner__count tnum">
          {syncProgress.current}/{syncProgress.total}
        </span>
      </Banner>
    );
  }

  if (!isOnline) {
    return (
      <Banner tone="warning">
        <WifiOff size={14} />
        No internet. Everything is being saved on this device
        {pendingCount > 0 && <> ({plural(pendingCount, 'change')} waiting)</>}
        {' '}and will be sent automatically when the connection is back.
      </Banner>
    );
  }

  if (pendingCount > 0) {
    return (
      <Banner tone="info">
        <RefreshCw size={14} />
        {plural(pendingCount, 'saved change')} waiting to be sent
        <button className="conn-banner__action" onClick={syncNow} title="Send now">
          <RefreshCw size={13} />
        </button>
      </Banner>
    );
  }

  if (lastSyncResult && lastSyncResult.synced > 0) {
    return (
      <Banner tone="success">
        <Wifi size={14} />
        Back online. {plural(lastSyncResult.synced, 'saved change')} sent to the server
      </Banner>
    );
  }

  return null;
}
