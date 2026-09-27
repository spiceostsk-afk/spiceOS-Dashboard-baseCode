-- =============================================================================
-- Spice OS — The count sheet expects the stock of ITS date, not of today
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- =============================================================================
-- WHAT WAS WRONG (reported 2026-09-25)
--
-- Closing Stock for 16 Sep showed Akhni Chicken Boti Semi at 189 plates.
-- Stock Summary for 16 Sep showed -6. Both claimed to be that day's figure.
--
-- Stock Summary was right. It adds up the ledger to the end of the chosen day:
-- 165 bought + 35 transferred in - 206 consumed = -6.
--
-- The count sheet was not. open_stock_count filled "Closing stock" from
-- inventory_stock.qty, which is the LIVE balance at the moment the sheet is
-- opened. The date picker chose which sheet to open and nothing else. Any day
-- but today was shown today's balance, and the variance typed against it was
-- measured from the wrong number.
--
-- Nothing wrong was ever POSTED. submit_stock_count already recomputes the
-- expected figure from the ledger at the count's own moment (23:59:59 local
-- for a closing count), and posts the correction from that. Only the draft
-- screen was misleading. It was misleading enough to make a manager doubt
-- one report or the other.
--
-- THE FIX
--
-- open_stock_count now takes the expected figure from the ledger, up to the
-- same instant submit_stock_count will use. What the sheet shows while typing
-- is then exactly what submitting will measure against. For today's closing
-- count that is the live balance, as before.
--
-- Every draft line is refreshed, counted or not, and a counted line's
-- variance is recomputed with it. The figure is fixed by the date now, not by
-- the moment the sheet was opened, so refreshing it cannot shift a variance
-- under someone. It only brings in a document entered late for that day, and
-- submitting would pick that up anyway.
--
-- Submitted sheets are history and are not touched, as before.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.open_stock_count(
  p_outlet_id  uuid,
  p_count_type text DEFAULT 'closing',
  p_count_date date DEFAULT CURRENT_DATE,
  p_cycle      text DEFAULT 'daily')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_rest   uuid := public.current_restaurant_id();
  v_outlet uuid := COALESCE(p_outlet_id, public.default_outlet_id(v_rest));
  v_id     uuid;
  v_tz     text;
  v_at     timestamptz;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.outlets WHERE id = v_outlet AND restaurant_id = v_rest) THEN
    RAISE EXCEPTION 'Outlet does not belong to this restaurant';
  END IF;

  SELECT id INTO v_id
  FROM public.stock_counts
  WHERE outlet_id = v_outlet AND count_type = p_count_type
    AND count_date = p_count_date AND status <> 'cancelled';

  IF v_id IS NULL THEN
    INSERT INTO public.stock_counts (restaurant_id, outlet_id, count_type, count_date, cycle)
    VALUES (v_rest, v_outlet, p_count_type, p_count_date, p_cycle)
    RETURNING id INTO v_id;
  END IF;

  -- A submitted sheet is history; do not touch it.
  IF (SELECT status FROM public.stock_counts WHERE id = v_id) = 'submitted' THEN
    RETURN v_id;
  END IF;

  -- The same moment submit_stock_count measures at. Keep the two in step.
  SELECT COALESCE(r.timezone, 'Asia/Kolkata') INTO v_tz
  FROM public.restaurants r WHERE r.id = v_rest;
  v_tz := COALESCE(v_tz, 'Asia/Kolkata');

  IF p_count_type = 'closing' THEN
    v_at := ((p_count_date + 1)::timestamp - interval '1 second') AT TIME ZONE v_tz;
  ELSIF (now() AT TIME ZONE v_tz)::date = p_count_date THEN
    v_at := now();
  ELSE
    v_at := (p_count_date::timestamp + interval '12 hours') AT TIME ZONE v_tz;
  END IF;

  -- Add any item that has appeared since the sheet was created.
  INSERT INTO public.stock_count_items (restaurant_id, count_id, inventory_item_id, ideal_qty, rate)
  SELECT v_rest, v_id, i.id, 0, i.last_purchase_rate
  FROM public.inventory_items i
  WHERE i.restaurant_id = v_rest AND i.is_active
  ON CONFLICT (count_id, inventory_item_id) DO NOTHING;

  -- What the books say at the end of that day, from the ledger.
  UPDATE public.stock_count_items ci
     SET ideal_qty = b.qty,
         variance  = CASE WHEN ci.physical_qty IS NULL THEN ci.variance
                          ELSE ci.physical_qty - b.qty END
    FROM (
      SELECT x.id AS line_id,
             COALESCE((SELECT SUM(m.delta)
                         FROM public.stock_movements m
                        WHERE m.inventory_item_id = x.inventory_item_id
                          AND m.outlet_id = v_outlet
                          AND m.created_at <= v_at), 0) AS qty
      FROM public.stock_count_items x
      WHERE x.count_id = v_id
    ) b
   WHERE ci.id = b.line_id
     AND ci.ideal_qty IS DISTINCT FROM b.qty;

  UPDATE public.stock_counts SET cycle = p_cycle, updated_at = now() WHERE id = v_id;

  RETURN v_id;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.open_stock_count(uuid, text, date, text) TO authenticated;

-- =============================================================================
-- VERIFY — the new definition is live. Existing drafts pick up the corrected
-- figure the next time their sheet is opened; submitted sheets are untouched.
-- =============================================================================
SELECT jsonb_pretty(jsonb_build_object(
  'open_stock_count_reads_ledger',
    (SELECT pg_get_functiondef('public.open_stock_count'::regproc) LIKE '%m.created_at <= v_at%'),
  'draft_sheets', (SELECT count(*) FROM public.stock_counts WHERE status = 'draft')
)) AS result;
