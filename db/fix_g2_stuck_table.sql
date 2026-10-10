-- =============================================================================
-- Spice OS — free Wali Baba's table G2 and cancel the test order left on it
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- =============================================================================
-- WHAT HAPPENED (07-Oct-2026 trading day; times IST, 08-Oct after midnight)
--
--   02:02:20  G2 settled (SWI, ₹199). The till starts a 60 s "free the table"
--             timer.
--   02:03:21  A new session opened on G2 (SWI).
--   02:03:21  The timer fires and closes EVERY open session on G2, including
--             the one opened 0.6 s earlier. It ends 'completed' with no bill.
--   02:03:31  An order is placed on the dead session: 2 x Shahi Tukda, ₹180.
--             It stays 'preparing' and the table stays 'occupied' with no open
--             session to settle, so G2 can't be used.
--
-- The same ₹180 was rung up again on G1 at 02:05 and billed (₹179.34 Swiggy),
-- so the G2 order is also a duplicate in Day-wise sales, which counts any
-- completed session's orders. Confirmed with the owner as not served.
--
-- The code bug is fixed in useBillingData.js: scheduleTableCleanup now frees
-- only a table still in 'cleaning', and closes only sessions opened before the
-- settle.
--
-- WHAT THIS DOES
--   1. Cancels the order and its line, so no report counts the ₹180.
--   2. Returns its stock through apply_recipe_stock, the same path the order
--      took it by. The return is dated to the order (08-Oct 02:03), so
--      trg_stock_movements_reapply_count re-chains any closing count after it
--      and counted figures stay as counted.
--   3. Frees G2, but only if nothing live is on it.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fix_g2_stuck_table()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  c_rest    CONSTANT uuid := 'b88e5c07-24d7-4386-8c47-e48f4cab23ee';  -- Wali Baba
  c_table   CONSTANT uuid := '7bbd7f78-411f-4540-89b4-f40c2b948e6b';  -- G2
  c_session CONSTANT uuid := 'b6d7b175-a6fd-422c-a754-6038951bdc53';
  c_order   CONSTANT uuid := '7bb92a98-8e96-4719-bc4b-57c21bf42e65';
  v_status  text;
  v_bills   integer;
  v_net     numeric;
  v_drift   integer;
  n_lines   integer := 0;
  ln        record;
BEGIN
  SELECT order_status INTO v_status
  FROM public.orders WHERE id = c_order AND restaurant_id = c_rest;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Order % not found for Wali Baba. Nothing changed.', c_order;
  END IF;

  -- A bill means money was taken; then this is not the test entry we think.
  SELECT count(*) INTO v_bills FROM public.bills
   WHERE session_id = c_session OR order_id = c_order;
  IF v_bills > 0 THEN
    RAISE EXCEPTION 'Found % bill(s) on this order. Nothing changed.', v_bills;
  END IF;

  IF v_status <> 'cancelled' THEN
    -- Give back exactly what each line took. is_cancelled on its own moves no
    -- stock (a void KOT was cooked), so the return is posted explicitly.
    FOR ln IN
      SELECT id, menu_item_id, quantity FROM public.order_items
       WHERE order_id = c_order AND NOT is_cancelled
    LOOP
      PERFORM public.apply_recipe_stock(
        c_rest, ln.menu_item_id, ln.quantity, ln.id, 'Test entry cancelled, not served');
      n_lines := n_lines + 1;
    END LOOP;

    UPDATE public.order_items
       SET is_cancelled = true,
           cancel_reason = 'Test entry, not served (G2 stuck table, 07-Oct)',
           cancelled_at = now()
     WHERE order_id = c_order AND NOT is_cancelled;

    UPDATE public.orders SET order_status = 'cancelled' WHERE id = c_order;
  END IF;

  -- What was taken and what came back must cancel out exactly.
  SELECT COALESCE(SUM(m.delta), 0) INTO v_net
  FROM public.stock_movements m
  JOIN public.order_items oi ON oi.id = m.ref_id AND m.ref_table = 'order_items'
  WHERE oi.order_id = c_order;
  IF v_net <> 0 THEN
    RAISE EXCEPTION 'Aborted: the order''s stock nets to %, not 0 (recipe changed since?). Nothing changed.', v_net;
  END IF;

  -- Every balance must still equal the sum of its own movements.
  SELECT count(*) INTO v_drift
  FROM public.inventory_stock s
  JOIN public.inventory_items i ON i.id = s.inventory_item_id AND i.restaurant_id = c_rest
  LEFT JOIN (SELECT inventory_item_id, outlet_id, SUM(delta) AS net
               FROM public.stock_movements GROUP BY 1, 2) l
         ON l.inventory_item_id = s.inventory_item_id AND l.outlet_id = s.outlet_id
  WHERE s.qty IS DISTINCT FROM COALESCE(l.net, 0);
  IF v_drift > 0 THEN
    RAISE EXCEPTION 'Aborted: % balances no longer match their ledger. Nothing changed.', v_drift;
  END IF;

  -- Free G2 only when nothing live is behind it.
  UPDATE public.restaurant_tables t
     SET status = 'available'
   WHERE t.id = c_table
     AND t.status = 'occupied'
     AND NOT EXISTS (SELECT 1 FROM public.customer_sessions cs
                      WHERE cs.table_id = t.id
                        AND cs.session_status IN ('active', 'billing', 'hold'))
     AND NOT EXISTS (SELECT 1 FROM public.orders o
                      WHERE o.table_id = t.id
                        AND o.order_status NOT IN ('completed', 'cancelled'));

  RETURN jsonb_build_object(
    'order', 'cancelled',
    'lines_returned', n_lines,
    'stock_net', v_net,
    'g2_status', (SELECT status FROM public.restaurant_tables WHERE id = c_table));
END;
$fn$;

SELECT jsonb_pretty(public.fix_g2_stuck_table()) AS result;

DROP FUNCTION public.fix_g2_stuck_table();
