import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useOutlet } from '../context/OutletContext';

/**
 * The reference lists behind everything else in Inventory: units, categories,
 * and the derived opening balance for a date.
 *
 * Units were free text on each material until the phase-2 migration, so "Kg",
 * "kg" and "KG" were three different units and nothing could be totalled
 * across items. They are rows now, and renaming one reaches every material
 * that uses it (a database trigger keeps the denormalised label in step).
 */

const round = (n) => Math.round(Number(n || 0) * 1000) / 1000;

/* ------------------------------------------------------------- Unit master */
export function useUnitMaster() {
  const [units, setUnits] = useState([]);
  const [usage, setUsage] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [unitRes, itemRes] = await Promise.all([
        supabase.from('inventory_units').select('*').order('sort_order').order('symbol'),
        supabase.from('inventory_items').select('unit_id, purchase_unit_id'),
      ]);
      if (unitRes.error) throw unitRes.error;
      if (itemRes.error) throw itemRes.error;

      // How many materials depend on each unit — deleting one that is in use
      // would leave those materials pointing at nothing.
      const counts = {};
      (itemRes.data || []).forEach((i) => {
        [i.unit_id, i.purchase_unit_id].forEach((id) => {
          if (id) counts[id] = (counts[id] || 0) + 1;
        });
      });

      setUnits(unitRes.data || []);
      setUsage(counts);
      setError(null);
    } catch (err) {
      console.error('Error loading units:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const saveUnit = useCallback(async (symbol, extras = {}, id = null) => {
    const sym = (symbol || '').trim();
    if (!sym) return { success: false, error: 'A unit symbol is required.' };

    const payload = { symbol: sym, name: (extras.name || '').trim() || sym };
    const { error: writeError } = id
      ? await supabase.from('inventory_units').update(payload).eq('id', id)
      : await supabase.from('inventory_units').insert([payload]);

    if (writeError) {
      return {
        success: false,
        error: writeError.code === '23505' ? `"${sym}" already exists.` : writeError.message,
      };
    }
    await refresh();
    return { success: true };
  }, [refresh]);

  const deleteUnit = useCallback(async (id) => {
    const { error: delError } = await supabase.from('inventory_units').delete().eq('id', id);
    if (delError) return { success: false, error: delError.message };
    await refresh();
    return { success: true };
  }, [refresh]);

  const toggleUnit = useCallback(async (id, isActive) => {
    const { error: updError } = await supabase
      .from('inventory_units').update({ is_active: isActive }).eq('id', id);
    if (updError) return { success: false, error: updError.message };
    await refresh();
    return { success: true };
  }, [refresh]);

  return { units, usage, loading, error, refresh, saveUnit, deleteUnit, toggleUnit };
}

/* --------------------------------------------------------- Category master */
export function useCategoryMaster() {
  const [categories, setCategories] = useState([]);
  const [usage, setUsage] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [catRes, itemRes] = await Promise.all([
        supabase.from('inventory_categories').select('*').order('sort_order').order('name'),
        supabase.from('inventory_items').select('category_id'),
      ]);
      if (catRes.error) throw catRes.error;
      if (itemRes.error) throw itemRes.error;

      const counts = {};
      (itemRes.data || []).forEach((i) => {
        if (i.category_id) counts[i.category_id] = (counts[i.category_id] || 0) + 1;
      });

      setCategories(catRes.data || []);
      setUsage(counts);
      setError(null);
    } catch (err) {
      console.error('Error loading categories:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const saveCategory = useCallback(async (name, _extras, id = null) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return { success: false, error: 'A category name is required.' };

    const { error: writeError } = id
      ? await supabase.from('inventory_categories').update({ name: trimmed }).eq('id', id)
      : await supabase.from('inventory_categories').insert([{ name: trimmed }]);

    if (writeError) {
      return {
        success: false,
        error: writeError.code === '23505' ? `"${trimmed}" already exists.` : writeError.message,
      };
    }
    await refresh();
    return { success: true };
  }, [refresh]);

  /**
   * Deleting a category detaches its materials rather than removing them —
   * inventory_items.category_id is ON DELETE SET NULL, so the materials
   * survive and simply become uncategorised.
   */
  const deleteCategory = useCallback(async (id) => {
    const { error: delError } = await supabase.from('inventory_categories').delete().eq('id', id);
    if (delError) return { success: false, error: delError.message };
    await refresh();
    return { success: true };
  }, [refresh]);

  return { categories, usage, loading, error, refresh, saveCategory, deleteCategory };
}

/* -------------------------------------------------------------- Opening stock */
/**
 * Opening for a date is everything that happened before it, which is by
 * construction the previous day's closing — the 30th's close and the 31st's
 * open are the same number and cannot drift apart.
 *
 * A figure can only be typed where nothing came before it (a brand new
 * material, or go-live). The database refuses the rest, because overwriting a
 * derived opening would break the chain between one day and the next.
 */
export function useOpeningStock() {
  const { outletId } = useOutlet();

  const [rows, setRows] = useState([]);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!outletId) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('opening_stock', {
        p_outlet_id: outletId,
        p_on: date,
      });
      if (rpcError) throw rpcError;

      setRows((data || []).map((r) => ({
        itemId: r.inventory_item_id,
        name: r.item_name,
        category: r.category_name || 'Uncategorised',
        unit: r.unit || 'units',
        opening: round(r.opening_qty),
        hasHistory: !!r.has_history,
        lastMovement: r.last_movement,
      })));
      setError(null);
    } catch (err) {
      console.error('Error loading opening stock:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [outletId, date]);

  useEffect(() => { refresh(); }, [refresh]);

  const setOpening = useCallback(async (itemId, qty) => {
    const { error: rpcError } = await supabase.rpc('set_opening_stock', {
      p_outlet_id: outletId,
      p_item_id: itemId,
      p_qty: Number(qty),
      p_on: date,
    });
    if (rpcError) return { success: false, error: rpcError.message };
    await refresh();
    return { success: true };
  }, [outletId, date, refresh]);

  return { rows, date, setDate, loading, error, refresh, setOpening };
}
