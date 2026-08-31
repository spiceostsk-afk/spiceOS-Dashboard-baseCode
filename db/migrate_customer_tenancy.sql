-- =============================================================================
-- Spice OS — Customer (Diner) Tenancy & Session Gating  [Phase 1: customer panel]
-- =============================================================================
-- Run once in the NEW project SQL Editor, AFTER schema.sql.
--
-- What this does:
--   1. Adds an opaque public_token to restaurant_tables (what the QR encodes).
--   2. Adds is_session_active() + claim helpers + session_feedback table.
--   3. TIGHTENS tenant_isolation to staff (authenticated) only — diners must not
--      see the whole restaurant.
--   4. Adds narrow anon (diner) policies: read menu, read/write own table+session,
--      order/call-waiter only while the session is live, leave feedback after.
--   5. Trigger to mark a table occupied when a diner self-checks-in (so diners
--      never need UPDATE on restaurant_tables).
--
-- The diner's JWT (minted by the resolve-table Edge Function) carries:
--   role = 'anon', restaurant_id, table_id, and (once seated) session_id.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Opaque table token (the value inside the QR)
-- ----------------------------------------------------------------------------
ALTER TABLE public.restaurant_tables
  ADD COLUMN IF NOT EXISTS public_token uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE public.restaurant_tables
  ADD CONSTRAINT restaurant_tables_public_token_key UNIQUE (public_token);

-- ----------------------------------------------------------------------------
-- 2. Helpers + feedback table
-- ----------------------------------------------------------------------------

-- SECURITY DEFINER so it can read customer_sessions regardless of the caller's
-- (anon) row visibility.
CREATE OR REPLACE FUNCTION public.is_session_active(sid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.customer_sessions
    WHERE id = sid AND session_status = 'active'
  )
$$;

-- read the table_id / session_id claims the Edge Function stamps into the JWT
CREATE OR REPLACE FUNCTION public.current_table_id()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'table_id', '')::uuid
$$;

CREATE OR REPLACE FUNCTION public.current_session_id()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'session_id', '')::uuid
$$;

