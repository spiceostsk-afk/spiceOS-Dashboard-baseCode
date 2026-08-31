-- =============================================================================
-- Cross-Tenant Isolation Test  —  run in the SQL Editor anytime
-- =============================================================================
-- Impersonates the `authenticated` role with two different tenant JWT claims and
-- asserts that neither can see the other's rows. Raises an EXCEPTION if isolation
-- is broken; prints "ISOLATION OK" otherwise. Needs at least two restaurants.
--
-- Why SET LOCAL ROLE: the SQL Editor's default role bypasses RLS, which would
-- mask a real leak. Switching to `authenticated` makes RLS apply for real.
-- =============================================================================

DO $$
DECLARE
  a uuid := '00000000-0000-0000-0000-000000000000';  -- Test Tenant
  b uuid;
  a_orders int; a_sessions int;
  leak_orders int; leak_sessions int; leak_menu int;
BEGIN
  SELECT id INTO b FROM public.restaurants WHERE id <> a ORDER BY created_at LIMIT 1;
  IF b IS NULL THEN
    RAISE NOTICE 'Only one tenant exists — sign up a second restaurant, then re-run.';
    RETURN;
  END IF;

  SET LOCAL ROLE authenticated;

  -- ---- As tenant A: baseline visibility ----
  PERFORM set_config('request.jwt.claims', json_build_object('restaurant_id', a)::text, true);
  SELECT count(*) INTO a_orders   FROM public.orders;
  SELECT count(*) INTO a_sessions FROM public.customer_sessions;

  -- ---- As tenant B: must see ZERO of tenant A's rows ----
  PERFORM set_config('request.jwt.claims', json_build_object('restaurant_id', b)::text, true);
  SELECT count(*) INTO leak_orders   FROM public.orders            WHERE restaurant_id = a;
  SELECT count(*) INTO leak_sessions FROM public.customer_sessions WHERE restaurant_id = a;
  SELECT count(*) INTO leak_menu     FROM public.menu_items        WHERE restaurant_id = a;

  RESET ROLE;

  IF leak_orders > 0 OR leak_sessions > 0 OR leak_menu > 0 THEN
    RAISE EXCEPTION 'ISOLATION FAILURE — tenant B sees A: % orders, % sessions, % menu items',
      leak_orders, leak_sessions, leak_menu;
  END IF;

  RAISE NOTICE 'ISOLATION OK — tenant A sees % orders / % sessions; tenant B sees 0 of A''s (orders/sessions/menu).',
    a_orders, a_sessions;
END $$;
