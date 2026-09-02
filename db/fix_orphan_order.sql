-- =============================================================================
-- Wali Baba — clear the ₹264 order that has no items on it
-- Run in the Supabase SQL Editor. Step 1 is read-only.
-- =============================================================================
-- Table 2 holds an order with a total of 264 and ZERO order_items. That is why
-- Settle is dead: the button is disabled when the bill has no items, and an
-- order with no lines has nothing to settle. Voiding did not clear it either,
-- because 'void' was refused by the session_status check constraint until the
-- previous migration widened it.
--
-- An order with no items is not a real bill, so it is cancelled rather than
-- kept. Stock is unaffected either way: consumption is driven by order_items,
-- and there are none.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. LOOK FIRST — every order with no items behind it
-- ----------------------------------------------------------------------------
SELECT jsonb_pretty(jsonb_build_object(
  'orders_without_items', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'table',          t.table_number,
             'order_status',   o.order_status,
             'session_status', COALESCE(cs.session_status, '(none)'),
             'total',          o.total,
             'created',        o.created_at
           ) ORDER BY o.created_at), '[]'::jsonb)
    FROM public.orders o
    LEFT JOIN public.customer_sessions cs ON cs.id = o.session_id
    LEFT JOIN public.restaurant_tables t  ON t.id = o.table_id
    WHERE o.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
      AND NOT EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id = o.id)),
  'orders_with_items', (
    SELECT count(*) FROM public.orders o
    WHERE o.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
      AND EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id = o.id))
)) AS before_state;


-- =============================================================================
-- 2. THE REPAIR
--
-- Only orders with NO items are touched, so a real bill can never be caught by
-- this. Their sessions are closed and the tables released.
-- =============================================================================
UPDATE public.orders o
   SET order_status = 'cancelled'
 WHERE o.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
   AND o.order_status NOT IN ('completed', 'cancelled')
   AND NOT EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id = o.id);

-- Close any session left with nothing live on it.
UPDATE public.customer_sessions cs
   SET session_status = 'cancelled',
       ended_at = COALESCE(cs.ended_at, now())
 WHERE cs.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
   AND cs.session_status IN ('active', 'billing', 'hold')
   AND NOT EXISTS (
     SELECT 1 FROM public.orders o
     WHERE o.session_id = cs.id
       AND o.order_status NOT IN ('completed', 'cancelled'));

-- Free tables no longer held by a live session.
UPDATE public.restaurant_tables t
   SET status = 'available'
 WHERE t.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
   AND t.status <> 'available'
   AND NOT EXISTS (
     SELECT 1 FROM public.customer_sessions cs
     WHERE cs.table_id = t.id
       AND cs.session_status IN ('active', 'billing', 'hold'));

-- ----------------------------------------------------------------------------
-- 3. VERIFY — all three should be empty or zero.
-- ----------------------------------------------------------------------------
SELECT jsonb_pretty(jsonb_build_object(
  'orders_still_live', (
    SELECT count(*) FROM public.orders
    WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
      AND order_status NOT IN ('completed', 'cancelled')),
  'sessions_still_open', (
    SELECT count(*) FROM public.customer_sessions
    WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
      AND session_status IN ('active', 'billing', 'hold')),
  'table_states', (
    SELECT COALESCE(jsonb_object_agg(table_number, status), '{}'::jsonb)
    FROM public.restaurant_tables
    WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'),
  'stock_untouched', 'no order_items existed, so no consumption was ever posted'
)) AS after_state;
