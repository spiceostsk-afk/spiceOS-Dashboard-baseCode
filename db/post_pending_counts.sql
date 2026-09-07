-- =============================================================================
-- Spice OS — post the counts that were entered but never submitted
-- Run once in the Supabase SQL Editor, AFTER db/fix_stock_count_variance.sql.
-- Safe to re-run.
-- =============================================================================
-- WHAT HAPPENED
--
-- Three closing counts were typed up and left in draft:
--
--     31 Aug   199 of 205 lines, entered 1 Sep
--      1 Sep    30 lines,        entered 2 Sep
--      4 Sep    43 lines,        entered 5 Sep
--
-- A draft posts nothing. No variance movement, no effect on any balance, no
-- carry into the next morning. The numbers existed only as typed text.
--
-- The 31 August sheet is the one that matters most: it is the most complete
-- count on record, and it is the reason 1 September opened at nothing. The
-- "opening stock is zero" problem was this sheet, sitting unposted.
--
-- WHY THEY WERE STRANDED
--
-- The edit button in the history list was disabled unless a count was already
-- posted — reopening only makes sense for a posted count, and a draft was
-- caught by the same rule. There was no way back into an unfinished sheet.
-- Fixed in ClosingStockHistory.jsx; this handles the three left behind.
--
-- ORDER MATTERS
--
-- The days are a chain. The corrections already posted for 2 and 3 September
-- are fixed amounts worked out against the ledger as it stood — insert a
-- correction back at 31 August and it flows forward, and those two days stop
-- landing on their counted figures.
--
-- So: submit in date order, then re-run the repair, which walks every posted
-- count in date order and re-posts whatever each day now needs. Both steps are
-- below, in that order.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. LOOK FIRST — the sheets about to be posted.
-- ----------------------------------------------------------------------------
SELECT jsonb_pretty(jsonb_build_object(
  'drafts_to_post', (
    SELECT COALESCE(jsonb_agg(x ORDER BY x->>'day'), '[]'::jsonb) FROM (
      SELECT jsonb_build_object(
               'day',    sc.count_date,
               'filled', count(ci.physical_qty),
               'lines',  count(ci.id)) AS x
      FROM public.stock_counts sc
      JOIN public.stock_count_items ci ON ci.count_id = sc.id
      WHERE sc.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
        AND sc.status = 'draft' AND sc.count_type = 'closing'
      GROUP BY sc.id, sc.count_date
      HAVING count(ci.physical_qty) > 0) s),
  'already_posted', (
    SELECT COALESCE(jsonb_agg(sc.count_date ORDER BY sc.count_date), '[]'::jsonb)
    FROM public.stock_counts sc
    WHERE sc.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
      AND sc.status = 'submitted' AND sc.count_type = 'closing'),
  'negative_items_now', (
    SELECT count(*) FROM public.inventory_stock s
    JOIN public.inventory_items i ON i.id = s.inventory_item_id
    WHERE i.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee' AND s.qty < 0)
)) AS before_state;


-- ----------------------------------------------------------------------------
-- 2. Post them, oldest first.
--
--    submit_stock_count is called exactly as the screen calls it, so these
--    sheets go through the same path as any other — no special case, and the
--    corrected variance rule applies to all of them.
--
--    An empty draft is skipped: a sheet with nothing on it is a sheet nobody
--    counted, not a claim that everything is zero.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_pending_stock_counts()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_rest uuid := 'b88e5c07-24d7-4386-8c47-e48f4cab23ee';
  c      record;
  done   jsonb := '[]'::jsonb;
BEGIN
  -- submit_stock_count checks current_restaurant_id(), which is null when this
  -- is run from the SQL Editor. Claim the tenant for this transaction only.
  PERFORM set_config('request.jwt.claims',
                     json_build_object('restaurant_id', v_rest)::text, true);

  FOR c IN
    SELECT sc.id, sc.count_date,
           (SELECT count(*) FROM public.stock_count_items ci
             WHERE ci.count_id = sc.id AND ci.physical_qty IS NOT NULL) AS filled
    FROM public.stock_counts sc
    WHERE sc.restaurant_id = v_rest
      AND sc.status = 'draft'
      AND sc.count_type = 'closing'
    ORDER BY sc.count_date            -- oldest first: the days are a chain
  LOOP
    CONTINUE WHEN c.filled = 0;

    PERFORM public.submit_stock_count(c.id);
    done := done || jsonb_build_object('day', c.count_date, 'lines', c.filled);
  END LOOP;

  RETURN jsonb_build_object('posted', done);
END;
$fn$;

SELECT jsonb_pretty(public.post_pending_stock_counts()) AS posted;


-- ----------------------------------------------------------------------------
-- 3. Re-align the days that were already posted.
--
--    2 and 3 September were corrected against the old chain. Now that 31 Aug
--    and 1 Sep sit underneath them, their corrections need recomputing — which
--    is exactly what this does, for every posted count, in date order.
-- ----------------------------------------------------------------------------
SELECT jsonb_pretty(public.repair_posted_stock_counts()) AS realigned;


-- =============================================================================
-- VERIFY — every counted line must be what its day closes at, and so what the
-- next day opens at. Expect gaps_remaining 0, and fewer negatives than before.
-- =============================================================================
WITH counted AS (
  SELECT sc.count_date, ci.inventory_item_id, sc.outlet_id, i.item_name, ci.physical_qty
  FROM public.stock_counts sc
  JOIN public.stock_count_items ci ON ci.count_id = sc.id
  JOIN public.inventory_items i ON i.id = ci.inventory_item_id
  WHERE sc.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
    AND sc.status = 'submitted' AND sc.count_type = 'closing'
    AND ci.physical_qty IS NOT NULL
),
chk AS (
  SELECT c.*,
         (SELECT COALESCE(SUM(m.delta), 0) FROM public.stock_movements m
           WHERE m.inventory_item_id = c.inventory_item_id
             AND m.outlet_id = c.outlet_id
             AND (m.created_at AT TIME ZONE 'Asia/Kolkata')::date <= c.count_date)
           AS opens_next_day
  FROM counted c
)
SELECT jsonb_pretty(jsonb_build_object(
  'lines_checked',  (SELECT count(*) FROM chk),
  'gaps_remaining', (SELECT count(*) FROM chk WHERE physical_qty <> opens_next_day),
  'still_wrong',    (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                       'day', count_date, 'item', item_name,
                       'counted', physical_qty, 'opens_at', opens_next_day)), '[]'::jsonb)
                     FROM chk WHERE physical_qty <> opens_next_day),
  'negative_items', (SELECT count(*) FROM public.inventory_stock s
                      JOIN public.inventory_items i ON i.id = s.inventory_item_id
                     WHERE i.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
                       AND s.qty < 0),
  'still_negative', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                       'item', i.item_name, 'qty', s.qty) ORDER BY s.qty), '[]'::jsonb)
                     FROM public.inventory_stock s
                     JOIN public.inventory_items i ON i.id = s.inventory_item_id
                     WHERE i.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
                       AND s.qty < 0),
  'total_stock',    (SELECT COALESCE(SUM(stock), 0) FROM public.inventory_items
                     WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee')
)) AS after_state;
