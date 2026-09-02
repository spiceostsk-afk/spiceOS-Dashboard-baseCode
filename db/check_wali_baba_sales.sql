-- =============================================================================
-- What sales data exists for Wali Baba, and what is tied to it?
-- Read-only. One statement — the editor returns only the last result.
-- =============================================================================
-- The question that matters before deleting anything: how much of the current
-- raw-material stock came from these orders? Deleting an order line fires
-- order_items_stock_sync, which puts its recipe ingredients BACK. So the
-- answer decides whether the flush needs the trigger held off.
-- =============================================================================
SELECT jsonb_pretty(jsonb_build_object(

  'restaurant', (SELECT name FROM public.restaurants
                  WHERE id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'),

  'sales_rows', jsonb_build_object(
    'orders',            (SELECT count(*) FROM public.orders
                           WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'),
    'order_items',       (SELECT count(*) FROM public.order_items
                           WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'),
    'bills',             (SELECT count(*) FROM public.bills
                           WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'),
    'customer_sessions', (SELECT count(*) FROM public.customer_sessions
                           WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'),
    'waiter_calls',      (SELECT count(*) FROM public.waiter_calls
                           WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'),
    'waiting_list',      (SELECT count(*) FROM public.waiting_list
                           WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'),
    'shift_reports',     (SELECT count(*) FROM public.shift_reports
                           WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee')),

  'order_dates', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('day', d, 'orders', n)
                              ORDER BY d DESC), '[]'::jsonb)
    FROM (SELECT created_at::date AS d, count(*) AS n
          FROM public.orders
          WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
          GROUP BY 1) s),

  -- The crux. Consumption movements are the stock these orders took out.
  -- If this is 0, no recipe ever fired and deleting the orders cannot move
  -- stock at all.
  'consumption_movements', (
    SELECT count(*) FROM public.stock_movements
    WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
      AND movement_type = 'consumption'),

  'consumption_qty', (
    SELECT COALESCE(SUM(ABS(delta)), 0) FROM public.stock_movements
    WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
      AND movement_type = 'consumption'),

  -- What the ledger is made of right now, so we can see what a flush touches.
  'movements_by_type', (
    SELECT COALESCE(jsonb_object_agg(movement_type, n), '{}'::jsonb)
    FROM (SELECT movement_type, count(*) AS n
          FROM public.stock_movements
          WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
          GROUP BY 1) s),

  -- Recipes are what turn a sale into stock movement. No recipes, no risk.
  'recipes_defined', (
    SELECT count(DISTINCT menu_item_id) FROM public.recipe_ingredients
    WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'),

  'materials_with_stock', (
    SELECT count(*) FROM public.inventory_items
    WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee' AND stock <> 0),

  'total_stock_value_rows', (
    SELECT count(*) FROM public.inventory_items
    WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee')

)) AS result;
