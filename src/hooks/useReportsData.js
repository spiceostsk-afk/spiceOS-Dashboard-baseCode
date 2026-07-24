import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import * as db from '../lib/db';

const FORMAT_CURRENCY = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', minimumFractionDigits: 2,
});

function getPeriodRange(period) {
  const now = new Date();
  let start;
  if (period === 'today') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (period === 'week') {
    const dayOfWeek = now.getDay();
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
  } else if (period === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else {
    start = new Date(0);
  }
  return { start, end: now };
}

/**
 * @param {Array} sessions
 * @param {Array} orders
 */
function computeSummary(sessions, orders) {
  if (!sessions || sessions.length === 0) {
    return { totalSales: 0, totalOrders: 0, avgOrderValue: 0, taxCollected: 0 };
  }
  const orderIds = new Set();
  let totalSales = 0;
  let taxCollected = 0;
  let orderCount = 0;

  for (const o of orders || []) {
    if (orderIds.has(o.id)) continue;
    orderIds.add(o.id);
    totalSales += Number(o.total || 0);
    taxCollected += Number(o.tax || 0);
    orderCount++;
  }

  return {
    totalSales,
    totalOrders: orderCount,
    avgOrderValue: orderCount > 0 ? totalSales / orderCount : 0,
    taxCollected,
  };
}

/**
 * @param {Array} orders
 */
function buildDailyBreakdown(orders, period) {
  const daysMap = {};
  const { start, end } = getPeriodRange(period);
  const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  const maxDays = Math.min(diffDays, 31);

  for (let i = 0; i < maxDays; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    daysMap[key] = { label: d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' }), total: 0 };
  }

  for (const o of orders || []) {
    if (!o.created_at) continue;
    const key = o.created_at.slice(0, 10);
    if (daysMap[key]) {
      daysMap[key].total += Number(o.total || 0);
    }
  }

  return Object.keys(daysMap).map((key) => ({
    key,
    label: daysMap[key].label,
    total: daysMap[key].total,
  }));
}

function buildTopItems(orders) {
  const itemMap = {};
  for (const o of orders || []) {
    for (const item of o.order_items || []) {
      const name = item.menu_items?.item_name || 'Unknown Item';
      if (!itemMap[name]) itemMap[name] = { qty: 0, revenue: 0 };
      itemMap[name].qty += item.quantity || 0;
      itemMap[name].revenue += Number(item.total_price || item.item_price * item.quantity || 0);
    }
  }
  return Object.entries(itemMap)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 10);
}

export function useReportsData() {
  const [period, setPeriod] = useState('today');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState({ totalSales: 0, totalOrders: 0, avgOrderValue: 0, taxCollected: 0 });
  const [topItems, setTopItems] = useState([]);
  const [dailyBreakdown, setDailyBreakdown] = useState([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { start, end } = getPeriodRange(period);
      const startStr = start.toISOString();
      const endStr = end.toISOString();

      const { data: sessions, error: sessionsError } = await supabase
        .from('customer_sessions')
        .select('id, ended_at')
        .eq('session_status', 'completed')
        .gte('ended_at', startStr)
        .lte('ended_at', endStr)
        .order('ended_at', { ascending: false });

      if (sessionsError) throw sessionsError;

      let sessionsList = sessions || [];
      let allOrders = [];

      if (sessionsList.length > 0) {
        const sessionIds = sessionsList.map((s) => s.id);
        const { data: ordersData, error: ordersError } = await supabase
          .from('orders')
          .select(`
            id, total, tax, subtotal, created_at,
            order_items(
              quantity, item_price, total_price,
              menu_items(item_name)
            )
          `)
          .in('session_id', sessionIds);

        if (ordersError) throw ordersError;
        allOrders = ordersData || [];
      }

      setSummary(computeSummary(sessionsList, allOrders));
      setTopItems(buildTopItems(allOrders));
      setDailyBreakdown(buildDailyBreakdown(allOrders, period));
    } catch (err) {
      setError(err.message || 'Failed to load report data');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    summary,
    topItems,
    dailyBreakdown,
    loading,
    error,
    period,
    setPeriod,
    refetch: fetchData,
    formatCurrency: (v) => FORMAT_CURRENCY.format(v || 0),
  };
}
