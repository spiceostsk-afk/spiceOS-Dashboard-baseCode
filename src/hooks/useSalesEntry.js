import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useOutlet } from '../context/OutletContext';

/**
 * Entering sales for a day that has already passed.
 *
 * Everything is written by one database function. A sale is not one row: it is
 * a completed session, an order, its items and a paid bill, and Reports starts
 * from the SESSION rather than the order — an order written on its own would
 * move stock and earn nothing. Four tables have to agree on a timestamp, and a
 * half-written sale is worse than none, so the browser asks once and the
 * database does the rest.
 */

const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function useSalesEntry() {
  const { outletId } = useOutlet();

  const [dishes, setDishes] = useState([]);
  const [tables, setTables] = useState([]);
  const [recent, setRecent] = useState([]);
  const [taxPct, setTaxPct] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [dishRes, tableRes, settingRes, recentRes] = await Promise.all([
        supabase
          .from('menu_items')
          .select('id, item_name, price, category_id, is_available')
          .order('item_name'),
        supabase.from('restaurant_tables').select('id, table_number').order('table_number'),
        supabase.from('restaurant_settings').select('value').eq('key', 'tax').maybeSingle(),
        supabase
          .from('orders')
          .select('id, created_at, total, notes, order_items(quantity)')
          .order('created_at', { ascending: false })
          .limit(40),
      ]);

      if (dishRes.error) throw dishRes.error;
      if (tableRes.error) throw tableRes.error;

      setDishes(dishRes.data || []);
      setTables(tableRes.data || []);
      setTaxPct(Number(settingRes?.data?.value?.gstRate) || 0);
      setRecent(recentRes.data || []);
      setError(null);
    } catch (err) {
      console.error('Error loading sales entry data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  /**
   * Record one sale.
   *
   * `at` is a local date and time. It is sent as an ISO instant so the
   * database stamps the session, order, items, bill and every stock movement
   * with the same moment — which is what puts the money and the consumption on
   * the same day.
   */
  const recordSale = useCallback(async ({
    date, time, lines, tableId, customerName, paymentMethod, note,
  }) => {
    const clean = (lines || [])
      .filter((l) => l.menuItemId && Number(l.quantity) > 0)
      .map((l) => ({
        menu_item_id: l.menuItemId,
        quantity: Number(l.quantity),
        price: l.price === '' || l.price === undefined ? null : Number(l.price),
      }));

    if (clean.length === 0) {
      return { success: false, error: 'Add at least one dish with a quantity.' };
    }

    const seen = new Set();
    for (const l of clean) {
      if (seen.has(l.menu_item_id)) {
        return { success: false, error: 'The same dish is listed twice — combine the quantities.' };
      }
      seen.add(l.menu_item_id);
    }

    // Local wall-clock, converted to a real instant by the browser's own zone,
    // which is the restaurant's zone in practice.
    const at = new Date(`${date}T${time || '20:00'}:00`);
    if (Number.isNaN(at.getTime())) {
      return { success: false, error: 'That date and time is not valid.' };
    }
    if (at.getTime() > Date.now()) {
      return { success: false, error: 'That is in the future — pick a day that has already happened.' };
    }

    try {
      const { data, error: rpcError } = await supabase.rpc('record_backdated_sale', {
        p_outlet_id: outletId,
        p_at: at.toISOString(),
        p_lines: clean,
        p_table_id: tableId || null,
        p_customer_name: customerName || 'Walk-in',
        p_tax_pct: taxPct,
        p_payment_method: paymentMethod || 'cash',
        p_note: note || null,
      });
      if (rpcError) throw rpcError;

      await refresh();
      return { success: true, result: data };
    } catch (err) {
      console.error('Error recording sale:', err);
      return { success: false, error: err.message };
    }
  }, [outletId, taxPct, refresh]);

  /** What a set of lines is worth, for the running total on screen. */
  const priceLines = useCallback((lines) => {
    const byId = new Map(dishes.map((d) => [d.id, d]));
    const subtotal = (lines || []).reduce((sum, l) => {
      if (!l.menuItemId || !(Number(l.quantity) > 0)) return sum;
      const unit = l.price === '' || l.price === undefined
        ? Number(byId.get(l.menuItemId)?.price) || 0
        : Number(l.price) || 0;
      return sum + unit * Number(l.quantity);
    }, 0);
    const tax = money(subtotal * taxPct / 100);
    return { subtotal: money(subtotal), tax, total: money(subtotal + tax) };
  }, [dishes, taxPct]);

  return {
    dishes, tables, recent, taxPct, loading, error,
    refresh, recordSale, priceLines,
  };
}
