-- =============================================================================
-- Spice OS — reopening a posted stock count
-- Run once in the Supabase SQL Editor, after db/migrate_inventory_phase2.sql.
-- Safe to re-run.
-- =============================================================================
-- The Closing Stock screen needs Edit on counts that have already been posted.
-- Submitting a count writes a 'physical_count' movement for every variance, so
-- editing one has to take those movements back before the sheet can be counted
-- again — otherwise the correction would be applied twice.
--
-- Reopening does NOT wipe what was counted. The physical quantities and remarks
-- stay on the sheet so the operator edits the numbers they entered rather than
-- starting from a blank page; only the stock effect is undone.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.reopen_stock_count(p_count_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  c record;
BEGIN
  SELECT * INTO c FROM public.stock_counts WHERE id = p_count_id;
  IF c IS NULL THEN
    RAISE EXCEPTION 'Stock count % not found', p_count_id;
  END IF;
  IF c.restaurant_id IS DISTINCT FROM public.current_restaurant_id()
     AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;

  -- Undo the stock effect, rebuilding the affected balances from the ledger.
  PERFORM public.clear_document_movements(c.restaurant_id, 'stock_counts', c.id);

  -- Back to a draft, with the counted numbers left in place to be corrected.
  UPDATE public.stock_counts
     SET status = 'draft', submitted_at = NULL, updated_at = now()
   WHERE id = p_count_id;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.reopen_stock_count(uuid) TO authenticated;

-- =============================================================================
-- VERIFY
-- =============================================================================
SELECT jsonb_pretty(jsonb_build_object(
  'reopen_stock_count_exists', EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'reopen_stock_count'),
  'submitted_counts', (
    SELECT count(*) FROM public.stock_counts WHERE status = 'submitted'),
  'draft_counts', (
    SELECT count(*) FROM public.stock_counts WHERE status = 'draft')
)) AS result;
