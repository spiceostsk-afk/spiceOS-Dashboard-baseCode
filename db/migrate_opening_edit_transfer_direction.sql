-- =============================================================================
-- Spice OS — editable opening stock, and transfers in both directions
-- Run once in the Supabase SQL Editor, after db/migrate_transfer_text.sql.
-- Safe to re-run.
-- =============================================================================
-- 1. EDITING AN OPENING BALANCE
--
--    Opening for a date is the sum of everything before it, which is the
--    previous day's closing. Those are one number, so "edit the opening" can
--    only mean one of two things: change what came before it, or let the two
--    disagree.
--
--    This posts a CORRECTION dated to the end of the previous day. Set 1 Sep's
--    opening to 50 when it derives to 40, and a +10 adjustment lands at
--    23:59:59 on 31 Aug. 1 Sep now opens at 50 — and 31 Aug now closes at 50
--    too, because they are the same number. The chain from day to day is never
--    broken, and the correction is visible in the Stock Summary rather than
--    being an invisible override.
--
--    Any date can be corrected, including old ones. Correcting a past day
--    shifts every day after it, which is arithmetically right and worth
--    knowing before doing it on a month-old figure.
--
-- 2. TRANSFERS IN AS WELL AS OUT
--
--    A transfer only went out: stock left this outlet for a typed destination.
--    Stock also arrives — from a central kitchen, another branch, a sister
--    restaurant — so `direction` says which way it went. Out deducts, in adds.
--
--    Transfers that point at a real outlet keep the old two-step
--    send-and-receive behaviour untouched.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Correct an opening balance
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.adjust_opening_stock(
  p_outlet_id uuid,
  p_item_id   uuid,
  p_qty       numeric,          -- what the opening SHOULD be
  p_on        date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_rest    uuid := public.current_restaurant_id();
  v_outlet  uuid := COALESCE(p_outlet_id, public.default_outlet_id(v_rest));
  v_tz      text;
  v_current numeric;
  v_delta   numeric;
  v_at      timestamptz;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.inventory_items
                  WHERE id = p_item_id AND restaurant_id = v_rest) THEN
    RAISE EXCEPTION 'Item does not belong to this restaurant';
  END IF;

  SELECT COALESCE(r.timezone, 'Asia/Kolkata') INTO v_tz
  FROM public.restaurants r WHERE r.id = v_rest;
  v_tz := COALESCE(v_tz, 'Asia/Kolkata');

  -- What it opens at today, before we touch anything.
  SELECT COALESCE(SUM(m.delta), 0) INTO v_current
  FROM public.stock_movements m
  WHERE m.inventory_item_id = p_item_id
    AND m.outlet_id = v_outlet
    AND (m.created_at AT TIME ZONE v_tz)::date < p_on;

  v_delta := p_qty - v_current;

  IF v_delta = 0 THEN
    RETURN jsonb_build_object('changed', false, 'opening', v_current);
  END IF;

  -- End of the day BEFORE, so it lands in this date's opening and in the
  -- previous date's closing at the same time. That is what keeps them equal.
  v_at := (p_on::timestamp - interval '1 second') AT TIME ZONE v_tz;

  PERFORM public.post_stock_movement(
    v_rest, v_outlet, p_item_id, v_delta, 'adjustment',
    'Opening stock corrected for ' || to_char(p_on, 'DD Mon YYYY'),
    NULL, NULL, NULL,
    'Was ' || v_current || ', set to ' || p_qty,
    v_at);

  RETURN jsonb_build_object(
    'changed', true, 'was', v_current, 'now', p_qty, 'adjustment', v_delta);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.adjust_opening_stock(uuid, uuid, numeric, date)
  TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. Transfer direction
--    from_outlet_id is the outlet whose stock this document moves, whichever
--    way it goes. The labels say where the other end was.
-- ----------------------------------------------------------------------------
ALTER TABLE public.stock_transfers
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'out';

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_transfers_direction_check') THEN
    ALTER TABLE public.stock_transfers
      ADD CONSTRAINT stock_transfers_direction_check CHECK (direction IN ('in', 'out'));
  END IF;
END $do$;

