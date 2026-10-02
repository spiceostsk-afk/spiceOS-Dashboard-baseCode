-- =============================================================================
-- Spice OS — correct how a settled bill was paid (Order history)
-- Run in the Supabase SQL Editor. Safe to re-run. Each statement stands alone.
-- =============================================================================
-- A cashier taps Cash when the customer paid by UPI, and the day's cash count
-- and payment-mode report are wrong from then on. This lets an OWNER change
-- the payment mode of a settled bill from Order history.
--
-- Same rules as editing or voiding a settled order (migrate_floor_and_order_
-- admin.sql, part B): the owner check is in the database, not just a hidden
-- button, and every change goes to order_audit with the before and after.
-- =============================================================================


-- 1. order_audit records payment corrections too.
ALTER TABLE public.order_audit DROP CONSTRAINT IF EXISTS order_audit_action_check;
ALTER TABLE public.order_audit
  ADD CONSTRAINT order_audit_action_check
  CHECK (action IN ('edit', 'void', 'delete', 'payment'));


-- 2. Change the payment mode of a settled bill.
--    A settled table with no bill row (settled before bills were written on
--    settle) gets one, built from its orders, so it can carry a mode at all.
CREATE OR REPLACE FUNCTION public.admin_set_payment_method(
  p_session_id uuid,
  p_method     text,
  p_reason     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  s        record;
  b        record;
  v_method text := lower(btrim(COALESCE(p_method, '')));
  v_before text;
  v_order  uuid;
BEGIN
  SELECT * INTO s FROM public.customer_sessions WHERE id = p_session_id;
  IF s IS NULL THEN RAISE EXCEPTION 'Bill not found'; END IF;

  IF NOT public.is_owner(s.restaurant_id) THEN
    RAISE EXCEPTION 'Only an owner can change how a bill was paid';
  END IF;
  IF s.session_status <> 'completed' THEN
    RAISE EXCEPTION 'Only a settled bill has a payment mode to correct';
  END IF;
  IF v_method NOT IN ('cash', 'card', 'qr', 'upi', 'zomato', 'swiggy', 'home_delivery', 'other') THEN
    RAISE EXCEPTION 'Unknown payment mode: %', p_method;
  END IF;

  SELECT * INTO b FROM public.bills WHERE session_id = p_session_id;

  IF b IS NULL THEN
    SELECT id INTO v_order
      FROM public.orders
     WHERE session_id = p_session_id AND order_status <> 'cancelled'
     ORDER BY created_at
     LIMIT 1;

    INSERT INTO public.bills (
      restaurant_id, order_id, session_id,
      subtotal, gst_amount, grand_total,
      payment_status, payment_method, generated_by, paid_at
    )
    SELECT s.restaurant_id, v_order, p_session_id,
           COALESCE(sum(o.subtotal), 0), COALESCE(sum(o.tax), 0), COALESCE(sum(o.total), 0),
           'paid', v_method, auth.uid(), COALESCE(s.ended_at, now())
      FROM public.orders o
     WHERE o.session_id = p_session_id AND o.order_status <> 'cancelled';
  ELSE
    v_before := b.payment_method;
    v_order := b.order_id;
    IF v_before IS NOT DISTINCT FROM v_method THEN
      RETURN jsonb_build_object('payment_method', v_method, 'changed', false);
    END IF;
    UPDATE public.bills SET payment_method = v_method WHERE id = b.id;
  END IF;

  INSERT INTO public.order_audit
    (restaurant_id, order_id, action, reason, before_state, after_state,
     actor_id, actor_email)
  VALUES
    (s.restaurant_id, v_order, 'payment',
     COALESCE(NULLIF(btrim(p_reason), ''), 'Payment mode corrected'),
     jsonb_build_object('session_id', p_session_id, 'payment_method', v_before),
     jsonb_build_object('session_id', p_session_id, 'payment_method', v_method),
     auth.uid(), auth.email());

  RETURN jsonb_build_object('payment_method', v_method, 'changed', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_set_payment_method(uuid, text, text) TO authenticated;
