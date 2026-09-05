-- =============================================================================
-- Spice OS — a finished sale must not leave its table occupied
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- =============================================================================
-- THE BUG
--
-- trg_mark_table_occupied fires AFTER INSERT on customer_sessions and sets the
-- table to 'occupied' for every row, without looking at what kind of session
-- was inserted:
--
--     UPDATE restaurant_tables SET status = 'occupied'
--      WHERE id = NEW.table_id AND status <> 'occupied';
--
-- That is right for a diner sitting down, because the session is inserted as
-- 'active' and the settle path sets the table back when it completes.
--
-- It is wrong for record_backdated_sale, which inserts a session that is
-- ALREADY 'completed'. The trigger marks the table occupied, and nothing ever
-- comes along to release it — the settle path is never walked, because the
-- sale was settled before it was entered. Twelve day sheets therefore left
-- eight tables showing as occupied with no session and no order behind them.
--
-- THE FIX
--
-- Occupy the table only for a session that is actually live. A session that
-- arrives already finished never occupied anything.
--
-- Statuses come from customer_sessions_session_status_check:
--   active, billing, hold, completed, cancelled, void
-- Live is the first three; the rest are over before they start.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.mark_table_occupied()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  -- A session inserted as completed, cancelled or void is history being
  -- recorded, not a table being taken.
  IF NEW.session_status NOT IN ('active', 'billing', 'hold') THEN
    RETURN NEW;
  END IF;

  UPDATE public.restaurant_tables
     SET status = 'occupied'
   WHERE id = NEW.table_id AND status <> 'occupied';

  RETURN NEW;
END;
$fn$;

-- ----------------------------------------------------------------------------
-- Release anything already stuck.
--
-- A table is only freed when nothing live is behind it. A genuinely busy table
-- has an active session or an unfinished order, and is left exactly as it is.
-- ----------------------------------------------------------------------------
UPDATE public.restaurant_tables t
   SET status = 'available'
 WHERE t.status = 'occupied'
   AND NOT EXISTS (
     SELECT 1 FROM public.customer_sessions cs
      WHERE cs.table_id = t.id
        AND cs.session_status IN ('active', 'billing', 'hold'))
   AND NOT EXISTS (
     SELECT 1 FROM public.orders o
      WHERE o.table_id = t.id
        AND o.order_status NOT IN ('completed', 'cancelled'));

-- =============================================================================
-- VERIFY — expect every remaining occupied table to have something live
-- on it, and the stuck ones to be gone.
-- =============================================================================
SELECT jsonb_pretty(jsonb_build_object(
  'by_status', (
    SELECT COALESCE(jsonb_object_agg(status, n), '{}'::jsonb)
    FROM (SELECT status, count(*) AS n FROM public.restaurant_tables GROUP BY 1) s),
  'occupied_with_nothing_live', (
    SELECT COALESCE(jsonb_agg(t.table_number ORDER BY t.table_number), '[]'::jsonb)
    FROM public.restaurant_tables t
    WHERE t.status = 'occupied'
      AND NOT EXISTS (SELECT 1 FROM public.customer_sessions cs
                       WHERE cs.table_id = t.id
                         AND cs.session_status IN ('active', 'billing', 'hold'))
      AND NOT EXISTS (SELECT 1 FROM public.orders o
                       WHERE o.table_id = t.id
                         AND o.order_status NOT IN ('completed', 'cancelled')))
)) AS result;


