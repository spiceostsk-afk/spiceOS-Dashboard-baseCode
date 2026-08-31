import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useOutlet } from '../context/OutletContext';

/**
 * The count sheet behind both Closing Stock and Available Stock.
 *
 * Both screens are the same act — stand in the store, count what is there,
 * tell the system. They differ only in what the number means afterwards, so
 * they share this hook and pass `type`.
 *
 * Editing is local until it is saved. Writing on every keystroke would mean a
 * round trip per digit while someone types "1250", and a half-typed "12" would
 * briefly be a real, saved count. Entries are held in memory and flushed by
 * Quick Save, or on the way into Review.
 */

const round = (n) => Math.round(Number(n || 0) * 1000) / 1000;

/** A blank input is "not counted", which is not the same as counting zero. */
const parseEntry = (raw) => {
  if (raw === '' || raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

export function useStockCount(type = 'closing') {
  const { outletId } = useOutlet();

  const [countId, setCountId] = useState(null);
  const [status, setStatus] = useState('draft');
  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [cycle, setCycle] = useState('daily');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  /** itemId -> { qty: string, unit: 'base'|'purchase', remark: string } */
  const [edits, setEdits] = useState({});

  const load = useCallback(async () => {
    if (!outletId) { setLoading(false); return; }
    setLoading(true);
    try {
      // Opening the sheet re-snapshots what the system expects, so the variance
      // is measured against this moment and not against whenever the draft
      // was first created.
      const { data: id, error: rpcError } = await supabase.rpc('open_stock_count', {
        p_outlet_id: outletId,
        p_count_type: type,
        p_count_date: date,
        p_cycle: cycle,
      });
      if (rpcError) throw rpcError;

      const [sheetRes, lineRes, catRes] = await Promise.all([
        supabase.from('stock_counts').select('*').eq('id', id).single(),
        supabase
          .from('stock_count_items')
          .select(`
            id, inventory_item_id, ideal_qty, physical_qty, entry_qty, entry_unit,
            variance, remark, rate,
            inventory_items ( item_name, unit, purchase_unit, conversion_factor,
                              category_id, is_favourite, barcode )
          `)
          .eq('count_id', id),
        supabase
          .from('inventory_categories')
          .select('id, name')
          .eq('is_active', true)
          .order('sort_order').order('name'),
      ]);

      if (sheetRes.error) throw sheetRes.error;
      if (lineRes.error) throw lineRes.error;
      if (catRes.error) throw catRes.error;

      setCountId(id);
      setStatus(sheetRes.data?.status || 'draft');
      setCategories(catRes.data || []);

      const mapped = (lineRes.data || [])
        .map((r) => {
          const item = r.inventory_items || {};
          return {
            lineId: r.id,
            itemId: r.inventory_item_id,
            name: item.item_name || 'Item',
            unit: item.unit || 'units',
            purchaseUnit: item.purchase_unit || item.unit || 'units',
            conversion: Number(item.conversion_factor) || 1,
            categoryId: item.category_id || null,
            favourite: !!item.is_favourite,
            barcode: item.barcode || '',
            ideal: round(r.ideal_qty),
            physical: r.physical_qty === null ? null : round(r.physical_qty),
            entryQty: r.entry_qty,
            entryUnit: r.entry_unit || 'base',
            remark: r.remark || '',
            rate: r.rate,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));

      setRows(mapped);

      // Seed the editor from whatever was already saved, so reopening a draft
      // shows the numbers the operator left behind.
      setEdits(Object.fromEntries(
        mapped
          .filter((r) => r.physical !== null)
          .map((r) => [r.itemId, {
            qty: String(r.entryQty ?? r.physical),
            unit: r.entryUnit,
            remark: r.remark,
          }]),
      ));
      setError(null);
    } catch (err) {
      console.error('Error loading stock count:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [outletId, type, date, cycle]);

  useEffect(() => { load(); }, [load]);

  const setEntry = useCallback((itemId, patch) => {
    setEdits((prev) => ({
      ...prev,
      [itemId]: { qty: '', unit: 'base', remark: '', ...prev[itemId], ...patch },
    }));
  }, []);

  const clearEntry = useCallback((itemId) => {
    setEdits((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  }, []);

  const clearAll = useCallback(() => setEdits({}), []);

  /** Rows decorated with whatever is currently in the editor. */
  const decorated = useMemo(() => rows.map((r) => {
    const edit = edits[r.itemId];
    const typed = parseEntry(edit?.qty);
    const unit = edit?.unit || 'base';
    // Everything is stored in the base unit; the purchase unit is only a
    // convenience at the keyboard.
    const physical = typed === null ? null
      : round(unit === 'purchase' ? typed * r.conversion : typed);

    return {
      ...r,
      entered: typed,
      enteredUnit: unit,
      physicalPreview: physical,
      remarkDraft: edit?.remark ?? r.remark,
      variancePreview: physical === null ? null : round(physical - r.ideal),
      hasEntry: physical !== null,
    };
  }), [rows, edits]);

  const enteredCount = decorated.filter((r) => r.hasEntry).length;

  /** Persist the editor to the draft sheet. Only touched lines are written. */
  const saveDraft = useCallback(async () => {
    if (!countId) return { success: false, error: 'No count sheet open.' };
    setSaving(true);
    try {
      const touched = decorated.filter(
        (r) => r.hasEntry || r.physical !== null || (r.remarkDraft || '') !== (r.remark || ''),
      );

      if (touched.length > 0) {
        const payload = touched.map((r) => ({
          id: r.lineId,
          count_id: countId,
          inventory_item_id: r.itemId,
          ideal_qty: r.ideal,
          physical_qty: r.physicalPreview,
          entry_qty: r.entered,
          entry_unit: r.enteredUnit,
          variance: r.variancePreview,
          remark: r.remarkDraft || null,
          rate: r.rate,
          updated_at: new Date().toISOString(),
        }));

        const { error: upsertError } = await supabase
          .from('stock_count_items')
          .upsert(payload, { onConflict: 'id' });
        if (upsertError) throw upsertError;
      }

      await load();
      return { success: true, saved: touched.length };
    } catch (err) {
      console.error('Error saving stock count:', err);
      return { success: false, error: err.message };
    } finally {
      setSaving(false);
    }
  }, [countId, decorated, load]);

  /** Save, then freeze the sheet and post every variance to the ledger. */
  const submit = useCallback(async () => {
    const saved = await saveDraft();
    if (!saved.success) return saved;

    setSaving(true);
    try {
      const { error: rpcError } = await supabase.rpc('submit_stock_count', {
        p_count_id: countId,
      });
      if (rpcError) throw rpcError;
      await load();
      return { success: true };
    } catch (err) {
      console.error('Error submitting stock count:', err);
      return { success: false, error: err.message };
    } finally {
      setSaving(false);
    }
  }, [countId, saveDraft, load]);

  /** Wipe every entry on the open draft, in the sheet as well as the editor. */
  const resetSheet = useCallback(async () => {
    if (!countId) return { success: false, error: 'No count sheet open.' };
    setSaving(true);
    try {
      const { error: updateError } = await supabase
        .from('stock_count_items')
        .update({ physical_qty: null, entry_qty: null, variance: null, remark: null })
        .eq('count_id', countId);
      if (updateError) throw updateError;
      setEdits({});
      await load();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    } finally {
      setSaving(false);
    }
  }, [countId, load]);

  const toggleFavourite = useCallback(async (itemId, next) => {
    setRows((prev) => prev.map((r) => (r.itemId === itemId ? { ...r, favourite: next } : r)));
    const { error: updateError } = await supabase
      .from('inventory_items')
      .update({ is_favourite: next })
      .eq('id', itemId);
    if (updateError) {
      // Put the star back if the write did not land.
      setRows((prev) => prev.map((r) => (r.itemId === itemId ? { ...r, favourite: !next } : r)));
    }
  }, []);

  return {
    countId, status, rows: decorated, categories,
    date, setDate, cycle, setCycle,
    loading, saving, error, enteredCount,
    setEntry, clearEntry, clearAll,
    saveDraft, submit, resetSheet, toggleFavourite,
    refresh: load,
    isSubmitted: status === 'submitted',
  };
}

/** Previously submitted sheets, for the History dropdown. */
export function useStockCountHistory(type = 'closing') {
  const { outletId } = useOutlet();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!outletId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('stock_counts')
        .select('id, count_date, status, submitted_at, cycle')
        .eq('outlet_id', outletId)
        .eq('count_type', type)
        .eq('status', 'submitted')
        .order('count_date', { ascending: false })
        .limit(30);
      if (error) throw error;
      setHistory(data || []);
    } catch (err) {
      console.error('Error loading count history:', err);
    } finally {
      setLoading(false);
    }
  }, [outletId, type]);

  useEffect(() => { load(); }, [load]);

  return { history, loading, refresh: load };
}
