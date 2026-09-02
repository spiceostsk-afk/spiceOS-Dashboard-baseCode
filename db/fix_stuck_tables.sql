-- =============================================================================
-- Wali Baba — release tables stuck open after being settled
-- Run in the Supabase SQL Editor. Step 1 is read-only; read it before step 2.
-- =============================================================================
-- WHY THEY ARE STUCK
--
-- Settling a bill ended the customer_session but never closed the orders
-- underneath it. They stayed at 'pending' or 'preparing', and the dashboard
-- counts any order that is not finished as still live — so a table that had
-- been paid and cleared kept reporting itself as open and unbilled.
--
-- On the billing screen the same sessions look the opposite way round: isPaid
-- is read from session_status, which IS 'completed', so the button shows
-- "Paid & completed" and is disabled. That is why Settle appears to be
-- missing. Nothing is wrong with the button; the session behind it is already
-- closed.
--
-- The code fix stops this happening again. This repairs the two already stuck.
--
-- NOTE ON STOCK: order_status is not what moves inventory — the recipe trigger
-- fires on order_items, which this does not touch. Stock is unaffected.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. LOOK FIRST — which orders are still open, and is their session closed?
-- ----------------------------------------------------------------------------
SELECT jsonb_pretty(jsonb_build_object(
  'open_orders', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'table',          t.table_number,
             'order_status',   o.order_status,
             'session_status', COALESCE(cs.session_status, '(no session)'),
             'total',          o.total,
             'opened',         o.created_at,
             'items',          (SELECT count(*) FROM public.order_items oi
                                 WHERE oi.order_id = o.id)
           ) ORDER BY o.created_at), '[]'::jsonb)
    FROM public.orders o
    LEFT JOIN public.customer_sessions cs  ON cs.id = o.session_id
    LEFT JOIN public.restaurant_tables t   ON t.id = o.table_id
    WHERE o.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
      AND o.order_status NOT IN ('completed', 'cancelled')),

  'active_sessions', (
    SELECT count(*) FROM public.customer_sessions
    WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
      AND session_status = 'active'),

  'table_states', (
    SELECT COALESCE(jsonb_object_agg(table_number, status), '{}'::jsonb)
    FROM public.restaurant_tables
    WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee')
)) AS before_state;


-- =============================================================================
-- 2. THE REPAIR — run this after reading the above.
--
-- Only orders whose session is ALREADY completed are closed. An order on a
-- genuinely active session is a real open table and is left alone, so this
-- cannot close a bill that has not been paid.
-- =============================================================================
UPDATE public.orders o
   SET order_status = 'completed'
  FROM public.customer_sessions cs
 WHERE cs.id = o.session_id
   AND o.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
   AND cs.session_status = 'completed'
   AND o.order_status NOT IN ('completed', 'cancelled');

-- Free any table still held by a session that has finished.
UPDATE public.restaurant_tables t
   SET status = 'available'
 WHERE t.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
   AND t.status <> 'available'
   AND NOT EXISTS (
     SELECT 1 FROM public.customer_sessions cs
     WHERE cs.table_id = t.id
       AND cs.session_status IN ('active', 'billing'));

-- ----------------------------------------------------------------------------
-- 3. VERIFY — open_orders should now hold only genuinely active tables.
-- ----------------------------------------------------------------------------
SELECT jsonb_pretty(jsonb_build_object(
  'still_open', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'table',          t.table_number,
             'order_status',   o.order_status,
             'session_status', COALESCE(cs.session_status, '(no session)'),
             'total',          o.total
           )), '[]'::jsonb)
    FROM public.orders o
    LEFT JOIN public.customer_sessions cs ON cs.id = o.session_id
    LEFT JOIN public.restaurant_tables t  ON t.id = o.table_id
    WHERE o.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
      AND o.order_status NOT IN ('completed', 'cancelled')),
  'orders_closed_now', (
    SELECT count(*) FROM public.orders
    WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
      AND order_status = 'completed'),
  'table_states', (
    SELECT COALESCE(jsonb_object_agg(table_number, status), '{}'::jsonb)
    FROM public.restaurant_tables
    WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'),
  'stock_untouched', 'order_status does not move stock — the recipe trigger is on order_items'
)) AS after_state;
