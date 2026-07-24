import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import * as db from '../lib/db';

const FORMAT_CURRENCY = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', minimumFractionDigits: 2,
});

const STATUS_FILTERS = ['all', 'completed', 'void'];

function getDateRange(range) {
  const now = new Date();
  if (range === 'today') return { start: new Date(now.getFullYear(), now.getMonth(), now.getDate()), end: now };
  if (range === 'week') {
    const dayOfWeek = now.getDay();
    return { start: new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek), end: now };
  }
  if (range === 'month') return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now };
  return { start: new Date(0), end: now };
}

export function useOrdersData() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateRange, setDateRange] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [kotOrder, setKotOrder] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { start, end } = getDateRange(dateRange);
      const statuses = statusFilter === 'all' ? ['completed', 'void'] : [statusFilter];

      let query = supabase
        .from('customer_sessions')
        .select(`
          id, customer_name, phone_number, guest_count, session_status,
          started_at, ended_at,
          restaurant_tables(table_number),
          orders(id, subtotal, tax, total, created_at, order_status,
            order_items(id, quantity, item_price, total_price,
              menu_items(item_name)
            )
          )
        `)
        .in('session_status', statuses)
        .gte('ended_at', start.toISOString())
        .lte('ended_at', end.toISOString())
        .order('ended_at', { ascending: false });

      const { data, error: queryError } = await query;
      if (queryError) throw queryError;

      let results = (data || []).map((s) => {
        const orderList = s.orders || [];
        const itemCount = orderList.reduce((sum, o) => sum + (o.order_items?.length || 0), 0);
        const totalAmount = orderList.reduce((sum, o) => sum + Number(o.total || 0), 0);
        return {
          id: s.id,
          billId: s.id?.slice(0, 4).toUpperCase(),
          customerName: s.customer_name || 'Walk-in',
          phone: s.phone_number || '',
          guests: s.guest_count,
          status: s.session_status,
          tableNumber: s.restaurant_tables?.table_number,
          startedAt: s.started_at,
          endedAt: s.ended_at,
          itemCount,
          totalAmount,
          orders: orderList,
        };
      });

      if (search) {
        const q = search.toLowerCase();
        results = results.filter((r) =>
          r.billId.toLowerCase().includes(q) ||
          r.customerName.toLowerCase().includes(q) ||
          String(r.tableNumber || '').includes(q) ||
          r.orders.some((o) => (o.order_items || []).some((oi) =>
            oi.menu_items?.item_name?.toLowerCase().includes(q)
          ))
        );
      }

      setOrders(results);
    } catch (err) {
      setError(err.message || 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [dateRange, statusFilter, search]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePrintKot = useCallback((order) => {
    setKotOrder(order);
    setTimeout(() => {
      const win = window.open('', '_blank');
      if (!win) return;
      win.document.write(`
        <html><head><title>KOT - ${order.billId}</title>
        <style>
          body { font-family: monospace; font-size: 14px; width: 300px; margin: 0 auto; padding: 1rem; }
          h1 { font-size: 18px; text-align: center; margin-bottom: 4px; }
          .sub { text-align: center; font-size: 12px; color: #666; margin-bottom: 1rem; }
          hr { border-top: 1px dashed #333; }
          table { width: 100%; border-collapse: collapse; }
          th { text-align: left; font-size: 11px; text-transform: uppercase; padding: 4px 0; }
          td { padding: 4px 0; font-size: 13px; }
          .right { text-align: right; }
          .total { font-weight: bold; border-top: 1px dashed #333; padding-top: 6px; }
          .footer { text-align: center; font-size: 11px; margin-top: 1rem; color: #666; }
          @media print { body { margin: 0; padding: 0.5rem; } }
        </style>
        </head><body>
        <h1>SPICE OS</h1>
        <div class="sub">123 Downtown St, Metro | Tel: +91 90812 01234</div>
        <hr/>
        <div><strong>KOT:</strong> ${order.billId}</div>
        <div><strong>Table:</strong> T-${order.tableNumber} | <strong>Guest:</strong> ${order.customerName}</div>
        <hr/>
        <table>
          <tr><th>Item</th><th class="right">Qty</th><th class="right">Price</th></tr>
          ${order.orders.map(o => (o.order_items || []).map(oi => `
            <tr>
              <td>${oi.menu_items?.item_name || 'Item'}</td>
              <td class="right">${oi.quantity}</td>
              <td class="right">${FORMAT_CURRENCY.format(oi.total_price || oi.item_price * oi.quantity || 0)}</td>
            </tr>
          `).join('')).join('')}
        </table>
        <hr/>
        <div class="footer">Thank You • Visit Again</div>
        <script>window.print();window.close();</script>
        </body></html>
      `);
      win.document.close();
      setKotOrder(null);
    }, 100);
  }, []);

  return {
    orders,
    loading,
    error,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    dateRange,
    setDateRange,
    selectedOrder,
    setSelectedOrder,
    refetch: fetchData,
    formatCurrency: (v) => FORMAT_CURRENCY.format(v || 0),
    STATUS_FILTERS,
    handlePrintKot,
    kotOrder,
  };
}
