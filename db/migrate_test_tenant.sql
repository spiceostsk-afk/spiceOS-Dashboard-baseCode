-- =============================================================================
-- Spice OS — Test Tenant Data Migration (Phase 0)
-- =============================================================================
-- Copies the existing single-restaurant data (Lumiere Bistro / Café Fleur) from
-- the OLD project into the NEW multi-tenant project, under one restaurant row
-- called the "test tenant".
--
-- WHY THIS WORKS WITHOUT EDITING THE DUMP:
--   The old tables have no restaurant_id column. A `pg_dump --data-only` emits
--   COPY statements listing only the old columns, so the new restaurant_id column
--   falls back to its DEFAULT. During the load we temporarily point that DEFAULT
--   at the test tenant, then restore it to the JWT function. No row edits needed.
--
-- RUN ORDER:
--   STEP A (this file, part 1)  -> in NEW project
--   STEP B (pg_dump | psql)     -> shell, see PHASE0_RUNBOOK.md §4
--   STEP C (this file, part 2)  -> in NEW project
-- =============================================================================

-- ####################  STEP A — before loading data  ####################

-- A1. Create the test tenant restaurant. Note the id it prints.
INSERT INTO public.restaurants (id, slug, name, status, plan)
VALUES (
  '00000000-0000-0000-0000-000000000000',  -- fixed, memorable test-tenant id
  'test-tenant',
  'Test Tenant',
  'active',
  'basic'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.restaurant_themes (restaurant_id, preset)
VALUES ('00000000-0000-0000-0000-000000000000', 'default')
ON CONFLICT (restaurant_id) DO NOTHING;

-- A2. Point every domain table's restaurant_id DEFAULT at the test tenant, so the
--     incoming COPY (which omits the column) fills it automatically.
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
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN restaurant_id SET DEFAULT %L::uuid',
      t, '00000000-0000-0000-0000-000000000000'
    );
  END LOOP;
END $$;

-- A3. RLS would block a plain COPY. The SQL Editor runs as a superuser-ish role
--     that bypasses RLS, but if you load via psql as a normal role, disable RLS
--     for the load and re-enable in STEP C. Uncomment if needed:
-- ALTER TABLE public.staff_users        DISABLE ROW LEVEL SECURITY;
-- ... (repeat per table) ...

-- >>> Now run STEP B from the shell (PHASE0_RUNBOOK.md §4), then STEP C below. <<<


-- ####################  STEP C — after loading data  ####################
-- Run this block ONLY after the pg_dump load has completed.

-- C1. Restore the DEFAULT to the JWT-derived function so real tenants get their
--     own restaurant_id going forward.
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
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN restaurant_id SET DEFAULT public.current_restaurant_id()',
      t
    );
  END LOOP;
END $$;

-- C2. If you disabled RLS in A3, re-enable it here:
-- ALTER TABLE public.staff_users        ENABLE ROW LEVEL SECURITY;
-- ... (repeat per table) ...

-- C3. Verify: every domain row must belong to the test tenant, zero orphans.
--     Run this and eyeball the counts against the old project.
SELECT 'restaurant_tables' AS tbl, count(*) AS rows,
       count(*) FILTER (WHERE restaurant_id IS NULL) AS null_rid
FROM public.restaurant_tables
UNION ALL SELECT 'menu_items',        count(*), count(*) FILTER (WHERE restaurant_id IS NULL) FROM public.menu_items
UNION ALL SELECT 'menu_categories',   count(*), count(*) FILTER (WHERE restaurant_id IS NULL) FROM public.menu_categories
UNION ALL SELECT 'customer_sessions', count(*), count(*) FILTER (WHERE restaurant_id IS NULL) FROM public.customer_sessions
UNION ALL SELECT 'orders',            count(*), count(*) FILTER (WHERE restaurant_id IS NULL) FROM public.orders
UNION ALL SELECT 'order_items',       count(*), count(*) FILTER (WHERE restaurant_id IS NULL) FROM public.order_items
UNION ALL SELECT 'bills',             count(*), count(*) FILTER (WHERE restaurant_id IS NULL) FROM public.bills
UNION ALL SELECT 'staff',             count(*), count(*) FILTER (WHERE restaurant_id IS NULL) FROM public.staff
ORDER BY tbl;
-- Expected: null_rid = 0 on every row. If any null_rid > 0, the load ran before
-- STEP A2 set the default — truncate those tables and re-load.
