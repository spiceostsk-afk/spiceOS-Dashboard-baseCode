# Inventory & Stock Control — runbook

PetPooja-grade stock management for Spice OS: per-outlet balances, purchases,
wastage, transfers, closing-stock counts, and the Stock Summary report.

## 1. Run the migration

`db/migrate_inventory_stock.sql`, once, in the Supabase SQL Editor
(project `vfdmedydwxwdkvoarkho`). It must run **after** `db/schema.sql` and
`db/migrate_recipes_inventory.sql`. It is idempotent — re-running is safe.

It will, in order:

1. Create `outlets` and give every existing restaurant one default outlet.
2. Stamp `orders.outlet_id` on all existing orders.
3. Promote the free-text `inventory_items.category` into an
   `inventory_categories` master and link each item to its row.
4. Add `purchase_unit` / `conversion_factor` / `barcode` / `stock_cycle` /
   `last_purchase_rate` to `inventory_items`, defaulting the purchase unit to
   the existing unit at 1:1 (no behaviour change until you edit an item).
5. Move balances into `inventory_stock` (per outlet), keeping
   `inventory_items.stock` as the roll-up so nothing that reads it breaks.
6. Add `movement_type` to `stock_movements` and **backfill every existing row**
   from its `reason` text.
7. Create vendors, purchases, wastage, transfers and stock-count tables.
8. Create the `stock_summary()` report function.
9. Apply `tenant_isolation` RLS to all twelve new tables.

### Verifying it worked

```sql
-- every restaurant has exactly one default outlet
select r.name, count(o.*) filter (where o.is_default) as defaults
from restaurants r left join outlets o on o.restaurant_id = r.id
group by r.name;

-- no movement is left untyped
select movement_type, count(*) from stock_movements group by 1 order by 2 desc;

-- the roll-up agrees with the per-outlet detail
select i.item_name, i.stock, sum(s.qty) as per_outlet
from inventory_items i left join inventory_stock s on s.inventory_item_id = i.id
group by i.id, i.item_name, i.stock
having i.stock is distinct from coalesce(sum(s.qty), 0);   -- expect 0 rows

-- smoke the report
select * from stock_summary(null, current_date - 30, current_date) limit 10;
```

## 2. What each column of the report means

`stock_summary(p_outlet_id, p_from, p_to, p_category_id, p_search, p_unit_type)`

| Column | Definition |
|---|---|
| Opening Stock | sum of every movement **before** `p_from` |
| Purchase Stock | posted purchases, net of purchase returns, in range |
| Total Stock | opening + purchase + transfer in |
| Consumption | recipe depletion from orders (positive magnitude) |
| Transfer In / Out | between outlets (positive magnitudes) |
| Wastage | recorded spoilage etc. (positive magnitude) |
| **Ideal Stock** | what the books say **before** any count corrects them |
| **Physical Stock** | the latest *submitted* count in range; `null` = never counted |
| **Variance** | physical − ideal. Negative = less on the shelf than expected |
| Remark | whatever the operator typed against that variance |
| Closing Stock | the balance actually carried forward (includes count corrections) |

`p_unit_type = 'purchase'` divides every quantity by the item's conversion
factor and reports the purchase unit — the "Unit Type" filter in the report.

Dates are resolved in the restaurant's own timezone, so a day boundary matches
service, not UTC.

## 3. Day-to-day flow

```
Inventory ▸ Raw Materials      define items, units, conversion, reorder level
Inventory ▸ Purchase           vendor invoice  →  stock in
Inventory ▸ Wastage            spoilage        →  stock out, with a reason
Inventory ▸ Transfer           branch A → B    →  send, then receive
Inventory ▸ Available Stock    spot-check mid-service
Inventory ▸ Closing Stock      end of day: count, review, post
Inventory ▸ Stock Summary      the eleven-column report, exportable as CSV
```

Consumption needs no entry — the existing `order_items` trigger deducts recipe
ingredients from whichever outlet took the order.

## 4. Design decisions worth knowing

**One canonical unit.** Stock, recipes and the ledger are always in the item's
consumption unit. `purchase_unit` + `conversion_factor` are an entry-time
convenience only, converted the moment a line is saved. No conversion bug can
reach a stored balance.

**Nothing writes a balance directly.** Every feature posts through
`post_stock_movement()`, which updates `inventory_stock`, refreshes the
`inventory_items.stock` roll-up and appends the ledger row in one statement.
Balances and ledger cannot drift.

**Counts only move what was counted.** A blank row on a count sheet means
"nobody looked at this", not "there is none". Untouched lines are skipped on
submit — writing them to zero would be the most destructive thing this module
could do.

**Ideal is re-snapshotted on open and again on submit.** A sheet drafted at 9pm
and submitted at 11pm is measured against 11pm's expectation, so the orders
served in between do not appear as a phantom variance.

**Transfers are two-step.** Stock leaves the source on send and arrives on
receive, at the quantity actually accepted. A short receipt is booked as a
`shortage` at the destination — the source already gave up the full amount, so
deducting the gap there too would double-count the loss.

## 5. Known gap

`production_in` / `production_out` movement types and the report's Production
column exist, but there is **no UI to record production** (turning raw materials
into a semi-finished item). The client's column list did not ask for it; the
PetPooja screenshots show it. Items can already be flagged `semi_finished` in
the item master, so the data model is ready if it is wanted later.