-- =============================================================================
-- PART 2 — remove the pre-September test sales
-- =============================================================================
-- WHAT GOES
--
--   ali rizvi   23 Jul 18:35  table 1  Butter Chicken x1                    ₹374
--   ali rizvi   23 Jul 18:51  table 2  Butter Chicken x1                    ₹374
--   Mohammad    23 Aug 02:22  table 1  Biryani Rice x1, Chicken Barra Rice  ₹440
--
-- Three sessions, three orders, four lines, no bills, ₹1,188. Named by id
-- rather than by date, so this can never widen to catch a real sale.
--
-- NONE OF THESE ARE WALI BABA'S. Two belong to "Test Tenant" and one to
-- "Baba Biryani" — leftover tenants with no inventory at all. They only ever
-- appeared alongside Wali Baba's sales because this file runs as postgres,
-- which RLS does not apply to. Wali Baba's own revenue is ₹241,558.50 over 14
-- completed sessions, all of it 1-3 September, and this part does not touch
-- one rupee of it.
--
-- WHAT STAYS
--
-- The ZOMATO (₹4,526.50) and SWIGGY (₹7,227) sessions of 2 Sep are real
-- September revenue and are NOT touched. They are missing their bill rows,
-- which is a separate problem — they count in Day-wise and Item-wise but not
-- in the Payment Mode report.
--
-- THE HAZARD
--
-- order_items carries trg_order_items_stock_sync, whose DELETE branch hands a
-- line's recipe ingredients BACK to stock. These four lines never took any
-- stock — there is not one stock_movements row against them — but Chicken
-- Barra Rice has since been given a two-ingredient recipe. Deleting it with
-- the trigger live would credit stock that was never debited and put the
-- 1 Sep closing count out.
--
-- So the trigger is held off for the delete. It is done inside a function
-- because the SQL Editor commits each statement on its own: a bare script
-- that disabled the trigger and then failed would leave it disabled, and
-- every order after that would silently stop deducting stock. A function body
-- is one transaction — if any part fails, the disable rolls back with it.
--
-- The function proves it worked: total stock before and after must match to
-- the gram, or it raises and nothing is deleted.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.remove_pre_september_test_sales()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_sessions uuid[] := ARRAY[
    'de5df73e-e94e-422c-8c8b-964c7a95471d',   -- ali rizvi, 23 Jul, table 1
    'bbf8f813-d18a-47a2-9660-1a455da7b9e9',   -- ali rizvi, 23 Jul, table 2
    '568f76f8-56d6-4bbe-9d27-ebd5f9ee97da'    -- Mohammad,  23 Aug, table 1
  ]::uuid[];
  v_orders      uuid[];
  v_tenants     text;
  v_stock_before numeric;
  v_stock_after  numeric;
  v_bills_found  integer;
  n_bills    integer := 0;
  n_items    integer := 0;
  n_orders   integer := 0;
  n_calls    integer := 0;
  n_feedback integer := 0;
  n_sessions integer := 0;
