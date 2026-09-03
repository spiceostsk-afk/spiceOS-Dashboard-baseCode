-- =============================================================================
-- Spice OS — floor layout, and owner-level correction of completed orders
-- ONE migration. Run once in the Supabase SQL Editor. Safe to re-run.
-- =============================================================================
-- PART A — the floor: Ground, Basement, Packing, Car Service
-- PART B — editing and voiding a completed order, owner-only, with an audit
--
-- Everything else from this session has already been applied; this is the only
-- outstanding migration.
-- =============================================================================


-- #############################################################################
-- PART A — FLOOR LAYOUT
-- #############################################################################
--   Ground Floor   G1  – G13   dining tables
--   Basement       B1  – B14   dining tables
--   Packing        P1  – P4    parcel counters, not seats
--   Car Service    C1  – C4    drive-in bays, not seats
--
-- The numbers carry their area's letter because restaurant_tables has
-- UNIQUE (restaurant_id, table_number): a plain "Table 1" cannot exist on two
-- floors. Loosening that would leave "Table 1" ambiguous everywhere a table is
-- named, printed KOTs included, so G1 and B1 it is.
--
-- `kind` exists because a packing counter is not a table with zero seats. It
-- lets the floor screen drop the pax line for them and keeps them out of
-- table-occupancy figures. Ordering and billing are identical.
--
-- The four existing tables are RENAMED, not replaced — orders reference a
-- table by id, so their history follows them untouched.
-- =============================================================================

ALTER TABLE public.restaurant_tables
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'table';

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'restaurant_tables_kind_check') THEN
    ALTER TABLE public.restaurant_tables
      ADD CONSTRAINT restaurant_tables_kind_check
      CHECK (kind IN ('table', 'packing', 'car'));
  END IF;
END $do$;

UPDATE public.restaurant_sections
   SET section_name = 'Ground Floor'
 WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
   AND lower(section_name) = 'testing floor'
   AND NOT EXISTS (
     SELECT 1 FROM public.restaurant_sections x
     WHERE x.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
       AND x.section_name = 'Ground Floor');

INSERT INTO public.restaurant_sections (restaurant_id, section_name)
VALUES
  ('b88e5c07-24d7-4386-8c47-e48f4cab23ee', 'Ground Floor'),
  ('b88e5c07-24d7-4386-8c47-e48f4cab23ee', 'Basement'),
  ('b88e5c07-24d7-4386-8c47-e48f4cab23ee', 'Packing'),
  ('b88e5c07-24d7-4386-8c47-e48f4cab23ee', 'Car Service')
ON CONFLICT (restaurant_id, section_name) DO NOTHING;

UPDATE public.restaurant_tables t
   SET table_number = 'G' || t.table_number,
       section_id = (SELECT id FROM public.restaurant_sections
                      WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
                        AND section_name = 'Ground Floor'),
       kind = 'table'
 WHERE t.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
   AND t.table_number ~ '^[0-9]+$';

INSERT INTO public.restaurant_tables
  (restaurant_id, table_number, section_id, capacity, kind, status)
SELECT 'b88e5c07-24d7-4386-8c47-e48f4cab23ee',
       v.prefix || g.n,
       (SELECT id FROM public.restaurant_sections
         WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
           AND section_name = v.section),
       v.capacity, v.kind, 'available'
FROM (VALUES
  ('Ground Floor', 'G', 13, 4, 'table'),
  ('Basement',     'B', 14, 4, 'table'),
  ('Packing',      'P',  4, 0, 'packing'),
  ('Car Service',  'C',  4, 0, 'car')
) AS v(section, prefix, upto, capacity, kind)
CROSS JOIN LATERAL generate_series(1, v.upto) AS g(n)
ON CONFLICT (restaurant_id, table_number) DO NOTHING;


-- #############################################################################
-- PART B — OWNER-LEVEL ORDER CORRECTION
-- #############################################################################
-- Editing a completed bill rewrites money that has already been reported, and
-- moves stock that has already been counted. So three things guard it:
--
--   * only an owner may do it, checked in the DATABASE rather than by hiding a
--     button — a hidden button is not a permission;
--   * a reason is required and stored;
--   * every change is written to order_audit with before and after, so the
--     figures can always be explained afterwards.
--
-- HOW STOCK FOLLOWS
--
-- Nothing here posts stock movements by hand. order_items already carries the
-- recipe trigger: deleting a line hands its ingredients back, inserting one
-- takes them out, and flipping is_cancelled to true reverses it. Replacing the
-- lines of an order therefore nets out correctly on its own, dated to the
-- order rather than to now.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- B1. Is the caller an owner of this restaurant?
--     SECURITY DEFINER for the same reason is_platform_admin() is: it reads
--     restaurant_members from inside policies that guard that very table.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_owner(p_restaurant_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.restaurant_members
    WHERE user_id = auth.uid()
      AND restaurant_id = COALESCE(p_restaurant_id, public.current_restaurant_id())
      AND role = 'owner'
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_owner(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- B2. The audit trail
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_audit (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL DEFAULT public.current_restaurant_id()
                  REFERENCES public.restaurants(id) ON DELETE CASCADE,
  order_id      uuid,                       -- kept even after the order goes
  action        text NOT NULL,
  reason        text NOT NULL,
  before_state  jsonb,
  after_state   jsonb,
  actor_id      uuid,
  actor_email   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_audit_pkey PRIMARY KEY (id),
  CONSTRAINT order_audit_action_check CHECK (action IN ('edit', 'void', 'delete'))
);

CREATE INDEX IF NOT EXISTS idx_order_audit_rest
  ON public.order_audit (restaurant_id, created_at DESC);

ALTER TABLE public.order_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.order_audit;
CREATE POLICY tenant_isolation ON public.order_audit
  FOR ALL TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id())
         OR (SELECT public.is_platform_admin()))
  WITH CHECK (restaurant_id = (SELECT public.current_restaurant_id())
         OR (SELECT public.is_platform_admin()));

