-- =============================================================================
-- Spice OS — move a day sheet that was recorded against the wrong date
-- Run once in the Supabase SQL Editor. Safe to re-run (it moves by a fixed
-- target date, not by an offset, so running twice changes nothing the second
-- time).
-- =============================================================================
-- WHAT HAPPENED
--
-- A day sheet was entered for 6 September when the trade belonged to the 5th.
-- Sales Entry books a sheet at 21:00 local on the date chosen, and stamps that
-- same instant on the session, the order, every line, the bill and every
-- consumption movement the recipes produced. Correcting the date therefore
-- means moving all six, not just the one the screen shows.
--
-- WHY THE COUNTS HAVE TO BE REPAIRED AFTERWARDS
--
-- Both days carry a submitted closing count — 5 September with 29 lines,
-- 6 September with 24. Their corrections were worked out with this sheet's
-- consumption on the 6th. Move it to the 5th and both days close somewhere
-- else, so repair_posted_stock_counts() runs at the end and puts every counted
-- day back on the figure someone physically wrote down.
--
-- WHICH SHEET THIS MOVES
--
--   the 33-dish sheet, Rs 31,640.00, session 3ead425a
--
-- Five sheets were recorded for 6 September. This is the one the circle was
-- drawn around. If it was meant to be the Rs 53,985.00 / 42-dish sheet below
-- it, swap the id in both places for da43ff7e-0adb-431c-a9f0-004a95f42e45.
--
--   Rs 31,640.00   33 dishes   3ead425a-3be4-414c-a883-6fd6c523b35e
--   Rs 53,985.00   42 dishes   da43ff7e-0adb-431c-a9f0-004a95f42e45
--   Rs 80,670.00   40 dishes   a2daf660-2a44-4936-bd77-7946304a2517
--   Rs  8,200.00   12 dishes   e14f4da4-80a4-4eed-8089-ba900e1168b3
--   Rs 11,920.00   20 dishes   b1954ab4-04b8-47de-9a41-4b78106d36c6
--
-- It is reversible: run it again with DATE '2026-09-06' to put it back.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. LOOK FIRST — what is about to move.
-- ----------------------------------------------------------------------------
SELECT jsonb_pretty(jsonb_build_object(
  'sheet', (
    SELECT jsonb_build_object(
             'recorded_for', (cs.ended_at AT TIME ZONE 'Asia/Kolkata')::date,
             'total',        (SELECT COALESCE(SUM(o.total), 0) FROM public.orders o
                               WHERE o.session_id = cs.id),
             'dishes',       (SELECT count(*) FROM public.order_items oi
                               JOIN public.orders o ON o.id = oi.order_id
                              WHERE o.session_id = cs.id),
             'consumption_movements', (
               SELECT count(*) FROM public.stock_movements m
               WHERE m.ref_table = 'order_items'
                 AND m.ref_id IN (SELECT oi.id FROM public.order_items oi
                                  JOIN public.orders o ON o.id = oi.order_id
                                  WHERE o.session_id = cs.id)))
    FROM public.customer_sessions cs
    WHERE cs.id = '3ead425a-3be4-414c-a883-6fd6c523b35e'::uuid),  -- 33 dishes, Rs 31,640.00
  'moving_to', DATE '2026-09-05'                                   -- << TARGET DATE
)) AS before_state;


