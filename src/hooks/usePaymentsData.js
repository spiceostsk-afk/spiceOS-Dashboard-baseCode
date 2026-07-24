import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const FORMAT_CURRENCY = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', minimumFractionDigits: 2,
});

function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function calcSummary(payments) {
  if (!payments || payments.length === 0) {
    return { totalCollections: 0, count: 0, average: 0 };
  }
  const totalCollections = payments.reduce((sum, p) => sum + (p.total_amount || 0), 0);
  const count = payments.length;
  return { totalCollections, count, average: count > 0 ? totalCollections / count : 0 };
}

function filterByDateRange(payments, range) {
  if (!payments || range === 'all') return payments;
  const now = new Date();
  let start;
  if (range === 'today') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (range === 'week') {
    const dayOfWeek = now.getDay();
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
  } else if (range === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else {
    return payments;
  }
  const startTs = start.getTime();
  return payments.filter((p) => {
    const ended = p.ended_at ? new Date(p.ended_at).getTime() : 0;
    return ended >= startTs;
  });
}

export function usePaymentsData() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState('today');
  const [selectedPayment, setSelectedPayment] = useState(null);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from('customer_sessions')
        .select(`
          id, customer_name, guest_count, started_at, ended_at, session_status, table_id,
          restaurant_tables(table_number)
        `)
        .eq('session_status', 'completed')
        .order('ended_at', { ascending: false })
        .limit(200);

      if (queryError) throw queryError;

      const enriched = (data || []).map((session) => ({
        ...session,
        total_amount: 0,
        order_count: 0,
        table_number: session.restaurant_tables?.table_number || '—',
      }));

      if (enriched.length > 0) {
        const sessionIds = enriched.map((s) => s.id);
        try {
          const { data: ordersData } = await supabase
            .from('orders')
            .select('session_id, total')
            .in('session_id', sessionIds);
          const orderMap = {};
          for (const o of ordersData || []) {
            if (!orderMap[o.session_id]) orderMap[o.session_id] = [];
            orderMap[o.session_id].push(o);
          }
          for (const payment of enriched) {
            const orders = orderMap[payment.id] || [];
            payment.total_amount = orders.reduce((sum, o) => sum + Number(o.total || 0), 0);
            payment.order_count = orders.length;
          }
        } catch {
          // totals stay 0
        }
      }

      setPayments(enriched);
    } catch (err) {
      setError(err.message || 'Failed to load payments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const filteredPayments = filterByDateRange(payments, dateRange);
  const summary = calcSummary(filteredPayments);

  return {
    payments: filteredPayments,
    allPayments: payments,
    loading,
    error,
    dateRange,
    setDateRange,
    selectedPayment,
    setSelectedPayment,
    summary,
    refetch: fetchPayments,
    formatCurrency: (v) => FORMAT_CURRENCY.format(v || 0),
  };
}
