-- =============================================================================
-- Spice OS — a physical count must decide the day it counted
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- =============================================================================
-- THE BUG
--
-- submit_stock_count measured the variance against the wrong number:
--
--     SELECT COALESCE(qty, 0) INTO v_ideal
--     FROM public.inventory_stock                -- the LIVE balance, right now
--     WHERE outlet_id = c.outlet_id AND inventory_item_id = ln.inventory_item_id;
--
--     v_var := ln.physical_qty - v_ideal;        -- posted at 23:59:59 on count_date
--
-- inventory_stock.qty is the balance across EVERY day, including the days
-- after the one being counted. The correction is then stamped at the end of
-- the counted day. Count the 2nd, submit on the 5th, and the 2nd is measured
-- against the 5th.
--
-- Rumali Roti, counted 0 on 2 Sep and submitted on the 5th:
--
--     books at end of 2 Sep      -206
--     correct variance           +206
--     what it compared against   -406   (the 5 Sep balance)
--     variance it posted         +406
--     so 3 Sep opened at         +200   instead of 0
--
-- Worse, the error hides itself. By the time the 3 Sep count was submitted the
-- over-correction had pushed the live balance to exactly the counted figure,
-- so that count computed a variance of zero and posted nothing at all. It
-- looked like it had worked.
--
-- Across the two submitted counts, 48 of 87 counted lines did not carry into
-- the next day.
--
-- THE FIX
--
-- Measure against the balance AS OF the moment the count applies to — the sum
-- of every movement up to that instant, and nothing after it. Then the day
-- ends at the counted figure, and because opening is by construction the
-- previous day's closing, the next day opens there too.
--
-- SECOND BUG: a spot check was recorded as a closing figure
--
-- v_at was 23:59:59 on count_date whatever the count_type. A mid-service
-- "Available stock" check therefore claimed to be that day's closing balance
-- and fought the real closing count — two counts on one day, and whichever was
-- submitted last silently won. An available count now lands at the moment it
-- is taken.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. The corrected function
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_stock_count(p_count_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  c    record;
  ln   record;
  v_tz text;
  v_at timestamptz;
BEGIN
  SELECT * INTO c FROM public.stock_counts WHERE id = p_count_id;
  IF c IS NULL THEN RAISE EXCEPTION 'Stock count % not found', p_count_id; END IF;
  IF c.restaurant_id IS DISTINCT FROM public.current_restaurant_id()
     AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;
  IF c.status <> 'draft' THEN RAISE EXCEPTION 'Stock count is already %', c.status; END IF;

  SELECT COALESCE(r.timezone, 'Asia/Kolkata') INTO v_tz
  FROM public.restaurants r WHERE r.id = c.restaurant_id;
  v_tz := COALESCE(v_tz, 'Asia/Kolkata');

  -- A closing count is the end of its day. An available count is a spot check
  -- taken during service, so it lands when it was taken — never at 23:59:59,
  -- where it would masquerade as the closing figure. For a spot check entered
  -- against an earlier date, midday is the honest stand-in: plainly inside the
  -- day, plainly not its close.
  IF c.count_type = 'closing' THEN
    v_at := ((c.count_date + 1)::timestamp - interval '1 second') AT TIME ZONE v_tz;
  ELSIF (now() AT TIME ZONE v_tz)::date = c.count_date THEN
    v_at := now();
  ELSE
    v_at := (c.count_date::timestamp + interval '12 hours') AT TIME ZONE v_tz;
  END IF;

  FOR ln IN
    SELECT * FROM public.stock_count_items
    WHERE count_id = p_count_id AND physical_qty IS NOT NULL
  LOOP
    DECLARE
      v_ideal numeric;
      v_var   numeric;
    BEGIN
      -- What the books said AT THAT MOMENT, not what they say now. This is the
      -- whole fix: everything up to v_at, nothing after it.
      SELECT COALESCE(SUM(m.delta), 0) INTO v_ideal
      FROM public.stock_movements m
      WHERE m.inventory_item_id = ln.inventory_item_id
        AND m.outlet_id = c.outlet_id
        AND m.created_at <= v_at;

      v_var := ln.physical_qty - v_ideal;

      UPDATE public.stock_count_items
         SET ideal_qty = v_ideal, variance = v_var, updated_at = now()
       WHERE id = ln.id;

      IF v_var <> 0 THEN
        PERFORM public.post_stock_movement(
          c.restaurant_id, c.outlet_id, ln.inventory_item_id,
          v_var, 'physical_count',
          CASE WHEN c.count_type = 'closing' THEN 'Closing stock count'
               ELSE 'Available stock count' END,
          'stock_counts', c.id, ln.rate, ln.remark,
          v_at);
      END IF;
    END;
  END LOOP;

  UPDATE public.stock_counts
     SET status = 'submitted', submitted_at = now(), updated_at = now()
   WHERE id = p_count_id;
END;
$fn$;

-- ----------------------------------------------------------------------------
-- 2. Repair the counts that were already posted wrong
--
--    Walked in date order, because the days are a chain: repairing the 2nd
--    changes what the 3rd opens at, so the 3rd can only be judged once the 2nd
--    is right. For each counted line, whatever is needed to make that day end
--    at the figure someone physically wrote down is posted as a correction
--    dated to that day's end.
--
--    Corrections are posted rather than old movements edited. The original
--    count and its mistake stay on the ledger where they can be seen, which is
--    the same reason a wrong invoice gets a credit note instead of an eraser.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.repair_posted_stock_counts()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_rest    uuid := 'b88e5c07-24d7-4386-8c47-e48f4cab23ee';   -- Wali Baba
  ln        record;
  v_tz      text;
  v_at      timestamptz;
  v_actual  numeric;
  v_delta   numeric;
  n_fixed   integer := 0;
  n_ok      integer := 0;
  v_moved   numeric := 0;
BEGIN
  SELECT COALESCE(r.timezone, 'Asia/Kolkata') INTO v_tz
  FROM public.restaurants r WHERE r.id = v_rest;
  v_tz := COALESCE(v_tz, 'Asia/Kolkata');

  FOR ln IN
    SELECT sc.count_date, sc.count_type, sc.outlet_id, sc.id AS count_id,
           ci.inventory_item_id, ci.physical_qty, ci.rate, ci.id AS line_id,
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

    UPDATE public.stock_count_items
       SET ideal_qty = v_actual - COALESCE((
             SELECT SUM(m.delta) FROM public.stock_movements m
             WHERE m.inventory_item_id = ln.inventory_item_id
               AND m.outlet_id = ln.outlet_id
               AND m.ref_table = 'stock_counts' AND m.ref_id = ln.count_id), 0),
           variance = v_delta,
           updated_at = now()
     WHERE id = ln.line_id;

    IF v_delta = 0 THEN
      n_ok := n_ok + 1;
    ELSE
      PERFORM public.post_stock_movement(
        v_rest, ln.outlet_id, ln.inventory_item_id,
        v_delta, 'physical_count',
        'Closing stock count',
        'stock_counts', ln.count_id, ln.rate,
        'Correction: the count of ' || to_char(ln.count_date, 'DD Mon')
          || ' was measured against a later balance',
        v_at);
      n_fixed := n_fixed + 1;
      v_moved := v_moved + v_delta;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'lines_already_right', n_ok,
    'lines_corrected',     n_fixed,
    'net_stock_change',    v_moved);
END;
$fn$;

SELECT jsonb_pretty(public.repair_posted_stock_counts()) AS repair;

-- =============================================================================
-- VERIFY — every counted line must now be what its day closes at, and
-- therefore what the next day opens at. Expect gaps_remaining to be 0.
-- =============================================================================
WITH counted AS (
  SELECT sc.count_date, ci.inventory_item_id, sc.outlet_id, i.item_name,
         ci.physical_qty
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
  'lines_checked',   (SELECT count(*) FROM chk),
  'gaps_remaining',  (SELECT count(*) FROM chk WHERE physical_qty <> opens_next_day),
  'still_wrong',     (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                        'day', count_date, 'item', item_name,
                        'counted', physical_qty, 'opens_at', opens_next_day)), '[]'::jsonb)
                      FROM chk WHERE physical_qty <> opens_next_day),
  'negative_items',  (SELECT count(*) FROM public.inventory_stock s
                       JOIN public.inventory_items i ON i.id = s.inventory_item_id
                      WHERE i.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
                        AND s.qty < 0)
)) AS after_state;