CREATE TABLE IF NOT EXISTS public.session_feedback (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL DEFAULT public.current_restaurant_id()
                  REFERENCES public.restaurants(id) ON DELETE CASCADE,
  session_id    uuid REFERENCES public.customer_sessions(id),
  rating        integer CHECK (rating BETWEEN 1 AND 5),
  comment       text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_feedback_restaurant ON public.session_feedback (restaurant_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 3. Tighten tenant_isolation: staff (authenticated) only.
--    (Phase 0 granted anon too; diners get the narrow policies in §4 instead.)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'staff_users','staff','restaurant_sections','restaurant_tables',
    'customer_sessions','waiter_calls','menu_categories','menu_items',
    'orders','order_items','waiting_list','bills','shift_reports','restaurant_settings'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON public.%I
        FOR ALL
        TO authenticated
        USING (
          restaurant_id = (SELECT public.current_restaurant_id())
          OR (SELECT public.is_platform_admin())
        )
        WITH CHECK (
          restaurant_id = (SELECT public.current_restaurant_id())
          OR (SELECT public.is_platform_admin())
        )
    $f$, t);
  END LOOP;
END $$;

-- session_feedback: staff can read all their restaurant's feedback
ALTER TABLE public.session_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.session_feedback
  FOR ALL TO authenticated
  USING (
    restaurant_id = (SELECT public.current_restaurant_id())
    OR (SELECT public.is_platform_admin())
  )
  WITH CHECK (
    restaurant_id = (SELECT public.current_restaurant_id())
    OR (SELECT public.is_platform_admin())
  );

-- ----------------------------------------------------------------------------
-- 4. Diner (anon) policies — narrow, claim-scoped.
--    A diner may: browse the menu, see their own table + session, self-check-in,
--    order / call a waiter only while their session is live, and leave feedback.
-- ----------------------------------------------------------------------------

-- 4a. Menu is readable by the diner's restaurant
CREATE POLICY diner_read_menu_categories ON public.menu_categories
  FOR SELECT TO anon
  USING (restaurant_id = (SELECT public.current_restaurant_id()));

CREATE POLICY diner_read_menu_items ON public.menu_items
  FOR SELECT TO anon
  USING (restaurant_id = (SELECT public.current_restaurant_id()));

-- 4b. Diner sees only their own table
CREATE POLICY diner_read_own_table ON public.restaurant_tables
  FOR SELECT TO anon
  USING (id = (SELECT public.current_table_id()));

-- 4c. Sessions: read own, self-check-in creates an active session for own table
CREATE POLICY diner_read_own_session ON public.customer_sessions
  FOR SELECT TO anon
  USING (
    id = (SELECT public.current_session_id())
    OR table_id = (SELECT public.current_table_id())
  );

CREATE POLICY diner_checkin ON public.customer_sessions
  FOR INSERT TO anon
  WITH CHECK (
    restaurant_id = (SELECT public.current_restaurant_id())
    AND table_id = (SELECT public.current_table_id())
    AND session_status = 'active'
  );

-- 4d. Orders: create only for own LIVE session; read own
CREATE POLICY diner_insert_orders ON public.orders
  FOR INSERT TO anon
  WITH CHECK (
    restaurant_id = (SELECT public.current_restaurant_id())
    AND session_id = (SELECT public.current_session_id())
    AND (SELECT public.is_session_active(session_id))
  );

CREATE POLICY diner_read_orders ON public.orders
  FOR SELECT TO anon
  USING (session_id = (SELECT public.current_session_id()));

-- 4e. Order items: tied to an order in the diner's own live session
CREATE POLICY diner_insert_order_items ON public.order_items
  FOR INSERT TO anon
  WITH CHECK (
    restaurant_id = (SELECT public.current_restaurant_id())
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND o.session_id = (SELECT public.current_session_id())
        AND (SELECT public.is_session_active(o.session_id))
    )
  );

CREATE POLICY diner_read_order_items ON public.order_items
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND o.session_id = (SELECT public.current_session_id())
    )
  );

-- 4f. Waiter calls: create only during live session; read own
CREATE POLICY diner_insert_waiter_calls ON public.waiter_calls
  FOR INSERT TO anon
  WITH CHECK (
    restaurant_id = (SELECT public.current_restaurant_id())
    AND session_id = (SELECT public.current_session_id())
    AND (SELECT public.is_session_active(session_id))
  );

CREATE POLICY diner_read_waiter_calls ON public.waiter_calls
  FOR SELECT TO anon
  USING (session_id = (SELECT public.current_session_id()));

-- 4g. Feedback: leave feedback for own session (after it has completed — so this
--     intentionally does NOT require is_session_active)
ALTER TABLE public.session_feedback ENABLE ROW LEVEL SECURITY;  -- idempotent
CREATE POLICY diner_insert_feedback ON public.session_feedback
  FOR INSERT TO anon
  WITH CHECK (
    restaurant_id = (SELECT public.current_restaurant_id())
    AND session_id = (SELECT public.current_session_id())
  );

-- ----------------------------------------------------------------------------
-- 5. Auto-occupy a table on diner self-check-in (so diners never UPDATE tables)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_table_occupied()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.restaurant_tables
  SET status = 'occupied'
  WHERE id = NEW.table_id AND status <> 'occupied';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mark_table_occupied ON public.customer_sessions;
CREATE TRIGGER trg_mark_table_occupied
  AFTER INSERT ON public.customer_sessions
  FOR EACH ROW EXECUTE FUNCTION public.mark_table_occupied();

-- =============================================================================
-- Done. Next: deploy the resolve-table Edge Function (see the function's
-- README) and set the JWT_SECRET secret, then rewire the customer panel.
--
-- Quick check — list your tables' QR tokens to build QR codes from:
--   SELECT table_number, public_token FROM public.restaurant_tables ORDER BY table_number;
-- =============================================================================
