import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useOutlet } from '../context/OutletContext';

/**
 * The raw-material master, backed by `inventory_items` + `inventory_stock`.
 *
 * `inventory_items.stock` is the roll-up across every outlet; `inventory_stock`
 * holds the per-branch detail. Both are maintained by the database's
 * post_stock_movement function, so this hook never writes a balance directly —
 * it asks for a movement and reads the result back. That is the only way the
 * ledger and the balances can be guaranteed to agree.
 */

const nowLabel = (iso) =>
  new Date(iso || Date.now()).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });

/** Trim the float dust that repeated 0.5-step arithmetic leaves behind. */
const round = (n) => Math.round(Number(n || 0) * 1000) / 1000;

const mapItem = (row, outletQty) => ({
  id: row.id,
  name: row.item_name,
  category: row.inventory_categories?.name || row.category || 'Uncategorised',
  categoryId: row.category_id || null,
  stock: round(row.stock),
  outletStock: outletQty === undefined ? null : round(outletQty),
  unit: row.unit || 'units',
  purchaseUnit: row.purchase_unit || row.unit || 'units',
  conversion: Number(row.conversion_factor) || 1,
  barcode: row.barcode || '',
  reorderAt: round(row.reorder_at),
  lastRate: row.last_purchase_rate,
  itemType: row.item_type || 'raw',
  isFavourite: !!row.is_favourite,
  isActive: row.is_active !== false,
  createdAt: row.created_at,
  // post_stock_movement stamps updated_at on every movement, so this doubles
  // as "last time this material actually moved".
  lastMovementAt: row.updated_at,
  updatedAt: nowLabel(row.updated_at),
});

const mapMovement = (row) => ({
  id: row.id,
  item: row.item_name || 'Item',
  delta: round(row.delta),
  reason: row.reason,
  type: row.movement_type || 'adjustment',
  at: nowLabel(row.created_at),
});

