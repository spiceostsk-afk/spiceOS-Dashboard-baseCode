-- =============================================================================
-- Spice OS — let the schema accept the session states the app actually uses
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- =============================================================================
-- THE BUG
--
-- customer_sessions.session_status only allowed 'active', 'completed' and
-- 'cancelled'. The billing screen writes three more:
--
--   'void'     when a bill is voided
--   'hold'     when a bill is put on hold
--   'billing'  when a payment is partial
--
-- Every one of those UPDATEs was refused by the check constraint. Voiding a
-- bill therefore did nothing at all: the session stayed active, the table
-- stayed occupied, and the order stayed open — which is exactly what "I voided
-- this bill and it is still showing" looks like.
--
-- Hold and partial payment failed the same way, silently, and because nothing
-- could ever be stored as 'hold' the Held tab was permanently empty.
--
-- THE FIX
--
-- Widen the constraint rather than rewrite the app. These are real states a
-- restaurant has — a bill on hold is neither open nor closed — and collapsing
-- them onto 'cancelled' would lose the distinction between a voided bill and
-- an abandoned one.
--
-- Reports and Payments read session_status = 'completed', so a voided or held
-- session still earns nothing. That stays true.
-- =============================================================================

ALTER TABLE public.customer_sessions
  DROP CONSTRAINT IF EXISTS customer_sessions_session_status_check;

ALTER TABLE public.customer_sessions
  ADD CONSTRAINT customer_sessions_session_status_check
  CHECK (session_status IN ('active', 'billing', 'hold', 'completed', 'cancelled', 'void'));

-- =============================================================================
-- DIAGNOSTIC — what is actually on Table 2 right now?
--
-- The Settle button is disabled when the session is already paid OR when the
-- bill has no items. `items` below is the one to read: a session showing a
-- total with zero order_items would explain a dead Settle button.
-- =============================================================================
SELECT jsonb_pretty(jsonb_build_object(
  'statuses_now_allowed', ARRAY['active','billing','hold','completed','cancelled','void'],

  'open_tables', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'table',          t.table_number,
             'table_status',   t.status,
             'session_status', cs.session_status,
             'session_opened', cs.started_at,
             'orders',         (SELECT count(*) FROM public.orders o
                                 WHERE o.session_id = cs.id),
             'order_statuses', (SELECT COALESCE(jsonb_agg(DISTINCT o.order_status), '[]'::jsonb)
                                 FROM public.orders o WHERE o.session_id = cs.id),
             'items',          (SELECT count(*) FROM public.order_items oi
                                 JOIN public.orders o ON o.id = oi.order_id
                                 WHERE o.session_id = cs.id),
             'total',          (SELECT COALESCE(SUM(o.total), 0) FROM public.orders o
                                 WHERE o.session_id = cs.id)
           ) ORDER BY t.table_number), '[]'::jsonb)
    FROM public.customer_sessions cs
    JOIN public.restaurant_tables t ON t.id = cs.table_id
    WHERE cs.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
      AND cs.session_status NOT IN ('completed', 'cancelled', 'void')),

  'orders_still_live', (
    SELECT count(*) FROM public.orders
    WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
      AND order_status NOT IN ('completed', 'cancelled'))
)) AS result;
