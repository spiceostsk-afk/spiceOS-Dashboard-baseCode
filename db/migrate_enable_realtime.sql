-- =============================================================================
-- Spice OS — turn on realtime for the tables the panels listen to
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- =============================================================================
-- Every panel subscribes to postgres_changes (Billing, the captain console, the
-- diner's order-status screen), but on this project the supabase_realtime
-- publication holds no public tables. The ALTER that did it lived in the old
-- project's supabase_migration.sql and never made the move. So nothing has ever
-- arrived: a diner's QR order sat on the bill unseen until someone refreshed.
--
-- Tenant isolation is unchanged. Realtime checks each subscriber's RLS before
-- sending a row, so a restaurant's till only hears its own changes, and a diner
-- only their own session's.
--
-- Each table is added only if it is not already in the publication, because
-- ALTER PUBLICATION ... ADD TABLE errors on a table that is already there.
-- =============================================================================

DO $do$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'restaurant_tables', 'customer_sessions', 'orders', 'order_items',
    'menu_items', 'menu_categories', 'waiter_calls', 'waiting_list'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $do$;

-- Check: should list all eight.
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
ORDER BY tablename;
