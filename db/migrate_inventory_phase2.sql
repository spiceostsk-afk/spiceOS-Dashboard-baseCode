-- =============================================================================
-- Spice OS — Inventory phase 2: unit master, editable documents, opening stock
-- Run once in the Supabase SQL Editor, after db/migrate_inventory_stock.sql
-- and db/migrate_masters.sql. Safe to re-run.
-- =============================================================================
-- Three things this makes possible:
--
--   1. A Unit Master. Units were free text on each item, so "Kg", "kg" and
--      "KG" were three different units and nothing could be converted or
--      totalled across items. They become rows.
--
--   2. Editing a document that has already moved stock. Purchases, wastage and
--      transfers post movements the moment they are saved; until now the only
--      correction was to cancel. Editing rewrites the document's movements in
--      place, KEEPING THE ORIGINAL DATE, then recomputes the affected balances
--      from the ledger rather than nudging them.
--
--      Be aware of what that means: a report already run for that date will
--      report a different number afterwards. That is the deliberate trade-off
--      for in-place editing over a reverse-and-repost audit trail.
--
--   3. Opening stock as a first-class, DERIVED figure. Opening for a date is
--      the sum of everything that happened before it, which is by definition
--      the previous day's closing — the two can never disagree. A typed
--      opening balance is only accepted where nothing came before it.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Unit master
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_units (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL DEFAULT public.current_restaurant_id()
                  REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name          text NOT NULL,                 -- 'Kilogram'
  symbol        text NOT NULL,                 -- 'Kg'
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_units_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_units_symbol_key UNIQUE (restaurant_id, symbol)
);

CREATE INDEX IF NOT EXISTS idx_inventory_units_rest
  ON public.inventory_units (restaurant_id, is_active, sort_order);

-- Promote every unit already in use, from both the consumption and purchase
-- columns, so nothing an item points at is missing from the master.
INSERT INTO public.inventory_units (restaurant_id, symbol, name)
SELECT DISTINCT i.restaurant_id, btrim(u.sym), btrim(u.sym)
FROM public.inventory_items i
CROSS JOIN LATERAL (VALUES (i.unit), (i.purchase_unit)) AS u(sym)
WHERE btrim(COALESCE(u.sym, '')) <> ''
ON CONFLICT (restaurant_id, symbol) DO NOTHING;

-- A starter set for restaurants that have no materials yet.
INSERT INTO public.inventory_units (restaurant_id, symbol, name, sort_order)
SELECT r.id, v.symbol, v.name, v.ord
FROM public.restaurants r
CROSS JOIN (VALUES
  ('Kg',     'Kilogram',   1),
  ('Gram',   'Gram',       2),
  ('Litre',  'Litre',      3),
  ('ML',     'Millilitre', 4),
  ('Piece',  'Piece',      5),
  ('Packet', 'Packet',     6),
  ('Bottle', 'Bottle',     7),
  ('Dozen',  'Dozen',      8)
) AS v(symbol, name, ord)
ON CONFLICT (restaurant_id, symbol) DO NOTHING;

-- Items point at the master, while the text columns stay as the label every
-- existing screen already reads. Text remains the source of truth for display
-- so nothing breaks; the id is what the Unit Master edits.
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS unit_id          uuid REFERENCES public.inventory_units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS purchase_unit_id uuid REFERENCES public.inventory_units(id) ON DELETE SET NULL;

UPDATE public.inventory_items i
   SET unit_id = u.id
  FROM public.inventory_units u
 WHERE u.restaurant_id = i.restaurant_id
   AND u.symbol = btrim(i.unit)
   AND i.unit_id IS NULL;

UPDATE public.inventory_items i
   SET purchase_unit_id = u.id
  FROM public.inventory_units u
 WHERE u.restaurant_id = i.restaurant_id
   AND u.symbol = btrim(i.purchase_unit)
   AND i.purchase_unit_id IS NULL;

-- Renaming a unit in the master must reach every item that uses it, or the
-- label and the master drift apart.
CREATE OR REPLACE FUNCTION public.inventory_units_sync_labels()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.symbol IS DISTINCT FROM OLD.symbol THEN
    UPDATE public.inventory_items SET unit = NEW.symbol WHERE unit_id = NEW.id;
    UPDATE public.inventory_items SET purchase_unit = NEW.symbol WHERE purchase_unit_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_inventory_units_sync ON public.inventory_units;
CREATE TRIGGER trg_inventory_units_sync
  AFTER UPDATE ON public.inventory_units
  FOR EACH ROW EXECUTE FUNCTION public.inventory_units_sync_labels();

