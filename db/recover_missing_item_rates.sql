-- =============================================================================
-- Spice OS — put a cost back on items that have none
-- Run in the Supabase SQL Editor. Section 1 is read-only; read it before
-- running section 3. Safe to re-run.
-- =============================================================================
-- WHY
--
-- 204 active items have last_purchase_rate = 0, so every one of them values
-- its stock at nothing. That is what makes Purchase Value, Stock Value and
-- Variance Value all read ₹0.00 however much stock is on the shelf.
--
-- Two things caused it and both are now fixed in code:
--
--   1. Posting a purchase copied the line's rate onto the item, INCLUDING a
--      zero. That zero then prefilled the rate box on the next invoice for
--      that item, so one blank field quietly became the default and spread.
--      migrate_document_date_movements.sql now only writes a rate above zero.
--
--   2. Nothing warned when a line had a quantity but no rate. The purchase
--      form now turns the rate box amber and asks before saving.
--
-- Neither of those can invent a price that was never typed. This script
-- recovers the ones that CAN be recovered — items priced on some earlier
-- document, whose cost was later overwritten with a zero — and tells you
-- exactly which items are left for someone to price by hand.
--
-- WHERE A RATE IS RECOVERED FROM
--
-- stock_movements.rate, which post_purchase already stores in BASE units.
-- Using the ledger rather than purchase_items avoids having to redo the
-- purchase-unit conversion, and it picks up rates from any document type.
-- The most recent non-zero rate for the item wins.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. LOOK FIRST — how many are recoverable, and what would be written
-- ----------------------------------------------------------------------------
SELECT jsonb_pretty(jsonb_build_object(
  'items_with_no_rate', (
    SELECT count(*) FROM public.inventory_items
    WHERE is_active AND COALESCE(last_purchase_rate, 0) = 0),
  'recoverable_from_ledger', (
    SELECT count(*) FROM public.inventory_items i
    WHERE i.is_active AND COALESCE(i.last_purchase_rate, 0) = 0
      AND EXISTS (
        SELECT 1 FROM public.stock_movements m
        WHERE m.inventory_item_id = i.id AND COALESCE(m.rate, 0) > 0)),
  'must_be_priced_by_hand', (
    SELECT count(*) FROM public.inventory_items i
    WHERE i.is_active AND COALESCE(i.last_purchase_rate, 0) = 0
      AND NOT EXISTS (
        SELECT 1 FROM public.stock_movements m
        WHERE m.inventory_item_id = i.id AND COALESCE(m.rate, 0) > 0)),
  'sample_of_what_would_be_written', (
    SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
      SELECT i.item_name,
             i.unit,
             ROUND(i.stock, 3) AS stock_on_hand,
             r.rate            AS rate_to_write,
             r.created_at::date AS rate_last_seen
      FROM public.inventory_items i
      CROSS JOIN LATERAL (
        SELECT m.rate, m.created_at
        FROM public.stock_movements m
        WHERE m.inventory_item_id = i.id AND COALESCE(m.rate, 0) > 0
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT 1
      ) r
      WHERE i.is_active AND COALESCE(i.last_purchase_rate, 0) = 0
      ORDER BY i.stock DESC NULLS LAST
      LIMIT 25
    ) x)
)) AS before_state;

-- ----------------------------------------------------------------------------
-- 2. THE ITEMS SOMEONE HAS TO PRICE BY HAND
--
--    Nothing in the ledger has ever carried a cost for these, so there is
--    nothing to recover. Sorted by how much stock is sitting on them, because
--    that is the order worth working through — an item with 40 kg on the shelf
--    distorts the valuation far more than one with none.
--
--    Set these on Inventory → Raw Materials, or on the next purchase invoice.
-- ----------------------------------------------------------------------------
SELECT i.item_name,
       COALESCE(c.name, i.category, 'Uncategorised') AS category,
       i.unit,
       ROUND(COALESCE(i.stock, 0), 3) AS stock_on_hand
FROM public.inventory_items i
LEFT JOIN public.inventory_categories c ON c.id = i.category_id
WHERE i.is_active
  AND COALESCE(i.last_purchase_rate, 0) = 0
  AND NOT EXISTS (
    SELECT 1 FROM public.stock_movements m
    WHERE m.inventory_item_id = i.id AND COALESCE(m.rate, 0) > 0)
ORDER BY COALESCE(i.stock, 0) DESC, i.item_name;

-- ----------------------------------------------------------------------------
-- 3. RECOVER — only runs where a real rate exists in the ledger
--
--    An item that already has a rate is not touched, so this cannot overwrite
--    a price someone has since typed in by hand.
-- ----------------------------------------------------------------------------
UPDATE public.inventory_items i
   SET last_purchase_rate = (
         SELECT m.rate
         FROM public.stock_movements m
         WHERE m.inventory_item_id = i.id
           AND COALESCE(m.rate, 0) > 0
         ORDER BY m.created_at DESC, m.id DESC
         LIMIT 1
       ),
       updated_at = now()
 WHERE i.is_active
   AND COALESCE(i.last_purchase_rate, 0) = 0
   -- Without this the SET subquery would write NULL over the zero for every
   -- item that has no priced history, which is not an improvement.
   AND EXISTS (
     SELECT 1 FROM public.stock_movements m
     WHERE m.inventory_item_id = i.id AND COALESCE(m.rate, 0) > 0
   );

-- ----------------------------------------------------------------------------
-- 4. VERIFY
-- ----------------------------------------------------------------------------
SELECT jsonb_pretty(jsonb_build_object(
  'items_still_without_a_rate', (
    SELECT count(*) FROM public.inventory_items
    WHERE is_active AND COALESCE(last_purchase_rate, 0) = 0),
  'of_those_holding_stock', (
    SELECT count(*) FROM public.inventory_items
    WHERE is_active AND COALESCE(last_purchase_rate, 0) = 0
      AND COALESCE(stock, 0) <> 0),
  'rates_recovered_now_priced', (
    SELECT count(*) FROM public.inventory_items
    WHERE is_active AND COALESCE(last_purchase_rate, 0) > 0)
)) AS after_state;
