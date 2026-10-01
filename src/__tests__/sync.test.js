import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * A stand-in Supabase: tables are arrays, and each call can be told to fail
 * as a dropped connection ('network') or a server rejection ('server').
 */
const server = vi.hoisted(() => ({
  tables: {},
  calls: [],
  failNext: [],            // queue of 'network' | 'server' | null, consumed per call
  rpcSignature: null,      // set of accepted param names, null = accept anything
}));

vi.mock('../lib/supabase', () => {
  const takeFailure = () => {
    const f = server.failNext.shift();
    if (f === 'network') return { message: 'TypeError: Failed to fetch' };
    if (f === 'server') return { message: 'new row violates check constraint', code: '23514' };
    return null;
  };
  const rows = (t) => (server.tables[t] ||= []);
  const from = (table) => ({
    insert(payload) {
      server.calls.push({ op: 'insert', table, payload });
      const error = takeFailure();
      if (error) return Promise.resolve({ error });
      const list = Array.isArray(payload) ? payload : [payload];
      for (const r of list) {
        if (rows(table).some((x) => x.id === r.id)) {
          return Promise.resolve({ error: { code: '23505', message: `duplicate key value violates unique constraint "${table}_pkey"` } });
        }
      }
      rows(table).push(...list.map((r) => ({ ...r })));
      return Promise.resolve({ error: null });
    },
    update(fields) {
      return {
        eq(col, val) {
          server.calls.push({ op: 'update', table, fields, where: val });
          const error = takeFailure();
          if (error) return Promise.resolve({ error });
          rows(table).filter((r) => r[col] === val).forEach((r) => Object.assign(r, fields));
          return Promise.resolve({ error: null });
        },
      };
    },
    delete() {
      return {
        eq(col, val) {
          server.calls.push({ op: 'delete', table, where: val });
          const error = takeFailure();
          if (error) return Promise.resolve({ error });
          server.tables[table] = rows(table).filter((r) => r[col] !== val);
          return Promise.resolve({ error: null });
        },
      };
    },
  });
  const rpc = (fn, params) => {
    server.calls.push({ op: 'rpc', fn, params });
    const error = takeFailure();
    if (error) return Promise.resolve({ error });
    if (server.rpcSignature && Object.keys(params).some((k) => !server.rpcSignature.has(k))) {
      return Promise.resolve({ error: { code: 'PGRST202', message: 'Could not find the function' } });
    }
    rows(`rpc:${fn}`).push({ ...params });
    return Promise.resolve({ error: null });
  };
  return { supabase: { from, rpc } };
});

const db = await import('../lib/db');
const sync = await import('../lib/sync');

async function resetAll() {
  for (const s of ['sessions', 'orders', 'order_items', 'tables', 'sync_queue', 'meta']) {
    await db.clearStore(s);
  }
  server.tables = {};
  server.calls = [];
  server.failNext = [];
  server.rpcSignature = null;
}

/** A table opened, ordered on and settled entirely offline, as the till queues it. */
async function queueOfflineMeal() {
  const sessionTemp = 'temp_session_1';
  const orderTemp = 'temp_order_1';
  await db.put('sessions', { id: sessionTemp, table_id: 'table-1', session_status: 'active' });
  await db.put('orders', { id: orderTemp, session_id: sessionTemp });
  await db.enqueueSync({ action: 'insert', table: 'customer_sessions', tempId: sessionTemp, data: { table_id: 'table-1', session_status: 'active' } });
  await db.enqueueSync({ action: 'insert', table: 'orders', tempId: orderTemp, data: { session_id: sessionTemp, subtotal: 100, created_at: '2026-09-30T18:20:00.000Z' } });
  await db.enqueueSync({ action: 'insert', table: 'order_items', data: { order_id: orderTemp, menu_item_id: 'dish-1', quantity: 1 } });
  await db.enqueueSync({ action: 'rpc', fn: 'record_bill', params: { p_session_id: sessionTemp, p_total: 105, p_paid: true, p_paid_at: '2026-09-30T18:20:00.000Z' } });
  await db.enqueueSync({ action: 'update', table: 'customer_sessions', data: { id: sessionTemp, session_status: 'completed' } });
  return { sessionTemp, orderTemp };
}

