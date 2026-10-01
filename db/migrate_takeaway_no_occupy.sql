-- =============================================================================
-- Spice OS — takeaway never occupies a packing counter
-- Run in the Supabase SQL Editor. Safe to re-run. Three statements; each
-- stands on its own (the editor commits them one at a time).
-- =============================================================================
-- A takeaway is filed under a packing counter (restaurant_tables.kind =
-- 'packing') only because customer_sessions.table_id is NOT NULL. Many
-- takeaways are open on one counter at once, so the counter must never read
-- "occupied" or "cleaning": that is what made the till refuse a new takeaway
-- when every counter "was busy".
--
-- The dashboard no longer writes those statuses for packing counters. These
-- keep the database right regardless of who writes: a till still running the
-- old build, a queued offline update, or the session-insert trigger.
-- =============================================================================


-- 1. Opening a session no longer occupies a packing counter.
CREATE OR REPLACE FUNCTION public.mark_table_occupied()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- A session inserted as completed, cancelled or void is history being
  -- recorded, not a table being taken.
  IF NEW.session_status NOT IN ('active', 'billing', 'hold') THEN
    RETURN NEW;
  END IF;

  -- Takeaways share a packing counter; it is never taken.
  UPDATE public.restaurant_tables
     SET status = 'occupied'
   WHERE id = NEW.table_id
     AND status <> 'occupied'
     AND kind <> 'packing';

  RETURN NEW;
END;
$function$;


-- 2. A packing counter's status is always 'available', whatever is written.
CREATE OR REPLACE FUNCTION public.keep_packing_counter_free()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.kind = 'packing' THEN
    NEW.status := 'available';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_keep_packing_counter_free ON public.restaurant_tables;
CREATE TRIGGER trg_keep_packing_counter_free
  BEFORE INSERT OR UPDATE ON public.restaurant_tables
  FOR EACH ROW EXECUTE FUNCTION public.keep_packing_counter_free();


-- 3. Free the counters already marked busy. Their open takeaways stay open —
--    only the counter's status changes.
UPDATE public.restaurant_tables
   SET status = 'available'
 WHERE kind = 'packing'
   AND status <> 'available'
RETURNING restaurant_id, table_number, status;
