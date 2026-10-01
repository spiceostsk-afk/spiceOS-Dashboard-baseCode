import { supabase } from './supabase';
import * as db from './db';
import { isNetworkError, reportNetworkFailure } from './connectivity';

/**
 * Takeaway orders.
 *
 * A takeaway still sits on a packing counter (restaurant_tables.kind =
 * 'packing') underneath. Every part of the POS — offline sync, settle, the
 * captain panel, resolve-table — assumes a session has a table, and
 * customer_sessions.table_id is NOT NULL. So the counter is picked for the
 * cashier instead of removed, and the customer is given a token number.
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

/**
 * A packing counter free for a new takeaway. Only 'available' ones: a counter
 * in 'cleaning' still has its settle-time cleanup timer running, which closes
 * every open session on it — a new order put there would be closed under the
 * cashier a minute later.
 */
export function pickFreeCounter(tables) {
  const natural = (t) => Number(String(t.table_number).replace(/\D/g, '')) || 0;
  return (tables || [])
    .filter((t) => t.kind === 'packing' && t.status === 'available' && !t.active_session && !t.held_session)
    .sort((a, b) => natural(a) - natural(b))[0] || null;
}
