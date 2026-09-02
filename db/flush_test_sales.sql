-- =============================================================================
-- Flush test sales for Wali Baba, leaving stock and recipes untouched
-- Run in the Supabase SQL Editor. Read the result before believing it.
-- =============================================================================
-- THE HAZARD
--
-- order_items carries trg_order_items_stock_sync. Its DELETE branch calls
-- apply_recipe_stock with a POSITIVE quantity — deleting a sold line hands its
-- recipe ingredients back to stock. That is correct behaviour for a mistaken
-- order, and completely wrong for flushing test data: every deleted line would
-- inflate raw material stock, and the 31 Aug counted figures would be lost.
--
-- So the trigger is held off for the duration of the delete.
--
-- WHY A FUNCTION AND NOT A SCRIPT
--
-- The Supabase SQL Editor commits each statement separately, so a script that
-- disabled the trigger and then failed would leave it disabled — and every
-- subsequent order would stop deducting stock, silently, until someone
-- noticed. A function body is a single transaction: if any part fails, the
-- disable rolls back with it and the trigger is never left off.
--
-- DISABLE TRIGGER takes an ACCESS EXCLUSIVE lock on order_items, so no other
-- outlet or tenant can write an order during the window. Brief, and the right
-- side to err on.
--
-- WHAT IS KEPT
--
-- Consumption movements stay on the ledger, per your decision. Stock balances
-- therefore do not move by a single gram — the function proves this by
-- measuring total stock before and after and returning both.
--
-- Recipes, raw materials, units, categories, suppliers and the menu are not
-- touched at all.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.flush_sales_data(p_restaurant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_stock_before  numeric;
  v_stock_after   numeric;
  v_moves_before  integer;
  v_moves_after   integer;
  n_bills     integer := 0;
  n_items     integer := 0;
  n_orders    integer := 0;
  n_calls     integer := 0;
  n_waiting   integer := 0;
  n_sessions  integer := 0;
  n_shifts    integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.restaurants WHERE id = p_restaurant_id) THEN
    RAISE EXCEPTION 'Restaurant % not found', p_restaurant_id;
  END IF;

  SELECT COALESCE(SUM(stock), 0) INTO v_stock_before
  FROM public.inventory_items WHERE restaurant_id = p_restaurant_id;

  SELECT count(*) INTO v_moves_before
  FROM public.stock_movements WHERE restaurant_id = p_restaurant_id;

  -- Hold off the recipe-depletion trigger so deleting a sale cannot put its
  -- ingredients back.
  ALTER TABLE public.order_items DISABLE TRIGGER trg_order_items_stock_sync;

  -- Delete inwards along the foreign keys: bills point at orders and
  -- sessions, order_items at orders, orders at sessions.
  DELETE FROM public.bills WHERE restaurant_id = p_restaurant_id;
  GET DIAGNOSTICS n_bills = ROW_COUNT;

  DELETE FROM public.order_items WHERE restaurant_id = p_restaurant_id;
  GET DIAGNOSTICS n_items = ROW_COUNT;

  DELETE FROM public.orders WHERE restaurant_id = p_restaurant_id;
  GET DIAGNOSTICS n_orders = ROW_COUNT;

  DELETE FROM public.waiter_calls WHERE restaurant_id = p_restaurant_id;
  GET DIAGNOSTICS n_calls = ROW_COUNT;

  DELETE FROM public.waiting_list WHERE restaurant_id = p_restaurant_id;
  GET DIAGNOSTICS n_waiting = ROW_COUNT;

  DELETE FROM public.customer_sessions WHERE restaurant_id = p_restaurant_id;
  GET DIAGNOSTICS n_sessions = ROW_COUNT;

  DELETE FROM public.shift_reports WHERE restaurant_id = p_restaurant_id;
  GET DIAGNOSTICS n_shifts = ROW_COUNT;

  ALTER TABLE public.order_items ENABLE TRIGGER trg_order_items_stock_sync;

  SELECT COALESCE(SUM(stock), 0) INTO v_stock_after
  FROM public.inventory_items WHERE restaurant_id = p_restaurant_id;

  SELECT count(*) INTO v_moves_after
  FROM public.stock_movements WHERE restaurant_id = p_restaurant_id;

  -- Refuse to commit if stock moved. Better to fail loudly and change nothing
  -- than to hand back a cheerful summary over corrupted inventory.
  IF v_stock_after IS DISTINCT FROM v_stock_before THEN
    RAISE EXCEPTION
      'Aborted: total stock changed from % to %. Nothing has been deleted.',
      v_stock_before, v_stock_after;
  END IF;

  RETURN jsonb_build_object(
    'deleted', jsonb_build_object(
      'bills', n_bills, 'order_items', n_items, 'orders', n_orders,
      'waiter_calls', n_calls, 'waiting_list', n_waiting,
      'customer_sessions', n_sessions, 'shift_reports', n_shifts),
    'stock_total_before', v_stock_before,
    'stock_total_after',  v_stock_after,
    'stock_unchanged',    v_stock_after = v_stock_before,
    'stock_movements_before', v_moves_before,
    'stock_movements_after',  v_moves_after,
    'ledger_untouched', v_moves_after = v_moves_before);
END;
$fn$;

-- Deliberately NOT granted to authenticated. This wipes a restaurant's entire
-- sales history; it should only ever be reachable from the SQL Editor by
-- someone who means it.
REVOKE ALL ON FUNCTION public.flush_sales_data(uuid) FROM public, authenticated, anon;

-- =============================================================================
-- RUN IT — Wali Baba
--
-- Expect stock_unchanged: true and ledger_untouched: true. If either is false
-- the function will already have aborted and deleted nothing.
-- =============================================================================
SELECT jsonb_pretty(
  public.flush_sales_data('b88e5c07-24d7-4386-8c47-e48f4cab23ee')
) AS result;
