import React from 'react';
import { Wifi, WifiOff, RefreshCw, AlertTriangle } from 'lucide-react';

function SyncProgress({ current, total }) {
  return (
    <span style={{ fontWeight: 700, marginLeft: '0.5rem', fontSize: '0.75rem' }}>
      {current}/{total}
    </span>
  );
}

export default function ConnectivityBanner({ isOnline, syncing, syncProgress, syncNow, lastSyncResult }) {
  if (syncing) {
    return (
      <div className="conn-banner syncing">
        <RefreshCw size={14} className="spinner" />
        Syncing data...
        <SyncProgress current={syncProgress.current} total={syncProgress.total} />
        <style>{`
          .conn-banner { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; font-size: 0.8rem; font-weight: 700; border-bottom: 1px solid var(--color-border); }
          .syncing { background: #E3F2FD; color: #1565C0; }
          .spinner { animation: spin 1s linear infinite; }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div className="conn-banner offline">
        <WifiOff size={14} />
        Offline Mode — changes will sync automatically when connected
        <style>{`
          .conn-banner { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; font-size: 0.8rem; font-weight: 700; border-bottom: 1px solid var(--color-border); }
          .offline { background: #FFF3E0; color: #E65100; }
        `}</style>
      </div>
    );
  }

  if (lastSyncResult && lastSyncResult.synced > 0) {
    return (
      <div className="conn-banner synced">
        <Wifi size={14} />
        Synced {lastSyncResult.synced} item{lastSyncResult.synced > 1 ? 's' : ''} successfully
        {lastSyncResult.failed > 0 && (
          <span style={{ color: '#C62828', marginLeft: '0.5rem' }}>
            <AlertTriangle size={14} /> {lastSyncResult.failed} failed
          </span>
        )}
        <button className="dismiss-btn" onClick={syncNow}>
          <RefreshCw size={12} />
        </button>
        <style>{`
          .conn-banner { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; font-size: 0.8rem; font-weight: 700; border-bottom: 1px solid var(--color-border); }
          .synced { background: #E8F5E9; color: #2E7D32; }
          .dismiss-btn { margin-left: auto; background: none; border: none; cursor: pointer; color: inherit; }
        `}</style>
      </div>
    );
  }

  return null;
}
