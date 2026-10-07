import { supabase } from './supabase';
import {
  getPendingSyncItems, removeSyncItem, put, getAll, remove as dbRemove,
  getMeta, setMeta,
} from './db';
import { isNetworkError, reportNetworkFailure } from './connectivity';

/**
 * Pushes what the till saved while offline up to Supabase, in the order it
 * happened.
 *
 * - Strictly in order. An order can't be written before the table session it
 *   belongs to, so the queue stops at the first entry that can't go yet and
 *   picks up from there next time.
 * - Temporary ids (temp_…) are mapped to real ids in a map kept in IndexedDB,
 *   not in memory, so an entry retried an hour later still finds the real id
 *   of the session created before it. That includes the `id` an update or
 *   delete targets — those used to go out with the temp id, match no row, and
 *   "succeed" without changing anything.
 * - Inserts carry a client-made UUID, so an insert that reached the server but
 *   whose reply was lost is recognised on retry instead of written twice.
 * - A network failure costs no retries: the entry just waits for the line.
 *   Only a real rejection from the server counts, and after MAX_RETRIES the
 *   entry is parked in the failed list for someone to look at — never deleted.
 */

const MAX_RETRIES = 5;
const BACKOFF_BASE_MS = 1000;
const ID_MAP_KEY = 'sync_id_map';
const FAILED_KEY = 'sync_failed';
const TEMP_PREFIX = 'temp_';
const LOCAL_STORES_WITH_REFS = ['sessions', 'orders', 'order_items', 'tables'];
const REF_FIELDS = ['order_id', 'session_id', 'table_id', 'menu_item_id', 'orderId'];

const isTemp = (v) => typeof v === 'string' && v.startsWith(TEMP_PREFIX);

export function newUuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  // RFC 4122 v4 fallback for old browsers.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export async function getIdMap() {
  return (await getMeta(ID_MAP_KEY)) || {};
}

/** The real id for a temp id, once it has synced; otherwise the id as given. */
export async function resolveId(id) {
  if (!isTemp(id)) return id;
  const map = await getIdMap();
  return map[id] || id;
}

/**
 * True while anything saved offline is still waiting to go up. New writes must
 * then join the queue behind it rather than go straight to the server: an
 * order sent directly could arrive before the table session it belongs to.
 */
export async function hasPendingSync() {
  try {
    return (await getPendingSyncItems()).length > 0;
  } catch {
    return false;
  }
}

export async function getFailedSyncItems() {
  return (await getMeta(FAILED_KEY)) || [];
}

/** Put parked entries back on the queue for another go. */
export async function retryFailedSyncItems() {
  const failed = await getFailedSyncItems();
  for (const entry of failed) {
    const rest = { ...entry };
    delete rest.id; delete rest.error; delete rest.failedAt;     // re-queued as new
    await put('sync_queue', { ...rest, retries: 0, nextRetryAt: 0 });
  }
  await setMeta(FAILED_KEY, []);
  return failed.length;
}

/** Swap every temp id inside a payload for its real id where one is known. */
function resolvePayload(data, map) {
  if (!data || typeof data !== 'object') return data;
  const out = Array.isArray(data) ? [] : {};
  for (const [k, v] of Object.entries(data)) {
    if (isTemp(v)) out[k] = map[v] || v;
    else if (v && typeof v === 'object') out[k] = resolvePayload(v, map);
    else out[k] = v;
  }
  return out;
}

function hasUnresolved(data) {
  if (!data || typeof data !== 'object') return false;
  return Object.values(data).some((v) => isTemp(v) || (v && typeof v === 'object' && hasUnresolved(v)));
}

/** Rewrite the local copies so screens stop showing temp ids once synced. */
async function applyIdToLocalStores(tempId, realId) {
  for (const store of LOCAL_STORES_WITH_REFS) {
    const rows = await getAll(store);
    for (const row of rows) {
      let changed = false;
      const next = { ...row };
      if (row.id === tempId) { next.id = realId; changed = true; }
      for (const f of REF_FIELDS) {
        if (row[f] === tempId) { next[f] = realId; changed = true; }
      }
      if (Array.isArray(row.customer_sessions)) {
        next.customer_sessions = row.customer_sessions.map((s) => (s.id === tempId ? { ...s, id: realId } : s));
        changed = changed || next.customer_sessions.some((s, i) => s !== row.customer_sessions[i]);
      }
      if (!changed) continue;
      await put(store, next);
      if (next.id !== row.id) await dbRemove(store, row.id);
    }
  }
}

async function runInsert(entry, data) {
  const { error } = await supabase.from(entry.table).insert({ ...data, id: entry.clientId });
  // 23505 on our own id: the first attempt got through, only its reply was lost.
  if (error && !(error.code === '23505' && String(error.message || '').includes('pkey'))) throw error;
  return entry.clientId;
}

