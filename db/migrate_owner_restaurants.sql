-- =============================================================================
-- Spice OS — one owner, many restaurants
-- Run once in the Supabase SQL Editor, after db/schema.sql. Safe to re-run.
-- =============================================================================
-- restaurant_members already has a composite (user_id, restaurant_id) key, so
-- the database has always allowed an owner to belong to several restaurants.
-- Two things stopped it being usable:
--
--   1. The access-token hook stamped the FIRST membership into the JWT and
--      there was no way to say "not that one, this one".
--   2. restaurants_read only exposes the row matching the current claim, so an
--      owner could not even see the names of their other restaurants.
--
-- This migration fixes both, without loosening RLS:
--
--   user_active_restaurant   which restaurant this user is currently working
--                            in. Read by the auth hook when it mints a token.
--
--   set_active_restaurant()  switch. Verifies membership before it writes.
--
--   my_restaurants()         the dropdown's data. SECURITY DEFINER so it can
--                            name restaurants the caller is a member of
--                            WITHOUT widening the restaurants_read policy —
--                            the app still only ever operates on one tenant,
--                            so that policy stays exactly as tight as it was.
--
-- The security property that matters: the hook only ever selects from THIS
-- user's own restaurant_members rows. A tampered selection cannot mint a claim
-- for a restaurant the user is not a member of — the worst it can do is be
-- ignored.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Membership test
--    SECURITY DEFINER for the same reason is_platform_admin() is: it is called
--    from places that must not re-enter restaurant_members' own RLS.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_member_of(p_restaurant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.restaurant_members
    WHERE user_id = auth.uid() AND restaurant_id = p_restaurant_id
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_member_of(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. The current selection
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_active_restaurant (
  user_id       uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_active_restaurant ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS active_restaurant_self ON public.user_active_restaurant;
CREATE POLICY active_restaurant_self ON public.user_active_restaurant
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- The Auth server mints the token, so it must be able to read the selection.
DROP POLICY IF EXISTS auth_admin_read_active ON public.user_active_restaurant;
CREATE POLICY auth_admin_read_active ON public.user_active_restaurant
  FOR SELECT TO supabase_auth_admin
  USING (true);

GRANT SELECT ON public.user_active_restaurant TO supabase_auth_admin;

-- ----------------------------------------------------------------------------
-- 3. The access-token hook, now selection-aware
--    Unchanged in shape: still one restaurant_id + user_role claim, still
--    driven entirely by restaurant_members. It just prefers the row the owner
--    picked, and falls back to the oldest membership when there is no pick (or
--    the pick is stale, e.g. the restaurant was deleted or access revoked).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  claims          jsonb;
  v_uid           uuid := (event ->> 'user_id')::uuid;
  v_restaurant_id uuid;
  v_role          text;
BEGIN
  SELECT rm.restaurant_id, rm.role
    INTO v_restaurant_id, v_role
  FROM public.restaurant_members rm
  LEFT JOIN public.user_active_restaurant ua
         ON ua.user_id = rm.user_id
  WHERE rm.user_id = v_uid
  -- The chosen restaurant first; NULLS LAST so "no choice made" falls through
  -- to the oldest membership instead of sorting to the top.
  ORDER BY (rm.restaurant_id = ua.restaurant_id) DESC NULLS LAST,
           rm.created_at ASC
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

-- Re-assert the grants from schema.sql; CREATE OR REPLACE keeps them, but this
-- file must also work when run against a database where they drifted.
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM authenticated, anon, public;

-- ----------------------------------------------------------------------------
-- 4. Switching
--    Writing the selection is only half the job — the JWT still carries the old
--    claim until the client refreshes its session. The frontend does that
--    immediately after this returns.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_active_restaurant(p_restaurant_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.restaurant_members
    WHERE user_id = v_uid AND restaurant_id = p_restaurant_id
  ) THEN
    RAISE EXCEPTION 'You do not have access to that restaurant';
  END IF;

  INSERT INTO public.user_active_restaurant (user_id, restaurant_id, updated_at)
  VALUES (v_uid, p_restaurant_id, now())
  ON CONFLICT (user_id)
  DO UPDATE SET restaurant_id = EXCLUDED.restaurant_id, updated_at = now();
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.set_active_restaurant(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. The dropdown's data
--    Returns only restaurants the caller is actually a member of. This is why
--    restaurants_read did not need to be widened: nothing else in the app ever
--    reads a restaurant other than the current one.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.my_restaurants();

CREATE OR REPLACE FUNCTION public.my_restaurants()
RETURNS TABLE (
  id         uuid,
  name       text,
  slug       text,
  role       text,
  status     text,
  logo_url   text,
  is_active  boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id,
         r.name,
         r.slug,
         rm.role,
         r.status,
         t.logo_url,
         (r.id = COALESCE(
            (SELECT ua.restaurant_id FROM public.user_active_restaurant ua
             WHERE ua.user_id = auth.uid()),
            (SELECT rm2.restaurant_id FROM public.restaurant_members rm2
             WHERE rm2.user_id = auth.uid()
             ORDER BY rm2.created_at ASC LIMIT 1)
         )) AS is_active
  FROM public.restaurant_members rm
  JOIN public.restaurants r ON r.id = rm.restaurant_id
  LEFT JOIN public.restaurant_themes t ON t.restaurant_id = r.id
  WHERE rm.user_id = auth.uid()
  ORDER BY r.name
$$;

GRANT EXECUTE ON FUNCTION public.my_restaurants() TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. Adding another restaurant to an owner's account
--
--    Without this the dropdown can never hold more than the one restaurant
--    signup created, so the feature would not be reachable. `restaurants` is
--    still platform-admin-write-only at the policy level; this function is the
--    one narrow, audited exception, and it always makes the CALLER the owner of
--    what it creates — it cannot be used to join an existing restaurant.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_restaurant(
  p_name text,
  p_slug text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_uid  uuid := auth.uid();
  v_name text := btrim(p_name);
  v_slug text;
  v_id   uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF v_name = '' OR v_name IS NULL THEN
    RAISE EXCEPTION 'A restaurant name is required';
  END IF;

  -- Only someone who already owns a restaurant may open another. A brand-new
  -- account still goes through signup / provision-restaurant.
  IF NOT EXISTS (
    SELECT 1 FROM public.restaurant_members
    WHERE user_id = v_uid AND role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Only an owner can add another restaurant';
  END IF;

  v_slug := lower(regexp_replace(COALESCE(NULLIF(btrim(p_slug), ''), v_name),
                                 '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := btrim(v_slug, '-');
  IF v_slug = '' THEN
    RAISE EXCEPTION 'Could not derive a slug from that name';
  END IF;

  IF EXISTS (SELECT 1 FROM public.restaurants WHERE slug = v_slug) THEN
    RAISE EXCEPTION 'The address "%" is already taken', v_slug;
  END IF;

  INSERT INTO public.restaurants (name, slug, status, plan)
  VALUES (v_name, v_slug, 'trial', 'basic')
  RETURNING id INTO v_id;

  INSERT INTO public.restaurant_members (user_id, restaurant_id, role)
  VALUES (v_uid, v_id, 'owner');

  INSERT INTO public.restaurant_themes (restaurant_id, preset)
  VALUES (v_id, 'default')
  ON CONFLICT (restaurant_id) DO NOTHING;

  RETURN v_id;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.create_restaurant(text, text) TO authenticated;

-- =============================================================================
-- End. An owner can now hold several restaurants on one login and move between
-- them; every other tenant boundary in the schema is untouched.
--
-- NOTE: db/migrate_inventory_stock.sql adds a trigger that gives each new
-- restaurant a default outlet, so a restaurant created here is immediately
-- usable by the stock module. Run that migration first if you have not.
-- =============================================================================