-- ----------------------------------------------------------------------------
-- 2. Move it.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.move_day_sheet(p_session_id uuid, p_to_date date)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_rest   uuid := 'b88e5c07-24d7-4386-8c47-e48f4cab23ee';
  v_tz     text := 'Asia/Kolkata';
  cs       record;
  v_from   date;
  v_at     timestamptz;
  v_lines  uuid[];
  n_orders integer := 0;
  n_items  integer := 0;
  n_bills  integer := 0;
  n_moves  integer := 0;
  v_repair jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims',
                     json_build_object('restaurant_id', v_rest)::text, true);

  SELECT * INTO cs FROM public.customer_sessions WHERE id = p_session_id;
  IF cs IS NULL THEN RAISE EXCEPTION 'Session % not found', p_session_id; END IF;
  IF cs.restaurant_id IS DISTINCT FROM v_rest THEN
    RAISE EXCEPTION 'That sheet does not belong to this restaurant. Nothing moved.';
  END IF;

  v_from := (cs.ended_at AT TIME ZONE v_tz)::date;
  IF v_from = p_to_date THEN
    RETURN jsonb_build_object('status', 'already on ' || p_to_date);
  END IF;

  -- Keep the time of day the sheet was booked at (21:00 for a day sheet) and
  -- change only the date, so it still lands after the day's purchases and
  -- before that night's closing count.
  v_at := ((p_to_date + (cs.ended_at AT TIME ZONE v_tz)::time)::timestamp)
          AT TIME ZONE v_tz;

  SELECT array_agg(oi.id) INTO v_lines
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE o.session_id = p_session_id;

  UPDATE public.customer_sessions
     SET started_at = v_at - interval '45 minutes',
         ended_at   = v_at,
         metadata   = COALESCE(metadata, '{}'::jsonb)
                      || jsonb_build_object('moved_from', v_from, 'moved_at', now())
   WHERE id = p_session_id;

  UPDATE public.orders SET created_at = v_at WHERE session_id = p_session_id;
  GET DIAGNOSTICS n_orders = ROW_COUNT;

  UPDATE public.order_items SET created_at = v_at
   WHERE id = ANY(COALESCE(v_lines, '{}'::uuid[]));
  GET DIAGNOSTICS n_items = ROW_COUNT;

  UPDATE public.bills SET created_at = v_at, paid_at = v_at
   WHERE session_id = p_session_id;
  GET DIAGNOSTICS n_bills = ROW_COUNT;

  -- The consumption the recipes produced moves with the sale, or the food
  -- comes off one day's stock while the money lands on another.
  UPDATE public.stock_movements
     SET created_at = v_at
   WHERE ref_table = 'order_items'
     AND ref_id = ANY(COALESCE(v_lines, '{}'::uuid[]));
  GET DIAGNOSTICS n_moves = ROW_COUNT;

  -- Both days close somewhere new now, and both were counted.
  v_repair := public.repair_posted_stock_counts();

  RETURN jsonb_build_object(
    'moved_from', v_from,
    'moved_to',   p_to_date,
    'orders',     n_orders,
    'order_items', n_items,
    'bills',      n_bills,
    'stock_movements', n_moves,
    'counts_realigned', v_repair);
END;
$fn$;

SELECT jsonb_pretty(public.move_day_sheet(
  '3ead425a-3be4-414c-a883-6fd6c523b35e'::uuid,   -- 33 dishes, Rs 31,640.00
  DATE '2026-09-05'                               -- << TARGET DATE
)) AS result;


-- =============================================================================
-- VERIFY — the sheet should now sit on the target date, both days' takings
-- should have shifted by its total, and every counted line must still be what
-- its day closes at.
-- =============================================================================
WITH counted AS (
  SELECT sc.count_date, ci.inventory_item_id, sc.outlet_id, ci.physical_qty
  FROM public.stock_counts sc
  JOIN public.stock_count_items ci ON ci.count_id = sc.id
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
  'takings_by_day', (
    SELECT COALESCE(jsonb_object_agg(d, t), '{}'::jsonb) FROM (
      SELECT (cs.ended_at AT TIME ZONE 'Asia/Kolkata')::date::text AS d,
             SUM(o.total) AS t
      FROM public.customer_sessions cs
      JOIN public.orders o ON o.session_id = cs.id
      WHERE cs.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
        AND (cs.ended_at AT TIME ZONE 'Asia/Kolkata')::date
            BETWEEN DATE '2026-09-04' AND DATE '2026-09-07'
      GROUP BY 1) x),
  'lines_checked',  (SELECT count(*) FROM chk),
  'gaps_remaining', (SELECT count(*) FROM chk WHERE physical_qty <> opens_next_day),
  'negative_items', (SELECT count(*) FROM public.inventory_stock s
                      JOIN public.inventory_items i ON i.id = s.inventory_item_id
                     WHERE i.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
                       AND s.qty < 0)
)) AS after_state;
