import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { fmtDayShort } from '../lib/dates';

const TODAY_START = new Date();
TODAY_START.setHours(0, 0, 0, 0);

const STATUS_FILTERS = {
  active: 'active',
  occupied: 'occupied',
  cancelled: 'cancelled',
};

/**
 * An order is finished when it is completed or cancelled.
 *
 * This used to test for 'delivered', which the schema does not allow, so it
 * matched nothing and every paid order stayed "live". Together with settling
 * not closing its orders, a table that had been paid and cleared still
 * reported itself open and unbilled on the dashboard, for ever.
 */
const FINISHED_ORDER_STATUSES = ['completed', 'cancelled'];

/**
 * The periods the dashboard can report on.
 *
 * Boundaries are LOCAL, not UTC: "today" has to mean the trading day the
 * restaurant is actually in, or a sale at 11pm IST lands on tomorrow's figures.
 * Each range is converted to an instant only at the point of querying.
 */

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

/** Returns { from, to } as Date objects covering the whole period. */
export function resolvePeriod(period, custom) {
  const now = new Date();

  switch (period) {
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(now.getDate() - 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case 'this_month':
      return {
        from: new Date(now.getFullYear(), now.getMonth(), 1),
        to: endOfDay(now),
      };
    case 'last_month': {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      // Day 0 of this month is the last day of the previous one.
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: first, to: endOfDay(last) };
    }
    case 'custom': {
      if (!custom?.from || !custom?.to) return { from: startOfDay(now), to: endOfDay(now) };
      const from = new Date(`${custom.from}T00:00:00`);
      const to = new Date(`${custom.to}T00:00:00`);
      // A backwards range is a typo, not an empty period — read it either way.
      return from <= to
        ? { from: startOfDay(from), to: endOfDay(to) }
        : { from: startOfDay(to), to: endOfDay(from) };
    }
    case 'today':
    default:
      return { from: startOfDay(now), to: endOfDay(now) };
  }
}

/** How many days the range spans, so the chart can pick a sensible grouping. */
const daysInRange = (from, to) =>
  Math.max(1, Math.round((to - from) / 86400000) + 1);

function parseOrders(orders) {
  if (!orders || orders.length === 0) return { totalSales: 0, netSales: 0, orderCount: 0 };

  let totalSales = 0;
  let netSales = 0;

  orders.forEach((o) => {
    totalSales += Number(o.total || 0);
    netSales += Number(o.subtotal || 0);
  });

  return { totalSales, netSales, orderCount: orders.length };
}


function calcAov(totalSales, orderCount) {
  if (orderCount === 0) return 0;
  return totalSales / orderCount;
}

function buildSectionRevenue(orders) {
  if (!orders || orders.length === 0) {
    return [];
  }

  const sectionsMap = {};
  orders.forEach((o) => {
    const secName =
      o.restaurant_tables?.restaurant_sections?.section_name || 'Dine-In Main';
    sectionsMap[secName] = (sectionsMap[secName] || 0) + Number(o.total || 0);
  });

  return Object.keys(sectionsMap).map((name) => ({
    name,
    value: sectionsMap[name],
  }));
}

/**
 * One bar per day across the selected range.
 *
 * A long range is capped at the last 31 days of it — sixty bars two pixels
 * wide tell nobody anything, and the range total is already on the card above.
 */
function buildDailyTrend(orders, from, to) {
  const span = daysInRange(from, to);
  const days = Math.min(span, 31);

  const daysMap = {};
  const last = new Date(to);
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(last);
    d.setDate(last.getDate() - i);
    const key = localKey(d);
    daysMap[key] = {
      // A short window names the weekday, which is what a manager compares.
      // Anything longer gets DD/MM — thirty full dates side by side are noise.
      label: span <= 8
        ? d.toLocaleDateString('en-GB', { weekday: 'short' })
        : fmtDayShort(d),
      total: 0,
    };
  }

  (orders || []).forEach((o) => {
    if (!o.created_at) return;
    const key = localKey(new Date(o.created_at));
    if (daysMap[key]) daysMap[key].total += Number(o.total || 0);
  });

  return Object.entries(daysMap).map(([key, v]) => ({ key, ...v }));
}

/**
 * How the period's money arrived, mode by mode.
 *
 * Read off the bills rather than the orders, because the payment mode lives on
 * the bill. Zomato and Swiggy sit here beside cash and card for the same reason
 * the till does it that way: the aggregator settles the bill on the guest's
 * behalf, so it is a mode of payment, not a separate kind of sale.
 */
const CHANNEL_LABELS = {
  cash: 'Cash', card: 'Card', upi: 'UPI', qr: 'UPI',
  zomato: 'Zomato', swiggy: 'Swiggy',
  home_delivery: 'Home delivery', other: 'Other',
};

