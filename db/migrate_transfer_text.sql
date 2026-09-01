-- =============================================================================
-- Spice OS — transfers as free text
-- Run once in the Supabase SQL Editor, after db/migrate_inventory_phase2.sql.
-- Safe to re-run.
-- =============================================================================
-- Transfers were modelled as outlet-to-outlet: stock left one branch and
-- arrived at another. That needs two real outlets, which most restaurants do
-- not have yet, so the screen was unusable for them.
--
-- FROM and TO become free text. What that changes, and what it does not:
--
--   * Stock still LEAVES. The goods went somewhere, so they come off the
--     sending outlet's balance exactly as before — a transfer that moved no
--     stock would be a note, not a transfer.
--
--   * Stock no longer ARRIVES anywhere, because a typed name is not a place
--     the system holds a balance for. There is no receive step and no
--     shortage line; a transfer is sent and that is the end of it.
--
--   * to_outlet_id becomes optional. Where it IS set — a genuine
--     outlet-to-outlet move — the old two-step behaviour still applies, so
--     nothing already recorded changes meaning.
--
-- The labels are what the operator typed. The outlet ids remain the thing the
-- ledger is keyed on, so the Stock Summary keeps working untouched.
-- =============================================================================

ALTER TABLE public.stock_transfers
  ADD COLUMN IF NOT EXISTS from_label text,
  ADD COLUMN IF NOT EXISTS to_label   text;

-- A typed destination has no outlet behind it.
ALTER TABLE public.stock_transfers
  ALTER COLUMN to_outlet_id DROP NOT NULL;

-- Existing transfers get labels from the outlets they already point at, so the
-- list reads the same before and after.
UPDATE public.stock_transfers t
   SET from_label = COALESCE(t.from_label, o.name)
  FROM public.outlets o
 WHERE o.id = t.from_outlet_id AND t.from_label IS NULL;

UPDATE public.stock_transfers t
   SET to_label = COALESCE(t.to_label, o.name)
  FROM public.outlets o
 WHERE o.id = t.to_outlet_id AND t.to_label IS NULL;

-- ----------------------------------------------------------------------------
-- Re-posting must not invent a destination.
--
-- post_stock_movement falls back to the default outlet when given a null one,
-- which is right for the sending side but would be actively wrong here: a
-- transfer to a typed name would quietly add the stock back to the default
-- outlet and cancel itself out. Hence the explicit IS NOT NULL guard.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.repost_transfer(p_transfer_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  t  record;
  ln record;
  v_qty numeric;
BEGIN
  SELECT * INTO t FROM public.stock_transfers WHERE id = p_transfer_id;
  IF t IS NULL THEN RAISE EXCEPTION 'Transfer % not found', p_transfer_id; END IF;
  IF t.restaurant_id IS DISTINCT FROM public.current_restaurant_id()
     AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;

  PERFORM public.clear_document_movements(t.restaurant_id, 'stock_transfers', t.id);

  IF t.status IN ('draft', 'cancelled') THEN RETURN; END IF;

  FOR ln IN SELECT * FROM public.stock_transfer_items WHERE transfer_id = p_transfer_id LOOP
    PERFORM public.post_stock_movement(
      t.restaurant_id, t.from_outlet_id, ln.inventory_item_id,
      -ln.qty_base, 'transfer_out',
      'Transfer to ' || COALESCE(t.to_label, 'elsewhere'),
      'stock_transfers', t.id, ln.rate, t.note,
      t.transfer_date::timestamptz);

    -- Only a real outlet can receive.
    IF t.status = 'received' AND t.to_outlet_id IS NOT NULL THEN
      v_qty := COALESCE(ln.received_qty_base, ln.qty_base);

      PERFORM public.post_stock_movement(
        t.restaurant_id, t.to_outlet_id, ln.inventory_item_id,
        ln.qty_base, 'transfer_in',
        'Transfer in ' || COALESCE(t.reference_no, ''),
        'stock_transfers', t.id, ln.rate, t.note,
        t.transfer_date::timestamptz);

      IF v_qty < ln.qty_base THEN
        PERFORM public.post_stock_movement(
          t.restaurant_id, t.to_outlet_id, ln.inventory_item_id,
          -(ln.qty_base - v_qty), 'shortage', 'Transfer shortage',
          'stock_transfers', t.id, ln.rate, NULL,
          t.transfer_date::timestamptz);
      END IF;
    END IF;
  END LOOP;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.send_transfer(p_transfer_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  t  record;
  ln record;
BEGIN
  SELECT * INTO t FROM public.stock_transfers WHERE id = p_transfer_id;
  IF t IS NULL THEN RAISE EXCEPTION 'Transfer % not found', p_transfer_id; END IF;
  IF t.restaurant_id IS DISTINCT FROM public.current_restaurant_id()
     AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;
  IF t.status <> 'draft' THEN RAISE EXCEPTION 'Transfer is already %', t.status; END IF;

  FOR ln IN SELECT * FROM public.stock_transfer_items WHERE transfer_id = p_transfer_id LOOP
    PERFORM public.post_stock_movement(
      t.restaurant_id, t.from_outlet_id, ln.inventory_item_id,
      -ln.qty_base, 'transfer_out',
      'Transfer to ' || COALESCE(t.to_label, 'elsewhere'),
      'stock_transfers', t.id, ln.rate, t.note,
      t.transfer_date::timestamptz);
  END LOOP;

  UPDATE public.stock_transfers SET status = 'sent', sent_at = now() WHERE id = p_transfer_id;
END;
$fn$;

-- =============================================================================
-- VERIFY
-- =============================================================================
SELECT jsonb_pretty(jsonb_build_object(
  'labels_added', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_transfers' AND column_name = 'from_label'),
  'to_outlet_now_optional', (
    SELECT is_nullable = 'YES' FROM information_schema.columns
    WHERE table_name = 'stock_transfers' AND column_name = 'to_outlet_id'),
  'transfers', (SELECT count(*) FROM public.stock_transfers),
  'labelled', (SELECT count(*) FROM public.stock_transfers WHERE from_label IS NOT NULL)
)) AS result;
