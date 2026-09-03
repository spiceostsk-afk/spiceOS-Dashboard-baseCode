import { useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

/**
 * Correcting an order that has already been settled.
 *
 * These rewrite money that has been reported and move stock that has been
 * counted, so the owner check lives in the DATABASE — every function refuses a
 * caller who is not an owner of the restaurant. Hiding the buttons is a
 * courtesy to the interface, not a permission; anyone can call an RPC.
 *
 * A reason is required and stored, and every change is written to order_audit
 * with a before and after snapshot, so a figure that changed after the fact
 * can always be explained.
 *
 * Stock follows on its own. order_items carries the recipe trigger, so
 * replacing an order's lines hands the old ingredients back and takes the new
 * ones out — dated to the order, not to today. Nothing here posts a movement
 * by hand.
 */
export function useOrderAdmin(onChanged) {
  const { role, isPlatformAdmin } = useAuth();
  const [busy, setBusy] = useState(false);

  // The rail only offers what this login can actually do. The database is
  // still the thing that decides.
  const canAdminister = role === 'owner' || isPlatformAdmin;

  const run = useCallback(async (fn, args) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc(fn, args);
      if (error) throw error;
      if (onChanged) await onChanged();
      return { success: true, result: data };
    } catch (err) {
      console.error(`${fn} failed:`, err);
      return { success: false, error: err.message };
    } finally {
      setBusy(false);
    }
  }, [onChanged]);

  const voidOrder = useCallback(
    (orderId, reason) => run('admin_void_order', { p_order_id: orderId, p_reason: reason }),
    [run],
  );

  const deleteOrder = useCallback(
    (orderId, reason) => run('admin_delete_order', { p_order_id: orderId, p_reason: reason }),
    [run],
  );

  /** lines: [{ menuItemId, quantity, price }] — replaces the bill entirely. */
  const editOrder = useCallback((orderId, lines, reason) => {
    const clean = (lines || [])
      .filter((l) => l.menuItemId && Number(l.quantity) > 0)
      .map((l) => ({
        menu_item_id: l.menuItemId,
        quantity: Number(l.quantity),
        price: l.price === '' || l.price === undefined ? null : Number(l.price),
      }));

    if (clean.length === 0) {
      return Promise.resolve({
        success: false,
        error: 'An order needs at least one item — void it instead of emptying it.',
      });
    }
    return run('admin_edit_order', {
      p_order_id: orderId, p_lines: clean, p_reason: reason,
    });
  }, [run]);

  return { canAdminister, busy, voidOrder, editOrder, deleteOrder };
}

/** The trail of what was changed after the fact, and why. */
export function useOrderAudit(orderId) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!orderId) { setEntries([]); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('order_audit')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setEntries(data || []);
    } catch (err) {
      console.error('Error loading order audit:', err);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  return { entries, loading, load };
}
