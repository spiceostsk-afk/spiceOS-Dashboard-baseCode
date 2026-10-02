/**
 * The bill as the customer reads it: one line per dish.
 *
 * Every round of ordering is its own order with its own lines — that is how a
 * KOT knows which items are new for the kitchen — so a dish ordered twice is
 * two order_items rows. The bill shows them as one line with the quantities
 * added up. The rows underneath stay separate; `parts` keeps them, oldest
 * first, so an edit to the merged line can be applied to the real rows.
 *
 * Lines merge only when the dish AND the price match: the same dish at a
 * different price (an edited rate, a manual line) is a different charge and
 * stays visible as one.
 */
export function groupBillLines(items) {
  const groups = new Map();
  for (const item of items || []) {
    const dish = item.menuItemId || `manual:${item.name}`;
    const key = `${dish}|${Number(item.price)}`;
    const part = { id: item.id, orderId: item.orderId, qty: Number(item.qty) || 0 };
    const g = groups.get(key);
    if (g) {
      g.qty += part.qty;
      g.parts.push(part);
      g.orderId = part.orderId;
    } else {
      groups.set(key, {
        ...item,
        key,
        qty: part.qty,
        parts: [part],
      });
    }
  }
  return [...groups.values()];
}

/**
 * The row changes that take a merged line from its current quantity to
 * `newQty`. More goes on the newest round (what the kitchen is about to get);
 * fewer comes off the newest rounds first, so the oldest, longest-cooked
 * items are the last to be touched.
 *
 * Returns [{ id, orderId, qty }] — qty 0 means the row is removed (or voided,
 * if it has already gone to the kitchen).
 */
export function planLineQtyChange(line, newQty) {
  const target = Math.max(0, Math.floor(Number(newQty) || 0));
  const parts = line?.parts || [];
  if (parts.length === 0 || target === line.qty) return [];

  if (target > line.qty) {
    const newest = parts[parts.length - 1];
    return [{ id: newest.id, orderId: newest.orderId, qty: newest.qty + (target - line.qty) }];
  }

  let toRemove = line.qty - target;
  const changes = [];
  for (const part of [...parts].reverse()) {
    if (toRemove <= 0) break;
    const take = Math.min(part.qty, toRemove);
    changes.push({ id: part.id, orderId: part.orderId, qty: part.qty - take });
    toRemove -= take;
  }
  return changes;
}
