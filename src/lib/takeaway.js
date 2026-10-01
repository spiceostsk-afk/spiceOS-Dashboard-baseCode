import { supabase } from './supabase';
import * as db from './db';
import { isNetworkError, reportNetworkFailure } from './connectivity';

/**
 * Takeaway orders.
 *
 * A takeaway is filed under a packing counter (restaurant_tables.kind =
 * 'packing') because customer_sessions.table_id is NOT NULL and offline sync,
 * settle and the bill all expect a table. The counter is only a filing place:
 * it is never occupied, any number of takeaways can be open on it at once,
 * and the customer is known by a token number. Settling one closes that
 * session only — nothing closes "every session on the counter".
 *
 * The token and the order type live in customer_sessions.metadata:
 *   { order_type: 'takeaway', token: 12 }
 * Reports can also tell a takeaway apart by the counter's kind, which covers
 * orders opened by tapping a P-counter directly, before tokens existed.
 */

export const isTakeaway = (session) => session?.metadata?.order_type === 'takeaway';

export const tokenOf = (session) => (isTakeaway(session) ? session.metadata.token ?? null : null);

/** Local midnight — tokens start again at 1 every day, as a counter's do. */
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

const tokenIn = (s) => {
  const n = Number(s?.metadata?.order_type === 'takeaway' ? s.metadata.token : NaN);
  return Number.isFinite(n) ? n : 0;
};

/**
 * The next token for today. Reads the server when it can and this device's
 * own sessions always, so an order opened offline and not yet pushed still
 * counts. Two tills issuing a token in the same second can collide; at a
 * single takeaway counter that is rare, and the token is a call-out number,
 * not a bill number, so a duplicate is an inconvenience rather than an error.
 */
export async function nextTakeawayToken({ online }) {
  const since = startOfToday();
  let highest = 0;

  if (online) {
    try {
      const { data, error } = await supabase
        .from('customer_sessions')
        .select('metadata')
        .gte('started_at', since.toISOString())
        .eq('metadata->>order_type', 'takeaway');
      if (error) throw error;
      for (const s of data || []) highest = Math.max(highest, tokenIn(s));
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      reportNetworkFailure();
    }
  }

  const local = (await db.getAll('sessions')) || [];
  for (const s of local) {
    if (s.started_at && new Date(s.started_at) >= since) highest = Math.max(highest, tokenIn(s));
  }

  return highest + 1;
}

export const isPackingCounter = (table) => table?.kind === 'packing';

const counterNo = (t) => Number(String(t.table_number).replace(/\D/g, '')) || 0;

/**
 * The counter new takeaways are filed under: the lowest-numbered one. It is
 * never busy, so there is no "free" counter to look for.
 */
export function pickTakeawayCounter(tables) {
  const seen = new Set();
  return (tables || [])
    .filter((t) => isPackingCounter(t) && !seen.has(t.id) && seen.add(t.id))
    .sort((a, b) => counterNo(a) - counterNo(b))[0] || null;
}

/**
 * The floor's rows. A dine-in table is one row. Packing counters become one
 * row per open takeaway (and per held one), plus a single "New takeaway" row,
 * so the floor and Running Orders list every takeaway rather than one per
 * counter. A takeaway row carries `rowKey` = its session id.
 */
export function expandTakeawayRows(tables, { isOpen, isHeld }) {
  const rows = [];
  let newRowAdded = false;
  const counters = (tables || []).filter(isPackingCounter).sort((a, b) => counterNo(a) - counterNo(b));

  for (const table of tables || []) {
    if (!isPackingCounter(table)) { rows.push(table); continue; }
    const sessions = table.customer_sessions || [];
    for (const s of sessions.filter(isOpen)) {
      rows.push({
        ...table, status: 'occupied', rowKey: s.id,
        active_session: s, held_session: null, completed_session: null,
      });
    }
    for (const s of sessions.filter(isHeld)) {
      rows.push({
        ...table, status: 'available', rowKey: s.id,
        active_session: null, held_session: s, completed_session: null,
      });
    }
    if (!newRowAdded && table.id === counters[0]?.id) {
      newRowAdded = true;
      rows.push({
        ...table, status: 'available', rowKey: `new-${table.id}`, isNewTakeaway: true,
        active_session: null, held_session: null,
      });
    }
  }
  return rows;
}
