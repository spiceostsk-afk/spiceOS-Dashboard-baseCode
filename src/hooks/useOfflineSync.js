import { useState, useEffect, useCallback, useRef } from 'react';
import {
  processSyncQueue, cacheSupabaseData, getFailedSyncItems, retryFailedSyncItems,
} from '../lib/sync';
import { getAll, putMany } from '../lib/db';
import { isOnlineNow, subscribeConnectivity, isNetworkError, reportNetworkFailure } from '../lib/connectivity';

const RETRY_EVERY_MS = 15000;

// One sync at a time across every screen that uses this hook.
let syncInFlight = null;

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(isOnlineNow);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });
  const [lastSyncResult, setLastSyncResult] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const unsubscribe = subscribeConnectivity((online) => {
      if (mountedRef.current) setIsOnline(online);
    });
    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, []);

  const refreshCounts = useCallback(async () => {
    try {
      const [pending, failed] = await Promise.all([getAll('sync_queue'), getFailedSyncItems()]);
      if (!mountedRef.current) return;
      setPendingCount(pending.length);
      setFailedCount(failed.length);
    } catch { /* IndexedDB unavailable */ }
  }, []);

  const syncNow = useCallback(async () => {
    if (syncInFlight) return syncInFlight;
    setSyncing(true);
    setSyncProgress({ current: 0, total: 0 });
    syncInFlight = (async () => {
      try {
        const result = await processSyncQueue((current, total) => {
          if (mountedRef.current) setSyncProgress({ current, total });
        });
        if (mountedRef.current) setLastSyncResult(result);
        return result;
      } finally {
        syncInFlight = null;
        if (mountedRef.current) setSyncing(false);
        await refreshCounts();
      }
    })();
    return syncInFlight;
  }, [refreshCounts]);

  // Back online: push what was saved locally. While anything is still waiting
  // (a server hiccup, a retry backing off), keep trying every few seconds.
  useEffect(() => {
    refreshCounts();
    if (!isOnline) return undefined;
    let cancelled = false;
    const tick = async () => {
      const pending = await getAll('sync_queue');
      if (!cancelled && pending.length > 0) await syncNow();
      else refreshCounts();
    };
    tick();
    const t = setInterval(tick, RETRY_EVERY_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, [isOnline, syncNow, refreshCounts]);

  const retryFailed = useCallback(async () => {
    await retryFailedSyncItems();
    await refreshCounts();
    if (isOnlineNow()) await syncNow();
  }, [syncNow, refreshCounts]);

  const cacheFromSupabase = useCallback(async (table, supabaseQuery) => {
    try {
      const data = await cacheSupabaseData(table, supabaseQuery);
      if (data && data.length > 0) {
        await putMany(table, data);
      }
      return data;
    } catch (err) {
      if (isNetworkError(err)) reportNetworkFailure();
      const cached = await getAll(table);
      return cached;
    }
  }, []);

  return {
    isOnline,
    syncing,
    syncProgress,
    lastSyncResult,
    pendingCount,
    failedCount,
    syncNow,
    retryFailed,
    refreshCounts,
    cacheFromSupabase,
  };
}
