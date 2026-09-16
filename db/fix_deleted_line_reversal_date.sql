-- =============================================================================
-- Spice OS — deleting an order line gives the stock back on the day it was sold
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- =============================================================================
-- THE SYMPTOM (reported for Barra and Akhni Chicken Boti, 9–10 Sep 2026)
--
-- The 9 Sep day sheet was entered twice. The duplicate (32 lines) was deleted
-- on 10 Sep at 16:09. Stock Summary then read:
--
--                               consumption shown   actually sold
--     Akhni Chicken Boti Semi   9 Sep  249          210
--                               10 Sep 151          190
--     Barra Semi                9 Sep   58           46
--                               10 Sep  32           44
--
-- The 9th kept the duplicate's consumption, and the 10th was credited with
-- its return. Twenty-one materials were affected, not just the two the client
-- noticed. Closing stock was right on both days, because the physical counts
-- absorbed the error, but Consumption, Ideal and Variance were wrong on both.
--
-- THE CAUSE
--
-- apply_recipe_stock learns WHEN and WHERE a sale happened by reading the
-- order line and its order:
--
--     SELECT o.outlet_id, o.created_at INTO v_outlet, v_at
--     FROM order_items oi JOIN orders o ON o.id = oi.order_id
--     WHERE oi.id = p_order_item_id;
--
-- On DELETE the trigger runs AFTER the row is gone, so this finds nothing.
-- v_at falls back to now(), which dates the return to whenever someone pressed
-- delete, and v_outlet falls back to the default outlet. Cancelling a line
-- (an UPDATE) was never affected because the row still exists.
--
-- THE FIX
--
-- When the order line is gone, the reversal copies the date and outlet of the
-- consumption it is undoing. That movement is what actually took the stock,
-- so a return that mirrors it lands on the same day and in the same outlet.
--
-- THE REPAIR
--
-- 1. Every misdated return is moved back to its sale's timestamp.
-- 2. For each affected material, the submitted closing counts from the sale
--    day onward are walked in date order, the same way
--    fix_stock_count_variance.sql does it. Moving the return onto the 9th
--    raised the 9th's books, so the 9th's count needs a correction of the same
--    size downward, and the 10th needs one upward. Every counted day still
--    ends at exactly the figure someone wrote down, and the live balance does
--    not change.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 0. LOOK FIRST (read-only): the returns filed under the wrong day
-- ----------------------------------------------------------------------------
SELECT r.restaurant_id,
       (o.created_at AT TIME ZONE 'Asia/Kolkata')::date AS sold_on,
       (r.created_at AT TIME ZONE 'Asia/Kolkata')::date AS returned_on,
       count(*)                                         AS movements,
       string_agg(DISTINCT r.item_name, ', ')           AS materials
FROM public.stock_movements r
CROSS JOIN LATERAL (
  SELECT m.created_at FROM public.stock_movements m
  WHERE m.ref_table = 'order_items' AND m.ref_id = r.ref_id
    AND m.inventory_item_id = r.inventory_item_id
    AND m.movement_type = 'consumption' AND m.reason <> 'Order line deleted'
  ORDER BY m.created_at LIMIT 1
) o
WHERE r.movement_type = 'consumption' AND r.reason = 'Order line deleted'
  AND (r.created_at AT TIME ZONE 'Asia/Kolkata')::date
      <> (o.created_at AT TIME ZONE 'Asia/Kolkata')::date
GROUP BY 1, 2, 3
ORDER BY 1, 2;

