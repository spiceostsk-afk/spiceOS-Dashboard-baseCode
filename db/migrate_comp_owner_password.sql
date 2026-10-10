-- =============================================================================
-- Spice OS — a complimentary bill needs the owner's password
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- =============================================================================
-- Asked for by the client 2026-10-10: zeroing a bill gives food away, so the
-- till must ask for the restaurant owner's LOGIN password before it allows it.
--
-- The check runs here, not in the browser. Signing in again as the owner would
-- swap the till's session for the owner's, and the browser has no other way
-- to check a password. This compares against the hash Supabase Auth already
-- stores, using pgcrypto's crypt(), the same check sign-in does.
--
-- Any owner of the CALLER's current restaurant can approve. A password for
-- another restaurant's owner proves nothing here.
--
-- A wrong password costs a second, which makes guessing slow. The password is
-- never stored or logged.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.verify_owner_password(p_password text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions AS $fn$
DECLARE
  v_rest uuid := public.current_restaurant_id();
  v_ok   boolean;
BEGIN
  IF v_rest IS NULL OR p_password IS NULL OR p_password = '' THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.restaurant_members rm
    JOIN auth.users u ON u.id = rm.user_id
    WHERE rm.restaurant_id = v_rest
      AND rm.role = 'owner'
      AND u.encrypted_password IS NOT NULL
      AND u.encrypted_password = extensions.crypt(p_password, u.encrypted_password)
  ) INTO v_ok;

  IF NOT v_ok THEN
    PERFORM pg_sleep(1);
  END IF;

  RETURN v_ok;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.verify_owner_password(text) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.verify_owner_password(text) TO authenticated;