describe('offline sync queue', () => {
  beforeEach(resetAll);

  it('sends a whole offline meal with every temp id swapped for the real one', async () => {
    const { sessionTemp } = await queueOfflineMeal();
    const result = await sync.processSyncQueue();

    expect(result.synced).toBe(5);
    expect(result.remaining).toBe(0);

    const [session] = server.tables.customer_sessions;
    const [order] = server.tables.orders;
    const [line] = server.tables.order_items;
    const [bill] = server.tables['rpc:record_bill'];

    expect(order.session_id).toBe(session.id);
    expect(line.order_id).toBe(order.id);
    // The bill is written — offline settles used to leave it out.
    expect(bill.p_session_id).toBe(session.id);
    expect(bill.p_paid_at).toBe('2026-09-30T18:20:00.000Z');
    // The update reaches the real row instead of matching nothing.
    expect(session.session_status).toBe('completed');
    // The order keeps the time it was taken (stock is costed on that date).
    expect(order.created_at).toBe('2026-09-30T18:20:00.000Z');

    expect(await sync.resolveId(sessionTemp)).toBe(session.id);
    // The local copy is renamed too.
    expect(await db.getById('sessions', session.id)).not.toBeNull();
    expect(await db.getById('sessions', sessionTemp)).toBeNull();
  });

  it('a dropped connection costs no retries and the next run finishes the job', async () => {
    await queueOfflineMeal();
    server.failNext = [null, 'network'];         // session goes up, then the line drops

    const first = await sync.processSyncQueue();
    expect(first.synced).toBe(1);
    expect(first.offline).toBe(true);
    const waiting = await db.getPendingSyncItems();
    expect(waiting).toHaveLength(4);
    expect(waiting.every((e) => (e.retries || 0) === 0)).toBe(true);

    // Hours later, a fresh run: the session's real id is still known.
    const second = await sync.processSyncQueue();
    expect(second.remaining).toBe(0);
    const [session] = server.tables.customer_sessions;
    expect(server.tables.orders[0].session_id).toBe(session.id);
    expect(session.session_status).toBe('completed');
  });

  it('keeps the order: a change waiting on a retry blocks the ones behind it', async () => {
    await queueOfflineMeal();
    server.failNext = ['server'];                 // the session insert is rejected once

    const result = await sync.processSyncQueue();
    expect(result.synced).toBe(0);
    expect(server.calls).toHaveLength(1);         // nothing jumped the queue
    expect(await db.getPendingSyncItems()).toHaveLength(5);
  });

  it('parks a change the server keeps rejecting, with what depends on it, and never deletes them', async () => {
    await queueOfflineMeal();
    const pending = await db.getPendingSyncItems();
    const first = pending.sort((a, b) => a.id - b.id)[0];
    await db.put('sync_queue', { ...first, retries: 4 });  // one strike left
    server.failNext = ['server'];

    const result = await sync.processSyncQueue();
    const failed = await sync.getFailedSyncItems();

    expect(result.failed).toBe(5);
    expect(failed).toHaveLength(5);
    expect(failed[0].error).toMatch(/check constraint/);
    expect(failed[1].error).toMatch(/Depends on a change that failed to sync/);
    expect(await db.getPendingSyncItems()).toHaveLength(0);

    // Put back on the queue, they go through.
    expect(await sync.retryFailedSyncItems()).toBe(5);
    const again = await sync.processSyncQueue();
    expect(again.synced).toBe(5);
    expect(await sync.getFailedSyncItems()).toHaveLength(0);
  });

  it('an insert whose reply was lost is recognised on retry, not written twice', async () => {
    await db.enqueueSync({ action: 'insert', table: 'orders', clientId: 'order-uuid-1', data: { session_id: 'real-session', subtotal: 50 } });
    // The server already has it: the first attempt got through.
    server.tables.orders = [{ id: 'order-uuid-1', session_id: 'real-session', subtotal: 50 }];

    const result = await sync.processSyncQueue();
    expect(result.synced).toBe(1);
    expect(server.tables.orders).toHaveLength(1);
  });

  it('sends the bill without p_paid_at when the database has not had that migration', async () => {
    server.rpcSignature = new Set(['p_session_id', 'p_total', 'p_paid']);
    await db.enqueueSync({ action: 'rpc', fn: 'record_bill', params: { p_session_id: 'real-session', p_total: 10, p_paid: true, p_paid_at: '2026-09-30T18:20:00.000Z' } });

    const result = await sync.processSyncQueue();
    expect(result.synced).toBe(1);
    expect(server.tables['rpc:record_bill'][0]).toEqual({ p_session_id: 'real-session', p_total: 10, p_paid: true });
  });

  it('hasPendingSync reports queued changes', async () => {
    expect(await sync.hasPendingSync()).toBe(false);
    await db.enqueueSync({ action: 'update', table: 'restaurant_tables', data: { id: 't', status: 'occupied' } });
    expect(await sync.hasPendingSync()).toBe(true);
  });
});
