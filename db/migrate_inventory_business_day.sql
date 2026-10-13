-- =============================================================================
-- Inventory follows the business day, not the calendar day
-- =============================================================================
--
-- THE COMPLAINT (13 Oct 2026, Wali Baba): consumption and the Stock Summary do
-- not match.
--
-- WHY: Wali Baba serves until about 3am and its day closes at 4am (Settings ->
-- businessDay.closeHour = 4). Every sales screen already counts a bill settled
-- at 1am as the night before (src/lib/businessDay.js). The inventory side never
-- learned this: stock_summary, opening_stock and the closing count all cut the
-- day at midnight. About a quarter of all orders are opened between 00:00 and
-- 03:00, so since 8 Oct:
--
--   * the Stock Summary shows each night's after-midnight consumption on the
--     NEXT day (12 Oct Akhni Chicken Boti: 155 shown, 106 really sold that
--     business day, and 82 plates of the 12th's night filed under the 13th);
--   * the closing count was posted at 23:59:59, BEFORE that night's late
--     orders. The count is physically taken after close, so it already
--     reflects them — then the ledger deducted them again on the next day.
--     The next day's ideal comes out short and its variance comes out
--     positive by exactly the night's late consumption.
--
-- WHAT THIS DOES
--   1. day_close_hour / business_date / business_day_end — one definition of
--      the day, read from the same restaurant_settings row the POS uses.
--   2. stock_summary and opening_stock bucket movements by business date.
--   3. submit_stock_count / open_stock_count date a closing count to the end
--      of its business day (03:59:59 the next morning for a 4am close).
--   4. The late-entry trigger and the opening-stock functions use the same day.
--   5. Re-dates every submitted closing count of a restaurant whose day does
--      not close at midnight, and re-chains them oldest first so each day
--      still opens at the previous day's count (the client's rule).
--
-- With closeHour = 0 every function below behaves exactly as before.
-- Safe to run twice. Run the whole file in the SQL Editor, then the VERIFY
-- query at the bottom.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. The business day
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.day_close_hour(p_restaurant_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- Same clamp as MAX_CLOSE_HOUR in src/lib/businessDay.js.
  SELECT COALESCE((
    SELECT CASE WHEN (s.value->>'closeHour') ~ '^\d+$'
                 AND (s.value->>'closeHour')::int BETWEEN 0 AND 6
                THEN (s.value->>'closeHour')::int END
    FROM public.restaurant_settings s
    WHERE s.restaurant_id = p_restaurant_id AND s.key = 'businessDay'
  ), 0);
$$;

-- The business date an instant belongs to: 01:30 on the 13th is the 12th.
CREATE OR REPLACE FUNCTION public.business_date(p_restaurant_id uuid, p_at timestamptz)
RETURNS date
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT ((p_at AT TIME ZONE COALESCE(r.timezone, 'Asia/Kolkata'))
          - make_interval(hours => public.day_close_hour(p_restaurant_id)))::date
  FROM public.restaurants r WHERE r.id = p_restaurant_id;
$$;

-- The last second of a business date: 03:59:59 the next morning for a 4am close,
-- 23:59:59 the same night for a midnight close.
CREATE OR REPLACE FUNCTION public.business_day_end(p_restaurant_id uuid, p_on date)
RETURNS timestamptz
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT ((p_on + 1)::timestamp
          + make_interval(hours => public.day_close_hour(p_restaurant_id))
          - interval '1 second')
         AT TIME ZONE COALESCE(r.timezone, 'Asia/Kolkata')
  FROM public.restaurants r WHERE r.id = p_restaurant_id;
$$;


-- -----------------------------------------------------------------------------
-- 2a. Stock Summary — identical to the live version except local_date
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stock_summary(p_outlet_id uuid DEFAULT NULL::uuid, p_from date DEFAULT CURRENT_DATE, p_to date DEFAULT CURRENT_DATE, p_category_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_unit_type text DEFAULT 'base'::text)
 RETURNS TABLE(inventory_item_id uuid, item_name text, category_id uuid, category_name text, unit text, opening_stock numeric, purchase_stock numeric, total_stock numeric, consumption numeric, transfer_in numeric, transfer_out numeric, wastage numeric, shortage numeric, production numeric, adjustment numeric, ideal_stock numeric, physical_stock numeric, variance numeric, closing_stock numeric, remark text, rate numeric, ideal_value numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
-- Every RETURNS TABLE column above is also a PL/pgSQL variable in here, and
-- several of them (unit, variance, consumption, wastage, rate) are named after
-- real columns in the query below. Resolving ties in favour of the column is
-- what the query means everywhere; the OUT names are only ever filled by
-- RETURN QUERY, never assigned to directly.
#variable_conflict use_column
DECLARE
  v_rest  uuid := public.current_restaurant_id();
  v_tz    text;
  v_shift interval := make_interval(hours => public.day_close_hour(public.current_restaurant_id()));
BEGIN
  SELECT COALESCE(r.timezone, 'Asia/Kolkata') INTO v_tz
  FROM public.restaurants r WHERE r.id = v_rest;
  v_tz := COALESCE(v_tz, 'Asia/Kolkata');

  RETURN QUERY
  WITH items AS (
    SELECT i.id, i.item_name, i.category_id, i.unit, i.purchase_unit,
           GREATEST(COALESCE(i.conversion_factor, 1), 0.000001) AS cf,
           i.last_purchase_rate,
           COALESCE(c.name, i.category, 'Uncategorised') AS category_name
    FROM public.inventory_items i
    LEFT JOIN public.inventory_categories c ON c.id = i.category_id
    WHERE i.restaurant_id = v_rest
      AND i.is_active
      AND (p_category_id IS NULL OR i.category_id = p_category_id)
      AND (p_search IS NULL OR btrim(p_search) = ''
           OR i.item_name ILIKE '%' || btrim(p_search) || '%'
           OR i.barcode   ILIKE '%' || btrim(p_search) || '%')
  ),
  scoped AS (
    SELECT m.inventory_item_id AS item_id,
           m.movement_type,
           m.delta,
           -- The business date: a 1am order belongs to the night before.
           ((m.created_at AT TIME ZONE v_tz) - v_shift)::date AS local_date
    FROM public.stock_movements m
    WHERE m.restaurant_id = v_rest
      AND (p_outlet_id IS NULL OR m.outlet_id = p_outlet_id)
      AND m.inventory_item_id IS NOT NULL
  ),
  agg AS (
    SELECT s.item_id,
           SUM(s.delta) FILTER (WHERE s.local_date <  p_from) AS opening,
           SUM(s.delta) FILTER (WHERE s.local_date BETWEEN p_from AND p_to
                                  AND s.movement_type IN ('purchase','purchase_return')) AS purchase,
           SUM(s.delta) FILTER (WHERE s.local_date BETWEEN p_from AND p_to
                                  AND s.movement_type = 'transfer_in')  AS tr_in,
           SUM(s.delta) FILTER (WHERE s.local_date BETWEEN p_from AND p_to
                                  AND s.movement_type = 'transfer_out') AS tr_out,
           SUM(s.delta) FILTER (WHERE s.local_date BETWEEN p_from AND p_to
                                  AND s.movement_type = 'consumption')  AS consumed,
           SUM(s.delta) FILTER (WHERE s.local_date BETWEEN p_from AND p_to
                                  AND s.movement_type = 'wastage')      AS wasted,
           SUM(s.delta) FILTER (WHERE s.local_date BETWEEN p_from AND p_to
                                  AND s.movement_type = 'shortage')     AS short,
           SUM(s.delta) FILTER (WHERE s.local_date BETWEEN p_from AND p_to
                                  AND s.movement_type IN ('production_in','production_out')) AS produced,
           SUM(s.delta) FILTER (WHERE s.local_date BETWEEN p_from AND p_to
                                  AND s.movement_type IN ('adjustment','opening')) AS adjusted,
           SUM(s.delta) FILTER (WHERE s.local_date BETWEEN p_from AND p_to
                                  AND s.movement_type = 'physical_count') AS counted,
           SUM(s.delta) FILTER (WHERE s.local_date <= p_to) AS closing
    FROM scoped s
    GROUP BY s.item_id
  ),
  -- The most recent submitted count in range wins: that is the number a
  -- manager physically stood in the store and wrote down.
  counted AS (
    SELECT DISTINCT ON (ci.inventory_item_id)
           ci.inventory_item_id AS item_id,
           ci.physical_qty,
           ci.remark
    FROM public.stock_count_items ci
    JOIN public.stock_counts sc ON sc.id = ci.count_id
    WHERE sc.restaurant_id = v_rest
      AND sc.status = 'submitted'
      AND sc.count_date BETWEEN p_from AND p_to
      AND (p_outlet_id IS NULL OR sc.outlet_id = p_outlet_id)
      AND ci.physical_qty IS NOT NULL
    ORDER BY ci.inventory_item_id, sc.count_date DESC, sc.submitted_at DESC
  ),
  calc AS (
    SELECT it.id, it.item_name, it.category_id, it.category_name,
           CASE WHEN p_unit_type = 'purchase'
                THEN COALESCE(it.purchase_unit, it.unit) ELSE it.unit END AS unit_label,
           CASE WHEN p_unit_type = 'purchase' THEN it.cf ELSE 1 END AS div,
           it.cf,
           it.last_purchase_rate,
           COALESCE(a.opening, 0)                  AS opening,
           COALESCE(a.purchase, 0)                 AS purchase,
           COALESCE(a.tr_in, 0)                    AS tr_in,
           -COALESCE(a.tr_out, 0)                  AS tr_out,
           -COALESCE(a.consumed, 0)                AS consumed,
           -COALESCE(a.wasted, 0)                  AS wasted,
           -COALESCE(a.short, 0)                   AS short,
           COALESCE(a.produced, 0)                 AS produced,
           COALESCE(a.adjusted, 0)                 AS adjusted,
           COALESCE(a.closing, 0)                  AS closing,
           cn.physical_qty,
           cn.remark
    FROM items it
    LEFT JOIN agg     a  ON a.item_id  = it.id
    LEFT JOIN counted cn ON cn.item_id = it.id
  )
  SELECT
    c.id,
    c.item_name,
    c.category_id,
    c.category_name,
    c.unit_label,
    ROUND(c.opening / c.div, 3),
    ROUND(c.purchase / c.div, 3),
    ROUND((c.opening + c.purchase + c.tr_in) / c.div, 3),
    ROUND(c.consumed / c.div, 3),
    ROUND(c.tr_in / c.div, 3),
    ROUND(c.tr_out / c.div, 3),
    ROUND(c.wasted / c.div, 3),
    ROUND(c.short / c.div, 3),
    ROUND(c.produced / c.div, 3),
    ROUND(c.adjusted / c.div, 3),
    -- Ideal: the books before any count corrected them.
    ROUND((c.opening + c.purchase + c.tr_in + c.produced + c.adjusted
           - c.consumed - c.tr_out - c.wasted - c.short) / c.div, 3),
    CASE WHEN c.physical_qty IS NULL THEN NULL
         ELSE ROUND(c.physical_qty / c.div, 3) END,
    CASE WHEN c.physical_qty IS NULL THEN NULL
         ELSE ROUND((c.physical_qty
                     - (c.opening + c.purchase + c.tr_in + c.produced + c.adjusted
                        - c.consumed - c.tr_out - c.wasted - c.short)) / c.div, 3) END,
    ROUND(c.closing / c.div, 3),
    c.remark,
    c.last_purchase_rate,
    ROUND((c.opening + c.purchase + c.tr_in + c.produced + c.adjusted
           - c.consumed - c.tr_out - c.wasted - c.short)
          * COALESCE(c.last_purchase_rate, 0), 2)
  FROM calc c
  ORDER BY c.item_name;
END;
$function$;


-- -----------------------------------------------------------------------------
-- 2b. Opening stock screen — same business date
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.opening_stock(p_outlet_id uuid, p_on date DEFAULT CURRENT_DATE)
 RETURNS TABLE(inventory_item_id uuid, item_name text, category_name text, unit text, opening_qty numeric, has_history boolean, last_movement date)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_rest  uuid := public.current_restaurant_id();
  v_tz    text;
  v_shift interval := make_interval(hours => public.day_close_hour(public.current_restaurant_id()));
BEGIN
  SELECT COALESCE(r.timezone, 'Asia/Kolkata') INTO v_tz
  FROM public.restaurants r WHERE r.id = v_rest;
  v_tz := COALESCE(v_tz, 'Asia/Kolkata');

  RETURN QUERY
  SELECT i.id,
         i.item_name,
         COALESCE(c.name, 'Uncategorised'),
         i.unit,
         COALESCE(SUM(m.delta) FILTER (
           WHERE ((m.created_at AT TIME ZONE v_tz) - v_shift)::date < p_on), 0),
         COUNT(m.*) FILTER (
           WHERE ((m.created_at AT TIME ZONE v_tz) - v_shift)::date < p_on) > 0,
         MAX(((m.created_at AT TIME ZONE v_tz) - v_shift)::date) FILTER (
           WHERE ((m.created_at AT TIME ZONE v_tz) - v_shift)::date < p_on)
  FROM public.inventory_items i
  LEFT JOIN public.inventory_categories c ON c.id = i.category_id
  LEFT JOIN public.stock_movements m
         ON m.inventory_item_id = i.id
        AND (p_outlet_id IS NULL OR m.outlet_id = p_outlet_id)
  WHERE i.restaurant_id = v_rest AND i.is_active
  GROUP BY i.id, i.item_name, c.name, i.unit
  ORDER BY i.item_name;
END;
$function$;


-- -----------------------------------------------------------------------------
-- 3a. Submitting a count — a closing count closes its BUSINESS day
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_stock_count(p_count_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- A closing count is the end of its business day: for a restaurant that
  -- closes at 4am that is 03:59:59 the next morning, after the night's last
  -- orders, which the count physically reflects. An available count is a spot
  -- check taken during service, so it lands when it was taken; for one entered
  -- against an earlier date, midday is the honest stand-in.
  IF c.count_type = 'closing' THEN
    v_at := public.business_day_end(c.restaurant_id, c.count_date);
  ELSIF public.business_date(c.restaurant_id, now()) = c.count_date THEN
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
      -- What the books said AT THAT MOMENT, not what they say now.
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
$function$;


-- -----------------------------------------------------------------------------
-- 3b. Opening a count sheet — measures at the same moment submit does
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.open_stock_count(p_outlet_id uuid, p_count_type text DEFAULT 'closing'::text, p_count_date date DEFAULT CURRENT_DATE, p_cycle text DEFAULT 'daily'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    v_at := public.business_day_end(v_rest, p_count_date);
  ELSIF public.business_date(v_rest, now()) = p_count_date THEN
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
$function$;


-- -----------------------------------------------------------------------------
-- 4a. Late entries re-apply the count of their BUSINESS day
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stock_movements_reapply_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  m       record;
  v_sign  numeric;           -- +1 an entry arrived, -1 an entry was removed
  cnt     record;
  v_at    timestamptz;
BEGIN
  IF TG_OP = 'INSERT' THEN m := NEW; v_sign := 1; ELSE m := OLD; v_sign := -1; END IF;

  -- A count's own movements are what closes the day; never correct those.
  IF m.movement_type = 'physical_count' OR m.ref_table = 'stock_counts'
     OR m.inventory_item_id IS NULL OR COALESCE(m.delta, 0) = 0 THEN
    RETURN NULL;
  END IF;

  -- The first submitted closing count, on or after the entry's own business
  -- day, that counted this item. That count has already fixed the closing
  -- balance, and every later day opens from it, so it is the one to re-apply.
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
    AND sc.count_date >= public.business_date(m.restaurant_id, m.created_at)
  ORDER BY sc.count_date
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;             -- no count has closed that day yet: nothing to protect
  END IF;

  v_at := public.business_day_end(m.restaurant_id, cnt.count_date);

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
$function$;


-- -----------------------------------------------------------------------------
-- 4b. Opening stock lands at the end of the PREVIOUS business day
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_opening_stock(p_outlet_id uuid, p_item_id uuid, p_qty numeric, p_on date DEFAULT CURRENT_DATE)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rest   uuid := public.current_restaurant_id();
  v_outlet uuid := COALESCE(p_outlet_id, public.default_outlet_id(v_rest));
  v_prior  integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.inventory_items
                  WHERE id = p_item_id AND restaurant_id = v_rest) THEN
    RAISE EXCEPTION 'Item does not belong to this restaurant';
  END IF;

  SELECT count(*) INTO v_prior
  FROM public.stock_movements m
  WHERE m.inventory_item_id = p_item_id
    AND m.outlet_id = v_outlet
    AND m.created_at <= public.business_day_end(v_rest, p_on - 1);

  IF v_prior > 0 THEN
    RAISE EXCEPTION
      'This material already has stock history before %. Its opening is the previous day''s closing and cannot be typed over.',
      p_on;
  END IF;

  -- Dated to the end of the business day BEFORE, so it counts as this date's opening.
  RETURN public.post_stock_movement(
    v_rest, v_outlet, p_item_id, p_qty, 'opening', 'Opening stock',
    NULL, NULL, NULL, NULL,
    public.business_day_end(v_rest, p_on - 1));
END;
$function$;

CREATE OR REPLACE FUNCTION public.adjust_opening_stock(p_outlet_id uuid, p_item_id uuid, p_qty numeric, p_on date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rest    uuid := public.current_restaurant_id();
  v_outlet  uuid := COALESCE(p_outlet_id, public.default_outlet_id(v_rest));
  v_current numeric;
  v_delta   numeric;
  v_at      timestamptz;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.inventory_items
                  WHERE id = p_item_id AND restaurant_id = v_rest) THEN
    RAISE EXCEPTION 'Item does not belong to this restaurant';
  END IF;

  -- End of the business day BEFORE, so it lands in this date's opening and in
  -- the previous date's closing at the same time. That keeps them equal.
  v_at := public.business_day_end(v_rest, p_on - 1);

  -- What it opens at, before we touch anything.
  SELECT COALESCE(SUM(m.delta), 0) INTO v_current
  FROM public.stock_movements m
  WHERE m.inventory_item_id = p_item_id
    AND m.outlet_id = v_outlet
    AND m.created_at <= v_at;

  v_delta := p_qty - v_current;

  IF v_delta = 0 THEN
    RETURN jsonb_build_object('changed', false, 'opening', v_current);
  END IF;

  PERFORM public.post_stock_movement(
    v_rest, v_outlet, p_item_id, v_delta, 'adjustment',
    'Opening stock corrected for ' || to_char(p_on, 'DD Mon YYYY'),
    NULL, NULL, NULL,
    'Was ' || v_current || ', set to ' || p_qty,
    v_at);

  RETURN jsonb_build_object(
    'changed', true, 'was', v_current, 'now', p_qty, 'adjustment', v_delta);
END;
$function$;


-- -----------------------------------------------------------------------------
-- 5. Repair: move every submitted closing count to the end of its business day
--    and re-chain, oldest first.
--
--    For each count: its movements move from 23:59:59 to business_day_end, so
--    the night's after-midnight orders now fall BEFORE it. The count then no
--    longer matches the ledger by exactly those orders; one correction per
--    line puts the balance back on the physical figure, and the sheet's ideal
--    and variance are recomputed against the books at that moment. Because
--    counts are processed in date order, each one is measured against a day
--    that already opens at the previous count.
--
--    UPDATE of created_at does not fire trg_stock_movements_reapply_count, and
--    the corrections carry ref_table 'stock_counts', which it skips.
--    Only restaurants whose day does not close at midnight are touched.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  c        record;
  ln       record;
  v_old    timestamptz;
  v_at     timestamptz;
  v_actual numeric;
  v_own    numeric;
  v_delta  numeric;
BEGIN
  FOR c IN
    SELECT sc.id, sc.restaurant_id, sc.outlet_id, sc.count_date,
           COALESCE(r.timezone, 'Asia/Kolkata') AS tz
    FROM public.stock_counts sc
    JOIN public.restaurants r ON r.id = sc.restaurant_id
    WHERE sc.status = 'submitted'
      AND sc.count_type = 'closing'
      AND public.day_close_hour(sc.restaurant_id) > 0
    ORDER BY sc.restaurant_id, sc.count_date, sc.submitted_at
  LOOP
    v_old := ((c.count_date + 1)::timestamp - interval '1 second') AT TIME ZONE c.tz;
    v_at  := public.business_day_end(c.restaurant_id, c.count_date);

    UPDATE public.stock_movements
       SET created_at = v_at
     WHERE ref_table = 'stock_counts' AND ref_id = c.id
       AND created_at = v_old;

    FOR ln IN
      SELECT ci.id AS line_id, ci.inventory_item_id, ci.physical_qty, ci.rate
      FROM public.stock_count_items ci
      WHERE ci.count_id = c.id AND ci.physical_qty IS NOT NULL
    LOOP
      SELECT COALESCE(SUM(m.delta), 0) INTO v_actual
      FROM public.stock_movements m
      WHERE m.inventory_item_id = ln.inventory_item_id
        AND m.outlet_id = c.outlet_id
        AND m.created_at <= v_at;

      SELECT COALESCE(SUM(m.delta), 0) INTO v_own
      FROM public.stock_movements m
      WHERE m.inventory_item_id = ln.inventory_item_id
        AND m.outlet_id = c.outlet_id
        AND m.ref_table = 'stock_counts' AND m.ref_id = c.id;

      v_delta := ln.physical_qty - v_actual;

      IF v_delta <> 0 THEN
        PERFORM public.post_stock_movement(
          c.restaurant_id, c.outlet_id, ln.inventory_item_id,
          v_delta, 'physical_count', 'Closing stock count',
          'stock_counts', c.id, ln.rate,
          'Re-chained: the count now closes the business day (after-midnight orders included)',
          v_at);
        v_own := v_own + v_delta;
      END IF;

      UPDATE public.stock_count_items
         SET ideal_qty  = v_actual + v_delta - v_own,
             variance   = ln.physical_qty - (v_actual + v_delta - v_own),
             updated_at = now()
       WHERE id = ln.line_id;
    END LOOP;
  END LOOP;
END;
$$;


-- =============================================================================
-- VERIFY — run on its own after the above. Expect:
--   close_hour 4, count_gaps 0, counts_left_at_midnight 0,
--   and akhni_12_oct consumption 106 (it was 155 before this ran).
-- =============================================================================
WITH counted AS (
  SELECT sc.count_date, sc.outlet_id, ci.inventory_item_id, ci.physical_qty
  FROM public.stock_counts sc
  JOIN public.stock_count_items ci ON ci.count_id = sc.id
  WHERE sc.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
    AND sc.status = 'submitted' AND sc.count_type = 'closing'
    AND ci.physical_qty IS NOT NULL
)
SELECT jsonb_pretty(jsonb_build_object(
  'close_hour', public.day_close_hour('b88e5c07-24d7-4386-8c47-e48f4cab23ee'),
  'count_gaps', (
    SELECT count(*) FROM counted c
    WHERE c.physical_qty <> (
      SELECT COALESCE(SUM(m.delta), 0) FROM public.stock_movements m
      WHERE m.inventory_item_id = c.inventory_item_id AND m.outlet_id = c.outlet_id
        AND public.business_date('b88e5c07-24d7-4386-8c47-e48f4cab23ee', m.created_at) <= c.count_date)),
  'counts_left_at_midnight', (
    SELECT count(*) FROM public.stock_movements m
    JOIN public.stock_counts sc ON sc.id = m.ref_id AND m.ref_table = 'stock_counts'
    WHERE sc.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
      AND sc.count_type = 'closing'
      AND m.created_at <> public.business_day_end(sc.restaurant_id, sc.count_date)),
  'akhni_12_oct', (
    SELECT -SUM(m.delta) FROM public.stock_movements m
    JOIN public.inventory_items i ON i.id = m.inventory_item_id
    WHERE m.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
      AND i.item_name = 'Akhni Chicken Boti Semi'
      AND m.movement_type = 'consumption'
      AND public.business_date(m.restaurant_id, m.created_at) = '2026-10-12')
)) AS after_state;
