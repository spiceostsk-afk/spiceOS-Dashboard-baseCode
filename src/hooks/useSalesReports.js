import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * The sales reports, all reading the same period.
 *
 * Revenue in this system hangs off customer_sessions, not orders: Reports and
 * Payments both start from a completed session and only then read the orders
 * attached to it. An order without a session earns nothing, so every report
 * here starts the same way — otherwise two reports over the same dates would
 * quietly disagree.
 *
 * Boundaries are LOCAL days. A sale at 11pm belongs to that evening's trade,
 * not to tomorrow.
 */

export const REPORT_PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last_7', label: '7D' },
  { key: 'last_14', label: '14D' },
  { key: 'last_30', label: '30D' },
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'custom', label: 'Custom range' },
];

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

export const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function resolveReportPeriod(period, custom) {
  const now = new Date();
  switch (period) {
    case 'yesterday': {
      const y = new Date(now); y.setDate(now.getDate() - 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    // Rolling windows, inclusive of today: "7D" is the last seven days of
    // trade, not the seven days before today.
    case 'last_7':
    case 'last_14':
    case 'last_30': {
      const days = Number(period.slice(5));
      const start = new Date(now);
      start.setDate(now.getDate() - (days - 1));
      return { from: startOfDay(start), to: endOfDay(now) };
    }
    case 'this_month':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfDay(now) };
    case 'last_month':
      return {
        from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        to: endOfDay(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    case 'custom': {
      if (!custom?.from || !custom?.to) return { from: startOfDay(now), to: endOfDay(now) };
      const a = new Date(`${custom.from}T00:00:00`);
      const b = new Date(`${custom.to}T00:00:00`);
      return a <= b
        ? { from: startOfDay(a), to: endOfDay(b) }
        : { from: startOfDay(b), to: endOfDay(a) };
    }
    default:
      return { from: startOfDay(now), to: endOfDay(now) };
  }
}

/** Shared period state, so every report screen behaves the same way. */
export function useReportPeriod(initial = 'today') {
  const [period, setPeriod] = useState(initial);
  const [customRange, setCustomRange] = useState(() => {
    const t = new Date();
    const weekAgo = new Date(t);
    weekAgo.setDate(t.getDate() - 6);
    return { from: isoDay(weekAgo), to: isoDay(t) };
  });

  const range = useMemo(
    () => resolveReportPeriod(period, customRange),
    [period, customRange],
  );

  return { period, setPeriod, customRange, setCustomRange, range };
}

const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Every completed sale in the period, with its lines — the raw material every
 * sales report here is built from. Fetched once and reshaped, rather than one
 * query per report, so the totals cannot drift between screens.
 */
export function useSalesData(range) {
  const [sessions, setSessions] = useState([]);
  const [bills, setBills] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fromIso = range.from.toISOString();
  const toIso = range.to.toISOString();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: sess, error: sErr } = await supabase
        .from('customer_sessions')
        .select(`
          id, customer_name, ended_at, session_status,
          restaurant_tables ( table_number ),
          orders (
            id, subtotal, tax, total, created_at, order_status,
            order_items (
              id, quantity, item_price, total_price, menu_item_id, is_cancelled,
              menu_items ( item_name, category_id )
            )
          )
        `)
        .eq('session_status', 'completed')
        .gte('ended_at', fromIso)
        .lte('ended_at', toIso)
        .order('ended_at', { ascending: false });
      if (sErr) throw sErr;

      const ids = (sess || []).map((s) => s.id);

      // Payment mode lives on the bill, not the order.
      let billRows = [];
      if (ids.length > 0) {
        const { data: b, error: bErr } = await supabase
          .from('bills')
          .select('id, session_id, order_id, grand_total, subtotal, gst_amount, service_charge, discount_type, discount_amount, payment_method, payment_status, paid_at')
          .in('session_id', ids);
        if (bErr) throw bErr;
        billRows = b || [];
      }

      const { data: cats } = await supabase
        .from('menu_categories').select('id, category_name');

      setSessions(sess || []);
      setBills(billRows);
      setCategories(cats || []);
      setError(null);
    } catch (err) {
      console.error('Error loading sales reports:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [fromIso, toIso]);

  useEffect(() => { load(); }, [load]);

  /** Every live order line in the period, flattened. */
  const lines = useMemo(() => {
    const out = [];
    sessions.forEach((s) => {
      (s.orders || []).forEach((o) => {
        if (o.order_status === 'cancelled') return;
        (o.order_items || []).forEach((oi) => {
          // A cancelled line was never sold, so it earns nothing here.
          if (oi.is_cancelled) return;
          out.push({
            sessionId: s.id,
            orderId: o.id,
            at: o.created_at || s.ended_at,
            dish: oi.menu_items?.item_name || '(deleted dish)',
            menuItemId: oi.menu_item_id,
            categoryId: oi.menu_items?.category_id || null,
            qty: Number(oi.quantity) || 0,
            amount: money(oi.total_price ?? (oi.item_price * oi.quantity)),
          });
        });
      });
    });
    return out;
  }, [sessions]);

  const summary = useMemo(() => {
    const orders = sessions.reduce((n, s) => n + (s.orders || []).length, 0);
    const gross = sessions.reduce((sum, s) =>
      sum + (s.orders || []).reduce((t, o) => t + (Number(o.total) || 0), 0), 0);
    const tax = sessions.reduce((sum, s) =>
      sum + (s.orders || []).reduce((t, o) => t + (Number(o.tax) || 0), 0), 0);
    const qty = lines.reduce((n, l) => n + l.qty, 0);
    return {
      bills: sessions.length,
      orders,
      gross: money(gross),
      tax: money(tax),
      net: money(gross - tax),
      qty,
      avg: sessions.length ? money(gross / sessions.length) : 0,
    };
  }, [sessions, lines]);

  return { sessions, bills, categories, lines, summary, loading, error, refresh: load };
}
