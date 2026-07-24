import { supabase } from './supabase';
import { getPendingSyncItems, removeSyncItem, put, getAll, remove as dbRemove } from './db';

const MAX_RETRIES = 5;
const BACKOFF_BASE_MS = 1000;
const TEMP_ID_FIELDS = ['order_id', 'session_id', 'table_id', 'menu_item_id'];

function updateLocalId(storeName, tempId, realId) {
  return getAll(storeName).then((items) => {
    const target = items.find((item) => item.id === tempId);
    if (!target) return;
    target.id = realId;
    return put(storeName, target).then(() => dbRemove(storeName, tempId));
  });
}

function resolveTempIdsInData(data, tempIdMap) {
  const resolved = { ...data };
  TEMP_ID_FIELDS.forEach((field) => {
    if (resolved[field] && tempIdMap[resolved[field]]) {
      resolved[field] = tempIdMap[resolved[field]];
    }
  });
  return resolved;
}

function replaceTempIdsInOrders(tempIdMap) {
  return getAll('orders').then((orders) => {
    const updates = orders.map((order) => {
      const mapped = tempIdMap[order.session_id];
      if (mapped) {
        order.session_id = mapped;
        return put('orders', order);
      }
      return Promise.resolve();
    });
    return Promise.all(updates);
  });
}

function replaceTempIdsInOrderItems(tempIdMap) {
  return getAll('order_items').then((items) => {
    const updates = items.map((item) => {
      const mappedOrderId = tempIdMap[item.order_id];
      if (mappedOrderId) item.order_id = mappedOrderId;
      return mappedOrderId ? put('order_items', item) : Promise.resolve();
    });
    return Promise.all(updates);
  });
}

function handleInsertAction(entry, tempIdMap) {
  const resolvedData = resolveTempIdsInData(entry.data, tempIdMap);
  return supabase
    .from(entry.table)
    .insert(resolvedData)
    .select()
    .single()
    .then(({ data, error }) => {
      if (error) throw error;
      if (entry.tempId && data?.id) {
        return updateLocalId(entry.table, entry.tempId, data.id).then(() => data.id);
      }
      return null;
    });
}

function handleUpdateAction(entry) {
  return supabase.from(entry.table).update(entry.data).eq('id', entry.data.id).then(({ error }) => {
    if (error) throw error;
  });
}

function handleDeleteAction(entry) {
  return supabase.from(entry.table).delete().eq('id', entry.data.id).then(({ error }) => {
    if (error) throw error;
  });
}

const ACTION_HANDLERS = {
  insert: handleInsertAction,
  update: handleUpdateAction,
  delete: handleDeleteAction,
};

function processSingleEntry(entry, tempIdMap) {
  const handler = ACTION_HANDLERS[entry.action];
  if (!handler) {
    return Promise.reject(new Error(`Unknown sync action: ${entry.action}`));
  }
  return handler(entry, tempIdMap);
}

export async function processSyncQueue(onProgress) {
  const pending = await getPendingSyncItems();
  if (pending.length === 0) return { synced: 0, failed: 0, errors: [] };

  const tempIdMap = {};
  const results = { synced: 0, failed: 0, errors: [] };
  const now = Date.now();

  for (const entry of pending) {
    if (entry.retries >= MAX_RETRIES) {
      results.errors.push({ id: entry.id, error: 'Max retries exceeded', entry });
      results.failed++;
      await removeSyncItem(entry.id);
      continue;
    }

    if (entry.nextRetryAt && entry.nextRetryAt > now) {
      continue;
    }

    try {
      const realId = await processSingleEntry(entry, tempIdMap);
      if (entry.action === 'insert' && entry.tempId && realId) {
        tempIdMap[entry.tempId] = realId;
      }
      await removeSyncItem(entry.id);
      results.synced++;
      if (onProgress) onProgress(results.synced, pending.length);
    } catch (err) {
      entry.retries = (entry.retries || 0) + 1;
      entry.nextRetryAt = now + Math.min(Math.pow(2, entry.retries) * BACKOFF_BASE_MS, 30000);
      await removeSyncItem(entry.id);
      await put('sync_queue', entry);
      results.errors.push({ id: entry.id, error: err.message || 'Sync failed', entry });
      results.failed++;
    }
  }

  if (Object.keys(tempIdMap).length > 0) {
    await replaceTempIdsInOrders(tempIdMap);
    await replaceTempIdsInOrderItems(tempIdMap);
  }

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