export function useInventoryData() {
  const { outletId } = useOutlet();

  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [itemsRes, logRes, catRes, stockRes] = await Promise.all([
        // No is_active filter: the Raw Materials master shows and edits the
        // Active column, so a row must not vanish the moment it is unticked.
        // Consumers that only want live materials filter on `isActive`.
        supabase
          .from('inventory_items')
          .select('*, inventory_categories ( name )')
          .order('item_name'),
        supabase
          .from('stock_movements')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('inventory_categories')
          .select('id, name')
          .eq('is_active', true)
          .order('sort_order').order('name'),
        outletId
          ? supabase.from('inventory_stock').select('inventory_item_id, qty').eq('outlet_id', outletId)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (itemsRes.error) throw itemsRes.error;
      if (logRes.error) throw logRes.error;
      if (catRes.error) throw catRes.error;
      if (stockRes.error) throw stockRes.error;

      const byOutlet = new Map((stockRes.data || []).map((r) => [r.inventory_item_id, Number(r.qty)]));

      setItems((itemsRes.data || []).map((row) => mapItem(row, byOutlet.get(row.id))));
      setCategories(catRes.data || []);
      setLog((logRes.data || []).map(mapMovement));
      setError(null);
    } catch (err) {
      console.error('Error loading inventory:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [outletId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addCategory = useCallback(async (name) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return { success: false, error: 'A category name is required.' };

    const { data, error: insertError } = await supabase
      .from('inventory_categories')
      .insert([{ name: trimmed }])
      .select()
      .single();

    if (insertError) {
      return {
        success: false,
        error: insertError.code === '23505'
          ? `"${trimmed}" already exists.`
          : insertError.message,
      };
    }
    await refresh();
    return { success: true, id: data.id };
  }, [refresh]);

  const addItem = useCallback(async (draft) => {
    const name = (draft.name || '').trim();
    if (!name) return { success: false, error: 'An item name is required.' };

    const unit = (draft.unit || '').trim() || 'units';
    const purchaseUnit = (draft.purchaseUnit || '').trim() || unit;
    const conversion = Number(draft.conversion) || 1;

    if (purchaseUnit !== unit && conversion <= 0) {
      return { success: false, error: 'The conversion factor must be greater than zero.' };
    }

    const opening = Number(draft.stock) || 0;

    const categoryName = draft.categoryId
      ? (categories.find((c) => c.id === draft.categoryId)?.name || 'Uncategorised')
      : 'Uncategorised';

    const { data, error: insertError } = await supabase
      .from('inventory_items')
      .insert([{
        item_name: name,
        category: categoryName,
        category_id: draft.categoryId || null,
        unit,
        purchase_unit: purchaseUnit,
        conversion_factor: conversion,
        barcode: (draft.barcode || '').trim() || null,
        stock: 0,          // the opening balance arrives as a movement, below
        reorder_at: Number(draft.reorderAt) || 0,
        last_purchase_rate: draft.rate === '' || draft.rate === undefined
          ? null : Number(draft.rate),
        item_type: draft.itemType || 'raw',
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

    // Opening stock goes in as a real movement so the Stock Summary report can
    // see where the first number came from.
    if (opening !== 0) {
      const { error: rpcError } = await supabase.rpc('adjust_stock', {
        p_outlet_id: outletId,
        p_item_id: data.id,
        p_delta: opening,
        p_reason: 'Opening stock',
        p_note: null,
      });
      if (rpcError) {
        await refresh();
        return { success: false, error: `Item added, but the opening stock failed: ${rpcError.message}` };
      }
    }

    await refresh();
    return { success: true };
  }, [categories, outletId, refresh]);

  const updateItem = useCallback(async (id, draft) => {
    const name = (draft.name || '').trim();
    if (!name) return { success: false, error: 'An item name is required.' };

    const unit = (draft.unit || '').trim() || 'units';
    const purchaseUnit = (draft.purchaseUnit || '').trim() || unit;

    const categoryName = draft.categoryId
      ? (categories.find((c) => c.id === draft.categoryId)?.name || 'Uncategorised')
      : 'Uncategorised';

    const { error: updateError } = await supabase
      .from('inventory_items')
      .update({
        item_name: name,
        category: categoryName,
        category_id: draft.categoryId || null,
        unit,
        purchase_unit: purchaseUnit,
        conversion_factor: Number(draft.conversion) || 1,
        barcode: (draft.barcode || '').trim() || null,
        reorder_at: Number(draft.reorderAt) || 0,
        item_type: draft.itemType || 'raw',
      })
      .eq('id', id);

    if (updateError) {
      return {
        success: false,
        error: updateError.code === '23505'
          ? `"${name}" is already in your inventory.`
          : updateError.message,
      };
    }
    await refresh();
    return { success: true };
  }, [categories, refresh]);

  /**
   * delta is signed: -1 consumes a unit, +1 receives one.
   *
   * Manual clicks floor at zero — going below by hand is a miscount, not a real
   * event. Recipe depletion is free to go negative; that reflects what the
   * kitchen actually used.
   */
  const adjust = useCallback(async (id, delta) => {
    const target = items.find((i) => i.id === id);
    if (!target) return { success: false, error: 'Item not found.' };

    const current = target.outletStock ?? target.stock;
    const applied = round(Math.max(0, current + delta) - current);
    if (applied === 0) return { success: true };

    const { error: rpcError } = await supabase.rpc('adjust_stock', {
      p_outlet_id: outletId,
      p_item_id: id,
      p_delta: applied,
      p_reason: applied > 0 ? 'Stock in' : 'Stock out',
      p_note: null,
    });

    if (rpcError) return { success: false, error: rpcError.message };

    await refresh();
    return { success: true };
  }, [items, outletId, refresh]);

  /**
   * Save a batch of inline grid edits in one round trip.
   *
   * `edits` is { itemId: { item_name?, category_id?, is_favourite?, is_active? } }.
   * The grid lets someone retype a dozen names before saving, so sending a
   * dozen requests would be both slow and half-atomic — an upsert keeps it to
   * one call and one failure mode.
   */
  const applyEdits = useCallback(async (edits) => {
    const ids = Object.keys(edits || {});
    if (ids.length === 0) return { success: true, saved: 0 };

    const byId = new Map(items.map((i) => [i.id, i]));
    const rows = [];

    for (const id of ids) {
      const current = byId.get(id);
      if (!current) continue;

      const patch = edits[id];
      const name = (patch.item_name ?? current.name ?? '').trim();
      if (!name) return { success: false, error: 'An item name cannot be blank.' };

      const categoryId = patch.category_id !== undefined ? patch.category_id : current.categoryId;

      rows.push({
        id,
        item_name: name,
        // `category` is the denormalised label the older screens still read.
        category: categoryId
          ? (categories.find((c) => c.id === categoryId)?.name || 'Uncategorised')
          : 'Uncategorised',
        category_id: categoryId || null,
        is_favourite: patch.is_favourite !== undefined ? patch.is_favourite : current.isFavourite,
        // Default to what the row already is — otherwise renaming a retired
        // material would quietly put it back on the active list.
        is_active: patch.is_active !== undefined ? patch.is_active : current.isActive,
      });
    }

    const { error: upsertError } = await supabase
      .from('inventory_items')
      .upsert(rows, { onConflict: 'id' });

    if (upsertError) {
      return {
        success: false,
        error: upsertError.code === '23505'
          ? 'Two items would end up with the same name.'
          : upsertError.message,
      };
    }

    await refresh();
    return { success: true, saved: rows.length };
  }, [items, categories, refresh]);

  /** Bulk activate / deactivate / favourite / recategorise the ticked rows. */
  const bulkUpdate = useCallback(async (ids, patch) => {
    if (!ids?.length) return { success: true };

    const payload = { ...patch };
    if (patch.category_id !== undefined) {
      payload.category = patch.category_id
        ? (categories.find((c) => c.id === patch.category_id)?.name || 'Uncategorised')
        : 'Uncategorised';
    }

    const { error: updateError } = await supabase
      .from('inventory_items')
      .update(payload)
      .in('id', ids);

    if (updateError) return { success: false, error: updateError.message };
    await refresh();
    return { success: true };
  }, [categories, refresh]);

  /**
   * Add several materials at once from the Quick Add sheet.
   *
   * Opening stock is deliberately NOT accepted here: a quick-add row is a
   * definition, and stock arrives through a purchase or a count so it lands on
   * the ledger with a reason attached.
   */
  const quickAdd = useCallback(async (drafts) => {
    const rows = (drafts || [])
      .map((d) => ({ ...d, name: (d.name || '').trim() }))
      .filter((d) => d.name);

    if (rows.length === 0) return { success: false, error: 'Nothing to add.' };

    const seen = new Set();
    for (const r of rows) {
      const key = r.name.toLowerCase();
      if (seen.has(key)) return { success: false, error: `"${r.name}" is listed twice.` };
      seen.add(key);
    }

    const { error: insertError } = await supabase.from('inventory_items').insert(
      rows.map((r) => ({
        item_name: r.name,
        category: r.categoryId
          ? (categories.find((c) => c.id === r.categoryId)?.name || 'Uncategorised')
          : 'Uncategorised',
        category_id: r.categoryId || null,
        unit: (r.unit || '').trim() || 'units',
        purchase_unit: (r.purchaseUnit || '').trim() || (r.unit || '').trim() || 'units',
        conversion_factor: Number(r.conversion) || 1,
        stock: 0,
        reorder_at: Number(r.reorderAt) || 0,
      })),
    );

    if (insertError) {
      return {
        success: false,
        error: insertError.code === '23505'
          ? 'One of those names is already in your inventory.'
          : insertError.message,
      };
    }

    await refresh();
    return { success: true, added: rows.length };
  }, [categories, refresh]);

  const removeItem = useCallback(async (id) => {
    // Soft delete: recipes and the movement log still point here, and a hard
    // delete would cascade away the history behind them.
    const { error: updateError } = await supabase
      .from('inventory_items')
      .update({ is_active: false })
      .eq('id', id);

    if (updateError) return { success: false, error: updateError.message };

    await refresh();
    return { success: true };
  }, [refresh]);

  const metrics = items.reduce((acc, item) => {
    if (!item.isActive) return acc;          // retired materials are not tracked
    const level = item.outletStock ?? item.stock;
    acc.tracked += 1;
    if (level <= 0) acc.out += 1;
    else if (level <= item.reorderAt) acc.low += 1;
    acc.value += level * (Number(item.lastRate) || 0);
    return acc;
  }, { tracked: 0, low: 0, out: 0, value: 0 });

  return {
    items, categories, log, metrics, loading, error,
    refresh, addItem, updateItem, adjust, removeItem, addCategory,
    applyEdits, bulkUpdate, quickAdd,
    connected: true,
  };
}
