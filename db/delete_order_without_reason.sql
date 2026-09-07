-- =============================================================================
-- Spice OS — deleting a bill no longer needs a reason
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- =============================================================================
-- WHY
--
-- Voiding keeps the bill, so it needs explaining: the record survives struck
-- through, and the next person to read it deserves to know why. A delete
-- leaves nothing to annotate — the bill is gone, and a mandatory reason box in
-- front of it is a box someone types "delete" into.
--
-- Void and edit still require one. Only delete is relaxed.
--
-- WHAT IS KEPT
--
-- The audit entry. order_audit still records the action, the full before
-- snapshot, who did it and when — the reason simply becomes optional, stored
-- when given and NULL when not. Owner-only still applies, and it is the
-- database that enforces it: anyone can call an RPC.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_delete_order(p_order_id uuid, p_reason text DEFAULT NULL)
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

  -- No reason check. A deleted bill has nothing left to annotate.

  v_before := public.order_snapshot(p_order_id);

  INSERT INTO public.order_audit
    (restaurant_id, order_id, action, reason, before_state, after_state,
     actor_id, actor_email)
  VALUES
    (o.restaurant_id, p_order_id, 'delete',
     NULLIF(btrim(COALESCE(p_reason, '')), ''),   -- kept when given, NULL when not
     v_before, NULL, auth.uid(), auth.email());

  DELETE FROM public.bills WHERE order_id = p_order_id;
  -- Returns the ingredients on the way out, through the recipe trigger.
  DELETE FROM public.order_items WHERE order_id = p_order_id;
  DELETE FROM public.orders WHERE id = p_order_id;

  RETURN jsonb_build_object('deleted', true, 'order_id', p_order_id);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.admin_delete_order(uuid, text) TO authenticated;

-- =============================================================================
-- VERIFY — the reason guard should be gone from delete and still present on
-- void and edit.
-- =============================================================================
SELECT jsonb_pretty(jsonb_build_object(
  'delete_still_requires_reason',
    (SELECT pg_get_functiondef(oid) LIKE '%A reason is required%'
     FROM pg_proc WHERE proname = 'admin_delete_order'),
  'void_still_requires_reason',
    (SELECT pg_get_functiondef(oid) LIKE '%A reason is required%'
     FROM pg_proc WHERE proname = 'admin_void_order'),
  'edit_still_requires_reason',
    (SELECT pg_get_functiondef(oid) LIKE '%A reason is required%'
     FROM pg_proc WHERE proname = 'admin_edit_order')
)) AS after_state;
