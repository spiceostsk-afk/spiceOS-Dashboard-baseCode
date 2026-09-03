import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useOutlet } from '../context/OutletContext';

/**
 * The entries behind one number on the Stock Summary.
 *
 * Every figure in that report is a sum over the ledger, so any of them can be
 * opened up and shown as the movements that produced it. A manager looking at
 * "Consumption 114.75" wants to know which orders ate it, and a report that
 * cannot answer that is a number they have to take on trust.
 *
 * Which movement types make up which column. Opening is the exception: it is
 * not a type at all but everything that happened BEFORE the range, so it is
 * handled by the date window rather than by a filter.
 */
export const COLUMN_MOVEMENTS = {
  opening_stock: { types: null, before: true, label: 'Opening stock' },
  purchase_stock: { types: ['purchase', 'purchase_return'], label: 'Purchases' },
  consumption: { types: ['consumption'], label: 'Consumption' },
  transfer_in: { types: ['transfer_in'], label: 'Transfers in' },
  transfer_out: { types: ['transfer_out'], label: 'Transfers out' },
  wastage: { types: ['wastage'], label: 'Wastage' },
  shortage: { types: ['shortage'], label: 'Shortage' },
  production: { types: ['production_in', 'production_out'], label: 'Production' },
  adjustment: { types: ['adjustment', 'opening'], label: 'Adjustments' },
  physical_stock: { types: ['physical_count'], label: 'Stock count' },
  variance: { types: ['physical_count'], label: 'Count variance' },
  // The composites: everything that shaped the figure, minus the count
  // corrections, which is exactly what "ideal" means.
  total_stock: {
    types: ['purchase', 'purchase_return', 'transfer_in', 'opening'],
    label: 'Opening, purchases and transfers in',
  },
  ideal_stock: {
    types: ['purchase', 'purchase_return', 'consumption', 'transfer_in',
      'transfer_out', 'wastage', 'shortage', 'production_in', 'production_out',
      'adjustment', 'opening'],
    label: 'Everything before the count',
  },
  closing_stock: { types: null, before: false, label: 'Every movement' },
};

const TYPE_LABEL = {
  opening: 'Opening', purchase: 'Purchase', purchase_return: 'Purchase return',
  consumption: 'Consumption', transfer_in: 'Transfer in', transfer_out: 'Transfer out',
  wastage: 'Wastage', shortage: 'Shortage', production_in: 'Production',
  production_out: 'Production use', adjustment: 'Adjustment',
  physical_count: 'Stock count',
};

const TYPE_TONE = {
  purchase: 'tone-green', transfer_in: 'tone-green', production_in: 'tone-green',
  opening: 'tone-blue', physical_count: 'tone-blue', adjustment: 'tone-neutral',
  consumption: 'tone-amber', transfer_out: 'tone-amber',
  wastage: 'tone-red', shortage: 'tone-red', purchase_return: 'tone-red',
};

export const movementLabel = (t) => TYPE_LABEL[t] || t;
export const movementTone = (t) => TYPE_TONE[t] || 'tone-neutral';

/**
 * @param cell  { itemId, itemName, column, unit } or null when nothing is open
 * @param range { from, to, allOutlets } matching the report's own filters
 */
export function useMovementDetail(cell, range) {
  const { outletId } = useOutlet();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!cell?.itemId) { setRows([]); return; }

    const spec = COLUMN_MOVEMENTS[cell.column];
    if (!spec) { setRows([]); return; }

    setLoading(true);
    try {
      let q = supabase
        .from('stock_movements')
        .select('id, created_at, movement_type, delta, balance_after, reason, note, rate, ref_table, ref_id')
        .eq('inventory_item_id', cell.itemId)
        .order('created_at', { ascending: false })
        .limit(500);

      if (!range.allOutlets && outletId) q = q.eq('outlet_id', outletId);

      // Opening is everything before the range started; every other column is
      // what happened inside it.
      if (spec.before) {
        q = q.lt('created_at', `${range.from}T00:00:00`);
      } else {
        q = q.gte('created_at', `${range.from}T00:00:00`)
          .lte('created_at', `${range.to}T23:59:59.999`);
      }

      if (spec.types) q = q.in('movement_type', spec.types);

      const { data, error: qErr } = await q;
      if (qErr) throw qErr;

      setRows((data || []).map((m) => ({
        id: m.id,
        at: m.created_at,
        type: m.movement_type,
        delta: Number(m.delta) || 0,
        balanceAfter: m.balance_after === null ? null : Number(m.balance_after),
        reason: m.reason || movementLabel(m.movement_type),
        note: m.note || '',
        rate: m.rate,
        refTable: m.ref_table,
        refId: m.ref_id,
      })));
      setError(null);
    } catch (err) {
      console.error('Error loading movement detail:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [cell?.itemId, cell?.column, range.from, range.to, range.allOutlets, outletId]);

  useEffect(() => { load(); }, [load]);

  const net = rows.reduce((sum, r) => sum + r.delta, 0);
  const inTotal = rows.filter((r) => r.delta > 0).reduce((s, r) => s + r.delta, 0);
  const outTotal = rows.filter((r) => r.delta < 0).reduce((s, r) => s + Math.abs(r.delta), 0);

  return { rows, loading, error, net, inTotal, outTotal, refresh: load };
}
