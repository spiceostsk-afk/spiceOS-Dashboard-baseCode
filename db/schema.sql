-- =============================================================================
-- Spice OS — Multi-Tenant Schema (Phase 0)
-- Target: a FRESH Supabase project. Run this whole file once in the SQL Editor.
-- =============================================================================
-- Model: shared schema + restaurant_id column + Row Level Security.
-- Every domain row carries restaurant_id. It defaults from the caller's JWT
-- (public.current_restaurant_id()), and RLS filters every read/write by it.
-- Result: the app's ~117 existing .from() call sites keep working unchanged —
-- reads are auto-scoped, inserts are auto-stamped.
--
-- Order matters: extensions -> helpers -> tenant tables -> domain tables ->
-- indexes -> RLS/policies -> auth hook. Do not reorder.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 0. Extensions
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. Tenant-resolution helpers
--    current_restaurant_id() reads the JWT claim injected by the auth hook (§9).
--    STABLE so the planner evaluates it once per query when wrapped in (SELECT ...).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_restaurant_id()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(
    COALESCE(
      current_setting('request.jwt.claims', true)::jsonb ->> 'restaurant_id',
      ''
    ),
    ''
  )::uuid
$$;

-- ----------------------------------------------------------------------------
-- 2. Tenant core tables
-- ----------------------------------------------------------------------------
CREATE TABLE public.restaurants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,               -- subdomain / QR routing key
  name        text NOT NULL,
  logo_url    text,
  status      text NOT NULL DEFAULT 'trial'
                CHECK (status IN ('trial','active','suspended','cancelled')),
  plan        text NOT NULL DEFAULT 'basic',
  currency    text NOT NULL DEFAULT 'INR',
  timezone    text NOT NULL DEFAULT 'Asia/Kolkata',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.restaurant_themes (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  tokens        jsonb NOT NULL DEFAULT '{}'::jsonb,   -- overrides the CSS custom properties
  preset        text DEFAULT 'default',
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- links a Supabase auth user to a restaurant + role.
-- Composite PK => a user CAN belong to several restaurants (franchise-ready),
-- even though the MVP onboards one restaurant per owner.
CREATE TABLE public.restaurant_members (
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  role          text NOT NULL CHECK (role IN ('owner','admin','captain','waiter','cashier')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, restaurant_id)
);

CREATE INDEX idx_members_restaurant ON public.restaurant_members (restaurant_id);

-- super-admin (platform) panel access. Managed via service_role only.
CREATE TABLE public.platform_admins (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- SECURITY DEFINER + fixed search_path: this reads platform_admins, and
-- platform_admins' own RLS policy calls this function. Running as invoker would
-- recurse infinitely; as definer it bypasses RLS on that lookup. The same reason
-- keeps every domain-table policy (which also calls this) from recursing.
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()
  )
$$;

-- ----------------------------------------------------------------------------
-- 3. Domain tables (all carry restaurant_id, defaulted from the JWT)
--    Column structure mirrors the current live schema (database design current.txt)
--    plus the documented additions: staff, restaurant_settings,
--    customer_sessions.metadata (CONTEXT.md §11).
-- ----------------------------------------------------------------------------

-- reusable snippet, written inline on each table:
--   restaurant_id uuid NOT NULL DEFAULT public.current_restaurant_id()
--     REFERENCES public.restaurants(id) ON DELETE CASCADE

CREATE TABLE public.staff_users (
  id            uuid NOT NULL DEFAULT uuid_generate_v4(),
  restaurant_id uuid NOT NULL DEFAULT public.current_restaurant_id()
                  REFERENCES public.restaurants(id) ON DELETE CASCADE,
  full_name     text NOT NULL,
  phone_number  text,
  email         text,
  role          text NOT NULL CHECK (role IN ('admin','captain','waiter','cashier')),
  is_active     boolean DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  CONSTRAINT staff_users_pkey PRIMARY KEY (id),
  CONSTRAINT staff_users_restaurant_email_key UNIQUE (restaurant_id, email)
);

-- newer staff table used by MenuDashboard (PIN-based). Kept distinct from staff_users.
CREATE TABLE public.staff (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL DEFAULT public.current_restaurant_id()
                  REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  phone         text DEFAULT '',
  email         text DEFAULT '',
  role          text NOT NULL DEFAULT 'staff' CHECK (role IN ('manager','staff')),
  pin           text NOT NULL,
  active        boolean DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE TABLE public.restaurant_sections (
  id            uuid NOT NULL DEFAULT uuid_generate_v4(),
  restaurant_id uuid NOT NULL DEFAULT public.current_restaurant_id()
                  REFERENCES public.restaurants(id) ON DELETE CASCADE,
  section_name  text NOT NULL,
  created_at    timestamptz DEFAULT now(),
  CONSTRAINT restaurant_sections_pkey PRIMARY KEY (id),
  CONSTRAINT restaurant_sections_restaurant_name_key UNIQUE (restaurant_id, section_name)
);

CREATE TABLE public.restaurant_tables (
  id                  uuid NOT NULL DEFAULT uuid_generate_v4(),
  restaurant_id       uuid NOT NULL DEFAULT public.current_restaurant_id()
                        REFERENCES public.restaurants(id) ON DELETE CASCADE,
  table_number        text NOT NULL,
  section_id          uuid REFERENCES public.restaurant_sections(id),
  capacity            integer NOT NULL DEFAULT 2,
  status              text NOT NULL DEFAULT 'available'
                        CHECK (status IN ('available','occupied','reserved','cleaning','payment')),
  assigned_waiter_id  uuid REFERENCES public.staff_users(id),
  is_temporary        boolean DEFAULT false,
  qr_code_url         text,
  created_at          timestamptz DEFAULT now(),
  merged_into         uuid REFERENCES public.restaurant_tables(id),
  bill_discount_type  text,
  bill_discount_value numeric DEFAULT 0,
  CONSTRAINT restaurant_tables_pkey PRIMARY KEY (id),
  CONSTRAINT restaurant_tables_restaurant_number_key UNIQUE (restaurant_id, table_number)
);

CREATE TABLE public.customer_sessions (
  id             uuid NOT NULL DEFAULT uuid_generate_v4(),
  restaurant_id  uuid NOT NULL DEFAULT public.current_restaurant_id()
                   REFERENCES public.restaurants(id) ON DELETE CASCADE,
  table_id       uuid NOT NULL REFERENCES public.restaurant_tables(id),
  customer_name  text NOT NULL,
  phone_number   text,
  guest_count    integer DEFAULT 1,
  session_status text DEFAULT 'active'
                   CHECK (session_status IN ('active','completed','cancelled')),
  started_at     timestamptz DEFAULT now(),
  ended_at       timestamptz,
  server_name    text,
  metadata       jsonb DEFAULT '{}'::jsonb,   -- discount / SC / void / hold (CONTEXT §11)
  CONSTRAINT customer_sessions_pkey PRIMARY KEY (id)
);

CREATE TABLE public.waiter_calls (
  id                 uuid NOT NULL DEFAULT uuid_generate_v4(),
  restaurant_id      uuid NOT NULL DEFAULT public.current_restaurant_id()
                       REFERENCES public.restaurants(id) ON DELETE CASCADE,
  session_id         uuid REFERENCES public.customer_sessions(id),
  table_id           uuid REFERENCES public.restaurant_tables(id),
  customer_name      text,
  request_status     text DEFAULT 'pending'
                       CHECK (request_status IN ('pending','assigned','completed','cancelled')),
  assigned_waiter_id uuid REFERENCES public.staff_users(id),
  notes              text,
  created_at         timestamptz DEFAULT now(),
  completed_at       timestamptz,
  CONSTRAINT waiter_calls_pkey PRIMARY KEY (id)
);

CREATE TABLE public.menu_categories (
  id            uuid NOT NULL DEFAULT uuid_generate_v4(),
  restaurant_id uuid NOT NULL DEFAULT public.current_restaurant_id()
                  REFERENCES public.restaurants(id) ON DELETE CASCADE,
  category_name text NOT NULL,
  created_at    timestamptz DEFAULT now(),
  CONSTRAINT menu_categories_pkey PRIMARY KEY (id),
  CONSTRAINT menu_categories_restaurant_name_key UNIQUE (restaurant_id, category_name)
);

CREATE TABLE public.menu_items (
  id            uuid NOT NULL DEFAULT uuid_generate_v4(),
  restaurant_id uuid NOT NULL DEFAULT public.current_restaurant_id()
                  REFERENCES public.restaurants(id) ON DELETE CASCADE,
  category_id   uuid REFERENCES public.menu_categories(id),
  item_name     text NOT NULL,
  description   text,
  price         numeric NOT NULL,
  image_url     text,
  is_available  boolean DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  CONSTRAINT menu_items_pkey PRIMARY KEY (id)
);

CREATE TABLE public.orders (
  id            uuid NOT NULL DEFAULT uuid_generate_v4(),
  restaurant_id uuid NOT NULL DEFAULT public.current_restaurant_id()
                  REFERENCES public.restaurants(id) ON DELETE CASCADE,
  session_id    uuid REFERENCES public.customer_sessions(id),
  table_id      uuid REFERENCES public.restaurant_tables(id),
  created_by    uuid REFERENCES public.staff_users(id),
  order_status  text DEFAULT 'pending'
                  CHECK (order_status IN ('pending','preparing','served','completed','cancelled')),
  subtotal      numeric DEFAULT 0,
  tax           numeric DEFAULT 0,
  total         numeric DEFAULT 0,
  notes         text,
  created_at    timestamptz DEFAULT now(),
  CONSTRAINT orders_pkey PRIMARY KEY (id)
);

CREATE TABLE public.order_items (
  id                   uuid NOT NULL DEFAULT uuid_generate_v4(),
  restaurant_id        uuid NOT NULL DEFAULT public.current_restaurant_id()
                         REFERENCES public.restaurants(id) ON DELETE CASCADE,
  order_id             uuid REFERENCES public.orders(id),
  menu_item_id         uuid REFERENCES public.menu_items(id),
  quantity             integer NOT NULL DEFAULT 1,
  item_price           numeric NOT NULL,
  total_price          numeric NOT NULL,
  special_instructions text,
  created_at           timestamptz DEFAULT now(),
  notes                text,
  is_cancelled         boolean DEFAULT false,
  cancel_reason        text,
  cancelled_at         timestamptz,
  CONSTRAINT order_items_pkey PRIMARY KEY (id)
);

CREATE TABLE public.waiting_list (
  id                uuid NOT NULL DEFAULT uuid_generate_v4(),
  restaurant_id     uuid NOT NULL DEFAULT public.current_restaurant_id()
                      REFERENCES public.restaurants(id) ON DELETE CASCADE,
  customer_name     text NOT NULL,
  phone_number      text,
  guest_count       integer DEFAULT 1,
  preferred_section text,
  queue_status      text DEFAULT 'waiting'
                      CHECK (queue_status IN ('waiting','assigned','cancelled','completed')),
  assigned_table_id uuid REFERENCES public.restaurant_tables(id),
  added_at          timestamptz DEFAULT now(),
  assigned_at       timestamptz,
  CONSTRAINT waiting_list_pkey PRIMARY KEY (id)
);

CREATE TABLE public.bills (
  id             uuid NOT NULL DEFAULT uuid_generate_v4(),
  restaurant_id  uuid NOT NULL DEFAULT public.current_restaurant_id()
                   REFERENCES public.restaurants(id) ON DELETE CASCADE,
  order_id       uuid REFERENCES public.orders(id),
  session_id     uuid REFERENCES public.customer_sessions(id),
  subtotal       numeric DEFAULT 0,
  gst_amount     numeric DEFAULT 0,
  service_charge numeric DEFAULT 0,
  grand_total    numeric DEFAULT 0,
  payment_status text DEFAULT 'pending'
                   CHECK (payment_status IN ('pending','paid','failed')),
  payment_method text,
  generated_by   uuid REFERENCES public.staff_users(id),
  paid_at        timestamptz,
  created_at     timestamptz DEFAULT now(),
  CONSTRAINT bills_pkey PRIMARY KEY (id)
);

CREATE TABLE public.shift_reports (
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id       uuid NOT NULL DEFAULT public.current_restaurant_id()
                        REFERENCES public.restaurants(id) ON DELETE CASCADE,
  captain_name        text NOT NULL,
  shift_start         timestamptz NOT NULL,
  shift_end           timestamptz NOT NULL,
  total_tables_served integer NOT NULL,
  total_orders        integer NOT NULL,
  total_revenue       numeric NOT NULL,
  total_waiter_calls  integer NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  breakdown           jsonb DEFAULT '[]'::jsonb,
  CONSTRAINT shift_reports_pkey PRIMARY KEY (id)
);

-- key/value settings, now scoped per restaurant (PK was just `key`)
CREATE TABLE public.restaurant_settings (
  restaurant_id uuid NOT NULL DEFAULT public.current_restaurant_id()
                  REFERENCES public.restaurants(id) ON DELETE CASCADE,
  key           text NOT NULL,
  value         jsonb DEFAULT '{}'::jsonb,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT restaurant_settings_pkey PRIMARY KEY (restaurant_id, key)
);

-- ----------------------------------------------------------------------------
-- 4. Indexes — restaurant_id LEADING on every hot path.
--    These are mandatory: RLS adds a restaurant_id predicate to every query,
--    and without a leading-column index it becomes a full scan once tenants
--    share a table.
-- ----------------------------------------------------------------------------
CREATE INDEX idx_tables_status        ON public.restaurant_tables (restaurant_id, status);
CREATE INDEX idx_sections_restaurant  ON public.restaurant_sections (restaurant_id);
CREATE INDEX idx_sessions_status      ON public.customer_sessions (restaurant_id, session_status, started_at DESC);
CREATE INDEX idx_sessions_table       ON public.customer_sessions (restaurant_id, table_id);
CREATE INDEX idx_waiter_calls_status  ON public.waiter_calls (restaurant_id, request_status, created_at DESC);
CREATE INDEX idx_menu_cat             ON public.menu_categories (restaurant_id);
CREATE INDEX idx_menu_items_cat       ON public.menu_items (restaurant_id, category_id, is_available);
CREATE INDEX idx_orders_created       ON public.orders (restaurant_id, created_at DESC);
CREATE INDEX idx_orders_session       ON public.orders (restaurant_id, session_id);
CREATE INDEX idx_order_items_order    ON public.order_items (restaurant_id, order_id);
CREATE INDEX idx_waiting_list_status  ON public.waiting_list (restaurant_id, queue_status);
CREATE INDEX idx_bills_session        ON public.bills (restaurant_id, session_id);
CREATE INDEX idx_shift_reports_start  ON public.shift_reports (restaurant_id, shift_start DESC);
CREATE INDEX idx_staff_restaurant     ON public.staff (restaurant_id, active);
CREATE INDEX idx_staff_users_rest     ON public.staff_users (restaurant_id, is_active);

-- ----------------------------------------------------------------------------
-- 5. RLS on domain tables — uniform tenant isolation via a DO loop.
--    Applies to `authenticated` (staff panels) AND `anon` (Phase 1 diner path,
--    where the anon JWT carries restaurant_id). Platform admins bypass for the
--    super-admin panel. Per-role read restrictions (e.g. diners can't read
--    bills) are layered in Phase 1 — Phase 0 establishes tenant isolation.
--    Note the (SELECT ...) wrappers: they make Postgres evaluate the claim once
--    per query instead of once per row (10–50x on large tables).
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
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON public.%I
        FOR ALL
        TO authenticated, anon
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

-- ----------------------------------------------------------------------------
-- 6. RLS on tenant-core tables
-- ----------------------------------------------------------------------------
ALTER TABLE public.restaurants        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_themes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admins    ENABLE ROW LEVEL SECURITY;

-- a member (or diner via anon JWT) may read their own restaurant; platform admins all.
CREATE POLICY restaurants_read ON public.restaurants
  FOR SELECT TO authenticated, anon
  USING (
    id = (SELECT public.current_restaurant_id())
    OR (SELECT public.is_platform_admin())
  );

-- only platform admins may write the restaurants row (provisioning / suspend).
CREATE POLICY restaurants_admin_write ON public.restaurants
  FOR ALL TO authenticated
  USING ((SELECT public.is_platform_admin()))
  WITH CHECK ((SELECT public.is_platform_admin()));

CREATE POLICY themes_read ON public.restaurant_themes
  FOR SELECT TO authenticated, anon
  USING (
    restaurant_id = (SELECT public.current_restaurant_id())
    OR (SELECT public.is_platform_admin())
  );

-- owners/admins of the restaurant may edit its theme.
CREATE POLICY themes_write ON public.restaurant_themes
  FOR ALL TO authenticated
  USING (
    restaurant_id = (SELECT public.current_restaurant_id())
    OR (SELECT public.is_platform_admin())
  )
  WITH CHECK (
    restaurant_id = (SELECT public.current_restaurant_id())
    OR (SELECT public.is_platform_admin())
  );

-- a user sees only their own memberships; platform admins see all.
CREATE POLICY members_self_read ON public.restaurant_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (SELECT public.is_platform_admin())
  );

-- platform_admins table: readable only by platform admins (writes via service_role).
CREATE POLICY platform_admins_read ON public.platform_admins
  FOR SELECT TO authenticated
  USING ((SELECT public.is_platform_admin()));

-- ----------------------------------------------------------------------------
-- 7. Custom Access Token Hook — injects restaurant_id + user_role into the JWT.
--    Enable it afterwards: Dashboard -> Authentication -> Hooks ->
--    "Customize Access Token (JWT) Claims" -> select public.custom_access_token_hook.
--    (MVP = single restaurant per user, so LIMIT 1.)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  claims          jsonb;
  v_restaurant_id uuid;
  v_role          text;
BEGIN
  SELECT restaurant_id, role
    INTO v_restaurant_id, v_role
  FROM public.restaurant_members
  WHERE user_id = (event ->> 'user_id')::uuid
  ORDER BY created_at ASC
  LIMIT 1;

  claims := event -> 'claims';

  IF v_restaurant_id IS NOT NULL THEN
    claims := jsonb_set(claims, '{restaurant_id}', to_jsonb(v_restaurant_id::text));
    claims := jsonb_set(claims, '{user_role}',     to_jsonb(v_role));
  END IF;

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;

-- the Auth server (supabase_auth_admin) must be able to run the hook and read members.
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM authenticated, anon, public;
GRANT SELECT ON public.restaurant_members TO supabase_auth_admin;

CREATE POLICY auth_admin_read_members ON public.restaurant_members
  FOR SELECT TO supabase_auth_admin
  USING (true);

-- =============================================================================
-- End of schema. Next: run migrate_test_tenant.sql to import existing data,
-- then enable the access-token hook in the Dashboard. See PHASE0_RUNBOOK.md.
-- =============================================================================