-- ----------------------------------------------------------------------------
-- 1. The corrected function
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_recipe_stock(
  p_restaurant_id uuid, p_menu_item_id uuid, p_servings numeric,
  p_order_item_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  ing      record;
  v_outlet uuid;
  v_at     timestamptz;
BEGIN
  IF p_menu_item_id IS NULL OR p_servings = 0 THEN
    RETURN;
  END IF;

  IF NOT public.auto_consumption_enabled(p_restaurant_id) THEN
    RETURN;
  END IF;

  -- The order says both WHERE and WHEN it was sold.
  SELECT o.outlet_id, o.created_at
    INTO v_outlet, v_at
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.id = p_order_item_id;

  -- A deleted line can no longer say either: the AFTER DELETE trigger runs
  -- once the row is gone. Undo the consumption where and when it was taken.
  IF NOT FOUND THEN
    SELECT m.outlet_id, m.created_at
      INTO v_outlet, v_at
    FROM public.stock_movements m
    WHERE m.ref_table = 'order_items'
      AND m.ref_id = p_order_item_id
      AND m.movement_type = 'consumption'
    ORDER BY m.created_at
    LIMIT 1;
  END IF;

  v_outlet := COALESCE(v_outlet, public.default_outlet_id(p_restaurant_id));

  FOR ing IN
    SELECT ri.inventory_item_id, ri.quantity
    FROM public.recipe_ingredients ri
    JOIN public.inventory_items inv ON inv.id = ri.inventory_item_id
    WHERE ri.menu_item_id  = p_menu_item_id
      AND ri.restaurant_id = p_restaurant_id
      AND inv.is_active
  LOOP
    PERFORM public.post_stock_movement(
      p_restaurant_id, v_outlet, ing.inventory_item_id,
      ing.quantity * p_servings, 'consumption', p_reason,
      'order_items', p_order_item_id, NULL, NULL,
      v_at);                                   -- null falls back to now()
  END LOOP;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.apply_recipe_stock(uuid, uuid, numeric, uuid, text) FROM public;

-- ----------------------------------------------------------------------------
-- 2. Repair the returns already filed under the wrong day
--
--    One function so the re-dating and the count corrections commit together.
--    The SQL Editor commits statement by statement. Re-dating without the
--    count corrections would leave the 9th closing 39 plates above its count.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.repair_deleted_line_reversals()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_affected jsonb;
  ln         record;
  v_at       timestamptz;
  v_actual   numeric;
  v_own      numeric;
  v_delta    numeric;
  n_moved    integer;
  n_fixed    integer := 0;
  n_ok       integer := 0;
BEGIN
  -- Move each return onto its sale's timestamp. Only when the outlet matches:
  -- a return posted to a different outlet also moved a balance, and needs a
  -- transfer, not a date change. None exist today, and any that appear are left alone.
  WITH misdated AS (
    SELECT r.id, o.created_at AS sold_at, r.restaurant_id, r.outlet_id,
           r.inventory_item_id
    FROM public.stock_movements r
    CROSS JOIN LATERAL (
      SELECT m.created_at, m.outlet_id FROM public.stock_movements m
      WHERE m.ref_table = 'order_items' AND m.ref_id = r.ref_id
        AND m.inventory_item_id = r.inventory_item_id
        AND m.movement_type = 'consumption' AND m.reason <> 'Order line deleted'
      ORDER BY m.created_at LIMIT 1
    ) o
    JOIN public.restaurants rest ON rest.id = r.restaurant_id
    WHERE r.movement_type = 'consumption' AND r.reason = 'Order line deleted'
      AND o.outlet_id IS NOT DISTINCT FROM r.outlet_id
      AND (r.created_at AT TIME ZONE COALESCE(rest.timezone, 'Asia/Kolkata'))::date
          <> (o.created_at AT TIME ZONE COALESCE(rest.timezone, 'Asia/Kolkata'))::date
  ),
  moved AS (
    UPDATE public.stock_movements s
       SET created_at = md.sold_at
      FROM misdated md
     WHERE s.id = md.id
    RETURNING md.restaurant_id, md.outlet_id, md.inventory_item_id, md.sold_at
  )
  SELECT count(*)::int,
         COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
           'restaurant_id', x.restaurant_id, 'outlet_id', x.outlet_id,
           'item_id', x.inventory_item_id, 'from_at', x.first_sold)), '[]'::jsonb)
    INTO n_moved, v_affected
  FROM (
    SELECT restaurant_id, outlet_id, inventory_item_id, sold_at,
           min(sold_at) OVER (PARTITION BY restaurant_id, outlet_id, inventory_item_id) AS first_sold
    FROM moved
  ) x;

  -- Walk the closing counts of every affected material in date order, so
  -- each day is judged only after the day before it has been corrected.
  FOR ln IN
    SELECT sc.id AS count_id, sc.count_date, sc.outlet_id, sc.restaurant_id,
           ci.id AS line_id, ci.inventory_item_id, ci.physical_qty, ci.rate,
           COALESCE(rest.timezone, 'Asia/Kolkata') AS tz
    FROM jsonb_to_recordset(v_affected)
         AS a(restaurant_id uuid, outlet_id uuid, item_id uuid, from_at timestamptz)
    JOIN public.stock_counts sc
      ON sc.restaurant_id = a.restaurant_id AND sc.outlet_id = a.outlet_id
    JOIN public.stock_count_items ci
      ON ci.count_id = sc.id AND ci.inventory_item_id = a.item_id
    JOIN public.restaurants rest ON rest.id = sc.restaurant_id
    WHERE sc.status = 'submitted'
      AND sc.count_type = 'closing'
      AND ci.physical_qty IS NOT NULL
      AND sc.count_date >= (a.from_at AT TIME ZONE COALESCE(rest.timezone, 'Asia/Kolkata'))::date
    ORDER BY sc.count_date, ci.inventory_item_id
  LOOP
    v_at := ((ln.count_date + 1)::timestamp - interval '1 second') AT TIME ZONE ln.tz;

    SELECT COALESCE(SUM(m.delta), 0) INTO v_actual
    FROM public.stock_movements m
    WHERE m.inventory_item_id = ln.inventory_item_id
      AND m.outlet_id = ln.outlet_id
      AND m.created_at <= v_at;

    SELECT COALESCE(SUM(m.delta), 0) INTO v_own
    FROM public.stock_movements m
    WHERE m.inventory_item_id = ln.inventory_item_id
      AND m.outlet_id = ln.outlet_id
      AND m.ref_table = 'stock_counts' AND m.ref_id = ln.count_id;

    v_delta := ln.physical_qty - v_actual;

    -- Ideal is the books before this count touched them; variance is what the
    -- count found against that.
    UPDATE public.stock_count_items
       SET ideal_qty  = v_actual - v_own,
           variance   = ln.physical_qty - (v_actual - v_own),
           updated_at = now()
     WHERE id = ln.line_id;

    IF v_delta = 0 THEN
      n_ok := n_ok + 1;
    ELSE
      PERFORM public.post_stock_movement(
        ln.restaurant_id, ln.outlet_id, ln.inventory_item_id,
        v_delta, 'physical_count', 'Closing stock count',
        'stock_counts', ln.count_id, ln.rate,
        'Correction: a deleted order line was returned to stock on the wrong day',
        v_at);
      n_fixed := n_fixed + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'returns_redated',       n_moved,
    'materials_affected',    jsonb_array_length(v_affected),
    'count_lines_corrected', n_fixed,
    'count_lines_already_ok', n_ok);