BEGIN
  -- Already gone? Say so and stop, so this file stays safe to re-run.
  IF NOT EXISTS (SELECT 1 FROM public.customer_sessions
                  WHERE id = ANY(v_sessions)) THEN
    RETURN jsonb_build_object('status', 'nothing to do — already removed');
  END IF;

  -- These three are NOT Wali Baba's, which is the whole reason they look like
  -- rubbish: two belong to "Test Tenant" and one to "Baba Biryani", neither of
  -- which holds a single inventory item. They were only ever visible together
  -- because this runs as postgres, which is not subject to RLS. So no
  -- single-restaurant check here — spanning tenants is expected.
  SELECT string_agg(DISTINCT r.name, ', ' ORDER BY r.name) INTO v_tenants
  FROM public.customer_sessions cs
  JOIN public.restaurants r ON r.id = cs.restaurant_id
  WHERE cs.id = ANY(v_sessions);

  -- A bill means money was taken. These three had none; if one has appeared
  -- since this was written, stop and let a person look.
  SELECT count(*) INTO v_bills_found
  FROM public.bills WHERE session_id = ANY(v_sessions);

  IF v_bills_found > 0 THEN
    RAISE EXCEPTION
      'Expected no bills on these sessions but found %. Nothing deleted.', v_bills_found;
  END IF;

  SELECT array_agg(id) INTO v_orders
  FROM public.orders WHERE session_id = ANY(v_sessions);

  -- Every tenant's stock, not one restaurant's: these lines never took any,
  -- so nothing anywhere may move. A stronger check than a scoped one.
  SELECT COALESCE(SUM(stock), 0) INTO v_stock_before FROM public.inventory_items;

  -- Hold off recipe depletion so deleting a sale cannot put ingredients back.
  ALTER TABLE public.order_items DISABLE TRIGGER trg_order_items_stock_sync;

  -- Inwards along the foreign keys: nothing here cascades.
  DELETE FROM public.bills WHERE session_id = ANY(v_sessions)
                              OR order_id = ANY(COALESCE(v_orders, '{}'::uuid[]));
  GET DIAGNOSTICS n_bills = ROW_COUNT;

  DELETE FROM public.order_items WHERE order_id = ANY(COALESCE(v_orders, '{}'::uuid[]));
  GET DIAGNOSTICS n_items = ROW_COUNT;

  DELETE FROM public.orders WHERE session_id = ANY(v_sessions);
  GET DIAGNOSTICS n_orders = ROW_COUNT;

  DELETE FROM public.waiter_calls WHERE session_id = ANY(v_sessions);
  GET DIAGNOSTICS n_calls = ROW_COUNT;

  DELETE FROM public.session_feedback WHERE session_id = ANY(v_sessions);
  GET DIAGNOSTICS n_feedback = ROW_COUNT;

  DELETE FROM public.customer_sessions WHERE id = ANY(v_sessions);
  GET DIAGNOSTICS n_sessions = ROW_COUNT;

  ALTER TABLE public.order_items ENABLE TRIGGER trg_order_items_stock_sync;

  SELECT COALESCE(SUM(stock), 0) INTO v_stock_after FROM public.inventory_items;

  IF v_stock_after IS DISTINCT FROM v_stock_before THEN
    RAISE EXCEPTION
      'Aborted: total stock moved from % to %. Nothing has been deleted.',
      v_stock_before, v_stock_after;
  END IF;

  RETURN jsonb_build_object(
    'status', 'removed',
    'deleted', jsonb_build_object(
      'sessions',        n_sessions,
      'orders',          n_orders,
      'order_items',     n_items,
      'bills',           n_bills,
      'waiter_calls',    n_calls,
      'session_feedback', n_feedback),
    'tenants', v_tenants,
    'stock_unchanged_at', v_stock_before);
END;
$fn$;

SELECT jsonb_pretty(public.remove_pre_september_test_sales()) AS removal;


