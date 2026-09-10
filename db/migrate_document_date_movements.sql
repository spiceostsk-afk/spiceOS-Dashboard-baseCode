-- =============================================================================
-- Spice OS — stock movements land on the document's date, not the typing date
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- =============================================================================
-- THE SYMPTOM
--
-- A purchase challan dated 9 September, entered on the 10th and posted, does
-- not appear in the Stock Summary for 9 September. Its Purchase Stock column
-- reads 0 for every item on the invoice. Refreshing changes nothing, because
-- nothing about it is stale — the movement genuinely carries the wrong date.
--
-- THE CAUSE
--
-- Stock Summary buckets by stock_movements.created_at, in the restaurant's own
-- timezone. post_purchase calls post_stock_movement WITHOUT its optional date
-- argument, so the movement falls back to now() — the day it was typed.
--
-- This was found once before, on invoice 2SEP2026BABAMEENA, and patched for
-- that one invoice by db/fix_2sep_babameena_date.sql. That fix noted the real
-- repair was one argument in four functions, and left it alone as not yet
-- worth the change. It has now happened again, so this does the real repair.
--
-- Four functions post movements without a date:
--
--     post_purchase        cancel_purchase
--     post_wastage         receive_transfer
--
-- send_transfer was already corrected by migrate_transfer_text.sql, and the
-- three repost_* functions have always passed the date — which is why an
-- invoice that gets edited quietly fixes itself and one posted a single time
-- stays wrong. That is also why this looks intermittent rather than total.
--
-- A SECOND, LATENT BUG IN THE FUNCTIONS THAT WERE ALREADY "RIGHT"
--
-- The repost_* functions pass `invoice_date::timestamptz`, which resolves at
-- the SERVER's timezone — UTC on Supabase. Midnight UTC is 05:30 the same day
-- in Asia/Kolkata, so it happens to be correct here. For any restaurant west
-- of Greenwich it would be 7pm the PREVIOUS day, and every document would post
-- to the wrong date. Rather than copy that, this migration adds one helper
-- that anchors a document at local NOON in the restaurant's own timezone —
-- a time no offset on earth can push onto a neighbouring day — and routes all
-- seven posting functions through it.
--
-- WHAT THIS DOES
--
--   1. Adds public.document_instant(restaurant_id, date).
--   2. Rewrites the four functions to pass the document's date.
--   3. Rewrites the three repost_* functions to use the same helper.
--   4. Moves already-posted movements onto their document's date.
--
-- Nothing is inserted and nothing is deleted. Quantities and balances are
-- untouched; only the date a movement is filed under changes, which is the
-- same field a re-post would have set.
--
-- SCOPE: the SQL Editor runs as postgres, so RLS does not apply and step 6
-- repairs EVERY tenant, not just the one that reported it. That is deliberate
-- — the bug was in shared functions, so every restaurant that ever backdated
-- a document has the same wrong dates. Each row is still matched to its own
-- restaurant's timezone.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. LOOK FIRST — what is currently filed under the wrong day
-- ----------------------------------------------------------------------------
SELECT jsonb_pretty(jsonb_build_object(
  'purchases_misdated', (
    SELECT count(*) FROM public.stock_movements m
    JOIN public.purchases p ON p.id = m.ref_id
    JOIN public.restaurants r ON r.id = m.restaurant_id
    WHERE m.ref_table = 'purchases'
      AND (m.created_at AT TIME ZONE COALESCE(r.timezone, 'Asia/Kolkata'))::date
          <> p.invoice_date),
  'wastage_misdated', (
    SELECT count(*) FROM public.stock_movements m
    JOIN public.stock_wastage w ON w.id = m.ref_id
    JOIN public.restaurants r ON r.id = m.restaurant_id
    WHERE m.ref_table = 'stock_wastage'
      AND (m.created_at AT TIME ZONE COALESCE(r.timezone, 'Asia/Kolkata'))::date
          <> w.wasted_on),
  'transfers_misdated', (
    SELECT count(*) FROM public.stock_movements m
    JOIN public.stock_transfers t ON t.id = m.ref_id
    JOIN public.restaurants r ON r.id = m.restaurant_id
    WHERE m.ref_table = 'stock_transfers'
      AND (m.created_at AT TIME ZONE COALESCE(r.timezone, 'Asia/Kolkata'))::date
          <> t.transfer_date),
  'worst_offenders', (
    SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
      SELECT p.invoice_no,
             p.invoice_date,
             (m.created_at AT TIME ZONE COALESCE(r.timezone, 'Asia/Kolkata'))::date AS filed_under,
             count(*) AS movements
      FROM public.stock_movements m
      JOIN public.purchases p   ON p.id = m.ref_id
      JOIN public.restaurants r ON r.id = m.restaurant_id
      WHERE m.ref_table = 'purchases'
        AND (m.created_at AT TIME ZONE COALESCE(r.timezone, 'Asia/Kolkata'))::date
            <> p.invoice_date
      GROUP BY p.invoice_no, p.invoice_date, filed_under
      ORDER BY p.invoice_date DESC
      LIMIT 20
    ) x)
)) AS before_state;

