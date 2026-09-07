-- =============================================================================
-- Spice OS — settling a table must produce a bill
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- =============================================================================
-- THE GAP
--
-- Settling a table updates the session, closes its orders and frees the table.
-- It has never written a row to `bills`. Every one of the sixteen bills in the
-- database came from Sales Entry; the billing screen has produced none.
--
-- Three reports the client has asked for are impossible because of it:
--
--   Discount report   the discount is stashed in customer_sessions.metadata as
--                     JSON and never lands anywhere countable
--   Payment mode      reads `bills`, so every table settled at the till is
--                     invisible to it
--   Online report     the ZOMATO and SWIGGY sessions have no bill at all
--
-- And `bills` has nowhere to put a discount even if it were written: the table
-- has subtotal, gst_amount, service_charge and grand_total, and nothing else.
--
-- WHAT THIS ADDS
--
--   1. discount_type and discount_amount on bills
--   2. record_bill(), which writes one bill per session and can be called
--      again without producing a second
--
-- ONE BILL PER SESSION
--
-- A session can carry several orders but is settled once, so the bill belongs
-- to the session. That already holds for all sixteen existing rows — none has
-- more than one bill — so the unique index below goes on cleanly and keeps it
-- true. order_id is left as the first order on the session, for the Sales
-- Entry rows that set it and for anything joining that way.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Somewhere to put the discount
-- ----------------------------------------------------------------------------
ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS discount_type   text,
  ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bills_discount_type_check') THEN
    ALTER TABLE public.bills
      ADD CONSTRAINT bills_discount_type_check
      CHECK (discount_type IS NULL OR discount_type IN ('percentage', 'flat'));
  END IF;
END $do$;

-- One settlement, one bill. Calling record_bill twice updates rather than
-- duplicates, and this is what makes that safe.
CREATE UNIQUE INDEX IF NOT EXISTS bills_one_per_session
  ON public.bills (session_id) WHERE session_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. Write the bill
--
--    Takes the figures the till already worked out and showed on the printed
--    bill, rather than recomputing them here — two implementations of the same
--    arithmetic would eventually disagree, and the one the customer was handed
--    is the one that must be recorded.
--
--    Idempotent on the session: settle twice, correct a payment mode, take a
--    partial payment and then the rest — all update the same row.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_bill(
  p_session_id      uuid,
  p_payment_method  text    DEFAULT 'cash',
  p_subtotal        numeric DEFAULT 0,
  p_discount_type   text    DEFAULT NULL,
  p_discount_amount numeric DEFAULT 0,
  p_service_charge  numeric DEFAULT 0,
  p_tax             numeric DEFAULT 0,
  p_total           numeric DEFAULT 0,
  p_paid            boolean DEFAULT true
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
    CASE WHEN p_paid THEN now() ELSE NULL END
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

GRANT EXECUTE ON FUNCTION public.record_bill(uuid, text, numeric, text, numeric, numeric, numeric, numeric, boolean)
  TO authenticated;

-- =============================================================================
-- VERIFY
-- =============================================================================
SELECT jsonb_pretty(jsonb_build_object(
  'discount_columns', (
    SELECT COALESCE(jsonb_agg(column_name ORDER BY column_name), '[]'::jsonb)
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bills'
      AND column_name IN ('discount_type', 'discount_amount')),
  'one_per_session_index', (
    SELECT count(*) FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'bills_one_per_session'),
  'record_bill_ready', (
    SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'record_bill'),
  'bills_now', (SELECT count(*) FROM public.bills),
  'sessions_settled_without_a_bill', (
    SELECT count(*) FROM public.customer_sessions cs
    WHERE cs.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
      AND cs.session_status = 'completed'
      AND NOT EXISTS (SELECT 1 FROM public.bills b WHERE b.session_id = cs.id))
)) AS after_state;
