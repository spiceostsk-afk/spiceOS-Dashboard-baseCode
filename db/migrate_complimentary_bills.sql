-- =============================================================================
-- Complimentary bills
--
-- The till now has "Complimentary (100% off)" beside Percentage and Flat in the
-- bill's discount, with who it was for (Owner, Staff meal, Guest of the house,
-- Other). This lets the bill say so:
--
--   1. bills.discount_type accepts 'complimentary'
--   2. bills.comp_reason holds who it was for
--   3. record_bill takes p_comp_reason (optional)
--
-- Until this runs the till still works: a complimentary bill is sent as a 100%
-- percentage discount without a reason, and the Complimentary Report still
-- finds it (₹0 charged on a bill with value).
--
-- The new record_bill is created first, then the old one dropped, so there is
-- never a moment with no record_bill (the SQL Editor commits per statement).
-- Safe to run more than once. Run in the Supabase SQL Editor.
-- =============================================================================

ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS comp_reason text;

ALTER TABLE public.bills DROP CONSTRAINT IF EXISTS bills_discount_type_check;

ALTER TABLE public.bills
  ADD CONSTRAINT bills_discount_type_check
  CHECK (discount_type IS NULL OR discount_type IN ('percentage', 'flat', 'complimentary'));

CREATE OR REPLACE FUNCTION public.record_bill(
  p_session_id      uuid,
  p_payment_method  text        DEFAULT 'cash',
  p_subtotal        numeric     DEFAULT 0,
  p_discount_type   text        DEFAULT NULL,
  p_discount_amount numeric     DEFAULT 0,
  p_service_charge  numeric     DEFAULT 0,
  p_tax             numeric     DEFAULT 0,
  p_total           numeric     DEFAULT 0,
  p_paid            boolean     DEFAULT true,
  p_paid_at         timestamptz DEFAULT NULL,
  p_comp_reason     text        DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  s        record;
  v_order  uuid;
  v_id     uuid;
  v_type   text := NULLIF(btrim(COALESCE(p_discount_type, '')), '');
BEGIN
  SELECT * INTO s FROM public.customer_sessions WHERE id = p_session_id;
  IF s IS NULL THEN RAISE EXCEPTION 'Session % not found', p_session_id; END IF;
  IF s.restaurant_id IS DISTINCT FROM public.current_restaurant_id()
     AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;

  SELECT id INTO v_order
  FROM public.orders
  WHERE session_id = p_session_id AND order_status <> 'cancelled'
  ORDER BY created_at
  LIMIT 1;

  INSERT INTO public.bills (
    restaurant_id, order_id, session_id,
    subtotal, discount_type, discount_amount, comp_reason, service_charge, gst_amount,
    grand_total, payment_status, payment_method, generated_by, paid_at
  ) VALUES (
    s.restaurant_id, v_order, p_session_id,
    COALESCE(p_subtotal, 0),
    v_type,
    COALESCE(p_discount_amount, 0),
    -- A reason only means something on a complimentary bill.
    CASE WHEN v_type = 'complimentary'
         THEN COALESCE(NULLIF(btrim(p_comp_reason), ''), 'Other') END,
    COALESCE(p_service_charge, 0),
    COALESCE(p_tax, 0),
    COALESCE(p_total, 0),
    CASE WHEN p_paid THEN 'paid' ELSE 'pending' END,
    COALESCE(NULLIF(btrim(p_payment_method), ''), 'cash'),
    auth.uid(),
    CASE WHEN p_paid THEN LEAST(COALESCE(p_paid_at, now()), now()) ELSE NULL END
  )
  ON CONFLICT (session_id) WHERE session_id IS NOT NULL
  DO UPDATE SET
    order_id        = EXCLUDED.order_id,
    subtotal        = EXCLUDED.subtotal,
    discount_type   = EXCLUDED.discount_type,
    discount_amount = EXCLUDED.discount_amount,
    comp_reason     = EXCLUDED.comp_reason,
    service_charge  = EXCLUDED.service_charge,
    gst_amount      = EXCLUDED.gst_amount,
    grand_total     = EXCLUDED.grand_total,
    payment_status  = EXCLUDED.payment_status,
    payment_method  = EXCLUDED.payment_method,
    paid_at         = EXCLUDED.paid_at
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.record_bill(uuid, text, numeric, text, numeric, numeric, numeric, numeric, boolean, timestamptz, text)
  TO authenticated;

-- The previous ten-argument version. Left in place, any call without
-- p_comp_reason would match both and PostgREST would refuse it as ambiguous.
DROP FUNCTION IF EXISTS public.record_bill(uuid, text, numeric, text, numeric, numeric, numeric, numeric, boolean, timestamptz);

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- VERIFY: one record_bill ending in p_comp_reason, and the widened check.
-- =============================================================================
SELECT p.oid::regprocedure AS signature
FROM pg_proc p
WHERE p.proname = 'record_bill' AND p.pronamespace = 'public'::regnamespace;

SELECT pg_get_constraintdef(oid) AS discount_type_check
FROM pg_constraint WHERE conname = 'bills_discount_type_check';