-- ----------------------------------------------------------------------------
-- 2. One place that decides when a document happened
--
--    Local noon, not local midnight. Midnight is only ever a few hours from
--    the day boundary, and every rounding, offset and daylight-saving edge
--    lands on it. Noon is twelve hours from either edge.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.document_instant(
  p_restaurant_id uuid,
  p_on            date
)
RETURNS timestamptz
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_tz text;
BEGIN
  IF p_on IS NULL THEN RETURN now(); END IF;

  SELECT COALESCE(r.timezone, 'Asia/Kolkata') INTO v_tz
  FROM public.restaurants r WHERE r.id = p_restaurant_id;

  RETURN (p_on + time '12:00') AT TIME ZONE COALESCE(v_tz, 'Asia/Kolkata');
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.document_instant(uuid, date) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. Purchases
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_purchase(p_purchase_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  p   record;
  ln  record;
  v_rate_base numeric;
  v_at timestamptz;
BEGIN
  SELECT * INTO p FROM public.purchases WHERE id = p_purchase_id;
  IF p IS NULL THEN RAISE EXCEPTION 'Purchase % not found', p_purchase_id; END IF;
  IF p.restaurant_id IS DISTINCT FROM public.current_restaurant_id()
     AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;
  IF p.status <> 'draft' THEN
    RAISE EXCEPTION 'Purchase is already %', p.status;
  END IF;

  v_at := public.document_instant(p.restaurant_id, p.invoice_date);

  FOR ln IN
    SELECT pi.*, inv.conversion_factor
    FROM public.purchase_items pi
    JOIN public.inventory_items inv ON inv.id = pi.inventory_item_id
    WHERE pi.purchase_id = p_purchase_id
  LOOP
    -- Rate is per entry unit; the ledger and costing work in base units.
    v_rate_base := CASE
      WHEN ln.entry_unit = 'purchase' AND COALESCE(ln.conversion_factor, 1) > 0
        THEN ln.rate / ln.conversion_factor
      ELSE ln.rate
    END;

    PERFORM public.post_stock_movement(
      p.restaurant_id, p.outlet_id, ln.inventory_item_id,
      ln.qty_base, 'purchase',
      'Purchase ' || COALESCE(p.invoice_no, ''),
      'purchases', p.id, v_rate_base, NULL,
      v_at);

    -- A rate of zero is almost always a blank field rather than free goods,
    -- and overwriting a known cost with it poisons every later valuation and
    -- every prefilled rate on the next invoice. Keep the last real one.
    IF COALESCE(v_rate_base, 0) > 0 THEN
      UPDATE public.inventory_items
         SET last_purchase_rate = v_rate_base
       WHERE id = ln.inventory_item_id;
    END IF;
  END LOOP;

  UPDATE public.purchases
     SET status = 'posted', posted_at = now()
   WHERE id = p_purchase_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.cancel_purchase(p_purchase_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  p  record;
  ln record;
  v_at timestamptz;
BEGIN
  SELECT * INTO p FROM public.purchases WHERE id = p_purchase_id;
  IF p IS NULL THEN RAISE EXCEPTION 'Purchase % not found', p_purchase_id; END IF;
  IF p.restaurant_id IS DISTINCT FROM public.current_restaurant_id()
     AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;

  v_at := public.document_instant(p.restaurant_id, p.invoice_date);

  IF p.status = 'posted' THEN
    FOR ln IN SELECT * FROM public.purchase_items WHERE purchase_id = p_purchase_id LOOP
      -- The reversal is dated to the invoice too. Cancelling a September
      -- challan in October must not leave September overstated and October
      -- short; the two entries have to cancel out on the same day.
      PERFORM public.post_stock_movement(
        p.restaurant_id, p.outlet_id, ln.inventory_item_id,
        -ln.qty_base, 'purchase_return',
        'Purchase cancelled ' || COALESCE(p.invoice_no, ''),
        'purchases', p.id, NULL, NULL,
        v_at);
    END LOOP;
  END IF;

  UPDATE public.purchases SET status = 'cancelled' WHERE id = p_purchase_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.repost_purchase(p_purchase_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  p  record;
  ln record;
  v_rate_base numeric;
  v_at timestamptz;
BEGIN
  SELECT * INTO p FROM public.purchases WHERE id = p_purchase_id;
  IF p IS NULL THEN RAISE EXCEPTION 'Purchase % not found', p_purchase_id; END IF;
  IF p.restaurant_id IS DISTINCT FROM public.current_restaurant_id()
     AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;

  PERFORM public.clear_document_movements(p.restaurant_id, 'purchases', p.id);

  IF p.status = 'cancelled' THEN RETURN; END IF;

  v_at := public.document_instant(p.restaurant_id, p.invoice_date);

  FOR ln IN
    SELECT pi.*, inv.conversion_factor
    FROM public.purchase_items pi
    JOIN public.inventory_items inv ON inv.id = pi.inventory_item_id
    WHERE pi.purchase_id = p_purchase_id
  LOOP
    v_rate_base := CASE
      WHEN ln.entry_unit = 'purchase' AND COALESCE(ln.conversion_factor, 1) > 0
        THEN ln.rate / ln.conversion_factor
      ELSE ln.rate
    END;

    PERFORM public.post_stock_movement(
      p.restaurant_id, p.outlet_id, ln.inventory_item_id,
      ln.qty_base, 'purchase',
      'Purchase ' || COALESCE(p.invoice_no, ''),
      'purchases', p.id, v_rate_base, NULL,
      v_at);

    IF COALESCE(v_rate_base, 0) > 0 THEN
      UPDATE public.inventory_items
         SET last_purchase_rate = v_rate_base
       WHERE id = ln.inventory_item_id;
    END IF;
  END LOOP;

  UPDATE public.purchases SET status = 'posted', posted_at = now() WHERE id = p_purchase_id;
END;
$fn$;

-- ----------------------------------------------------------------------------
-- 4. Wastage
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_wastage(p_wastage_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  w  record;
  ln record;
  v_at timestamptz;
BEGIN
  SELECT * INTO w FROM public.stock_wastage WHERE id = p_wastage_id;
  IF w IS NULL THEN RAISE EXCEPTION 'Wastage entry % not found', p_wastage_id; END IF;
  IF w.restaurant_id IS DISTINCT FROM public.current_restaurant_id()
     AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;
  IF w.status <> 'draft' THEN RAISE EXCEPTION 'Wastage entry is already %', w.status; END IF;

  v_at := public.document_instant(w.restaurant_id, w.wasted_on);

  FOR ln IN SELECT * FROM public.stock_wastage_items WHERE wastage_id = p_wastage_id LOOP
    PERFORM public.post_stock_movement(
      w.restaurant_id, w.outlet_id, ln.inventory_item_id,
      -ln.qty_base, 'wastage', ln.reason,
      'stock_wastage', w.id, ln.rate, w.note,
      v_at);
  END LOOP;

  UPDATE public.stock_wastage
     SET status = 'posted', posted_at = now(),
         total_value = (
           SELECT COALESCE(SUM(i.qty_base * COALESCE(i.rate, inv.last_purchase_rate, 0)), 0)
           FROM public.stock_wastage_items i
           JOIN public.inventory_items inv ON inv.id = i.inventory_item_id
           WHERE i.wastage_id = p_wastage_id
         )
   WHERE id = p_wastage_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.repost_wastage(p_wastage_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  w  record;
  ln record;
  v_at timestamptz;
BEGIN
  SELECT * INTO w FROM public.stock_wastage WHERE id = p_wastage_id;
  IF w IS NULL THEN RAISE EXCEPTION 'Wastage entry % not found', p_wastage_id; END IF;
  IF w.restaurant_id IS DISTINCT FROM public.current_restaurant_id()
     AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;

  PERFORM public.clear_document_movements(w.restaurant_id, 'stock_wastage', w.id);

  IF w.status = 'cancelled' THEN RETURN; END IF;

  v_at := public.document_instant(w.restaurant_id, w.wasted_on);

  FOR ln IN SELECT * FROM public.stock_wastage_items WHERE wastage_id = p_wastage_id LOOP
    PERFORM public.post_stock_movement(
      w.restaurant_id, w.outlet_id, ln.inventory_item_id,
      -ln.qty_base, 'wastage', ln.reason,
      'stock_wastage', w.id, ln.rate, w.note,
      v_at);
  END LOOP;

  UPDATE public.stock_wastage
     SET status = 'posted', posted_at = now(),
         total_value = (
           SELECT COALESCE(SUM(i.qty_base * COALESCE(i.rate, inv.last_purchase_rate, 0)), 0)
           FROM public.stock_wastage_items i
           JOIN public.inventory_items inv ON inv.id = i.inventory_item_id
           WHERE i.wastage_id = p_wastage_id
         )
   WHERE id = p_wastage_id;
END;
$fn$;

-- ----------------------------------------------------------------------------
-- 5. Transfers — receiving
--
--    send_transfer already passes the date (migrate_transfer_text.sql) and is
--    left exactly as it is, other than being routed through the same helper
--    is NOT attempted here: it is correct and in use, and rewriting a working
--    function to share a helper is not worth the risk of a typo.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.receive_transfer(p_transfer_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  t  record;
  ln record;
  v_qty numeric;
  v_at  timestamptz;
BEGIN
  SELECT * INTO t FROM public.stock_transfers WHERE id = p_transfer_id;
  IF t IS NULL THEN RAISE EXCEPTION 'Transfer % not found', p_transfer_id; END IF;
  IF t.restaurant_id IS DISTINCT FROM public.current_restaurant_id()
     AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;
  IF t.status <> 'sent' THEN
    RAISE EXCEPTION 'Transfer must be sent before it can be received';
  END IF;

  v_at := public.document_instant(t.restaurant_id, t.transfer_date);

  FOR ln IN SELECT * FROM public.stock_transfer_items WHERE transfer_id = p_transfer_id LOOP
    v_qty := COALESCE(ln.received_qty_base, ln.qty_base);

    PERFORM public.post_stock_movement(
      t.restaurant_id, t.to_outlet_id, ln.inventory_item_id,
      v_qty, 'transfer_in',
      'Transfer in ' || COALESCE(t.reference_no, ''),
      'stock_transfers', t.id, ln.rate, t.note,
      v_at);

    -- The sending outlet already gave up the full quantity on send, so the
    -- gap must NOT be deducted there again. Book the whole consignment in at
    -- the destination and write the shortfall off against it: the receiving
    -- branch ends up with what it actually holds, and the loss is on record
    -- with a name instead of quietly evaporating between two balances.
    IF v_qty < ln.qty_base THEN
      PERFORM public.post_stock_movement(
        t.restaurant_id, t.to_outlet_id, ln.inventory_item_id,
        ln.qty_base - v_qty, 'transfer_in',
        'Transfer in ' || COALESCE(t.reference_no, ''),
        'stock_transfers', t.id, ln.rate, t.note,
        v_at);

      PERFORM public.post_stock_movement(
        t.restaurant_id, t.to_outlet_id, ln.inventory_item_id,
        -(ln.qty_base - v_qty), 'shortage', 'Transfer shortage',
        'stock_transfers', t.id, ln.rate,
        'Sent ' || ln.qty_base::text || ', received ' || v_qty::text,
        v_at);
    END IF;
  END LOOP;

  UPDATE public.stock_transfers
     SET status = 'received', received_at = now()
   WHERE id = p_transfer_id;
END;
$fn$;

-- ----------------------------------------------------------------------------
-- 6. BACKFILL — move what is already posted onto its document's date
--
--    Only created_at changes, and only where the local date actually differs.
--    A movement already filed on the right day is not touched, which is what
--    makes this safe to run twice.
-- ----------------------------------------------------------------------------
UPDATE public.stock_movements m
   SET created_at = public.document_instant(m.restaurant_id, p.invoice_date)
  FROM public.purchases p, public.restaurants r
 WHERE m.ref_table = 'purchases'
   AND p.id = m.ref_id
   AND r.id = m.restaurant_id
   AND p.invoice_date IS NOT NULL
   AND (m.created_at AT TIME ZONE COALESCE(r.timezone, 'Asia/Kolkata'))::date
       <> p.invoice_date;

UPDATE public.stock_movements m
   SET created_at = public.document_instant(m.restaurant_id, w.wasted_on)
  FROM public.stock_wastage w, public.restaurants r
 WHERE m.ref_table = 'stock_wastage'
   AND w.id = m.ref_id
   AND r.id = m.restaurant_id
   AND w.wasted_on IS NOT NULL
   AND (m.created_at AT TIME ZONE COALESCE(r.timezone, 'Asia/Kolkata'))::date
       <> w.wasted_on;

UPDATE public.stock_movements m
   SET created_at = public.document_instant(m.restaurant_id, t.transfer_date)
  FROM public.stock_transfers t, public.restaurants r
 WHERE m.ref_table = 'stock_transfers'
   AND t.id = m.ref_id
   AND r.id = m.restaurant_id
   AND t.transfer_date IS NOT NULL
   AND (m.created_at AT TIME ZONE COALESCE(r.timezone, 'Asia/Kolkata'))::date
       <> t.transfer_date;

-- ----------------------------------------------------------------------------
-- 7. Re-walk the running balance
--
--    balance_after was stamped in INSERTION order. Once step 6 moves entries
--    onto their real dates, the ledger drawer sorts them by date and that
--    stamped figure reads out of order — the arrow beside a 9 September entry
--    would show the balance as it stood on the 10th.
--
--    Rewalking in date order fixes the column. It cannot change what is on the
--    shelf: the final running total for an item is the sum of all its deltas,
--    which is what inventory_stock.qty already holds, whatever order they are
--    added in. Only rows whose figure actually changes are written.
-- ----------------------------------------------------------------------------
WITH ordered AS (
  SELECT m.id,
         SUM(m.delta) OVER (
           PARTITION BY m.restaurant_id, m.outlet_id, m.inventory_item_id
           ORDER BY m.created_at, m.id
           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
         ) AS running
  FROM public.stock_movements m
  WHERE m.inventory_item_id IS NOT NULL
)
UPDATE public.stock_movements m
   SET balance_after = o.running
  FROM ordered o
 WHERE o.id = m.id
   AND m.balance_after IS DISTINCT FROM o.running;

-- ----------------------------------------------------------------------------
-- 8. VERIFY — all three counts should now read 0
-- ----------------------------------------------------------------------------
SELECT jsonb_pretty(jsonb_build_object(
  'helper_installed', EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'document_instant'),
  'purchases_still_misdated', (
    SELECT count(*) FROM public.stock_movements m
    JOIN public.purchases p ON p.id = m.ref_id
    JOIN public.restaurants r ON r.id = m.restaurant_id
    WHERE m.ref_table = 'purchases'
      AND (m.created_at AT TIME ZONE COALESCE(r.timezone, 'Asia/Kolkata'))::date
          <> p.invoice_date),
  'wastage_still_misdated', (
    SELECT count(*) FROM public.stock_movements m
    JOIN public.stock_wastage w ON w.id = m.ref_id
    JOIN public.restaurants r ON r.id = m.restaurant_id
    WHERE m.ref_table = 'stock_wastage'
      AND (m.created_at AT TIME ZONE COALESCE(r.timezone, 'Asia/Kolkata'))::date
          <> w.wasted_on),
  'transfers_still_misdated', (
    SELECT count(*) FROM public.stock_movements m
    JOIN public.stock_transfers t ON t.id = m.ref_id
    JOIN public.restaurants r ON r.id = m.restaurant_id
    WHERE m.ref_table = 'stock_transfers'
      AND (m.created_at AT TIME ZONE COALESCE(r.timezone, 'Asia/Kolkata'))::date
          <> t.transfer_date),
  -- The 9 September challan the client reported, as a spot check.
  'sep_9_purchase_movements', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'invoice', p.invoice_no,
             'items',   x.n,
             'filed_on', x.d)), '[]'::jsonb)
    FROM (
      SELECT m.ref_id,
             count(*) AS n,
             (m.created_at AT TIME ZONE COALESCE(r.timezone, 'Asia/Kolkata'))::date AS d
      FROM public.stock_movements m
      JOIN public.restaurants r ON r.id = m.restaurant_id
      WHERE m.ref_table = 'purchases'
        AND (m.created_at AT TIME ZONE COALESCE(r.timezone, 'Asia/Kolkata'))::date
            = DATE '2026-09-09'
      GROUP BY m.ref_id, d
    ) x
    JOIN public.purchases p ON p.id = x.ref_id),
  -- Items whose cost is still unknown. Every one of these values its stock at
  -- zero, which is why Stock Value and Purchase Value read as they do.
  'items_with_no_known_rate', (
    SELECT count(*) FROM public.inventory_items
    WHERE is_active AND COALESCE(last_purchase_rate, 0) = 0),
  -- Proof that nothing on the shelf moved. This compares the balance held on
  -- inventory_stock against the sum of the ledger for the same item and
  -- outlet. It should be 0 — and it should have been 0 before this ran too,
  -- because re-dating cannot change a sum.
  'balances_disagreeing_with_ledger', (
    SELECT count(*) FROM (
      SELECT s.outlet_id, s.inventory_item_id
      FROM public.inventory_stock s
      LEFT JOIN (
        SELECT outlet_id, inventory_item_id, SUM(delta) AS total
        FROM public.stock_movements
        WHERE inventory_item_id IS NOT NULL
        GROUP BY outlet_id, inventory_item_id
      ) m ON m.outlet_id = s.outlet_id
         AND m.inventory_item_id = s.inventory_item_id
      WHERE ROUND(COALESCE(s.qty, 0), 3) <> ROUND(COALESCE(m.total, 0), 3)
    ) x)
)) AS after_state;
