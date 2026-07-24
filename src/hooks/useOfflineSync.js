import { useState, useEffect, useCallback, useRef } from 'react';
import { processSyncQueue, cacheSupabaseData } from '../lib/sync';
import { getAll, putMany } from '../lib/db';

function getOnlineStatus() {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(getOnlineStatus);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });
  const [lastSyncResult, setLastSyncResult] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const handleOnline = () => {
      if (mountedRef.current) setIsOnline(true);
    };
    const handleOffline = () => {
      if (mountedRef.current) setIsOnline(false);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      mountedRef.current = false;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const syncNow = useCallback(async () => {
    if (syncing) return { synced: 0, failed: 0, errors: [] };
    setSyncing(true);
    setSyncProgress({ current: 0, total: 0 });
    try {
      const result = await processSyncQueue((current, total) => {
        setSyncProgress({ current, total });
      });
      setLastSyncResult(result);
      return result;
    } finally {
      setSyncing(false);
    }
  }, [syncing]);

  useEffect(() => {
    if (!isOnline) return;
    const pendingCheck = async () => {
      const pending = await getAll('sync_queue');
      if (pending.length > 0) {
        syncNow();
      }
    };
    pendingCheck();
  }, [isOnline, syncNow]);

  const cacheFromSupabase = useCallback(async (table, supabaseQuery) => {
    if (!isOnline) return null;
    try {
      const data = await cacheSupabaseData(table, supabaseQuery);
      if (data && data.length > 0) {
        await putMany(table, data);
      }
      return data;
    } catch {
      const cached = await getAll(table);
      return cached;
    }
  }, [isOnline]);

  return {
    isOnline,
    syncing,
    syncProgress,
    lastSyncResult,
    syncNow,
    cacheFromSupabase,
  };
}