/** The order the client reads them in, so the row never moves under them. */
const CHANNEL_ORDER = ['Zomato', 'Swiggy', 'Cash', 'UPI', 'Card', 'Home delivery', 'Other'];

export function buildChannelSplit(bills) {
  const byMode = new Map();
  let paidTotal = 0;

  (bills || []).forEach((b) => {
    if (b.payment_status !== 'paid') return;
    const label = CHANNEL_LABELS[String(b.payment_method || 'other').toLowerCase()] || 'Other';
    if (!byMode.has(label)) byMode.set(label, { label, bills: 0, amount: 0 });
    const row = byMode.get(label);
    row.bills += 1;
    row.amount += Number(b.grand_total) || 0;
    paidTotal += Number(b.grand_total) || 0;
  });

  const rows = [...byMode.values()]
    .map((r) => ({
      ...r,
      amount: Math.round(r.amount * 100) / 100,
      share: paidTotal ? Math.round((r.amount / paidTotal) * 1000) / 10 : 0,
    }))
    .sort((a, b) => {
      const ia = CHANNEL_ORDER.indexOf(a.label);
      const ib = CHANNEL_ORDER.indexOf(b.label);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

  return { rows, paidTotal: Math.round(paidTotal * 100) / 100 };
}

/** What actually sold in the period, biggest earner first. */
export function buildItemSplit(orderItems) {
  const byItem = new Map();
  let total = 0;

  (orderItems || []).forEach((oi) => {
    if (oi.is_cancelled) return;
    const name = oi.menu_items?.item_name || '(deleted dish)';
    const category = oi.menu_items?.menu_categories?.category_name || 'Uncategorised';
    const amount = Number(oi.total_price ?? (Number(oi.item_price || 0) * Number(oi.quantity || 0))) || 0;
    const key = `${name}||${category}`;
    if (!byItem.has(key)) byItem.set(key, { key, name, category, qty: 0, amount: 0 });
    const row = byItem.get(key);
    row.qty += Number(oi.quantity) || 0;
    row.amount += amount;
    total += amount;
  });

  const rows = [...byItem.values()]
    .map((r) => ({
      ...r,
      amount: Math.round(r.amount * 100) / 100,
      share: total ? Math.round((r.amount / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  return { rows, total: Math.round(total * 100) / 100 };
}

function buildRecentOrders(orders, limit = 5) {
  if (!orders || orders.length === 0) return [];
  return orders
    .filter((o) => o.id)
    .slice(0, limit)
    .map((o) => ({
      id: o.id,
      total: o.total || 0,
      status: o.order_status || 'pending',
      createdAt: o.created_at || null,
      tableNumber: o.restaurant_tables?.table_number || null,
    }));
}

function buildLiveOrders(orders) {
  if (!orders || orders.length === 0) return [];
  return orders.filter((o) => !FINISHED_ORDER_STATUSES.includes(o.order_status || ''));
}

/** yyyy-mm-dd in LOCAL time — `toISOString` would group by the UTC day. */
function localKey(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const STALE_ORDER_MINUTES = 45;

const FORMAT_INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

function minutesOpen(createdAt) {
  if (!createdAt) return null;
  const diff = (Date.now() - new Date(createdAt).getTime()) / 60000;
  return Number.isFinite(diff) ? Math.max(0, Math.round(diff)) : null;
}

/**
 * Things a manager should look at right now, newest problem first. Derived from
 * the orders already in hand — no extra round trip.
 */
function buildAlerts(orders, todayStr) {
  if (!orders || orders.length === 0) return [];
  const alerts = [];

  const stale = buildLiveOrders(orders)
    .map((o) => ({ order: o, min: minutesOpen(o.created_at) }))
    .filter((x) => x.min !== null && x.min > STALE_ORDER_MINUTES)
    .sort((a, b) => b.min - a.min);

  stale.slice(0, 2).forEach(({ order, min }) => {
    const table = order.restaurant_tables?.table_number;
    alerts.push({
      id: `stale-${table || 'x'}-${min}`,
      severity: 'warning',
      glyph: '⏱',
      title: table ? `Table ${table} open for ${min} minutes` : `An order has been open for ${min} minutes`,
      detail: `${FORMAT_INR.format(order.total || 0)} unbilled`,
      to: '/billing',
    });
  });

  const voided = orders.filter(
    (o) => o.order_status === STATUS_FILTERS.cancelled && (o.created_at || '').startsWith(todayStr),
  );

  if (voided.length > 0) {
    const amount = voided.reduce((sum, o) => sum + Number(o.total || 0), 0);
    alerts.push({
      id: 'voided',
      severity: 'danger',
      glyph: '✕',
      title: `${voided.length} voided order${voided.length === 1 ? '' : 's'} today · ${FORMAT_INR.format(amount)}`,
      detail: 'Review them in order history',
      to: '/orders',
    });
  }

  return alerts;
}

export function useDashboardData() {
  // The period every historical figure on this screen reports on. Live counts
  // (active tables, stuck orders) deliberately ignore it — they are about the
  // floor right now, not about a date range.
  const [period, setPeriod] = useState('today');
  const [customRange, setCustomRange] = useState(() => {
    const t = new Date();
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const weekAgo = new Date(t);
    weekAgo.setDate(t.getDate() - 6);
    return { from: iso(weekAgo), to: iso(t) };
  });

  const [state, setState] = useState({
    stats: {
      totalSales: 0,
      netSales: 0,
      periodOrders: 0,
      activeTables: 0,
      occupiedTables: 0,
      customerCount: 0,
      averageOrderValue: 0,
      totalOrders: 0,
    },
    sectionRevenue: [],
    channelSplit: { rows: [], paidTotal: 0 },
    itemSplit: { rows: [], total: 0 },
    dailyTrend: [],
    recentOrders: [],
    liveOrders: [],
    alerts: [],
    loading: true,
    error: null,
  });

  const fetchData = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    const todayStr = TODAY_START.toISOString().slice(0, 10);

    try {
      const { from, to } = resolvePeriod(period, customRange);

      // Filtered in the database, not after fetching. Pulling every order ever
      // placed and discarding most of them worked while there were seven of
      // them; it will not at seven thousand.
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select(`
          total,
          subtotal,
          order_status,
          created_at,
          table_id,
          restaurant_tables(
            table_number,
            restaurant_sections(section_name)
          )
        `)
        .gte('created_at', from.toISOString())
        .lte('created_at', to.toISOString());

      if (ordersError) throw ordersError;

      // Anything still open belongs to the floor, whatever period is selected —
      // a table stuck since yesterday is still stuck while you look at
      // last month.
      const { data: liveOrderRows, error: liveError } = await supabase
        .from('orders')
        .select(`
          id, total, order_status, created_at, table_id,
          restaurant_tables ( table_number )
        `)
        .not('order_status', 'in', '("completed","cancelled")');

      if (liveError) throw liveError;

      const { count: activeSessions } = await supabase
        .from('customer_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('session_status', STATUS_FILTERS.active);

      const { count: occupiedCount } = await supabase
        .from('restaurant_tables')
        .select('*', { count: 'exact', head: true })
        .eq('status', STATUS_FILTERS.occupied);

      // The payment-mode split. Filtered on paid_at rather than created_at: a
      // bill raised before midnight and settled after belongs to the day the
      // money actually landed.
      const { data: periodBills, error: billsError } = await supabase
        .from('bills')
        .select('grand_total, payment_method, payment_status, paid_at')
        .eq('payment_status', 'paid')
        .gte('paid_at', from.toISOString())
        .lte('paid_at', to.toISOString());

      if (billsError) throw billsError;

      // The item-wise split. Reached through the order rather than filtered on
      // the line's own timestamp, so a line added late still counts against the
      // order it belongs to.
      const { data: periodItems, error: itemsError } = await supabase
        .from('order_items')
        .select(`
          quantity, item_price, total_price, is_cancelled,
          menu_items ( item_name, menu_categories ( category_name ) ),
          orders!inner ( created_at, order_status )
        `)
        .gte('orders.created_at', from.toISOString())
        .lte('orders.created_at', to.toISOString())
        .neq('orders.order_status', 'cancelled');

      if (itemsError) throw itemsError;

      const { count: periodCustomers } = await supabase
        .from('customer_sessions')
        .select('*', { count: 'exact', head: true })
        .gte('started_at', from.toISOString())
        .lte('started_at', to.toISOString());

      const { totalSales, netSales, orderCount } = parseOrders(orders);
      const averageOrderValue = calcAov(totalSales, orderCount);

      setState({
        stats: {
          totalSales,
          netSales,
          // Orders within the selected period, not a fixed "today".
          periodOrders: orderCount,
          activeTables: activeSessions || 0,
          occupiedTables: occupiedCount || 0,
          customerCount: periodCustomers || 0,
          averageOrderValue,
          totalOrders: orderCount,
        },
        sectionRevenue: buildSectionRevenue(orders),
        channelSplit: buildChannelSplit(periodBills),
        itemSplit: buildItemSplit(periodItems),
        dailyTrend: buildDailyTrend(orders, from, to),
        recentOrders: buildRecentOrders(orders),
        liveOrders: buildLiveOrders(liveOrderRows),
        alerts: buildAlerts(liveOrderRows, todayStr),
        range: { from, to },
        loading: false,
        error: null,
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err.message || 'Failed to load dashboard data',
      }));
    }
  }, [period, customRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    ...state,
    refresh: fetchData,
    period,
    setPeriod,
    customRange,
    setCustomRange,
  };
}
