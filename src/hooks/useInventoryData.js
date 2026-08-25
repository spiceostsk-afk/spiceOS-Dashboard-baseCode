import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Inventory data source, backed by `inventory_items` + `stock_movements`
 * (see db/migrate_recipes_inventory.sql).
 *
 * This used to be a localStorage shim. It had to move server-side for recipes
 * to work: a dish ordered on a diner's phone deducts its ingredients through a
 * database trigger, and that can only touch stock that actually lives in the
 * database. The view's contract is unchanged.
 */

const nowLabel = (iso) =>
  new Date(iso || Date.now()).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });

/** Trim the float dust that repeated 0.5-step arithmetic leaves behind. */
const round = (n) => Math.round(Number(n || 0) * 1000) / 1000;

const mapItem = (row) => ({
  id: row.id,
  name: row.item_name,
  category: row.category || 'Uncategorised',
  stock: round(row.stock),
  unit: row.unit || 'units',
  reorderAt: round(row.reorder_at),
  updatedAt: nowLabel(row.updated_at),
});

const mapMovement = (row) => ({
  id: row.id,
  item: row.item_name || 'Item',
  delta: round(row.delta),
  reason: row.reason,
  at: nowLabel(row.created_at),
});

export function useInventoryData() {
  const [items, setItems] = useState([]);
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [itemsRes, logRes] = await Promise.all([
        supabase
          .from('inventory_items')
          .select('*')
          .eq('is_active', true)
          .order('item_name'),
        supabase
          .from('stock_movements')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200),
      ]);

      if (itemsRes.error) throw itemsRes.error;
      if (logRes.error) throw logRes.error;

      setItems((itemsRes.data || []).map(mapItem));
      setLog((logRes.data || []).map(mapMovement));
      setError(null);
    } catch (err) {
      console.error('Error loading inventory:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /** Movements the app makes itself; the order trigger logs its own. */
  const logMovement = useCallback(async (item, delta, reason, balanceAfter) => {
    await supabase.from('stock_movements').insert([{
      inventory_item_id: item.id,
      item_name: item.name ?? item.item_name,
      delta,
      balance_after: balanceAfter,
      reason,
    }]);
  }, []);

  const addItem = useCallback(async (draft) => {
    const name = (draft.name || '').trim();
    if (!name) return { success: false, error: 'An item name is required.' };

    const opening = Number(draft.stock) || 0;

    const { data, error: insertError } = await supabase
      .from('inventory_items')
      .insert([{
        item_name: name,
        category: (draft.category || '').trim() || 'Uncategorised',
        unit: (draft.unit || '').trim() || 'units',
        stock: opening,
        reorder_at: Number(draft.reorderAt) || 0,
      }])
      .select()
      .single();

    if (insertError) {
      const duplicate = insertError.code === '23505';
      return {
        success: false,
        error: duplicate ? `"${name}" is already in your inventory.` : insertError.message,
      };
    }

    await logMovement(mapItem(data), opening, 'Item added', opening);
    await refresh();
    return { success: true };
  }, [logMovement, refresh]);

  /** delta is signed: -1 consumes a unit, +1 receives one. */
  const adjust = useCallback(async (id, delta) => {
    const target = items.find((i) => i.id === id);
    if (!target) return { success: false, error: 'Item not found.' };

    // Manual clicks floor at zero — going below is a miscount, not a real
    // event. Recipe depletion is free to go negative; that reflects what the
    // kitchen actually used.
    const nextStock = round(Math.max(0, target.stock + delta));
    if (nextStock === target.stock) return { success: true };

    const { error: updateError } = await supabase
      .from('inventory_items')
      .update({ stock: nextStock })
      .eq('id', id);

    if (updateError) return { success: false, error: updateError.message };

    await logMovement(
      target,
      round(nextStock - target.stock),
      delta > 0 ? 'Stock in' : 'Stock out',
      nextStock,
    );
    await refresh();
    return { success: true };
  }, [items, logMovement, refresh]);

  const removeItem = useCallback(async (id) => {
    const target = items.find((i) => i.id === id);

    // Soft delete: recipes and the movement log still point here, and a hard
    // delete would cascade away the history behind them.
    const { error: updateError } = await supabase
      .from('inventory_items')
      .update({ is_active: false })
      .eq('id', id);

    if (updateError) return { success: false, error: updateError.message };

    if (target) await logMovement(target, 0, 'Item removed', target.stock);
    await refresh();
    return { success: true };
  }, [items, logMovement, refresh]);

  const metrics = items.reduce((acc, item) => {
    acc.tracked += 1;
    if (item.stock <= 0) acc.out += 1;
    else if (item.stock <= item.reorderAt) acc.low += 1;
    return acc;
  }, { tracked: 0, low: 0, out: 0 });

  return {
    items, log, metrics, loading, error,
    refresh, addItem, adjust, removeItem,
    connected: true,
  };
}
