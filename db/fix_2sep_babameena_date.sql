-- =============================================================================
-- Spice OS — put the 2 Sep Baba Meena purchase back on 2 September
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- =============================================================================
-- THE MISMATCH
--
-- Invoice 2SEP2026BABAMEENA is dated 2 September and shows 8 Plate of Akhni
-- Chicken Boti going to stock. Its stock movement landed on 3 September, so the
-- 2 September purchase drawer showed one entry of 230 (the Baba Factory
-- invoice) instead of two totalling 238.
--
-- WHY
--
-- post_purchase calls post_stock_movement without its optional eleventh
-- argument, so the movement falls back to now() — the day it was typed, not
-- the invoice date. This invoice was entered on the 3rd for the 2nd's goods.
--
-- Every other purchase is on the right day by accident: editing an invoice
-- runs repost_purchase, which DOES pass the date, and the others had all been
-- edited at some point. This one was posted once and never touched again.
--
-- The function itself is deliberately left alone for now — one invoice in a
-- hundred and two movements is not worth changing four posting functions over.
-- If it happens again, the fix is one argument in post_purchase:
--
--     'purchases', p.id, v_rate_base, NULL,
--     p.invoice_date::timestamptz          -- <- this line
--
-- post_wastage, receive_transfer and cancel_purchase have the same omission.
--
-- WHAT THIS DOES
--
-- Corrects created_at on the two affected movements — the same field a
-- re-post would have set. Nothing is inserted and nothing is deleted.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. LOOK FIRST
-- ----------------------------------------------------------------------------
SELECT jsonb_pretty(jsonb_build_object(
  'movements_to_move', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'item',         m.item_name,
             'qty',          m.delta,
             'invoice_date', p.invoice_date,
             'sitting_on',   (m.created_at AT TIME ZONE 'Asia/Kolkata')::date
           ) ORDER BY m.item_name), '[]'::jsonb)
    FROM public.stock_movements m
    JOIN public.purchases p ON p.id = m.ref_id AND m.ref_table = 'purchases'
    WHERE p.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
      AND p.invoice_no = '2SEP2026BABAMEENA'
      AND (m.created_at AT TIME ZONE 'Asia/Kolkata')::date <> p.invoice_date),
  'akhni_boti_on_2sep_now', (
    SELECT COALESCE(SUM(m.delta), 0) FROM public.stock_movements m
    JOIN public.inventory_items i ON i.id = m.inventory_item_id
    WHERE i.item_name = 'Akhni Chicken Boti' AND m.movement_type = 'purchase'
      AND (m.created_at AT TIME ZONE 'Asia/Kolkata')::date = DATE '2026-09-02')
)) AS before_state;


-- ----------------------------------------------------------------------------
-- 2. Move them, and re-align the days that were counted.
--
--    2 and 3 September both carry a submitted count, and their corrections
--    were worked out with these 8.8 units on the wrong side of midnight.
--    Shifting the stock without re-running the repair would leave 2 September
--    closing at its counted figure plus 8.8 — so both steps, in one function,
--    in one transaction.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fix_2sep_babameena_date()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_rest  uuid := 'b88e5c07-24d7-4386-8c47-e48f4cab23ee';
  n_moved integer := 0;
  v_repair jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims',
                     json_build_object('restaurant_id', v_rest)::text, true);

  UPDATE public.stock_movements m
     SET created_at = p.invoice_date::timestamptz
    FROM public.purchases p
   WHERE m.ref_table = 'purchases'
     AND m.ref_id = p.id
     AND p.restaurant_id = v_rest
     AND p.invoice_no = '2SEP2026BABAMEENA'
     AND m.created_at <> p.invoice_date::timestamptz;
  GET DIAGNOSTICS n_moved = ROW_COUNT;

  IF n_moved = 0 THEN
    RETURN jsonb_build_object('status', 'nothing to do — already on the right day');
  END IF;

  v_repair := public.repair_posted_stock_counts();

  RETURN jsonb_build_object('movements_redated', n_moved, 'counts_realigned', v_repair);
END;
$fn$;

SELECT jsonb_pretty(public.fix_2sep_babameena_date()) AS result;


-- =============================================================================
-- VERIFY — 2 September should now show 238 Plate of Akhni Chicken Boti
-- purchased (230 Baba Factory + 8 Baba Meena), with the counted days intact.
-- =============================================================================
WITH counted AS (
  SELECT sc.count_date, ci.inventory_item_id, sc.outlet_id, i.item_name, ci.physical_qty
  FROM public.stock_counts sc
  JOIN public.stock_count_items ci ON ci.count_id = sc.id
  JOIN public.inventory_items i ON i.id = ci.inventory_item_id
  WHERE sc.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
    AND sc.status = 'submitted' AND sc.count_type = 'closing'
    AND ci.physical_qty IS NOT NULL
),
chk AS (
  SELECT c.*,
         (SELECT COALESCE(SUM(m.delta), 0) FROM public.stock_movements m
           WHERE m.inventory_item_id = c.inventory_item_id
             AND m.outlet_id = c.outlet_id
             AND (m.created_at AT TIME ZONE 'Asia/Kolkata')::date <= c.count_date)
           AS opens_next_day
  FROM counted c
)
SELECT jsonb_pretty(jsonb_build_object(
  'akhni_boti_purchased_2sep', (
    SELECT COALESCE(SUM(m.delta), 0) FROM public.stock_movements m
    JOIN public.inventory_items i ON i.id = m.inventory_item_id
    WHERE i.item_name = 'Akhni Chicken Boti' AND m.movement_type = 'purchase'
      AND (m.created_at AT TIME ZONE 'Asia/Kolkata')::date = DATE '2026-09-02'),
  'entries_on_2sep', (
    SELECT count(*) FROM public.stock_movements m
    JOIN public.inventory_items i ON i.id = m.inventory_item_id
    WHERE i.item_name = 'Akhni Chicken Boti' AND m.movement_type = 'purchase'
      AND (m.created_at AT TIME ZONE 'Asia/Kolkata')::date = DATE '2026-09-02'),
  'babameena_still_misdated', (
    SELECT count(*) FROM public.stock_movements m
    JOIN public.purchases p ON p.id = m.ref_id AND m.ref_table = 'purchases'
    WHERE p.invoice_no = '2SEP2026BABAMEENA'
      AND (m.created_at AT TIME ZONE 'Asia/Kolkata')::date <> p.invoice_date),
  'lines_checked',  (SELECT count(*) FROM chk),
  'gaps_remaining', (SELECT count(*) FROM chk WHERE physical_qty <> opens_next_day),
  'negative_items', (SELECT count(*) FROM public.inventory_stock s
                      JOIN public.inventory_items i ON i.id = s.inventory_item_id
                     WHERE i.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
                       AND s.qty < 0)
)) AS after_state;
