-- =============================================================================
-- Spice OS — Void KOT keeps its stock out; a late entry cannot move a count
-- Run once in the Supabase SQL Editor, AFTER db/fix_deleted_line_reversal_date.sql.
-- Safe to re-run.
-- =============================================================================
-- TWO CLIENT RULES (2026-09-16)
--
-- 1. A KOT that is voided has still been cooked. "Stock will be removed but
--    not sale." The dish's ingredients stay consumed, nothing is earned, and
--    the value shows as Void KOT (see views/reports/VoidKotReport.jsx).
--
--    Until now cancelling a line (order_items.is_cancelled) handed its
--    ingredients back to stock, as if the kitchen had never cooked it. Voiding
--    a whole table already left stock alone, because it cancels the orders
--    and never touches the lines. Now both agree: stock follows the line for as
--    long as the line exists, cancelled or not. Only DELETING a line returns
--    its stock, because a delete means the line was a mistake and never
--    happened, like the duplicate 9 Sep day sheet.
--
--    No line has ever been cancelled in production (checked 2026-09-16), so no
--    past movement needs converting.
--
-- 2. An entry dated a day belongs to that day, and the closing count still
--    decides how that day ends. "If transfer is on the same [day] it will be
--    counted in that day only."
--
--    Today, a purchase, transfer, wastage or backdated sale posted AFTER that
--    day's closing count was submitted lands on top of the counted figure, and
--    the next day no longer opens at the count. BABAMEENA08SEP2026 was posted at
--    18:53 against a count submitted at 18:26: 9 Sep opened at 4 plates of
--    Akhni instead of 0.
--
--    Now any such entry, or its removal, re-applies the count: a correction
--    of the same size, opposite sign, is posted on the count itself. The entry
--    shows in its own day's column (Purchase, Transfer…), the count still
--    closes the day, and the Variance column changes to what the count
--    actually found against the full books. The correction references the
--    count, so reopening the count clears it along with the rest.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Stock follows the order line; cancellation only affects the sale
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.order_items_stock_sync()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- A line entered already cancelled was still sent, so still cooked.
    PERFORM public.apply_recipe_stock(
      NEW.restaurant_id, NEW.menu_item_id, -NEW.quantity, NEW.id, 'Order placed');
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- A delete says the line never happened, so its stock comes back, whether
    -- or not it had been voided (a void no longer returns anything itself).
    PERFORM public.apply_recipe_stock(
      OLD.restaurant_id, OLD.menu_item_id, OLD.quantity, OLD.id, 'Order line deleted');
    RETURN OLD;
  END IF;

  -- UPDATE. is_cancelled on its own moves no stock: a Void KOT was cooked.
  IF OLD.menu_item_id IS DISTINCT FROM NEW.menu_item_id THEN
    -- A swapped dish is a return plus a fresh take.
    PERFORM public.apply_recipe_stock(
      OLD.restaurant_id, OLD.menu_item_id, OLD.quantity, OLD.id, 'Dish changed');
    PERFORM public.apply_recipe_stock(
      NEW.restaurant_id, NEW.menu_item_id, -NEW.quantity, NEW.id, 'Dish changed');
  ELSIF OLD.quantity IS DISTINCT FROM NEW.quantity THEN
    PERFORM public.apply_recipe_stock(
      NEW.restaurant_id, NEW.menu_item_id, OLD.quantity - NEW.quantity, NEW.id, 'Quantity changed');
  END IF;

  RETURN NEW;
END;
$fn$;

-- ----------------------------------------------------------------------------
-- 2. A late entry re-applies the count that already closed its day
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stock_movements_reapply_count()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  m       record;
  v_sign  numeric;           -- +1 an entry arrived, -1 an entry was removed
  v_tz    text;
  cnt     record;
  v_at    timestamptz;
BEGIN
  IF TG_OP = 'INSERT' THEN m := NEW; v_sign := 1; ELSE m := OLD; v_sign := -1; END IF;

  -- A count's own movements are what closes the day; never correct those.
  IF m.movement_type = 'physical_count' OR m.ref_table = 'stock_counts'
     OR m.inventory_item_id IS NULL OR COALESCE(m.delta, 0) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(r.timezone, 'Asia/Kolkata') INTO v_tz
  FROM public.restaurants r WHERE r.id = m.restaurant_id;
  v_tz := COALESCE(v_tz, 'Asia/Kolkata');

  -- The first submitted closing count, on or after the entry's own day, that
  -- counted this item. That count has already fixed the closing balance, and
  -- every later day opens from it, so it is the one to re-apply.
  SELECT sc.id, sc.count_date, ci.id AS line_id, ci.rate
    INTO cnt
  FROM public.stock_counts sc
  JOIN public.stock_count_items ci
    ON ci.count_id = sc.id AND ci.inventory_item_id = m.inventory_item_id
  WHERE sc.restaurant_id = m.restaurant_id
    AND sc.outlet_id = m.outlet_id
    AND sc.status = 'submitted'
    AND sc.count_type = 'closing'
    AND ci.physical_qty IS NOT NULL
    AND sc.count_date >= (m.created_at AT TIME ZONE v_tz)::date
  ORDER BY sc.count_date
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;             -- no count has closed that day yet: nothing to protect
  END IF;

  v_at := ((cnt.count_date + 1)::timestamp - interval '1 second') AT TIME ZONE v_tz;

  PERFORM public.post_stock_movement(
    m.restaurant_id, m.outlet_id, m.inventory_item_id,
    -v_sign * m.delta, 'physical_count', 'Closing stock count',
    'stock_counts', cnt.id, cnt.rate,
    CASE WHEN v_sign > 0
         THEN 'Count re-applied: ' || COALESCE(m.reason, m.movement_type) || ' entered after the count'
         ELSE 'Count re-applied: ' || COALESCE(m.reason, m.movement_type) || ' removed after the count'
    END,
    v_at);

  -- Keep the count sheet's own figures in step: the books it was measured
  -- against moved, so did what it found.
  UPDATE public.stock_count_items
     SET ideal_qty  = COALESCE(ideal_qty, 0) + v_sign * m.delta,
         variance   = COALESCE(variance, 0) - v_sign * m.delta,
         updated_at = now()
   WHERE id = cnt.line_id;

  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_stock_movements_reapply_count ON public.stock_movements;
