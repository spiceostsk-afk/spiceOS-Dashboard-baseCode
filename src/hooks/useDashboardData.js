import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const TODAY_START = new Date();
TODAY_START.setHours(0, 0, 0, 0);

const STATUS_FILTERS = {
  active: 'active',
  occupied: 'occupied',
  delivered: 'delivered',
  cancelled: 'cancelled',
};

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

function calcTodayOrders(orders, todayStr) {
  if (!orders || orders.length === 0) return 0;
  return orders.filter((o) => {
    if (!o.created_at) return false;
    return o.created_at.startsWith(todayStr);
  }).length;
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

function buildDailyTrend(orders, days = 7) {
  if (!orders || orders.length === 0) return [];

  const daysMap = {};
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    daysMap[key] = { label: d.toLocaleDateString('en-US', { weekday: 'short' }), total: 0 };
  }

  orders.forEach((o) => {
    if (!o.created_at) return;
    const key = o.created_at.slice(0, 10);
    if (daysMap[key]) {
      daysMap[key].total += Number(o.total || 0);
    }
  });

  return Object.keys(daysMap).map((key) => ({
    key,
    label: daysMap[key].label,
    total: daysMap[key].total,
  }));
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
  return orders.filter((o) => {
    const s = o.order_status || '';
    return s !== STATUS_FILTERS.delivered && s !== STATUS_FILTERS.cancelled;
  });
}

export function useDashboardData() {
  const [state, setState] = useState({
    stats: {
      totalSales: 0,
      netSales: 0,
      todayOrders: 0,
      activeTables: 0,
      occupiedTables: 0,
      customerCount: 0,
      averageOrderValue: 0,
      totalOrders: 0,
    },
    sectionRevenue: [],
    dailyTrend: [],
    recentOrders: [],
    liveOrders: [],
    loading: true,
    error: null,
  });

  const fetchData = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    const todayStr = TODAY_START.toISOString().slice(0, 10);

    try {
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
        `);

      if (ordersError) throw ordersError;

      const { count: activeSessions } = await supabase
        .from('customer_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('session_status', STATUS_FILTERS.active);

      const { count: occupiedCount } = await supabase
        .from('restaurant_tables')
        .select('*', { count: 'exact', head: true })
        .eq('status', STATUS_FILTERS.occupied);

      const { count: todayCustomers } = await supabase
        .from('customer_sessions')
        .select('*', { count: 'exact', head: true })
        .gte('started_at', todayStr);

      const { totalSales, netSales, orderCount } = parseOrders(orders);
      const todayOrders = calcTodayOrders(orders, todayStr);
      const averageOrderValue = calcAov(totalSales, orderCount);

      setState({
        stats: {
          totalSales,
          netSales,
          todayOrders,
          activeTables: activeSessions || 0,
          occupiedTables: occupiedCount || 0,
          customerCount: todayCustomers || 0,
          averageOrderValue,
          totalOrders: orderCount,
        },
        sectionRevenue: buildSectionRevenue(orders),
        dailyTrend: buildDailyTrend(orders),
        recentOrders: buildRecentOrders(orders),
        liveOrders: buildLiveOrders(orders),
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
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { ...state, refresh: fetchData };
}