-- =============================================================================
-- PART 3 — remove the two aggregator sales of 2 Sep
-- =============================================================================
-- WHAT GOES
--
--   ZOMATO  2 Sep 16:35  table G3  13 lines  ₹4,526.50  (tax ₹411.50)
--   SWIGGY  2 Sep 16:54  table G4  15 lines  ₹7,227.00  (tax ₹657.00)
--
-- Two sessions, two orders, 28 lines, no bills, ₹11,753.50.
--
-- WHY THIS ONE IS NOT LIKE PART 2
--
-- The July/August lines never moved stock, so Part 2 holds the recipe trigger
-- off and total stock does not shift by a gram.
--
-- These two DID move stock: 37 consumption movements across 14 raw materials,
-- 114.75 units in total. Deleting the sale while leaving the consumption
-- behind would starve the ledger of a reason — 2 Sep would show 30 Fry Tikka
-- going out with nothing sold to explain it, and the balances would stay
-- depleted for food that, as far as the system is now concerned, was never
-- served.
--
-- So the consumption goes with the sale, and the balances are put back by
-- exactly what those movements took.
--
-- WHY NOT JUST LET THE TRIGGER DO IT
--
-- trg_order_items_stock_sync's DELETE branch hands ingredients back by POSTING
-- new positive movements, dated today rather than 2 Sep. That would leave the
-- ledger reading "30 taken on the 2nd, 30 returned on the 4th" for a sale
-- nobody is keeping any record of, and it would double the credit on top of
-- the correction below. The trigger is held off and the balances fixed
-- directly.
--
-- THE INVARIANT
--
-- Every inventory_stock.qty equals the exact sum of its own movements — that
-- holds for all 98 rows today. Deleting movements and adjusting qty by the
-- same amount keeps it true, and the function refuses to finish if it has
-- stopped being true.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.remove_sep2_aggregator_sales()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_sessions uuid[] := ARRAY[
    '1e0901e2-509d-4d1c-8496-8afca4db80a1',   -- ZOMATO, 2 Sep, G3
    '1de4082f-2634-402f-9468-58577a245610'    -- SWIGGY, 2 Sep, G4
  ]::uuid[];
  v_orders       uuid[];
  v_lines        uuid[];
  v_rest         uuid;
  v_stock_before numeric;
  v_stock_after  numeric;
  v_returned     numeric;
  v_bills_found  integer;
  v_drift        integer;
  n_moves    integer := 0;
  n_bills    integer := 0;
  n_items    integer := 0;
  n_orders   integer := 0;
  n_calls    integer := 0;
  n_feedback integer := 0;
  n_sessions integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.customer_sessions
                  WHERE id = ANY(v_sessions)) THEN
    RETURN jsonb_build_object('status', 'nothing to do — already removed');
  END IF;

  SELECT restaurant_id INTO v_rest
  FROM public.customer_sessions WHERE id = ANY(v_sessions) LIMIT 1;

  IF (SELECT count(DISTINCT restaurant_id) FROM public.customer_sessions
       WHERE id = ANY(v_sessions)) > 1 THEN
    RAISE EXCEPTION 'Those sessions span more than one restaurant. Nothing deleted.';
  END IF;

  SELECT count(*) INTO v_bills_found
  FROM public.bills WHERE session_id = ANY(v_sessions);
  IF v_bills_found > 0 THEN
    RAISE EXCEPTION
      'Expected no bills on these sessions but found %. Nothing deleted.', v_bills_found;
  END IF;

  SELECT array_agg(id) INTO v_orders
  FROM public.orders WHERE session_id = ANY(v_sessions);

  SELECT array_agg(id) INTO v_lines
  FROM public.order_items WHERE order_id = ANY(COALESCE(v_orders, '{}'::uuid[]));

  SELECT COALESCE(SUM(stock), 0) INTO v_stock_before
  FROM public.inventory_items WHERE restaurant_id = v_rest;

  ALTER TABLE public.order_items DISABLE TRIGGER trg_order_items_stock_sync;

  -- Delete the consumption and give back exactly what it took, in ONE
  -- statement: the DELETE feeds the totals and the totals feed the balance
  -- correction, so the two cannot disagree. `net` is negative because it is
  -- consumption — subtracting it is what puts the stock back.
  --
  -- Done as a chain of CTEs rather than through a temp table: the SQL Editor
  -- commits each statement separately, so a temp table would not survive to
  -- the statement that needed it.
  WITH gone AS (
    DELETE FROM public.stock_movements m
     WHERE m.ref_table = 'order_items'
       AND m.ref_id = ANY(COALESCE(v_lines, '{}'::uuid[]))
    RETURNING m.outlet_id, m.inventory_item_id, m.delta
  ),
  per_item AS (
    SELECT outlet_id, inventory_item_id, SUM(delta) AS net, count(*) AS n_rows
    FROM gone GROUP BY 1, 2
  ),
  corrected AS (
    UPDATE public.inventory_stock s
       SET qty = s.qty - p.net, updated_at = now()
      FROM per_item p
     WHERE s.outlet_id = p.outlet_id
       AND s.inventory_item_id = p.inventory_item_id
    RETURNING s.inventory_item_id
  )
  SELECT COALESCE(-SUM(p.net), 0), COALESCE(SUM(p.n_rows), 0)
    INTO v_returned, n_moves
  FROM per_item p;

  -- Keep the item roll-up in step with the per-outlet detail.
  UPDATE public.inventory_items i
     SET stock = (SELECT COALESCE(SUM(s.qty), 0) FROM public.inventory_stock s
                   WHERE s.inventory_item_id = i.id),
         updated_at = now()
   WHERE i.restaurant_id = v_rest
     AND i.stock IS DISTINCT FROM (SELECT COALESCE(SUM(s.qty), 0)
                                     FROM public.inventory_stock s
                                    WHERE s.inventory_item_id = i.id);

  DELETE FROM public.bills WHERE session_id = ANY(v_sessions)
                              OR order_id = ANY(COALESCE(v_orders, '{}'::uuid[]));
  GET DIAGNOSTICS n_bills = ROW_COUNT;

  DELETE FROM public.order_items WHERE order_id = ANY(COALESCE(v_orders, '{}'::uuid[]));
  GET DIAGNOSTICS n_items = ROW_COUNT;

  DELETE FROM public.orders WHERE session_id = ANY(v_sessions);
  GET DIAGNOSTICS n_orders = ROW_COUNT;

  DELETE FROM public.waiter_calls WHERE session_id = ANY(v_sessions);
  GET DIAGNOSTICS n_calls = ROW_COUNT;

  DELETE FROM public.session_feedback WHERE session_id = ANY(v_sessions);
  GET DIAGNOSTICS n_feedback = ROW_COUNT;

  DELETE FROM public.customer_sessions WHERE id = ANY(v_sessions);
  GET DIAGNOSTICS n_sessions = ROW_COUNT;

  ALTER TABLE public.order_items ENABLE TRIGGER trg_order_items_stock_sync;

  SELECT COALESCE(SUM(stock), 0) INTO v_stock_after
  FROM public.inventory_items WHERE restaurant_id = v_rest;

  IF v_stock_after IS DISTINCT FROM v_stock_before + v_returned THEN
    RAISE EXCEPTION
      'Aborted: stock went % to %, expected % back. Nothing has been deleted.',
      v_stock_before, v_stock_after, v_returned;
  END IF;

  -- Every balance must still equal the sum of its own movements.
  SELECT count(*) INTO v_drift
  FROM public.inventory_stock s
  LEFT JOIN (SELECT inventory_item_id, outlet_id, SUM(delta) AS net
               FROM public.stock_movements GROUP BY 1, 2) l
         ON l.inventory_item_id = s.inventory_item_id AND l.outlet_id = s.outlet_id
  WHERE s.qty IS DISTINCT FROM COALESCE(l.net, 0);

  IF v_drift > 0 THEN
    RAISE EXCEPTION
      'Aborted: % balances no longer match their ledger. Nothing has been deleted.', v_drift;
  END IF;

  RETURN jsonb_build_object(
    'status', 'removed',
    'deleted', jsonb_build_object(
      'sessions',         n_sessions,
      'orders',           n_orders,
      'order_items',      n_items,
      'bills',            n_bills,
      'stock_movements',  n_moves,
      'waiter_calls',     n_calls,
      'session_feedback', n_feedback),
    'stock_returned', v_returned,
    'stock_total', jsonb_build_object('before', v_stock_before, 'after', v_stock_after));
