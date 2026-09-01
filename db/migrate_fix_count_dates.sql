-- =============================================================================
-- Spice OS — fix: stock counts were dated when posted, not when counted
-- Run once in the Supabase SQL Editor, after db/migrate_inventory_phase2.sql.
-- Safe to re-run.
-- =============================================================================
-- THE BUG
--
-- submit_stock_count wrote its variance movements without a date, so
-- post_stock_movement fell back to now(). A closing count for 31 Aug posted on
-- 1 Sep therefore produced movements dated 1 Sep.
--
-- opening_stock(D) sums every movement BEFORE D, so opening for 1 Sep could
-- not see a movement dated 1 Sep. The closing stock was on the ledger, but the
-- next day's opening read zero and said "no earlier activity".
--
-- Same class of mistake in set_opening_stock: it dated its movement ON the
-- chosen day, so the opening it had just written was excluded from that day's
-- own opening and the screen showed zero straight back.
--
-- THE FIX
--
--   * A count's movements are dated 23:59:59 LOCAL on the date being counted.
--     End of day, so they land after that day's sales and before the next
--     day's opening — which is exactly what "closing stock" means.
--
--   * An opening balance is dated 23:59:59 local on the day BEFORE. Opening
--     for a date is the previous day's closing, so it has to sit before the
--     date it opens, not on it.
--
--   * Existing posted counts are re-dated by step 3. That repairs the client's
--     31 Aug count without asking anyone to enter it again.
--
-- Local, not UTC: (date + 1 day - 1 second) AT TIME ZONE tz converts a local
-- wall-clock time into the right instant. Using a bare ::timestamptz would
-- date a 31 Aug count to 05:30 on 31 Aug in Kolkata, which is nearer the
-- previous night than the close of business.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Counts land at the end of the day they counted
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

  -- 23:59:59 local on the counted date.
  v_at := ((c.count_date + 1)::timestamp - interval '1 second') AT TIME ZONE v_tz;

  FOR ln IN
    SELECT * FROM public.stock_count_items
    WHERE count_id = p_count_id AND physical_qty IS NOT NULL
  LOOP
    DECLARE
      v_ideal numeric;
      v_var   numeric;
    BEGIN
      SELECT COALESCE(qty, 0) INTO v_ideal
      FROM public.inventory_stock
      WHERE outlet_id = c.outlet_id AND inventory_item_id = ln.inventory_item_id;

      v_ideal := COALESCE(v_ideal, 0);
      v_var   := ln.physical_qty - v_ideal;

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
-- 2. An opening balance belongs to the end of the previous day
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_opening_stock(
  p_outlet_id uuid,
  p_item_id   uuid,
  p_qty       numeric,
  p_on        date DEFAULT CURRENT_DATE
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_rest   uuid := public.current_restaurant_id();
  v_outlet uuid := COALESCE(p_outlet_id, public.default_outlet_id(v_rest));
  v_tz     text;
  v_prior  integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.inventory_items
                  WHERE id = p_item_id AND restaurant_id = v_rest) THEN
    RAISE EXCEPTION 'Item does not belong to this restaurant';
  END IF;

  SELECT COALESCE(r.timezone, 'Asia/Kolkata') INTO v_tz
  FROM public.restaurants r WHERE r.id = v_rest;
  v_tz := COALESCE(v_tz, 'Asia/Kolkata');

  SELECT count(*) INTO v_prior
  FROM public.stock_movements m
  WHERE m.inventory_item_id = p_item_id
    AND m.outlet_id = v_outlet
    AND (m.created_at AT TIME ZONE v_tz)::date < p_on;

  IF v_prior > 0 THEN
    RAISE EXCEPTION
      'This material already has stock history before %. Its opening is the previous day''s closing and cannot be typed over.',
      p_on;
  END IF;

  -- Dated to the end of the day BEFORE, so it counts as this date's opening.
  RETURN public.post_stock_movement(
    v_rest, v_outlet, p_item_id, p_qty, 'opening', 'Opening stock',
    NULL, NULL, NULL, NULL,
    (p_on::timestamp - interval '1 second') AT TIME ZONE v_tz);
END;
$fn$;

-- ----------------------------------------------------------------------------
-- 3. Repair counts already posted with the wrong date
--
--    Only movements that came from a stock count are touched, and each is
--    moved to the end of the day its own count was for. Balances are unchanged
--    — the deltas are identical, only when they happened is corrected — so
--    there is nothing to recompute.
-- ----------------------------------------------------------------------------
UPDATE public.stock_movements m
   SET created_at = ((c.count_date + 1)::timestamp - interval '1 second')
                    AT TIME ZONE COALESCE(r.timezone, 'Asia/Kolkata')
  FROM public.stock_counts c
  JOIN public.restaurants r ON r.id = c.restaurant_id
 WHERE m.ref_table = 'stock_counts'
   AND m.ref_id = c.id
   AND m.movement_type = 'physical_count'
   AND (m.created_at AT TIME ZONE COALESCE(r.timezone, 'Asia/Kolkata'))::date
       <> c.count_date;

-- =============================================================================
-- VERIFY
--
--   counts_posted            how many counts are on the ledger
--   movements_misdated       must be 0 after this runs
--   opening_carried_forward  a spot check: for each posted closing count, how
--                            many materials now carry a non-zero opening into
--                            the following day
-- =============================================================================
SELECT jsonb_pretty(jsonb_build_object(
  'counts_posted', (SELECT count(*) FROM public.stock_counts WHERE status = 'submitted'),
  'count_movements', (
    SELECT count(*) FROM public.stock_movements WHERE movement_type = 'physical_count'),
  'movements_misdated', (
    SELECT count(*)
    FROM public.stock_movements m
    JOIN public.stock_counts c ON c.id = m.ref_id AND m.ref_table = 'stock_counts'
    JOIN public.restaurants r ON r.id = c.restaurant_id
    WHERE m.movement_type = 'physical_count'
      AND (m.created_at AT TIME ZONE COALESCE(r.timezone, 'Asia/Kolkata'))::date
          <> c.count_date),
  'opening_carried_forward', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'counted_on', d.count_date,
             'opens_on', d.count_date + 1,
             'materials_with_opening', d.n)), '[]'::jsonb)
    FROM (
      SELECT c.count_date, count(*) AS n
      FROM public.stock_counts c
      JOIN public.stock_movements m
        ON m.ref_table = 'stock_counts' AND m.ref_id = c.id
      WHERE c.status = 'submitted' AND m.delta <> 0
      GROUP BY c.count_date
      ORDER BY c.count_date DESC
      LIMIT 10) d)
)) AS result;
