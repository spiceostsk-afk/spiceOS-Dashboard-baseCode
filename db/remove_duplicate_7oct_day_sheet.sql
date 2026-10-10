-- =============================================================================
-- Spice OS — remove Wali Baba's duplicate 07-Oct-2026 day sheet (₹52,550)
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- =============================================================================
-- THE COMPLAINT
--
-- Day-wise sales for 07-Oct shows ₹52,550 twice.
--
-- THE CAUSE
--
-- The same sale was entered twice, through two different screens:
--
--   "basement sale"  till bill on B1, rung 08-Oct 02:50–02:54 IST (still the
--                    07-Oct trading day: the day closes at 3 AM), paid cash.
--                    Orders ₹49,550 + ₹3,000.
--   "Day total"      Sales Entry day sheet, typed 08-Oct 11:56 IST and
--                    backdated to 07-Oct 21:00. One order of ₹52,550.
--
-- Both have the same 31 dishes with identical quantities (359) and values, so
-- the 07-Oct sales were overstated by ₹52,550 and the recipe stock for those
-- dishes was taken twice.
--
-- WHAT GOES
--
-- The day sheet (session b4a0b99f…), which the owner chose to remove. The till
-- bill was rung at the time, with its bill and the staff member on record.
--
-- STOCK
--
-- Same path as the duplicate 09-Sep day sheet: the order lines are deleted
-- with trg_order_items_stock_sync ON. Its DELETE branch returns each line's
-- consumption dated to the original movement (07-Oct 21:00) and at the same
-- outlet (fix_deleted_line_reversal_date.sql). Each return lands before the
-- 07-Oct closing count, so trg_stock_movements_reapply_count posts the matching
-- count correction. The 07-Oct consumption drops by the duplicate, and every
-- closing count still reads what was physically counted.
--
-- The function refuses to finish unless what the day sheet took and what came
-- back net to exactly zero, and every balance still equals its ledger. One
-- function body is one transaction: any failure undoes all of it.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.remove_duplicate_7oct_day_sheet()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  c_rest    CONSTANT uuid := 'b88e5c07-24d7-4386-8c47-e48f4cab23ee';  -- Wali Baba
  c_sheet   CONSTANT uuid := 'b4a0b99f-d4ca-4f09-ae7a-1a45375c971a';  -- "Day total", the duplicate
  c_till    CONSTANT uuid := 'ca4a1a0b-e330-4317-b1a7-3c9280e6fda8';  -- "basement sale", kept
  v_orders  uuid[];
  v_lines   uuid[];
  v_sheet_total numeric;
  v_till_total  numeric;
  v_taken   numeric;
  v_net     numeric;
  v_drift   integer;
  n_bills    integer := 0;
  n_items    integer := 0;
  n_orders   integer := 0;
  n_calls    integer := 0;
  n_feedback integer := 0;
  n_sessions integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.customer_sessions WHERE id = c_sheet) THEN
    RETURN jsonb_build_object('status', 'nothing to do — already removed');
  END IF;

  -- Make sure this is the sheet we looked at, in Wali Baba, and that the twin
  -- being kept is still there.
  IF NOT EXISTS (SELECT 1 FROM public.customer_sessions
                  WHERE id = c_sheet AND restaurant_id = c_rest
                    AND (metadata->>'backdated')::boolean IS TRUE) THEN
    RAISE EXCEPTION 'Session % is not a Wali Baba day sheet. Nothing deleted.', c_sheet;
  END IF;

  SELECT COALESCE(SUM(total), 0) INTO v_sheet_total
  FROM public.orders WHERE session_id = c_sheet AND order_status <> 'cancelled';
  SELECT COALESCE(SUM(total), 0) INTO v_till_total
  FROM public.orders WHERE session_id = c_till AND restaurant_id = c_rest
                       AND order_status <> 'cancelled';

  IF v_sheet_total <> 52550 OR v_till_total <> 52550 THEN
    RAISE EXCEPTION 'Expected ₹52,550 on both entries, found sheet % and till %. Nothing deleted.',
      v_sheet_total, v_till_total;
  END IF;

  SELECT array_agg(id) INTO v_orders FROM public.orders WHERE session_id = c_sheet;
  SELECT array_agg(id) INTO v_lines FROM public.order_items
   WHERE order_id = ANY(COALESCE(v_orders, '{}'::uuid[]));

  SELECT COALESCE(SUM(delta), 0) INTO v_taken
  FROM public.stock_movements
  WHERE ref_table = 'order_items' AND ref_id = ANY(COALESCE(v_lines, '{}'::uuid[]));

  -- Inwards along the foreign keys: nothing here cascades. The order_items
  -- delete is what returns the stock.
  DELETE FROM public.bills WHERE session_id = c_sheet
                              OR order_id = ANY(COALESCE(v_orders, '{}'::uuid[]));
  GET DIAGNOSTICS n_bills = ROW_COUNT;

  DELETE FROM public.order_items WHERE order_id = ANY(COALESCE(v_orders, '{}'::uuid[]));
  GET DIAGNOSTICS n_items = ROW_COUNT;

  DELETE FROM public.orders WHERE session_id = c_sheet;
  GET DIAGNOSTICS n_orders = ROW_COUNT;

  DELETE FROM public.waiter_calls WHERE session_id = c_sheet;
  GET DIAGNOSTICS n_calls = ROW_COUNT;

  DELETE FROM public.session_feedback WHERE session_id = c_sheet;
  GET DIAGNOSTICS n_feedback = ROW_COUNT;

  DELETE FROM public.customer_sessions WHERE id = c_sheet;
  GET DIAGNOSTICS n_sessions = ROW_COUNT;

  -- Everything the sheet took must have come back, to the gram.
  SELECT COALESCE(SUM(delta), 0) INTO v_net
  FROM public.stock_movements
  WHERE ref_table = 'order_items' AND ref_id = ANY(COALESCE(v_lines, '{}'::uuid[]));
  IF v_net <> 0 THEN
    RAISE EXCEPTION 'Aborted: took % but nets to % after the delete (recipe changed since?). Nothing deleted.',
      v_taken, v_net;
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
    RAISE EXCEPTION 'Aborted: % balances no longer match their ledger. Nothing deleted.', v_drift;
  END IF;

  RETURN jsonb_build_object(
    'status', 'removed',
    'deleted', jsonb_build_object(
      'sessions', n_sessions, 'orders', n_orders, 'order_items', n_items,
      'bills', n_bills, 'waiter_calls', n_calls, 'session_feedback', n_feedback),
    'stock_taken_then_returned', v_taken);
END;
$fn$;

SELECT jsonb_pretty(public.remove_duplicate_7oct_day_sheet()) AS removal;

DROP FUNCTION public.remove_duplicate_7oct_day_sheet();

-- =============================================================================
-- VERIFY — 07-Oct trading day (03:00 07-Oct to 03:00 08-Oct IST).
-- Before: ₹52,550 counted twice. After: once, on "basement sale".
-- =============================================================================
SELECT jsonb_pretty(jsonb_build_object(
  'completed_sessions', count(*),
  'gross', SUM(t.total),
  'entries_of_52550', count(*) FILTER (WHERE t.total = 52550)
)) AS oct7_after
FROM (
  SELECT cs.id, SUM(o.total) AS total
  FROM public.customer_sessions cs
  JOIN public.orders o ON o.session_id = cs.id AND o.order_status <> 'cancelled'
  WHERE cs.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
    AND cs.session_status = 'completed'
    AND cs.ended_at >= '2026-10-06 21:30+00'
    AND cs.ended_at <  '2026-10-07 21:30+00'
  GROUP BY cs.id
) t;
