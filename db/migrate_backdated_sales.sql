-- =============================================================================
-- Spice OS — entering sales for a day that has already passed
-- Run once in the Supabase SQL Editor, after db/migrate_inventory_phase2.sql.
-- Safe to re-run.
-- =============================================================================
-- A restaurant that was busy, or offline, needs to enter yesterday's sales
-- today. Two things stood in the way.
--
-- 1. CONSUMPTION WAS DATED WHEN TYPED, NOT WHEN SOLD
--
--    apply_recipe_stock called post_stock_movement without a date, so it fell
--    back to now(). Sales for 1 Sep entered on 2 Sep would have deducted stock
--    dated 2 Sep: 1 Sep's Consumption column would read zero, 1 Sep's closing
--    would be overstated, and 2 Sep's opening would inherit the error. The
--    consumption now takes the ORDER's own timestamp.
--
--    This also fixes ordinary orders that straddle midnight — a table that
--    ordered at 23:55 and was billed at 00:05 now consumes on the day it ate.
--
-- 2. REVENUE HANGS OFF SESSIONS, NOT ORDERS
--
--    Reports and Payments both start from customer_sessions where
--    session_status = 'completed', filtered on ended_at, and only then read
--    the orders attached to them. An order written on its own would move stock
--    and earn nothing: invisible in every revenue figure. So a backdated sale
--    has to create the session, the order, its items and the bill together,
--    all carrying the same timestamp.
--
-- Hence one function rather than a handful of inserts from the browser: four
-- tables have to agree on a date, and a half-written sale is worse than none.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Consumption follows the order's date
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_recipe_stock(
  p_restaurant_id uuid,
  p_menu_item_id  uuid,
  p_servings      numeric,   -- signed: negative consumes, positive restores
  p_order_item_id uuid,
  p_reason        text
)
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
-- 2. Record a sale that happened earlier
--
--    p_lines is [{"menu_item_id": uuid, "quantity": n, "price": n}, ...].
--    price is optional — the menu's current price is used when it is absent,
--    but it is accepted so a sale can be recorded at what was actually charged
--    rather than at today's price.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_backdated_sale(
  p_outlet_id      uuid,
  p_at             timestamptz,
  p_lines          jsonb,
  p_table_id       uuid    DEFAULT NULL,
  p_customer_name  text    DEFAULT 'Walk-in',
  p_tax_pct        numeric DEFAULT 0,
  p_payment_method text    DEFAULT 'cash',
  p_note           text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_rest     uuid := public.current_restaurant_id();
  v_outlet   uuid := COALESCE(p_outlet_id, public.default_outlet_id(v_rest));
  v_table    uuid;
  v_session  uuid;
  v_order    uuid;
  ln         record;
  v_price    numeric;
  v_subtotal numeric := 0;
  v_tax      numeric;
  v_total    numeric;
  v_count    integer := 0;
