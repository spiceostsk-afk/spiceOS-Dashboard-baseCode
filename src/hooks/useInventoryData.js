import { useCallback, useEffect, useState } from 'react';

/**
 * Inventory data source.
 *
 * There is no `inventory_items` table yet, so this keeps the roster in
 * localStorage. Everything the screen does — add, adjust, the movement log —
 * works against this shim, and the shape below is the contract the view is
 * built on: swapping this body for Supabase queries (plus a `stock_movements`
 * audit table) needs no changes in the view.
 */

const ITEMS_KEY = 'spiceos_inventory_items';
const LOG_KEY = 'spiceos_inventory_log';

const read = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable — the in-memory state still holds */
  }
};

const nowLabel = () =>
  new Date().toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });

export function useInventoryData() {
  const [items, setItems] = useState([]);
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error] = useState(null);

  useEffect(() => {
    setItems(read(ITEMS_KEY));
    setLog(read(LOG_KEY));
    setLoading(false);
  }, []);

  const persist = useCallback((nextItems, nextLog) => {
    setItems(nextItems);
    write(ITEMS_KEY, nextItems);
    if (nextLog) {
      setLog(nextLog);
      write(LOG_KEY, nextLog);
    }
  }, []);

  const refresh = useCallback(async () => {
    setItems(read(ITEMS_KEY));
    setLog(read(LOG_KEY));
  }, []);

  const addItem = useCallback(async (draft) => {
    const name = (draft.name || '').trim();
    if (!name) return { success: false, error: 'An item name is required.' };

    const item = {
      id: `inv-${Date.now()}`,
      name,
      category: (draft.category || '').trim() || 'Uncategorised',
      stock: Number(draft.stock) || 0,
      unit: (draft.unit || '').trim() || 'units',
      reorderAt: Number(draft.reorderAt) || 0,
      updatedAt: nowLabel(),
    };

    const nextItems = [...read(ITEMS_KEY), item];
    const nextLog = [
      { id: `log-${Date.now()}`, item: item.name, delta: item.stock, reason: 'Item added', at: nowLabel() },
      ...read(LOG_KEY),
    ].slice(0, 200);

    persist(nextItems, nextLog);
    return { success: true };
  }, [persist]);

  /** delta is signed: -1 consumes a unit, +1 receives one. */
  const adjust = useCallback(async (id, delta) => {
    const current = read(ITEMS_KEY);
    const target = current.find((i) => i.id === id);
    if (!target) return { success: false, error: 'Item not found.' };

    const nextStock = Math.max(0, Number(target.stock || 0) + delta);
    const nextItems = current.map((i) => (
      i.id === id ? { ...i, stock: nextStock, updatedAt: nowLabel() } : i
    ));
    const nextLog = [
      {
        id: `log-${Date.now()}`,
        item: target.name,
        delta,
        reason: delta > 0 ? 'Stock in' : 'Stock out',
        at: nowLabel(),
      },
      ...read(LOG_KEY),
    ].slice(0, 200);

    persist(nextItems, nextLog);
    return { success: true };
  }, [persist]);

  const removeItem = useCallback(async (id) => {
    const current = read(ITEMS_KEY);
    const target = current.find((i) => i.id === id);
    const nextItems = current.filter((i) => i.id !== id);
    const nextLog = [
      { id: `log-${Date.now()}`, item: target?.name || 'Item', delta: 0, reason: 'Item removed', at: nowLabel() },
      ...read(LOG_KEY),
    ].slice(0, 200);
    persist(nextItems, nextLog);
    return { success: true };
  }, [persist]);

  const metrics = items.reduce((acc, item) => {
    acc.tracked += 1;
    if (item.stock <= 0) acc.out += 1;
    else if (item.stock <= item.reorderAt) acc.low += 1;
    return acc;
  }, { tracked: 0, low: 0, out: 0 });

  return {
    items, log, metrics, loading, error,
    refresh, addItem, adjust, removeItem,
    connected: false,
  };
}