-- ----------------------------------------------------------------------------
-- B3. A readable snapshot of an order, for the audit's before/after
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.order_snapshot(p_order_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'order_status', o.order_status,
    'subtotal', o.subtotal,
    'tax', o.tax,
    'total', o.total,
    'created_at', o.created_at,
    'lines', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'dish', COALESCE(m.item_name, '(manual line)'),
               'menu_item_id', oi.menu_item_id,
               'qty', oi.quantity,
               'price', oi.item_price,
               'cancelled', COALESCE(oi.is_cancelled, false)))
      FROM public.order_items oi
      LEFT JOIN public.menu_items m ON m.id = oi.menu_item_id
      WHERE oi.order_id = o.id), '[]'::jsonb))
  FROM public.orders o WHERE o.id = p_order_id
$$;

-- ----------------------------------------------------------------------------
-- B4. Void a completed order
--
--     Cancelling the LINES is what returns the stock: the recipe trigger's
--     update branch reverses a line the moment is_cancelled flips to true.
--     Cancelling the order alone would move no stock at all, because the
--     trigger lives on order_items.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_void_order(
  p_order_id uuid,
  p_reason   text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  o        record;
  v_before jsonb;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id;
  IF o IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;

  IF NOT public.is_owner(o.restaurant_id) THEN
    RAISE EXCEPTION 'Only an owner can void a completed order';
  END IF;
  IF COALESCE(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'A reason is required';
  END IF;

  v_before := public.order_snapshot(p_order_id);

  -- Returns the ingredients, one line at a time, through the recipe trigger.
  UPDATE public.order_items
     SET is_cancelled = true, cancel_reason = p_reason, cancelled_at = now()
   WHERE order_id = p_order_id
     AND COALESCE(is_cancelled, false) = false;

  UPDATE public.orders SET order_status = 'cancelled' WHERE id = p_order_id;

  UPDATE public.bills SET payment_status = 'failed'
   WHERE order_id = p_order_id;

  UPDATE public.customer_sessions
     SET session_status = 'void', ended_at = COALESCE(ended_at, now())
   WHERE id = o.session_id;

  INSERT INTO public.order_audit
    (restaurant_id, order_id, action, reason, before_state, after_state,
     actor_id, actor_email)
  VALUES
    (o.restaurant_id, p_order_id, 'void', btrim(p_reason), v_before,
     public.order_snapshot(p_order_id), auth.uid(), auth.email());

  RETURN jsonb_build_object('voided', true, 'order_id', p_order_id);
END;
$fn$;

-- ----------------------------------------------------------------------------
-- B5. Edit a completed order
--
--     p_lines is [{"menu_item_id": uuid, "quantity": n, "price": n}, ...] and
--     REPLACES what was on the bill.
--
--     The old lines are deleted, which hands their ingredients back, and the
--     new ones inserted, which takes the new ingredients out — both dated to
--     the order rather than to now. Stock therefore lands on the difference
--     without a single movement being written here by hand.
--
--     Be clear about the cost: this rewrites a day that has already been
--     reported. A sales report run before the edit will not match one run
--     after. That is inherent to editing in place.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_edit_order(
  p_order_id uuid,
  p_lines    jsonb,
  p_reason   text,
  p_tax_pct  numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  o          record;
  v_before   jsonb;
  ln         record;
  v_price    numeric;
  v_subtotal numeric := 0;
  v_tax      numeric;
  v_total    numeric;
  v_count    integer := 0;
  v_taxpct   numeric;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id;
  IF o IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;

  IF NOT public.is_owner(o.restaurant_id) THEN
    RAISE EXCEPTION 'Only an owner can edit a completed order';
  END IF;
  IF COALESCE(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'A reason is required';
  END IF;
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'An order needs at least one item — void it instead';
  END IF;

  v_before := public.order_snapshot(p_order_id);

  -- Keep the bill's own tax rate unless one is given, so an edit does not
  -- silently re-rate an old bill at today's percentage.
  v_taxpct := COALESCE(p_tax_pct,
    CASE WHEN COALESCE(o.subtotal, 0) > 0
         THEN ROUND(COALESCE(o.tax, 0) / o.subtotal * 100, 4)
         ELSE 0 END);

  -- Out with the old lines: the trigger hands their ingredients back.
  DELETE FROM public.order_items WHERE order_id = p_order_id;

  FOR ln IN
    SELECT (e ->> 'menu_item_id')::uuid AS menu_item_id,
           COALESCE((e ->> 'quantity')::numeric, 0) AS quantity,
           NULLIF(e ->> 'price', '')::numeric       AS price
    FROM jsonb_array_elements(p_lines) e
  LOOP
    IF ln.quantity <= 0 THEN CONTINUE; END IF;

    SELECT COALESCE(ln.price, m.price, 0) INTO v_price
    FROM public.menu_items m
    WHERE m.id = ln.menu_item_id AND m.restaurant_id = o.restaurant_id;

    IF v_price IS NULL THEN
      RAISE EXCEPTION 'Menu item % does not belong to this restaurant', ln.menu_item_id;
    END IF;

    -- And in with the new: the trigger takes the new ingredients out, dated
    -- to the order's own timestamp.
    INSERT INTO public.order_items
      (restaurant_id, order_id, menu_item_id, quantity, item_price, total_price, created_at)
    VALUES
      (o.restaurant_id, p_order_id, ln.menu_item_id, ln.quantity::integer,
       v_price, v_price * ln.quantity, o.created_at);

    v_subtotal := v_subtotal + (v_price * ln.quantity);
    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Every line had a quantity of zero — void the order instead';
  END IF;

  v_tax   := ROUND(v_subtotal * v_taxpct / 100, 2);
  v_total := v_subtotal + v_tax;

  UPDATE public.orders
     SET subtotal = v_subtotal, tax = v_tax, total = v_total
   WHERE id = p_order_id;

  UPDATE public.bills
     SET subtotal = v_subtotal, gst_amount = v_tax, grand_total = v_total
   WHERE order_id = p_order_id;

  INSERT INTO public.order_audit
    (restaurant_id, order_id, action, reason, before_state, after_state,
     actor_id, actor_email)
  VALUES
    (o.restaurant_id, p_order_id, 'edit', btrim(p_reason), v_before,
     public.order_snapshot(p_order_id), auth.uid(), auth.email());

  RETURN jsonb_build_object(
    'edited', true, 'lines', v_count,
    'subtotal', v_subtotal, 'tax', v_tax, 'total', v_total);
END;
$fn$;

-- ----------------------------------------------------------------------------
-- B6. Delete a completed order outright
--     Deleting the lines returns their stock; the audit outlives the order.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_order(
  p_order_id uuid,
  p_reason   text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  o        record;
  v_before jsonb;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id;
  IF o IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;

  IF NOT public.is_owner(o.restaurant_id) THEN
    RAISE EXCEPTION 'Only an owner can delete a completed order';
  END IF;
  IF COALESCE(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'A reason is required';
  END IF;

  v_before := public.order_snapshot(p_order_id);

  INSERT INTO public.order_audit
    (restaurant_id, order_id, action, reason, before_state, after_state,
     actor_id, actor_email)
  VALUES
    (o.restaurant_id, p_order_id, 'delete', btrim(p_reason), v_before,
     NULL, auth.uid(), auth.email());

  DELETE FROM public.bills WHERE order_id = p_order_id;
  -- Returns the ingredients on the way out, through the recipe trigger.
  DELETE FROM public.order_items WHERE order_id = p_order_id;
  DELETE FROM public.orders WHERE id = p_order_id;

  RETURN jsonb_build_object('deleted', true, 'order_id', p_order_id);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.order_snapshot(uuid)                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_void_order(uuid, text)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_edit_order(uuid, jsonb, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_order(uuid, text)              TO authenticated;

-- =============================================================================
-- VERIFY
-- =============================================================================
SELECT jsonb_pretty(jsonb_build_object(
  'floor', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'section', x.section_name, 'kind', x.kind,
             'count', x.n, 'from', x.lo, 'to', x.hi) ORDER BY x.section_name), '[]'::jsonb)
    FROM (
      SELECT s.section_name, t.kind, count(*) AS n,
             min(t.table_number) AS lo, max(t.table_number) AS hi
      FROM public.restaurant_tables t
      LEFT JOIN public.restaurant_sections s ON s.id = t.section_id
      WHERE t.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
      GROUP BY s.section_name, t.kind) x),
  'orders_keeping_their_history', (
    SELECT count(*) FROM public.orders
    WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
      AND table_id IS NOT NULL),
  'order_admin_ready', (
    SELECT COALESCE(jsonb_agg(p.proname ORDER BY p.proname), '[]'::jsonb)
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('is_owner','order_snapshot','admin_void_order',
                        'admin_edit_order','admin_delete_order')),
  'owners_who_can_use_it', (
    SELECT COALESCE(jsonb_agg(u.email ORDER BY u.email), '[]'::jsonb)
    FROM public.restaurant_members rm
    JOIN auth.users u ON u.id = rm.user_id
    WHERE rm.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
      AND rm.role = 'owner')
)) AS result;
