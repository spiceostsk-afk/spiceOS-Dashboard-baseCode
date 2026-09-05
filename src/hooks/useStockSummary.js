import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useOutlet } from '../context/OutletContext';

/**
 * The Stock Summary report.
 *
 * All eleven columns come back from one `stock_summary` RPC. None of this is
 * computed here on purpose: an opening balance for a date range means summing
 * every movement ever recorded before that date, and that is a database's job.
 * See db/migrate_inventory_stock.sql for the definitions each column carries.
 */

const today = () => new Date().toISOString().slice(0, 10);

export function useStockSummary() {
  const { outletId } = useOutlet();

  const [filters, setFilters] = useState({
    from: today(),
    to: today(),
    categoryId: '',
    search: '',
    unitType: 'base',
    allOutlets: false,
  });

  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const run = useCallback(async (override) => {
    const f = { ...filters, ...(override || {}) };
    setLoading(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('stock_summary', {
        p_outlet_id: f.allOutlets ? null : outletId,
        p_from: f.from,
        p_to: f.to,
        p_category_id: f.categoryId || null,
        p_search: f.search || null,
        p_unit_type: f.unitType,
      });
      if (rpcError) throw rpcError;
      setRows(data || []);
      setError(null);
    } catch (err) {
      console.error('Error loading stock summary:', err);
      setError(err.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [filters, outletId]);

  const loadCategories = useCallback(async () => {
    const { data } = await supabase
      .from('inventory_categories')
      .select('id, name')
      .eq('is_active', true)
      .order('sort_order').order('name');
    setCategories(data || []);
  }, []);

  useEffect(() => { loadCategories(); }, [loadCategories]);

  // Re-run when the outlet changes, but not on every keystroke in the search
  // box — filters are applied when the operator presses Search.
  useEffect(() => {
    if (outletId) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outletId]);

  const setFilter = useCallback((patch) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const clear = useCallback(() => {
    const next = {
      from: today(), to: today(), categoryId: '',
      search: '', unitType: 'base', allOutlets: false,
    };
    setFilters(next);
    run(next);
  }, [run]);

  /** Column totals, for the footer strip. */
  const totals = useMemo(() => rows.reduce((acc, r) => {
    acc.items += 1;
    acc.purchase += Number(r.purchase_stock) || 0;
    acc.consumption += Number(r.consumption) || 0;
    acc.wastage += Number(r.wastage) || 0;
    acc.value += Number(r.ideal_value) || 0;
    if (r.physical_stock !== null && r.physical_stock !== undefined) {
      acc.counted += 1;
      if (Number(r.variance) !== 0) acc.mismatched += 1;
      acc.varianceValue += (Number(r.variance) || 0) * (Number(r.rate) || 0);
    }
    return acc;
  }, {
    items: 0, purchase: 0, consumption: 0, wastage: 0,
    value: 0, counted: 0, mismatched: 0, varianceValue: 0,
  }), [rows]);

  /** CSV of exactly what is on screen, in the same column order. */
  const exportCsv = useCallback(() => {
    const head = [
      'Raw Material', 'Category', 'Unit', 'Opening Stock', 'Purchase Stock',
      'Total Stock', 'Consumption', 'Transfer In', 'Transfer Out', 'Wastage',
      'Ideal Stock', 'Physical Stock', 'Variance', 'Closing Stock', 'Remark',
    ];
    const esc = (v) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const body = rows.map((r) => [
      r.item_name, r.category_name, r.unit, r.opening_stock, r.purchase_stock,
      r.total_stock, r.consumption, r.transfer_in, r.transfer_out, r.wastage,
      r.ideal_stock, r.physical_stock, r.variance, r.closing_stock, r.remark,
    ].map(esc).join(','));

    const csv = [head.join(','), ...body].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock-summary-${filters.from}-to-${filters.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [rows, filters.from, filters.to]);

  return {
    rows, categories, filters, totals, loading, error,
    setFilter, search: run, clear, exportCsv,
  };
}
