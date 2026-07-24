import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const FORMAT_CURRENCY = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', minimumFractionDigits: 2,
});

function groupByPhone(sessions) {
  const groups = {};
  for (const s of sessions || []) {
    const key = s.phone_number || `walkin_${s.customer_name || s.id}`;
    if (!groups[key]) {
      groups[key] = { phone: s.phone_number || '', name: s.customer_name || 'Walk-in', visitCount: 0, totalSpent: 0, lastVisit: null, sessions: [] };
    }
    groups[key].visitCount++;
    groups[key].totalSpent += Number(s.total_amount || 0);
    if (!groups[key].lastVisit || (s.ended_at && s.ended_at > groups[key].lastVisit)) {
      groups[key].lastVisit = s.ended_at || s.started_at;
    }
    groups[key].sessions.push(s);
  }
  return Object.values(groups).sort((a, b) => (b.lastVisit || '') > (a.lastVisit || '') ? 1 : -1);
}

export function useCustomersData() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: sessions, error: sessionsError } = await supabase
        .from('customer_sessions')
        .select('id, customer_name, phone_number, guest_count, started_at, ended_at, session_status, table_id')
        .order('started_at', { ascending: false })
        .limit(500);

      if (sessionsError) throw sessionsError;
      const list = sessions || [];

      if (list.length > 0) {
        const sessionIds = list.map((s) => s.id);
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
          for (const s of list) {
            const orders = orderMap[s.id] || [];
            s.total_amount = orders.reduce((sum, o) => sum + Number(o.total || 0), 0);
          }
        } catch {
          // totals stay 0
        }
      }

      setCustomers(groupByPhone(list));
    } catch (err) {
      setError(err.message || 'Failed to load customers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  return {
    customers,
    loading,
    error,
    selectedCustomer,
    setSelectedCustomer,
    refetch: fetchCustomers,
    formatCurrency: (v) => FORMAT_CURRENCY.format(v || 0),
  };
}