END;
$fn$;

SELECT jsonb_pretty(public.repair_deleted_line_reversals()) AS repair;

-- A one-off. It is harmless to keep, but nothing should ever call it again.
DROP FUNCTION public.repair_deleted_line_reversals();

-- =============================================================================
-- VERIFY — Wali Baba. Expect:
--   misdated_left   0
--   count_gaps      0   (every counted day from 9 Sep closes at its counted figure)
--
-- Checked from 9 Sep only. Six older gaps (Akhni and Rice on 5, 6 and 8 Sep)
-- predate this and are unrelated: a purchase for that day was posted after
-- its closing count had already been submitted, e.g. BABAMEENA08SEP2026 at
-- 18:53 against a count submitted at 18:26.
--   the two rows below showing 9 Sep = 210 / 46 and 10 Sep = 190 / 44
-- =============================================================================
WITH counted AS (
  SELECT sc.count_date, sc.outlet_id, ci.inventory_item_id, ci.physical_qty
  FROM public.stock_counts sc
  JOIN public.stock_count_items ci ON ci.count_id = sc.id
  WHERE sc.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
    AND sc.status = 'submitted' AND sc.count_type = 'closing'
    AND ci.physical_qty IS NOT NULL
    AND sc.count_date >= '2026-09-09'
)
SELECT jsonb_pretty(jsonb_build_object(
  'misdated_left', (
    SELECT count(*) FROM public.stock_movements r
    WHERE r.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
      AND r.reason = 'Order line deleted'
      AND (r.created_at AT TIME ZONE 'Asia/Kolkata')::date <> (
        SELECT (m.created_at AT TIME ZONE 'Asia/Kolkata')::date
        FROM public.stock_movements m
        WHERE m.ref_id = r.ref_id AND m.inventory_item_id = r.inventory_item_id
          AND m.movement_type = 'consumption' AND m.reason <> 'Order line deleted'
        ORDER BY m.created_at LIMIT 1)),
  'count_gaps', (
    SELECT count(*) FROM counted c
    WHERE c.physical_qty <> (
      SELECT COALESCE(SUM(m.delta), 0) FROM public.stock_movements m
      WHERE m.inventory_item_id = c.inventory_item_id AND m.outlet_id = c.outlet_id
        AND (m.created_at AT TIME ZONE 'Asia/Kolkata')::date <= c.count_date)),
  'consumption_9_10_sep', (
    SELECT jsonb_object_agg(k, v) FROM (
      SELECT m.item_name || ' ' || to_char((m.created_at AT TIME ZONE 'Asia/Kolkata')::date, 'DD-Mon') AS k,
             -SUM(m.delta) AS v
      FROM public.stock_movements m
      WHERE m.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
        AND m.inventory_item_id IN ('f328a977-c885-4a04-b1b9-58d2fb65a802',   -- Akhni Chicken Boti Semi
                                    '57b49451-9af0-44d2-8723-4c85e698af30')   -- Barra Semi
        AND m.movement_type = 'consumption'
        AND (m.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN '2026-09-09' AND '2026-09-10'
      GROUP BY 1) t)
)) AS after_state;
