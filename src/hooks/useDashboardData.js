import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { fmtDayShort, fmtWeekday } from '../lib/dates';
import {
  dayOpens, dayCloses, tradingDate, tradingDayKey, tradingToday,
} from '../lib/businessDay';

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
 * Boundaries are the restaurant's TRADING days, not UTC and not midnight:
 * "today" is the day the restaurant is actually in. A day that ends at 3am
 * runs 03:00 to 02:59 the next morning, so a 1am bill is still tonight's,
 * and at 1am "today" is still the evening that began the day before.
 * Each range is converted to an instant only at the point of querying.
 */

const startOfDay = dayOpens;
const endOfDay = dayCloses;

/** Returns { from, to } as Date objects covering the whole period. */
export function resolvePeriod(period, custom) {
  const now = tradingToday();

  switch (period) {
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(now.getDate() - 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case 'this_month':
      return {
        from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: endOfDay(now),
      };
    case 'last_month': {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      // Day 0 of this month is the last day of the previous one.
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: startOfDay(first), to: endOfDay(last) };
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
  // `to` is the closing instant, which falls on the next calendar morning
  // when the day ends after midnight; the day it closes is the one wanted.
  const last = tradingDate(to);
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(last);
    d.setDate(last.getDate() - i);
    const key = localKey(d);
    daysMap[key] = {
      // A short window names the weekday, which is what a manager compares.
      // Anything longer gets DD-Mon — thirty full dates side by side are noise.
      label: span <= 8
        ? fmtWeekday(d)
        : fmtDayShort(d),
      total: 0,
    };
  }

  (orders || []).forEach((o) => {
    // A sale belongs to the day it was settled, the same day Reports files it.
    const at = o.customer_sessions?.ended_at || o.created_at;
    if (!at) return;
    const key = tradingDayKey(at);
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
  home_delivery: 'Home delivery', other: 'Other', complimentary: 'Complimentary',
};

/** The order the client reads them in, so the row never moves under them. */
const CHANNEL_ORDER = ['Zomato', 'Swiggy', 'Cash', 'UPI', 'Card', 'Home delivery', 'Other', 'Complimentary'];

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
function buildAlerts(orders) {
  const todayKey = tradingDayKey(new Date());
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
    (o) => o.order_status === STATUS_FILTERS.cancelled && tradingDayKey(o.created_at) === todayKey,
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
    const t = tradingToday();
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
    refreshing: false,
    error: null,
  });

  // silent: a refresh of the same period keeps the figures on screen while
  // the new ones load, instead of blanking every card. A new period does not —
  // the old period's numbers must never sit under the new period's label.
  const fetchData = useCallback(async ({ silent = false } = {}) => {
    setState((prev) => ({
      ...prev, loading: !silent, refreshing: silent, error: null,
    }));

    try {
      const { from, to } = resolvePeriod(period, customRange);

      const fromIso = from.toISOString();
      const toIso = to.toISOString();

      // None of these depends on another, so they go out together. One after
      // the other they cost eight round trips to the server — seconds, at the
      // till, every time the screen opened or refreshed.
      const [
        recentRes, settledRes, liveRes, activeRes, occupiedRes, billsRes, itemsRes, customersRes,
      ] = await Promise.all([
        // Recent activity shows the latest five orders of the period, so only
        // those five are fetched.
        supabase
          .from('orders')
          .select(`
            id,
            total,
            order_status,
            created_at,
            restaurant_tables ( table_number )
          `)
          .gte('created_at', fromIso)
          .lte('created_at', toIso)
          .order('created_at', { ascending: false })
          .limit(5),

        // What counts as a sale. A KOT is not proof of sale; a settled bill is.
        // Orders on a table still eating, and orders on a table that is voided
        // or abandoned, earn nothing until the bill is settled. Filed under the
        // day it was settled, which is how Reports and Payments already count,
        // so the dashboard and the reports agree.
        supabase
          .from('orders')
          .select(`
            total,
            subtotal,
            restaurant_tables(
              restaurant_sections(section_name)
            ),
            customer_sessions!inner ( session_status, ended_at )
          `)
          .eq('customer_sessions.session_status', 'completed')
          .gte('customer_sessions.ended_at', fromIso)
          .lte('customer_sessions.ended_at', toIso)
          .neq('order_status', 'cancelled'),

        // Anything still open belongs to the floor, whatever period is selected —
        // a table stuck since yesterday is still stuck while you look at
        // last month.
        supabase
          .from('orders')
          .select(`
            id, total, order_status, created_at, table_id,
            restaurant_tables ( table_number )
          `)
          .not('order_status', 'in', '("completed","cancelled")'),

        supabase
          .from('customer_sessions')
          .select('*', { count: 'exact', head: true })
          .eq('session_status', STATUS_FILTERS.active),

        supabase
          .from('restaurant_tables')
          .select('*', { count: 'exact', head: true })
          .eq('status', STATUS_FILTERS.occupied),

        // The payment-mode split. Filtered on paid_at rather than created_at: a
        // bill raised before midnight and settled after belongs to the day the
        // money actually landed.
        supabase
          .from('bills')
          .select('grand_total, payment_method, payment_status, paid_at')
          .eq('payment_status', 'paid')
          .gte('paid_at', fromIso)
          .lte('paid_at', toIso),

        // The item-wise split. Reached through the order and its session rather
        // than filtered on the line's own timestamp, so a line added late still
        // counts against the bill it was settled on — and an unsettled one not at all.
        supabase
          .from('order_items')
          .select(`
            quantity, item_price, total_price, is_cancelled,
            menu_items ( item_name, menu_categories ( category_name ) ),
            orders!inner ( order_status, customer_sessions!inner ( session_status, ended_at ) )
          `)
          .eq('orders.customer_sessions.session_status', 'completed')
          .gte('orders.customer_sessions.ended_at', fromIso)
          .lte('orders.customer_sessions.ended_at', toIso)
          .neq('orders.order_status', 'cancelled'),

        supabase
          .from('customer_sessions')
          .select('*', { count: 'exact', head: true })
          .gte('started_at', fromIso)
          .lte('started_at', toIso),
      ]);

      const failed = [recentRes, settledRes, liveRes, billsRes, itemsRes].find((r) => r.error);
      if (failed) throw failed.error;

      const orders = recentRes.data;
      const settledOrders = settledRes.data;
      const liveOrderRows = liveRes.data;
      const periodBills = billsRes.data;
      const periodItems = itemsRes.data;
      const activeSessions = activeRes.count;
      const occupiedCount = occupiedRes.count;
      const periodCustomers = customersRes.count;

      const { totalSales, netSales, orderCount } = parseOrders(settledOrders);
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
        sectionRevenue: buildSectionRevenue(settledOrders),
        channelSplit: buildChannelSplit(periodBills),
        itemSplit: buildItemSplit(periodItems),
        dailyTrend: buildDailyTrend(settledOrders, from, to),
        recentOrders: buildRecentOrders(orders),
        liveOrders: buildLiveOrders(liveOrderRows),
        alerts: buildAlerts(liveOrderRows),
        range: { from, to },
        loading: false,
        refreshing: false,
        error: null,
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        refreshing: false,
        error: err.message || 'Failed to load dashboard data',
      }));
    }
  }, [period, customRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refresh = useCallback(() => fetchData({ silent: true }), [fetchData]);

  return {
    ...state,
    refresh,
    period,
    setPeriod,
    customRange,
    setCustomRange,
  };
}