BEGIN
  IF v_rest IS NULL THEN
    RAISE EXCEPTION 'Not signed in to a restaurant';
  END IF;
  IF p_at IS NULL THEN
    RAISE EXCEPTION 'A date and time is required';
  END IF;
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'A sale needs at least one item';
  END IF;

  -- A session needs a table, and Reports needs a session.
  v_table := COALESCE(
    (SELECT id FROM public.restaurant_tables
      WHERE id = p_table_id AND restaurant_id = v_rest),
    (SELECT id FROM public.restaurant_tables
      WHERE restaurant_id = v_rest ORDER BY created_at LIMIT 1));

  IF v_table IS NULL THEN
    RAISE EXCEPTION
      'This restaurant has no tables. Add one under QR Codes before entering past sales — a sale is recorded against a table.';
  END IF;

  -- Completed session, closed at the moment of the sale. Reports filter on
  -- ended_at, so this is what puts the money on the right day.
  INSERT INTO public.customer_sessions (
    restaurant_id, table_id, customer_name, guest_count,
    session_status, started_at, ended_at, metadata
  ) VALUES (
    v_rest, v_table, COALESCE(NULLIF(btrim(p_customer_name), ''), 'Walk-in'), 1,
    'completed', p_at - interval '45 minutes', p_at,
    jsonb_build_object('backdated', true, 'entered_at', now(), 'note', p_note)
  )
  RETURNING id INTO v_session;

  -- Price the lines before the order, so its totals are right from the start.
  FOR ln IN
    SELECT (e ->> 'menu_item_id')::uuid AS menu_item_id,
           COALESCE((e ->> 'quantity')::numeric, 0) AS quantity,
           NULLIF(e ->> 'price', '')::numeric       AS price
    FROM jsonb_array_elements(p_lines) e
  LOOP
    IF ln.quantity <= 0 THEN CONTINUE; END IF;

    SELECT COALESCE(ln.price, m.price, 0) INTO v_price
    FROM public.menu_items m
    WHERE m.id = ln.menu_item_id AND m.restaurant_id = v_rest;

    IF v_price IS NULL THEN
      RAISE EXCEPTION 'Menu item % does not belong to this restaurant', ln.menu_item_id;
    END IF;

    v_subtotal := v_subtotal + (v_price * ln.quantity);
    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'A sale needs at least one item with a quantity above zero';
  END IF;

  v_tax   := ROUND(v_subtotal * COALESCE(p_tax_pct, 0) / 100, 2);
  v_total := v_subtotal + v_tax;

  INSERT INTO public.orders (
    restaurant_id, outlet_id, session_id, table_id, order_status,
    subtotal, tax, total, notes, created_at
  ) VALUES (
    v_rest, v_outlet, v_session, v_table, 'completed',
    v_subtotal, v_tax, v_total,
    COALESCE(p_note, 'Entered after the fact'), p_at
  )
  RETURNING id INTO v_order;

  -- Inserting these fires the stock trigger, which now reads the order's
  -- created_at and dates the consumption to the day of the sale.
  FOR ln IN
    SELECT (e ->> 'menu_item_id')::uuid AS menu_item_id,
           COALESCE((e ->> 'quantity')::numeric, 0) AS quantity,
           NULLIF(e ->> 'price', '')::numeric       AS price
    FROM jsonb_array_elements(p_lines) e
  LOOP
    IF ln.quantity <= 0 THEN CONTINUE; END IF;

    SELECT COALESCE(ln.price, m.price, 0) INTO v_price
    FROM public.menu_items m WHERE m.id = ln.menu_item_id;

    INSERT INTO public.order_items (
      restaurant_id, order_id, menu_item_id, quantity,
      item_price, total_price, created_at
    ) VALUES (
      v_rest, v_order, ln.menu_item_id, ln.quantity::integer,
      v_price, v_price * ln.quantity, p_at
    );
  END LOOP;

  -- A paid bill, so the sale reaches Payments as well as Reports.
  INSERT INTO public.bills (
    restaurant_id, order_id, session_id, subtotal, gst_amount,
    service_charge, grand_total, payment_status, payment_method,
    paid_at, created_at
  ) VALUES (
    v_rest, v_order, v_session, v_subtotal, v_tax,
    0, v_total, 'paid', COALESCE(p_payment_method, 'cash'),
    p_at, p_at
  );

  RETURN jsonb_build_object(
    'order_id', v_order,
    'session_id', v_session,
    'sold_on', (p_at AT TIME ZONE COALESCE(
                  (SELECT timezone FROM public.restaurants WHERE id = v_rest),
                  'Asia/Kolkata'))::date,
    'lines', v_count,
    'subtotal', v_subtotal,
    'tax', v_tax,
    'total', v_total);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.record_backdated_sale(
  uuid, timestamptz, jsonb, uuid, text, numeric, text, text) TO authenticated;

-- =============================================================================
-- VERIFY
-- =============================================================================
SELECT jsonb_pretty(jsonb_build_object(
  'record_backdated_sale_ready', EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'record_backdated_sale'),
  'consumption_now_dated_to_the_order', (
    SELECT pg_get_functiondef(p.oid) LIKE '%v_at);%'
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'apply_recipe_stock'),
  'tables_available', (
    SELECT COALESCE(jsonb_object_agg(name, n), '{}'::jsonb) FROM (
      SELECT r.name, count(t.*) AS n
      FROM public.restaurants r
      LEFT JOIN public.restaurant_tables t ON t.restaurant_id = r.id
      GROUP BY r.name) s)
)) AS result;
