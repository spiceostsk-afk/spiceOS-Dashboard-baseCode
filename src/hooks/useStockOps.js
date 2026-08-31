import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useOutlet } from '../context/OutletContext';

/**
 * Wastage and outlet-to-outlet transfers.
 *
 * They live together because they are the same shape: a dated header, a few
 * lines, and a database function that turns the whole thing into ledger
 * movements atomically. Neither one touches stock from the browser.
 */

const round = (n) => Math.round(Number(n || 0) * 1000) / 1000;

export const WASTAGE_REASONS = [
  'Spoilage', 'Expired', 'Spillage', 'Over-production',
  'Preparation loss', 'Staff meal', 'Customer return', 'Other',
];

const toBase = (line, item) => {
  const qty = Number(line.qty) || 0;
  const conversion = Number(item?.conversion_factor) || 1;
  return round(line.entryUnit === 'purchase' ? qty * conversion : qty);
};

/* ------------------------------------------------------------------ Wastage */
export function useWastageData() {
  const { outletId } = useOutlet();

  const [entries, setEntries] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [entryRes, itemRes] = await Promise.all([
        supabase
          .from('stock_wastage')
          .select(`
            id, wasted_on, status, note, total_value, outlet_id, posted_at,
            stock_wastage_items ( id, inventory_item_id, qty_base, reason, rate,
                                  inventory_items ( item_name, unit ) )
          `)
          .order('wasted_on', { ascending: false })
          .limit(200),
        supabase
          .from('inventory_items')
          .select('id, item_name, unit, purchase_unit, conversion_factor, last_purchase_rate, stock')
          .eq('is_active', true)
          .order('item_name'),
      ]);

      if (entryRes.error) throw entryRes.error;
      if (itemRes.error) throw itemRes.error;

      setEntries(entryRes.data || []);
      setItems(itemRes.data || []);
      setError(null);
    } catch (err) {
      console.error('Error loading wastage:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const saveWastage = useCallback(async (draft) => {
    const lines = (draft.lines || []).filter((l) => l.inventoryItemId && Number(l.qty) > 0);
    if (lines.length === 0) {
      return { success: false, error: 'Add at least one item with a quantity.' };
    }

    const itemById = new Map(items.map((i) => [i.id, i]));

    try {
      const { data: header, error: headError } = await supabase
        .from('stock_wastage')
        .insert([{
          outlet_id: outletId,
          wasted_on: draft.wastedOn,
          note: (draft.note || '').trim() || null,
        }])
        .select()
        .single();
      if (headError) throw headError;

      const { error: lineError } = await supabase.from('stock_wastage_items').insert(
        lines.map((l) => {
          const item = itemById.get(l.inventoryItemId);
          return {
            wastage_id: header.id,
            inventory_item_id: l.inventoryItemId,
            qty_base: toBase(l, item),
            reason: l.reason || 'Spoilage',
            rate: item?.last_purchase_rate ?? null,
          };
        }),
      );

      if (lineError) {
        await supabase.from('stock_wastage').delete().eq('id', header.id);
        throw lineError;
      }

      const { error: postError } = await supabase.rpc('post_wastage', { p_wastage_id: header.id });
      if (postError) throw postError;

      await refresh();
      return { success: true };
    } catch (err) {
      console.error('Error saving wastage:', err);
      return { success: false, error: err.message };
    }
  }, [items, outletId, refresh]);

  return { entries, items, loading, error, refresh, saveWastage };
}

