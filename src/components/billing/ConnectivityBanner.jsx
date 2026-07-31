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

export default function ConnectivityBanner({ isOnline, syncing, syncProgress, syncNow, lastSyncResult }) {
  if (syncing) {
    return (
      <Banner tone="info">
        <RefreshCw size={14} className="spin" />
        Syncing data…
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
        Offline mode — changes sync automatically once you’re back online
      </Banner>
    );
  }

  if (lastSyncResult && lastSyncResult.synced > 0) {
    return (
      <Banner tone="success">
        <Wifi size={14} />
        Synced {lastSyncResult.synced} item{lastSyncResult.synced > 1 ? 's' : ''} successfully
        {lastSyncResult.failed > 0 && (
          <span style={{ color: 'var(--color-danger)', display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
            <AlertTriangle size={14} /> {lastSyncResult.failed} failed
          </span>
        )}
        <button className="conn-banner__action" onClick={syncNow} title="Sync again">
          <RefreshCw size={13} />
        </button>
      </Banner>
    );
  }

  return null;
}
