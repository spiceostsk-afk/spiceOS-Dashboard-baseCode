import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import * as db from '../lib/db';
import { kotTicketHtml, printTicket } from '../lib/kot';
import { dayOpens, dayCloses, tradingToday } from '../lib/businessDay';

const FORMAT_CURRENCY = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', minimumFractionDigits: 2,
});

const STATUS_FILTERS = ['all', 'completed', 'void'];

const isoDay = (d) => {
  const t = new Date(d);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};

// Ranges run on the restaurant's trading days (lib/businessDay.js), so a
// bill settled at 1am sits with the night it belongs to.
function getDateRange(range, custom) {
  const now = new Date();
  const today = tradingToday();
  if (range === 'today') return { start: dayOpens(today), end: now };
  if (range === 'week') {
    const dayOfWeek = today.getDay();
    return { start: dayOpens(new Date(today.getFullYear(), today.getMonth(), today.getDate() - dayOfWeek)), end: now };
  }
  if (range === 'month') return { start: dayOpens(new Date(today.getFullYear(), today.getMonth(), 1)), end: now };
  if (range === 'custom') {
    if (!custom?.from || !custom?.to) return { start: new Date(0), end: now };
    const a = new Date(`${custom.from}T00:00:00`);
    const b = new Date(`${custom.to}T00:00:00`);
    // Dates picked back to front are a slip, not an empty result — swap them
    // rather than showing the till operator a blank screen.
    return a <= b
      ? { start: dayOpens(a), end: dayCloses(b) }
      : { start: dayOpens(b), end: dayCloses(a) };
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
    const today = tradingToday();
    const weekAgo = new Date(today);
    weekAgo.setDate(today.getDate() - 6);
    return { from: isoDay(weekAgo), to: isoDay(today) };
  });
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [kotOrder] = useState(null);

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
        const ordersTotal = orderList.reduce((sum, o) => sum + Number(o.total || 0), 0);
        const bill = billBySession.get(s.id);
        // What the customer paid is the bill: after discount, service charge
        // and tax. The orders' own totals are before any discount, so a bill
        // taken at 100% off still read as the full amount here. Only a table
        // with no bill row falls back to them.
        const totalAmount = bill && bill.grand_total !== null && bill.grand_total !== undefined
          ? Number(bill.grand_total)
          : ordersTotal;
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
          discountAmount: Math.max(0, ordersTotal - totalAmount),
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

  // The same kitchen ticket Billing prints, reprinted for the whole table.
  // It used to be its own copy with a placeholder restaurant name and
  // address, and prices a kitchen ticket should never carry.
  const handlePrintKot = useCallback((order) => {
    const items = (order.orders || [])
      .filter((o) => o.order_status !== 'cancelled')
      .flatMap((o) => (o.order_items || []).map((oi) => ({
        qty: oi.quantity,
        name: oi.menu_items?.item_name || 'Item',
      })));
    printTicket(kotTicketHtml({
      tableNumber: order.tableNumber,
      billId: order.billId,
      guests: order.guests,
      items,
      subtitle: 'REPRINT — full table',
    }));
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
