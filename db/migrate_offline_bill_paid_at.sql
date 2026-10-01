-- =============================================================================
-- Offline settles keep the time they were paid
--
-- A table settled while the till was offline reaches the server later, when
-- the connection returns. record_bill stamped paid_at = now(), so a bill paid
-- at 23:50 and synced at 09:00 landed on the next day in every report.
--
-- Adds p_paid_at (optional). The till sends it only for settles it queued
-- offline; online settles leave it out and get now() exactly as before.
-- A time in the future is clamped to now() — a wrong device clock must not
-- put money on a day that hasn't happened yet.
--
-- The new signature is created first, then the old one dropped, so there is
-- never a moment with no record_bill (the SQL Editor commits per statement).
-- Until this runs, the till still works: the sync falls back to sending the
-- bill without p_paid_at.
-- =============================================================================

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
  p_paid_at         timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  s        record;
  v_order  uuid;
  v_id     uuid;
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
    subtotal, discount_type, discount_amount, service_charge, gst_amount,
    grand_total, payment_status, payment_method, generated_by, paid_at
  ) VALUES (
    s.restaurant_id, v_order, p_session_id,
    COALESCE(p_subtotal, 0),
    NULLIF(btrim(COALESCE(p_discount_type, '')), ''),
    COALESCE(p_discount_amount, 0),
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

GRANT EXECUTE ON FUNCTION public.record_bill(uuid, text, numeric, text, numeric, numeric, numeric, numeric, boolean, timestamptz)
  TO authenticated;

-- The old nine-argument version. Left in place, a call without p_paid_at
-- would match both and PostgREST would refuse it as ambiguous.
DROP FUNCTION IF EXISTS public.record_bill(uuid, text, numeric, text, numeric, numeric, numeric, numeric, boolean);

-- Make PostgREST see the new signature straight away.
NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- VERIFY: one record_bill, ten arguments, the last being p_paid_at.
-- =============================================================================
SELECT p.oid::regprocedure AS signature
FROM pg_proc p
WHERE p.proname = 'record_bill' AND p.pronamespace = 'public'::regnamespace;
