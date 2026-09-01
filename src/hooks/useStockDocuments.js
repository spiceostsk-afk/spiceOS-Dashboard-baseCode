import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useOutlet } from '../context/OutletContext';

/**
 * Editing and deleting documents that have already moved stock.
 *
 * Purchases, wastage entries and transfers post their movements the moment
 * they are saved, so correcting one is not a simple UPDATE — the stock effect
 * has to be taken back and re-applied. Both happen in the database:
 *
 *   repost_*            strips the document's movements, then writes fresh
 *                       ones from the current lines, KEEPING THE DOCUMENT'S
 *                       OWN DATE so the Stock Summary for that day stays
 *                       anchored where it belongs.
 *   delete_stock_document  strips the movements and removes the document.
 *
 * Both rebuild the affected balances from the ledger rather than nudging them,
 * so a balance can never drift away from the movements behind it.
 *
 * Worth knowing: because an edit rewrites history in place rather than posting
 * a correction, a report already run for that date will report differently
 * afterwards. That was a deliberate choice over an audit trail.
 */

export function useStockDocuments(onChanged) {
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (fn, ...args) => {
    setBusy(true);
    try {
      const { error } = await supabase.rpc(fn, ...args);
      if (error) throw error;
      if (onChanged) await onChanged();
      return { success: true };
    } catch (err) {
      console.error(`${fn} failed:`, err);
      return { success: false, error: err.message };
    } finally {
      setBusy(false);
    }
  }, [onChanged]);

  const repostPurchase = useCallback(
    (id) => run('repost_purchase', { p_purchase_id: id }), [run]);
  const repostWastage = useCallback(
    (id) => run('repost_wastage', { p_wastage_id: id }), [run]);
  const repostTransfer = useCallback(
    (id) => run('repost_transfer', { p_transfer_id: id }), [run]);
  const reopenCount = useCallback(
    (id) => run('reopen_stock_count', { p_count_id: id }), [run]);

  /** kind: 'purchase' | 'wastage' | 'transfer' | 'count' */
  const deleteDocument = useCallback(
    (kind, id) => run('delete_stock_document', { p_kind: kind, p_id: id }), [run]);

  return {
    busy, repostPurchase, repostWastage, repostTransfer, reopenCount, deleteDocument,
  };
}

/* ---------------------------------------------------- Closing stock history */
/**
 * Every count already posted, with its lines, for the history panel on the
 * Closing Stock screen.
 */
export function useStockCountHistoryDetail(type = 'closing') {
  const { outletId } = useOutlet();

  const [counts, setCounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!outletId) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error: qErr } = await supabase
        .from('stock_counts')
        .select(`
          id, count_date, count_type, cycle, status, submitted_at, note,
          stock_count_items (
            id, ideal_qty, physical_qty, variance, remark, rate,
            inventory_items ( item_name, unit )
          )
        `)
        .eq('outlet_id', outletId)
        .eq('count_type', type)
        .order('count_date', { ascending: false })
        .limit(120);

      if (qErr) throw qErr;

      setCounts((data || []).map((c) => {
        const lines = (c.stock_count_items || [])
          .filter((l) => l.physical_qty !== null)
          .map((l) => ({
            id: l.id,
            name: l.inventory_items?.item_name || 'Item',
            unit: l.inventory_items?.unit || '',
            ideal: Number(l.ideal_qty) || 0,
            physical: Number(l.physical_qty) || 0,
            variance: Number(l.variance) || 0,
            remark: l.remark || '',
            rate: l.rate,
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        return {
          id: c.id,
          date: c.count_date,
          cycle: c.cycle,
          status: c.status,
          submittedAt: c.submitted_at,
          note: c.note,
          lines,
          counted: lines.length,
          mismatched: lines.filter((l) => l.variance !== 0).length,
          varianceValue: lines.reduce(
            (sum, l) => sum + l.variance * (Number(l.rate) || 0), 0),
        };
      }));
      setError(null);
    } catch (err) {
      console.error('Error loading count history:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [outletId, type]);

  useEffect(() => { refresh(); }, [refresh]);

  return { counts, loading, error, refresh };
}
