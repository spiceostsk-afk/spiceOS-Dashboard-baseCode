import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import * as db from '../lib/db';

const FORMAT_CURRENCY = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', minimumFractionDigits: 2,
});

const STATUS_FILTERS = ['all', 'completed', 'void'];

const isoDay = (d) => {
  const t = new Date(d);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};

function getDateRange(range, custom) {
  const now = new Date();
  if (range === 'today') return { start: new Date(now.getFullYear(), now.getMonth(), now.getDate()), end: now };
  if (range === 'week') {
    const dayOfWeek = now.getDay();
    return { start: new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek), end: now };
  }
  if (range === 'month') return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now };
  if (range === 'custom') {
    if (!custom?.from || !custom?.to) return { start: new Date(0), end: now };
    const a = new Date(`${custom.from}T00:00:00`);
    const b = new Date(`${custom.to}T23:59:59.999`);
    // Dates picked back to front are a slip, not an empty result — swap them
    // rather than showing the till operator a blank screen.
    return a <= b
      ? { start: a, end: b }
      : { start: new Date(`${custom.to}T00:00:00`), end: new Date(`${custom.from}T23:59:59.999`) };
  }
  return { start: new Date(0), end: now };
}

export function useOrdersData() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateRange, setDateRange] = useState('all');
  const [customRange, setCustomRange] = useState(() => {
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(today.getDate() - 6);
    return { from: isoDay(weekAgo), to: isoDay(today) };
  });
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [kotOrder, setKotOrder] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { start, end } = getDateRange(dateRange, customRange);
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

      // How the money arrived lives on the bill, not the session, so it takes
      // a second query. Fetched by session id in one go rather than per row:
      // a month of history is one round trip either way.
      const sessionIds = (data || []).map((s) => s.id);
      const billBySession = new Map();
      if (sessionIds.length > 0) {
        const { data: billRows, error: billError } = await supabase
          .from('bills')
          .select('session_id, payment_method, payment_status, grand_total, paid_at')
          .in('session_id', sessionIds);
        // A bill that will not load must not blank the whole screen — the
        // history is still readable without knowing the tender.
        if (billError) console.error('Could not load payment modes:', billError);
        (billRows || []).forEach((b) => {
          const prev = billBySession.get(b.session_id);
          // A part payment followed by the rest can leave more than one row.
          // The settled one is the truth about how the table actually paid.
          if (!prev || (b.payment_status === 'paid' && prev.payment_status !== 'paid')) {
            billBySession.set(b.session_id, b);
          }
        });
      }

      let results = (data || []).map((s) => {
        const orderList = s.orders || [];
        const itemCount = orderList.reduce((sum, o) => sum + (o.order_items?.length || 0), 0);
        const totalAmount = orderList.reduce((sum, o) => sum + Number(o.total || 0), 0);
        const bill = billBySession.get(s.id);
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
          // Null rather than a guess. A settled table with no bill row is a
          // real gap worth seeing, not something to paper over with "Cash".
          paymentMethod: bill?.payment_method || null,
          paymentStatus: bill?.payment_status || null,
          orders: orderList,
        };
      });

      if (search) {
        const q = search.toLowerCase();
        results = results.filter((r) =>
          r.billId.toLowerCase().includes(q) ||
          r.customerName.toLowerCase().includes(q) ||
          String(r.tableNumber || '').includes(q) ||
          // So "zomato" or "upi" narrows the list the way a cashier expects.
          (r.paymentMethod || '').toLowerCase().includes(q) ||
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
  }, [dateRange, customRange, statusFilter, search]);

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
    customRange,
    setCustomRange,
    selectedOrder,
    setSelectedOrder,
    refetch: fetchData,
    formatCurrency: (v) => FORMAT_CURRENCY.format(v || 0),
    STATUS_FILTERS,
    handlePrintKot,
    kotOrder,
  };
}