async function runUpdate(entry, data) {
  const { id, ...fields } = data;
  // Undefined fields would be sent as nulls by some clients; drop them.
  Object.keys(fields).forEach((k) => fields[k] === undefined && delete fields[k]);
  const { error } = await supabase.from(entry.table).update(fields).eq('id', id);
  if (error) throw error;
}

async function runDelete(entry, data) {
  const { error } = await supabase.from(entry.table).delete().eq('id', data.id);
  if (error) throw error;
}

/**
 * A complimentary bill as a server without migrate_complimentary_bills.sql can
 * take it: a 100% percentage discount, no reason. Still ₹0 charged on a bill
 * with value, which the Complimentary Report picks up either way.
 */
export function compFallback(params) {
  const rest = { ...params, p_discount_type: 'percentage' };
  delete rest.p_comp_reason;
  return rest;
}

async function runRpc(entry, params) {
  let { error } = await supabase.rpc(entry.fn, params);
  if (error && entry.fn === 'record_bill' && params.p_discount_type === 'complimentary') {
    params = compFallback(params);
    ({ error } = await supabase.rpc(entry.fn, params));
  }
  // record_bill without the p_paid_at migration: PostgREST can't find a
  // function taking that argument. Send the bill anyway, stamped at sync time,
  // rather than park a paid bill over a missing timestamp.
  if (error && error.code === 'PGRST202' && 'p_paid_at' in params) {
    const rest = { ...params };
    delete rest.p_paid_at;
    ({ error } = await supabase.rpc(entry.fn, rest));
  }
  if (error) throw error;
}

async function park(entry, message) {
  const failed = await getFailedSyncItems();
  failed.push({ ...entry, error: message, failedAt: new Date().toISOString() });
  await setMeta(FAILED_KEY, failed);
  await removeSyncItem(entry.id);
}

export async function processSyncQueue(onProgress) {
  const pending = (await getPendingSyncItems()).sort((a, b) => a.id - b.id);
  const results = { synced: 0, failed: 0, errors: [], remaining: pending.length, offline: false };
  if (pending.length === 0) return results;

  const map = await getIdMap();
  const now = Date.now();

  for (const entry of pending) {
    // Its turn hasn't come round again yet — and nothing behind it may jump
    // the queue, so stop here.
    if (entry.nextRetryAt && entry.nextRetryAt > now) break;

    // An insert gets its real id once, before the first attempt, and keeps it.
    if (entry.action === 'insert' && !entry.clientId) {
      entry.clientId = newUuid();
      await put('sync_queue', entry);
    }

    const payload = resolvePayload(entry.action === 'rpc' ? entry.params : entry.data, map);
    if (hasUnresolved(payload)) {
      // It needs a record that never made it to the server (its insert was
      // parked). It can't succeed, so park it alongside with the reason.
      await park(entry, 'Depends on a change that failed to sync');
      results.failed++;
      results.errors.push({ id: entry.id, error: 'Depends on a change that failed to sync', entry });
      continue;
    }

    try {
      if (entry.action === 'insert') {
        const realId = await runInsert(entry, payload);
        if (entry.tempId) {
          map[entry.tempId] = realId;
          await setMeta(ID_MAP_KEY, map);
          await applyIdToLocalStores(entry.tempId, realId);
        }
      } else if (entry.action === 'update') {
        await runUpdate(entry, payload);
      } else if (entry.action === 'delete') {
        await runDelete(entry, payload);
      } else if (entry.action === 'rpc') {
        await runRpc(entry, payload);
      } else {
        throw new Error(`Unknown sync action: ${entry.action}`);
      }
      await removeSyncItem(entry.id);
      results.synced++;
      if (onProgress) onProgress(results.synced, pending.length);
    } catch (err) {
      if (isNetworkError(err)) {
        // The line dropped mid-sync. Not the entry's fault: no retry spent.
        reportNetworkFailure();
        results.offline = true;
        break;
      }
      const message = err.message || 'Sync failed';
      const retries = (entry.retries || 0) + 1;
      if (retries >= MAX_RETRIES) {
        await park(entry, message);
        results.failed++;
        results.errors.push({ id: entry.id, error: message, entry });
        continue;
      }
      await put('sync_queue', {
        ...entry,
        retries,
        lastError: message,
        nextRetryAt: now + Math.min(Math.pow(2, retries) * BACKOFF_BASE_MS, 30000),
      });
      results.errors.push({ id: entry.id, error: message, entry });
      break;
    }
  }

  results.remaining = (await getPendingSyncItems()).length;
  return results;
}

export async function cacheSupabaseData(table, query) {
  const { data, error } = await query;
  if (error) throw error;
  if (data) {
    await put('meta', { id: 'last_fetch_' + table, value: Date.now() });
  }
  return data;
}