-- ----------------------------------------------------------------------------
-- 2. Date-preserving movements
--    An edited document must keep the date it happened on, not the date it was
--    corrected, or the Stock Summary for that day silently changes shape.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_stock_movement(
  p_restaurant_id uuid,
  p_outlet_id     uuid,
  p_item_id       uuid,
  p_delta         numeric,
  p_type          text,
  p_reason        text,
  p_ref_table     text DEFAULT NULL,
  p_ref_id        uuid DEFAULT NULL,
  p_rate          numeric DEFAULT NULL,
  p_note          text DEFAULT NULL,
  p_at            timestamptz DEFAULT NULL     -- null = now
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_outlet  uuid := COALESCE(p_outlet_id, public.default_outlet_id(p_restaurant_id));
  v_balance numeric;
  v_name    text;
  v_id      uuid;
BEGIN
  IF p_item_id IS NULL OR COALESCE(p_delta, 0) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT item_name INTO v_name
  FROM public.inventory_items
  WHERE id = p_item_id AND restaurant_id = p_restaurant_id;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Inventory item % does not belong to restaurant %', p_item_id, p_restaurant_id;
  END IF;

  INSERT INTO public.inventory_stock (restaurant_id, outlet_id, inventory_item_id, qty, updated_at)
  VALUES (p_restaurant_id, v_outlet, p_item_id, p_delta, now())
  ON CONFLICT (outlet_id, inventory_item_id)
  DO UPDATE SET qty = public.inventory_stock.qty + EXCLUDED.qty, updated_at = now()
  RETURNING qty INTO v_balance;

  UPDATE public.inventory_items
     SET stock = (SELECT COALESCE(SUM(s.qty), 0) FROM public.inventory_stock s
                   WHERE s.inventory_item_id = p_item_id),
         updated_at = now()
   WHERE id = p_item_id AND restaurant_id = p_restaurant_id;

  INSERT INTO public.stock_movements (
    restaurant_id, outlet_id, inventory_item_id, item_name, delta, balance_after,
    reason, movement_type, ref_table, ref_id, rate, note, created_at
  ) VALUES (
    p_restaurant_id, v_outlet, p_item_id, v_name, p_delta, v_balance,
    COALESCE(p_reason, p_type), p_type, p_ref_table, p_ref_id, p_rate, p_note,
    COALESCE(p_at, now())
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION
  public.post_stock_movement(uuid,uuid,uuid,numeric,text,text,text,uuid,numeric,text,timestamptz)
  FROM public;

-- ----------------------------------------------------------------------------
-- 3. Rebuild a balance from the ledger
--    After movements are deleted, nudging the balance is not enough — it has
--    to be recomputed, or the drift is permanent and invisible.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recompute_item_stock(
  p_restaurant_id uuid,
  p_outlet_id     uuid,
  p_item_id       uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  INSERT INTO public.inventory_stock (restaurant_id, outlet_id, inventory_item_id, qty, updated_at)
  VALUES (
    p_restaurant_id, p_outlet_id, p_item_id,
    COALESCE((SELECT SUM(m.delta) FROM public.stock_movements m
               WHERE m.inventory_item_id = p_item_id
                 AND m.outlet_id = p_outlet_id), 0),
    now())
  ON CONFLICT (outlet_id, inventory_item_id)
  DO UPDATE SET qty = EXCLUDED.qty, updated_at = now();

  UPDATE public.inventory_items
     SET stock = (SELECT COALESCE(SUM(s.qty), 0) FROM public.inventory_stock s
                   WHERE s.inventory_item_id = p_item_id),
         updated_at = now()
   WHERE id = p_item_id;
END;
$fn$;

/**
 * Strip every movement a document produced, then rebuild the balances it
 * touched. Used before re-posting an edited document.
 */
CREATE OR REPLACE FUNCTION public.clear_document_movements(
  p_restaurant_id uuid,
  p_ref_table     text,
  p_ref_id        uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  -- Held in a jsonb array rather than a TEMP TABLE on purpose: a temp table
  -- created here would not survive the Supabase SQL Editor, which commits each
  -- statement separately, and re-entering the function in one transaction
  -- would collide on the name.
  v_pairs jsonb;
  touched record;
BEGIN
  SELECT COALESCE(
           jsonb_agg(DISTINCT jsonb_build_array(m.outlet_id, m.inventory_item_id)),
           '[]'::jsonb)
    INTO v_pairs
  FROM public.stock_movements m
  WHERE m.restaurant_id = p_restaurant_id
    AND m.ref_table = p_ref_table
    AND m.ref_id = p_ref_id;

  DELETE FROM public.stock_movements m
  WHERE m.restaurant_id = p_restaurant_id
    AND m.ref_table = p_ref_table
    AND m.ref_id = p_ref_id;

  FOR touched IN
    SELECT (e ->> 0)::uuid AS outlet_id, (e ->> 1)::uuid AS item_id
    FROM jsonb_array_elements(v_pairs) e
  LOOP
    PERFORM public.recompute_item_stock(p_restaurant_id, touched.outlet_id, touched.item_id);
  END LOOP;
END;
$fn$;

-- ----------------------------------------------------------------------------
-- 4. Re-post an edited document
--    The app updates the header and lines, then calls one of these. Each keeps
--    the document's own date on the movements it writes.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.repost_purchase(p_purchase_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  p  record;
  ln record;
  v_rate_base numeric;
BEGIN
  SELECT * INTO p FROM public.purchases WHERE id = p_purchase_id;
  IF p IS NULL THEN RAISE EXCEPTION 'Purchase % not found', p_purchase_id; END IF;
  IF p.restaurant_id IS DISTINCT FROM public.current_restaurant_id()
     AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;

  PERFORM public.clear_document_movements(p.restaurant_id, 'purchases', p.id);

  IF p.status = 'cancelled' THEN RETURN; END IF;

  FOR ln IN
    SELECT pi.*, inv.conversion_factor
    FROM public.purchase_items pi
    JOIN public.inventory_items inv ON inv.id = pi.inventory_item_id
    WHERE pi.purchase_id = p_purchase_id
  LOOP
    v_rate_base := CASE
      WHEN ln.entry_unit = 'purchase' AND COALESCE(ln.conversion_factor, 1) > 0
        THEN ln.rate / ln.conversion_factor
      ELSE ln.rate
    END;

    PERFORM public.post_stock_movement(
      p.restaurant_id, p.outlet_id, ln.inventory_item_id,
      ln.qty_base, 'purchase',
      'Purchase ' || COALESCE(p.invoice_no, ''),
      'purchases', p.id, v_rate_base, NULL,
      p.invoice_date::timestamptz);

    UPDATE public.inventory_items
       SET last_purchase_rate = v_rate_base
     WHERE id = ln.inventory_item_id;
  END LOOP;

  UPDATE public.purchases SET status = 'posted', posted_at = now() WHERE id = p_purchase_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.repost_wastage(p_wastage_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  w  record;
  ln record;
BEGIN
  SELECT * INTO w FROM public.stock_wastage WHERE id = p_wastage_id;
  IF w IS NULL THEN RAISE EXCEPTION 'Wastage entry % not found', p_wastage_id; END IF;
  IF w.restaurant_id IS DISTINCT FROM public.current_restaurant_id()
     AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;

  PERFORM public.clear_document_movements(w.restaurant_id, 'stock_wastage', w.id);

  IF w.status = 'cancelled' THEN RETURN; END IF;

  FOR ln IN SELECT * FROM public.stock_wastage_items WHERE wastage_id = p_wastage_id LOOP
    PERFORM public.post_stock_movement(
      w.restaurant_id, w.outlet_id, ln.inventory_item_id,
      -ln.qty_base, 'wastage', ln.reason,
      'stock_wastage', w.id, ln.rate, w.note,
      w.wasted_on::timestamptz);
  END LOOP;

  UPDATE public.stock_wastage
     SET status = 'posted', posted_at = now(),
         total_value = (
           SELECT COALESCE(SUM(i.qty_base * COALESCE(i.rate, inv.last_purchase_rate, 0)), 0)
           FROM public.stock_wastage_items i
           JOIN public.inventory_items inv ON inv.id = i.inventory_item_id
           WHERE i.wastage_id = p_wastage_id)
   WHERE id = p_wastage_id;
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
    PERFORM public.post_stock_movement(
      t.restaurant_id, t.from_outlet_id, ln.inventory_item_id,
      -ln.qty_base, 'transfer_out',
      'Transfer out ' || COALESCE(t.reference_no, ''),
      'stock_transfers', t.id, ln.rate, t.note,
      t.transfer_date::timestamptz);

    IF t.status = 'received' THEN
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

/** Delete a document outright, taking its stock effect with it. */
CREATE OR REPLACE FUNCTION public.delete_stock_document(p_kind text, p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_rest uuid := public.current_restaurant_id();
  v_table text;
BEGIN
  v_table := CASE p_kind
    WHEN 'purchase' THEN 'purchases'
    WHEN 'wastage'  THEN 'stock_wastage'
    WHEN 'transfer' THEN 'stock_transfers'
    WHEN 'count'    THEN 'stock_counts'
    ELSE NULL END;

  IF v_table IS NULL THEN RAISE EXCEPTION 'Unknown document kind %', p_kind; END IF;

  PERFORM public.clear_document_movements(v_rest, v_table, p_id);

  EXECUTE format('DELETE FROM public.%I WHERE id = $1 AND restaurant_id = $2', v_table)
    USING p_id, v_rest;
END;
$fn$;

-- ----------------------------------------------------------------------------
-- 5. Opening stock
--    Opening for a date is everything that happened before it — which is the
--    previous day's closing, by construction. Nothing stores it, so the two
--    can never disagree.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.opening_stock(
  p_outlet_id uuid,
  p_on        date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  inventory_item_id uuid,
  item_name         text,
  category_name     text,
  unit              text,
  opening_qty       numeric,
  has_history       boolean,
  last_movement     date
)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $fn$
#variable_conflict use_column
DECLARE
  v_rest uuid := public.current_restaurant_id();
  v_tz   text;
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
           WHERE (m.created_at AT TIME ZONE v_tz)::date < p_on), 0),
         COUNT(m.*) FILTER (
           WHERE (m.created_at AT TIME ZONE v_tz)::date < p_on) > 0,
         MAX((m.created_at AT TIME ZONE v_tz)::date) FILTER (
           WHERE (m.created_at AT TIME ZONE v_tz)::date < p_on)
  FROM public.inventory_items i
  LEFT JOIN public.inventory_categories c ON c.id = i.category_id
  LEFT JOIN public.stock_movements m
         ON m.inventory_item_id = i.id
        AND (p_outlet_id IS NULL OR m.outlet_id = p_outlet_id)
  WHERE i.restaurant_id = v_rest AND i.is_active
  GROUP BY i.id, i.item_name, c.name, i.unit
  ORDER BY i.item_name;
END;
$fn$;

/**
 * Set an opening balance for a material that has no history before this date.
 *
 * Refused where movements already exist: that date's opening is the previous
 * day's closing, and letting it be overwritten would make the books stop
 * tying together day to day. Correct those days instead, or use a stock count.
 */
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

  SELECT count(*) INTO v_prior
  FROM public.stock_movements m
  WHERE m.inventory_item_id = p_item_id
    AND m.outlet_id = v_outlet
    AND (m.created_at AT TIME ZONE COALESCE(v_tz, 'Asia/Kolkata'))::date < p_on;

  IF v_prior > 0 THEN
    RAISE EXCEPTION
      'This material already has stock history before %. Its opening is the previous day''s closing and cannot be typed over.',
      p_on;
  END IF;

  RETURN public.post_stock_movement(
    v_rest, v_outlet, p_item_id, p_qty, 'opening', 'Opening stock',
    NULL, NULL, NULL, NULL,
    (p_on::timestamptz + interval '1 second'));
END;
$fn$;

-- ----------------------------------------------------------------------------
-- 6. RLS + grants
-- ----------------------------------------------------------------------------
ALTER TABLE public.inventory_units ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.inventory_units;
CREATE POLICY tenant_isolation ON public.inventory_units
  FOR ALL TO authenticated, anon
  USING (restaurant_id = (SELECT public.current_restaurant_id())
         OR (SELECT public.is_platform_admin()))
  WITH CHECK (restaurant_id = (SELECT public.current_restaurant_id())
         OR (SELECT public.is_platform_admin()));

GRANT EXECUTE ON FUNCTION public.opening_stock(uuid, date)                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_opening_stock(uuid, uuid, numeric, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.repost_purchase(uuid)                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.repost_wastage(uuid)                         TO authenticated;
GRANT EXECUTE ON FUNCTION public.repost_transfer(uuid)                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_stock_document(text, uuid)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_item_stock(uuid, uuid, uuid)       TO authenticated;

-- =============================================================================
-- VERIFY — the only result the editor will show.
-- =============================================================================
SELECT jsonb_pretty(jsonb_build_object(
  'units_created', (SELECT count(*) FROM public.inventory_units),
  'units_per_restaurant', (
    SELECT COALESCE(jsonb_object_agg(name, n), '{}'::jsonb) FROM (
      SELECT r.name, count(u.*) AS n
      FROM public.restaurants r
      LEFT JOIN public.inventory_units u ON u.restaurant_id = r.id
      GROUP BY r.name) s),
  'items_linked_to_a_unit', (
    SELECT count(*) FROM public.inventory_items WHERE unit_id IS NOT NULL),
  'items_without_a_unit', (
    SELECT count(*) FROM public.inventory_items WHERE unit_id IS NULL),
  'new_functions', (
    SELECT COALESCE(jsonb_agg(p.proname ORDER BY p.proname), '[]'::jsonb)
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('opening_stock','set_opening_stock','repost_purchase',
                        'repost_wastage','repost_transfer','delete_stock_document',
                        'recompute_item_stock','clear_document_movements'))
)) AS result;