CREATE OR REPLACE FUNCTION public.send_transfer(p_transfer_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  t  record;
  ln record;
BEGIN
  SELECT * INTO t FROM public.stock_transfers WHERE id = p_transfer_id;
  IF t IS NULL THEN RAISE EXCEPTION 'Transfer % not found', p_transfer_id; END IF;
  IF t.restaurant_id IS DISTINCT FROM public.current_restaurant_id()
     AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;
  IF t.status <> 'draft' THEN RAISE EXCEPTION 'Transfer is already %', t.status; END IF;

  FOR ln IN SELECT * FROM public.stock_transfer_items WHERE transfer_id = p_transfer_id LOOP
    IF t.direction = 'in' THEN
      PERFORM public.post_stock_movement(
        t.restaurant_id, t.from_outlet_id, ln.inventory_item_id,
        ln.qty_base, 'transfer_in',
        'Transfer in from ' || COALESCE(t.from_label, 'elsewhere'),
        'stock_transfers', t.id, ln.rate, t.note,
        t.transfer_date::timestamptz);
    ELSE
      PERFORM public.post_stock_movement(
        t.restaurant_id, t.from_outlet_id, ln.inventory_item_id,
        -ln.qty_base, 'transfer_out',
        'Transfer to ' || COALESCE(t.to_label, 'elsewhere'),
        'stock_transfers', t.id, ln.rate, t.note,
        t.transfer_date::timestamptz);
    END IF;
  END LOOP;

  UPDATE public.stock_transfers SET status = 'sent', sent_at = now() WHERE id = p_transfer_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.repost_transfer(p_transfer_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  t  record;
  ln record;
  v_qty numeric;
BEGIN
  SELECT * INTO t FROM public.stock_transfers WHERE id = p_transfer_id;
  IF t IS NULL THEN RAISE EXCEPTION 'Transfer % not found', p_transfer_id; END IF;
  IF t.restaurant_id IS DISTINCT FROM public.current_restaurant_id()
     AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;

  PERFORM public.clear_document_movements(t.restaurant_id, 'stock_transfers', t.id);

  IF t.status IN ('draft', 'cancelled') THEN RETURN; END IF;

  FOR ln IN SELECT * FROM public.stock_transfer_items WHERE transfer_id = p_transfer_id LOOP
    IF t.direction = 'in' THEN
      PERFORM public.post_stock_movement(
        t.restaurant_id, t.from_outlet_id, ln.inventory_item_id,
        ln.qty_base, 'transfer_in',
        'Transfer in from ' || COALESCE(t.from_label, 'elsewhere'),
        'stock_transfers', t.id, ln.rate, t.note,
        t.transfer_date::timestamptz);
    ELSE
      PERFORM public.post_stock_movement(
        t.restaurant_id, t.from_outlet_id, ln.inventory_item_id,
        -ln.qty_base, 'transfer_out',
        'Transfer to ' || COALESCE(t.to_label, 'elsewhere'),
        'stock_transfers', t.id, ln.rate, t.note,
        t.transfer_date::timestamptz);
    END IF;

    -- A real outlet on the other end keeps the old two-step behaviour.
    IF t.status = 'received' AND t.to_outlet_id IS NOT NULL AND t.direction = 'out' THEN
      v_qty := COALESCE(ln.received_qty_base, ln.qty_base);

      PERFORM public.post_stock_movement(
        t.restaurant_id, t.to_outlet_id, ln.inventory_item_id,
        ln.qty_base, 'transfer_in',
        'Transfer in ' || COALESCE(t.reference_no, ''),
        'stock_transfers', t.id, ln.rate, t.note,
        t.transfer_date::timestamptz);

      IF v_qty < ln.qty_base THEN
        PERFORM public.post_stock_movement(
          t.restaurant_id, t.to_outlet_id, ln.inventory_item_id,
          -(ln.qty_base - v_qty), 'shortage', 'Transfer shortage',
          'stock_transfers', t.id, ln.rate, NULL,
          t.transfer_date::timestamptz);
      END IF;
    END IF;
  END LOOP;
END;
$fn$;

-- =============================================================================
-- VERIFY
-- =============================================================================
SELECT jsonb_pretty(jsonb_build_object(
  'adjust_opening_stock_ready', EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'adjust_opening_stock'),
  'transfer_direction_column', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_transfers' AND column_name = 'direction'),
  'existing_transfers_by_direction', (
    SELECT COALESCE(jsonb_object_agg(direction, n), '{}'::jsonb)
    FROM (SELECT direction, count(*) AS n
          FROM public.stock_transfers GROUP BY direction) s)
)) AS result;