CREATE TRIGGER trg_stock_movements_reapply_count
AFTER INSERT OR DELETE ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.stock_movements_reapply_count();

-- ----------------------------------------------------------------------------
-- 3. Re-apply the counts that late entries have already disturbed
--
--    Walked in date order, as fix_stock_count_variance.sql does, because each
--    day opens from the one before. Wali Baba only: other tenants hold test
--    data. On 2026-09-16 this was six lines, Akhni Chicken Boti Semi and Rice
--    on 5, 6 and 8 Sep.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reapply_disturbed_counts()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_rest   uuid := 'b88e5c07-24d7-4386-8c47-e48f4cab23ee';   -- Wali Baba
  ln       record;
  v_tz     text;
  v_at     timestamptz;
  v_actual numeric;
  v_own    numeric;
  v_delta  numeric;
  fixed    jsonb := '[]'::jsonb;
BEGIN
  SELECT COALESCE(r.timezone, 'Asia/Kolkata') INTO v_tz
  FROM public.restaurants r WHERE r.id = v_rest;
  v_tz := COALESCE(v_tz, 'Asia/Kolkata');

  FOR ln IN
    SELECT sc.id AS count_id, sc.count_date, sc.outlet_id,
           ci.id AS line_id, ci.inventory_item_id, ci.physical_qty, ci.rate,
           i.item_name
    FROM public.stock_counts sc
    JOIN public.stock_count_items ci ON ci.count_id = sc.id
    JOIN public.inventory_items i ON i.id = ci.inventory_item_id
    WHERE sc.restaurant_id = v_rest
      AND sc.status = 'submitted'
      AND sc.count_type = 'closing'
      AND ci.physical_qty IS NOT NULL
    ORDER BY sc.count_date, i.item_name
  LOOP
    v_at := ((ln.count_date + 1)::timestamp - interval '1 second') AT TIME ZONE v_tz;

    SELECT COALESCE(SUM(m.delta), 0) INTO v_actual
    FROM public.stock_movements m
    WHERE m.inventory_item_id = ln.inventory_item_id
      AND m.outlet_id = ln.outlet_id
      AND m.created_at <= v_at;

    v_delta := ln.physical_qty - v_actual;
    CONTINUE WHEN v_delta = 0;

    SELECT COALESCE(SUM(m.delta), 0) INTO v_own
    FROM public.stock_movements m
    WHERE m.inventory_item_id = ln.inventory_item_id
      AND m.outlet_id = ln.outlet_id
      AND m.ref_table = 'stock_counts' AND m.ref_id = ln.count_id;

    PERFORM public.post_stock_movement(
      v_rest, ln.outlet_id, ln.inventory_item_id,
      v_delta, 'physical_count', 'Closing stock count',
      'stock_counts', ln.count_id, ln.rate,
      'Count re-applied: an entry for this day was posted after the count',
      v_at);

    UPDATE public.stock_count_items
       SET ideal_qty  = v_actual - v_own,
           variance   = ln.physical_qty - (v_actual - v_own),
           updated_at = now()
     WHERE id = ln.line_id;

    fixed := fixed || jsonb_build_object(
      'day', ln.count_date, 'item', ln.item_name,
      'counted', ln.physical_qty, 'books_were', v_actual, 'correction', v_delta);
  END LOOP;

  RETURN jsonb_build_object('corrected', fixed);
END;
$fn$;

SELECT jsonb_pretty(public.reapply_disturbed_counts()) AS repair;

DROP FUNCTION public.reapply_disturbed_counts();

-- =============================================================================
-- VERIFY. Expect count_gaps 0, cancel_moves_stock false and trigger_live true.
-- =============================================================================
SELECT jsonb_pretty(jsonb_build_object(
  'count_gaps', (
    SELECT count(*)
    FROM public.stock_counts sc
    JOIN public.stock_count_items ci ON ci.count_id = sc.id
    WHERE sc.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
      AND sc.status = 'submitted' AND sc.count_type = 'closing'
      AND ci.physical_qty IS NOT NULL
      AND ci.physical_qty <> (
        SELECT COALESCE(SUM(m.delta), 0) FROM public.stock_movements m
        WHERE m.inventory_item_id = ci.inventory_item_id AND m.outlet_id = sc.outlet_id
          AND (m.created_at AT TIME ZONE 'Asia/Kolkata')::date <= sc.count_date)),
  'cancel_moves_stock', (
    SELECT prosrc ILIKE '%Item cancelled%' FROM pg_proc
    WHERE proname = 'order_items_stock_sync' AND pronamespace = 'public'::regnamespace),
  'trigger_live', EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_stock_movements_reapply_count')
)) AS after_state;
