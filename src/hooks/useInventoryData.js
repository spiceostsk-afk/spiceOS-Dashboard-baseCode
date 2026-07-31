import { useCallback, useState } from 'react';

/**
 * Inventory data source.
 *
 * There is no `inventory_items` table yet, so this returns an empty roster and
 * the view renders its empty state. The shape below is the contract the screen
 * is built against — swapping this body for real Supabase queries (plus a
 * `stock_movements` audit table for `adjust`) needs no changes in the view.
 */

const EMPTY_METRICS = { tracked: 0, low: 0, out: 0 };

export function useInventoryData() {
  const [items] = useState([]);
  const [loading] = useState(false);
  const [error] = useState(null);

  const refresh = useCallback(async () => {}, []);

  /** delta is signed: -1 to consume a unit, +1 to receive one. */
  const adjust = useCallback(async () => ({
    success: false,
    error: 'Inventory tracking is not connected yet.',
  }), []);

  const metrics = items.reduce((acc, item) => {
    acc.tracked += 1;
    if (item.stock <= 0) acc.out += 1;
    else if (item.stock <= item.reorderAt) acc.low += 1;
    return acc;
  }, { ...EMPTY_METRICS });

  return { items, metrics, loading, error, refresh, adjust, connected: false };
}
