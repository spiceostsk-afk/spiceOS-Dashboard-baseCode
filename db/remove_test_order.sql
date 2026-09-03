-- =============================================================================
-- Remove the "mohammad testing" order and give back the stock it consumed
-- Run in the Supabase SQL Editor. Step 1 is read-only — read it first.
-- =============================================================================
-- This is the OPPOSITE of db/flush_test_sales.sql, which held the stock
-- trigger off so a bulk delete could not disturb inventory. Here the trigger
-- is exactly what is wanted: order_items_stock_sync fires on delete and calls
-- apply_recipe_stock with a POSITIVE quantity, handing the recipe ingredients
-- back. So it is left switched on and does the reverting itself.
--
-- Order of deletion matters. bills point at orders and sessions, order_items
-- point at orders, orders point at sessions — so they go in that order, and
-- order_items must go while their order still exists or the trigger cannot
-- read which outlet the sale belonged to.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. LOOK FIRST — what will be deleted, and what comes back to stock
-- ----------------------------------------------------------------------------
SELECT jsonb_pretty(jsonb_build_object(

  'sessions_matched', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'customer',       cs.customer_name,
             'table',          t.table_number,
             'session_status', cs.session_status,
             'started',        cs.started_at,
             'orders',         (SELECT count(*) FROM public.orders o
                                 WHERE o.session_id = cs.id),
             'items',          (SELECT count(*) FROM public.order_items oi
                                 JOIN public.orders o ON o.id = oi.order_id
                                 WHERE o.session_id = cs.id),
             'total',          (SELECT COALESCE(SUM(o.total), 0) FROM public.orders o
                                 WHERE o.session_id = cs.id)
           )), '[]'::jsonb)
    FROM public.customer_sessions cs
    LEFT JOIN public.restaurant_tables t ON t.id = cs.table_id
    WHERE cs.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
      AND cs.customer_name ILIKE '%mohammad%test%'),

  'dishes_ordered', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'dish', COALESCE(m.item_name, '(manual line)'),
             'qty',  oi.quantity)), '[]'::jsonb)
    FROM public.order_items oi
    JOIN public.orders o             ON o.id = oi.order_id
    JOIN public.customer_sessions cs ON cs.id = o.session_id
    LEFT JOIN public.menu_items m    ON m.id = oi.menu_item_id
    WHERE cs.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
      AND cs.customer_name ILIKE '%mohammad%test%'),

  -- Exactly what the trigger will hand back, worked out from the recipes.
  'stock_to_be_returned', (
    SELECT COALESCE(jsonb_object_agg(name, qty), '{}'::jsonb) FROM (
      SELECT inv.item_name || ' (' || inv.unit || ')' AS name,
             ROUND(SUM(ri.quantity * oi.quantity), 3) AS qty
      FROM public.order_items oi
      JOIN public.orders o             ON o.id = oi.order_id
      JOIN public.customer_sessions cs ON cs.id = o.session_id
      JOIN public.recipe_ingredients ri ON ri.menu_item_id = oi.menu_item_id
      JOIN public.inventory_items inv   ON inv.id = ri.inventory_item_id
      WHERE cs.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
        AND cs.customer_name ILIKE '%mohammad%test%'
      GROUP BY 1) s),

  'stock_total_now', (
    SELECT COALESCE(SUM(stock), 0) FROM public.inventory_items
    WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee')
)) AS before_state;


-- =============================================================================
-- 2. THE DELETE
--
-- The stock trigger stays ON. Deleting each order line returns its recipe
-- ingredients, so inventory reverts as a consequence rather than by a separate
-- correction.
-- =============================================================================
DELETE FROM public.bills b
 WHERE b.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
   AND b.session_id IN (
     SELECT cs.id FROM public.customer_sessions cs
     WHERE cs.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
       AND cs.customer_name ILIKE '%mohammad%test%');

-- Order lines go while their order still exists, so the trigger can still see
-- which outlet and which day the sale belonged to.
DELETE FROM public.order_items oi
 WHERE oi.order_id IN (
   SELECT o.id FROM public.orders o
   JOIN public.customer_sessions cs ON cs.id = o.session_id
   WHERE cs.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
     AND cs.customer_name ILIKE '%mohammad%test%');

DELETE FROM public.orders o
 WHERE o.session_id IN (
   SELECT cs.id FROM public.customer_sessions cs
   WHERE cs.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
     AND cs.customer_name ILIKE '%mohammad%test%');

-- Free the table before the session that held it disappears.
UPDATE public.restaurant_tables t
   SET status = 'available'
 WHERE t.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
   AND t.id IN (
     SELECT cs.table_id FROM public.customer_sessions cs
     WHERE cs.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
       AND cs.customer_name ILIKE '%mohammad%test%');

DELETE FROM public.customer_sessions cs
 WHERE cs.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
   AND cs.customer_name ILIKE '%mohammad%test%';

-- ----------------------------------------------------------------------------
-- 3. VERIFY
--
-- stock_total_now should have RISEN by the quantities listed in step 1.
-- The consumption movements stay on the ledger with matching positive
-- reversals beside them, which is the honest record: it happened, then it was
-- taken back.
-- ----------------------------------------------------------------------------
SELECT jsonb_pretty(jsonb_build_object(
  'sessions_left',  (SELECT count(*) FROM public.customer_sessions
                      WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
                        AND customer_name ILIKE '%mohammad%test%'),
  'stock_total_now', (SELECT COALESCE(SUM(stock), 0) FROM public.inventory_items
                       WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'),
  'reversals_posted', (
    SELECT count(*) FROM public.stock_movements
    WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
      AND reason = 'Order line deleted'),
  'orders_still_live', (
    SELECT count(*) FROM public.orders
    WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
      AND order_status NOT IN ('completed', 'cancelled')),
  'table_states', (
    SELECT COALESCE(jsonb_object_agg(table_number, status), '{}'::jsonb)
    FROM public.restaurant_tables
    WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee')
)) AS after_state;