/* ---------------------------------------------------------------- Transfers */
export function useTransferData() {
  const { outletId, outlets } = useOutlet();

  const [transfers, setTransfers] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [transferRes, itemRes] = await Promise.all([
        supabase
          .from('stock_transfers')
          .select(`
            id, transfer_date, reference_no, status, note,
            from_outlet_id, to_outlet_id, sent_at, received_at,
            stock_transfer_items ( id, inventory_item_id, qty_base,
                                   received_qty_base, rate,
                                   inventory_items ( item_name, unit ) )
          `)
          .order('transfer_date', { ascending: false })
          .limit(200),
        supabase
          .from('inventory_items')
          .select('id, item_name, unit, purchase_unit, conversion_factor, last_purchase_rate')
          .eq('is_active', true)
          .order('item_name'),
      ]);

      if (transferRes.error) throw transferRes.error;
      if (itemRes.error) throw itemRes.error;

      setTransfers(transferRes.data || []);
      setItems(itemRes.data || []);
      setError(null);
    } catch (err) {
      console.error('Error loading transfers:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  /** Stock on hand at the sending outlet, so the form can warn before it goes. */
  const [sourceStock, setSourceStock] = useState({});

  const loadSourceStock = useCallback(async (fromOutletId) => {
    if (!fromOutletId) { setSourceStock({}); return; }
    const { data } = await supabase
      .from('inventory_stock')
      .select('inventory_item_id, qty')
      .eq('outlet_id', fromOutletId);
    setSourceStock(Object.fromEntries((data || []).map((r) => [r.inventory_item_id, Number(r.qty)])));
  }, []);

  const saveTransfer = useCallback(async (draft, { sendNow = true } = {}) => {
    const lines = (draft.lines || []).filter((l) => l.inventoryItemId && Number(l.qty) > 0);
    if (lines.length === 0) {
      return { success: false, error: 'Add at least one item with a quantity.' };
    }
    if (!draft.fromOutletId || !draft.toOutletId) {
      return { success: false, error: 'Choose both a source and a destination outlet.' };
    }
    if (draft.fromOutletId === draft.toOutletId) {
      return { success: false, error: 'Source and destination must be different outlets.' };
    }

    const itemById = new Map(items.map((i) => [i.id, i]));

    try {
      const { data: header, error: headError } = await supabase
        .from('stock_transfers')
        .insert([{
          from_outlet_id: draft.fromOutletId,
          to_outlet_id: draft.toOutletId,
          transfer_date: draft.transferDate,
          reference_no: (draft.referenceNo || '').trim() || null,
          note: (draft.note || '').trim() || null,
        }])
        .select()
        .single();
      if (headError) throw headError;

      const { error: lineError } = await supabase.from('stock_transfer_items').insert(
        lines.map((l) => {
          const item = itemById.get(l.inventoryItemId);
          return {
            transfer_id: header.id,
            inventory_item_id: l.inventoryItemId,
            qty_base: toBase(l, item),
            rate: item?.last_purchase_rate ?? null,
          };
        }),
      );

      if (lineError) {
        await supabase.from('stock_transfers').delete().eq('id', header.id);
        throw lineError;
      }

      if (sendNow) {
        const { error: sendError } = await supabase.rpc('send_transfer', { p_transfer_id: header.id });
        if (sendError) throw sendError;
      }

      await refresh();
      return { success: true, id: header.id };
    } catch (err) {
      console.error('Error saving transfer:', err);
      return { success: false, error: err.message };
    }
  }, [items, refresh]);

  const sendTransfer = useCallback(async (id) => {
    const { error: rpcError } = await supabase.rpc('send_transfer', { p_transfer_id: id });
    if (rpcError) return { success: false, error: rpcError.message };
    await refresh();
    return { success: true };
  }, [refresh]);

  /**
   * Receive, optionally short. `received` maps a line id to the quantity that
   * actually turned up; anything not named is accepted in full.
   */
  const receiveTransfer = useCallback(async (id, received = {}) => {
    try {
      const updates = Object.entries(received).filter(([, qty]) => qty !== '' && qty !== null);
      for (const [lineId, qty] of updates) {
        const { error: updateError } = await supabase
          .from('stock_transfer_items')
          .update({ received_qty_base: Number(qty) })
          .eq('id', lineId);
        if (updateError) throw updateError;
      }

      const { error: rpcError } = await supabase.rpc('receive_transfer', { p_transfer_id: id });
      if (rpcError) throw rpcError;

      await refresh();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, [refresh]);

  const outletName = useCallback(
    (id) => outlets.find((o) => o.id === id)?.name || 'Unknown outlet',
    [outlets],
  );

  return {
    transfers, items, loading, error, sourceStock, outletId,
    refresh, saveTransfer, sendTransfer, receiveTransfer, loadSourceStock, outletName,
  };
}