END;
$fn$;

SELECT jsonb_pretty(public.remove_sep2_aggregator_sales()) AS aggregator_removal;


-- =============================================================================
-- VERIFY — expect ₹229,805.00 over 12 completed sessions.
--
-- This runs as postgres, so it sees every tenant at once. Before: ₹242,746.50
-- over 17, of which Wali Baba's own was ₹241,558.50 over 14 and the remaining
-- ₹1,188 belonged to Test Tenant and Baba Biryani. Part 2 removed exactly that
-- ₹1,188, so from here the two figures are the same number — every session
-- left is Wali Baba's, and every one of them is a day sheet from Sales Entry.
--
-- Part 3 took ₹11,753.50 more off, and put 114.75 units of stock back:
-- Wali Baba's total moves from -354.79 to -240.04.
-- =============================================================================
SELECT jsonb_pretty(jsonb_build_object(
  'completed_sessions', (SELECT count(*) FROM public.customer_sessions
                          WHERE session_status = 'completed'),
  'gross', (SELECT COALESCE(SUM(o.total), 0) FROM public.orders o
             JOIN public.customer_sessions cs ON cs.id = o.session_id
            WHERE cs.session_status = 'completed'),
  'by_day', (
    SELECT COALESCE(jsonb_object_agg(d, g), '{}'::jsonb) FROM (
      SELECT (cs.ended_at AT TIME ZONE 'Asia/Kolkata')::date::text AS d,
             SUM(o.total) AS g
      FROM public.customer_sessions cs
      JOIN public.orders o ON o.session_id = cs.id
      WHERE cs.session_status = 'completed'
      GROUP BY 1) x)
)) AS after_state;
