import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useOutlet } from '../context/OutletContext';

/**
 * Purchases and the vendors behind them.
 *
 * A purchase is a draft until it is posted. Drafts move no stock, so a
 * half-entered invoice never reaches the books — and posting is the single
 * moment stock, the ledger and the item's last-known rate all change together,
 * inside one database function.
 */

const round = (n) => Math.round(Number(n || 0) * 1000) / 1000;

/** What a line is worth, and how much of it actually lands in the store. */
export function lineTotals(line, item) {
  const qty = Number(line.qty) || 0;
  const rate = Number(line.rate) || 0;
  const taxPct = Number(line.taxPct) || 0;
  const conversion = Number(item?.conversion_factor) || 1;

  const base = qty * rate;
  const amount = round(base + (base * taxPct) / 100);
  const qtyBase = round(line.entryUnit === 'purchase' ? qty * conversion : qty);

  return { amount, qtyBase };
}

export function usePurchaseData() {
  const { outletId } = useOutlet();

  const [purchases, setPurchases] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [purchaseRes, vendorRes, itemRes] = await Promise.all([
        supabase
          .from('purchases')
          .select(`
            id, invoice_no, invoice_date, status, subtotal, tax_amount,
            discount, total, note, outlet_id, posted_at,
            vendors ( id, name ),
            purchase_items ( id, inventory_item_id, qty, entry_unit, qty_base,
                             rate, tax_pct, amount,
                             inventory_items ( item_name, unit, purchase_unit ) )
          `)
          .order('invoice_date', { ascending: false })
          .limit(200),
        supabase.from('vendors').select('*').eq('is_active', true).order('name'),
        supabase
          .from('inventory_items')
          .select('id, item_name, unit, purchase_unit, conversion_factor, last_purchase_rate')
          .eq('is_active', true)
          .order('item_name'),
      ]);

      if (purchaseRes.error) throw purchaseRes.error;
      if (vendorRes.error) throw vendorRes.error;
      if (itemRes.error) throw itemRes.error;

      setPurchases(purchaseRes.data || []);
      setVendors(vendorRes.data || []);
      setItems(itemRes.data || []);
      setError(null);
    } catch (err) {
      console.error('Error loading purchases:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  /**
   * Write the invoice and its lines, then post it in one go. `postNow` is on
   * by default because an invoice that has arrived is stock that has arrived;
   * saving it as a draft is the exception, not the rule.
   */
  const savePurchase = useCallback(async (draft, { postNow = true } = {}) => {
    const lines = (draft.lines || []).filter((l) => l.inventoryItemId && Number(l.qty) > 0);
    if (lines.length === 0) {
      return { success: false, error: 'Add at least one item with a quantity.' };
    }

    const itemById = new Map(items.map((i) => [i.id, i]));
    const computed = lines.map((l) => ({ line: l, ...lineTotals(l, itemById.get(l.inventoryItemId)) }));

    const subtotal = round(computed.reduce(
      (s, c) => s + (Number(c.line.qty) || 0) * (Number(c.line.rate) || 0), 0,
    ));
    const total = round(computed.reduce((s, c) => s + c.amount, 0) - (Number(draft.discount) || 0));

    try {
      const { data: header, error: headError } = await supabase
        .from('purchases')
        .insert([{
          outlet_id: outletId,
          vendor_id: draft.vendorId || null,
          invoice_no: (draft.invoiceNo || '').trim() || null,
          invoice_date: draft.invoiceDate,
          note: (draft.note || '').trim() || null,
          subtotal,
          tax_amount: round(computed.reduce((s, c) => s + c.amount, 0) - subtotal),
          discount: Number(draft.discount) || 0,
          total,
        }])
        .select()
        .single();

      if (headError) throw headError;

      const { error: lineError } = await supabase.from('purchase_items').insert(
        computed.map((c) => ({
          purchase_id: header.id,
          inventory_item_id: c.line.inventoryItemId,
          qty: Number(c.line.qty),
          entry_unit: c.line.entryUnit || 'base',
          qty_base: c.qtyBase,
          rate: Number(c.line.rate) || 0,
          tax_pct: Number(c.line.taxPct) || 0,
          amount: c.amount,
        })),
      );

      if (lineError) {
        // The header without its lines is a lie; take it back out.
        await supabase.from('purchases').delete().eq('id', header.id);
        throw lineError;
      }

      if (postNow) {
        const { error: postError } = await supabase.rpc('post_purchase', { p_purchase_id: header.id });
        if (postError) throw postError;
      }

      await refresh();
      return { success: true, id: header.id };
    } catch (err) {
      console.error('Error saving purchase:', err);
      return { success: false, error: err.message };
    }
  }, [items, outletId, refresh]);

  /**
   * Edit an invoice that has already moved stock.
   *
   * The lines are replaced wholesale and the database re-posts the document,
   * which strips its old movements and writes fresh ones dated to the invoice,
   * not to now. A report already run for that date will therefore report
   * differently afterwards — that is inherent to editing in place rather than
   * posting a correction.
   */
  const updatePurchase = useCallback(async (id, draft) => {
    const lines = (draft.lines || []).filter((l) => l.inventoryItemId && Number(l.qty) > 0);
    if (lines.length === 0) {
      return { success: false, error: 'A purchase needs at least one item.' };
    }

    const itemById = new Map(items.map((i) => [i.id, i]));
    const computed = lines.map((l) => ({ line: l, ...lineTotals(l, itemById.get(l.inventoryItemId)) }));
    const subtotal = round(computed.reduce(
      (s2, c) => s2 + (Number(c.line.qty) || 0) * (Number(c.line.rate) || 0), 0));
    const gross = round(computed.reduce((s2, c) => s2 + c.amount, 0));

    try {
      const { error: headError } = await supabase
        .from('purchases')
        .update({
          vendor_id: draft.vendorId || null,
          invoice_no: (draft.invoiceNo || '').trim() || null,
          invoice_date: draft.invoiceDate,
          note: (draft.note || '').trim() || null,
          subtotal,
          tax_amount: round(gross - subtotal),
          discount: Number(draft.discount) || 0,
          total: round(gross - (Number(draft.discount) || 0)),
        })
        .eq('id', id);
      if (headError) throw headError;

      const { error: delError } = await supabase
        .from('purchase_items').delete().eq('purchase_id', id);
      if (delError) throw delError;

      const { error: lineError } = await supabase.from('purchase_items').insert(
        computed.map((c) => ({
          purchase_id: id,
          inventory_item_id: c.line.inventoryItemId,
          qty: Number(c.line.qty),
          entry_unit: c.line.entryUnit || 'base',
          qty_base: c.qtyBase,
          rate: Number(c.line.rate) || 0,
          tax_pct: Number(c.line.taxPct) || 0,
          amount: c.amount,
        })),
      );
      if (lineError) throw lineError;

      const { error: rpcError } = await supabase.rpc('repost_purchase', { p_purchase_id: id });
      if (rpcError) throw rpcError;

      await refresh();
      return { success: true };
    } catch (err) {
      console.error('Error updating purchase:', err);
      return { success: false, error: err.message };
    }
  }, [items, refresh]);

  /** Remove the invoice and the stock it added. */
  const deletePurchase = useCallback(async (id) => {
    const { error: rpcError } = await supabase.rpc('delete_stock_document', {
      p_kind: 'purchase', p_id: id,
    });
    if (rpcError) return { success: false, error: rpcError.message };
    await refresh();
    return { success: true };
  }, [refresh]);

  const postPurchase = useCallback(async (id) => {
    const { error: rpcError } = await supabase.rpc('post_purchase', { p_purchase_id: id });
    if (rpcError) return { success: false, error: rpcError.message };
    await refresh();
    return { success: true };
  }, [refresh]);

  const cancelPurchase = useCallback(async (id) => {
    const { error: rpcError } = await supabase.rpc('cancel_purchase', { p_purchase_id: id });
    if (rpcError) return { success: false, error: rpcError.message };
    await refresh();
    return { success: true };
  }, [refresh]);

  const saveVendor = useCallback(async (draft) => {
    const name = (draft.name || '').trim();
    if (!name) return { success: false, error: 'A vendor name is required.' };

    const payload = {
      name,
      phone: (draft.phone || '').trim() || null,
      email: (draft.email || '').trim() || null,
      gstin: (draft.gstin || '').trim() || null,
      address: (draft.address || '').trim() || null,
    };

    const { error: writeError } = draft.id
      ? await supabase.from('vendors').update(payload).eq('id', draft.id)
      : await supabase.from('vendors').insert([payload]);

    if (writeError) {
      return {
        success: false,
        error: writeError.code === '23505'
          ? `A vendor called "${name}" already exists.`
          : writeError.message,
      };
    }
    await refresh();
    return { success: true };
  }, [refresh]);

  const removeVendor = useCallback(async (id) => {
    // Soft delete: posted invoices still point here.
    const { error: updateError } = await supabase
      .from('vendors').update({ is_active: false }).eq('id', id);
    if (updateError) return { success: false, error: updateError.message };
    await refresh();
    return { success: true };
  }, [refresh]);

  return {
    purchases, vendors, items, loading, error,
    refresh, savePurchase, postPurchase, cancelPurchase, saveVendor, removeVendor,
    updatePurchase, deletePurchase,
  };
}
