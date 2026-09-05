-- =============================================================================
-- Spice OS — recording what the kitchen makes
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- =============================================================================
-- WHY
--
-- Twenty raw materials sit below zero, and seventeen of them have never had a
-- single unit put in: no purchase, no opening, no transfer. The first movement
-- in their life is a sale taking stock away.
--
-- They are not bought. Rumali Roti, Fry Tikka, Malai Tikka, Korma Gravy, Rice
-- Semi, Lassi — the kitchen makes them out of things that ARE bought. Recipes
-- consume them when a dish is sold, so they can only ever go down.
--
-- stock_movements has carried 'production_in' and 'production_out' since the
-- inventory migration, and the movement drawer already knows how to label and
-- colour them. There has simply never been anything that writes one.
--
-- WHAT A BATCH IS
--
-- Making thirty Rumali Roti moves stock in two directions at once: the roti
-- come IN, and the atta and oil the batch consumed go OUT. Recording only the
-- output would fix the roti and quietly break the flour, so a batch is one
-- document with both sides, posted together or not at all.
--
-- The inputs are optional. A kitchen that wants nothing more than "we made 30
-- roti today" can have exactly that, and add the recipe side later — half a
-- record beats the nothing that is there now.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.production_batches (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL DEFAULT public.current_restaurant_id()
                  REFERENCES public.restaurants(id) ON DELETE CASCADE,
  outlet_id     uuid REFERENCES public.outlets(id) ON DELETE SET NULL,
  batch_no      text,
  made_on       date NOT NULL DEFAULT CURRENT_DATE,
  status        text NOT NULL DEFAULT 'draft',
  note          text,
  posted_at     timestamptz,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT production_batches_pkey PRIMARY KEY (id),
  CONSTRAINT production_batches_status_check CHECK (status IN ('draft','posted','cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_production_batches_rest
  ON public.production_batches (restaurant_id, made_on DESC);

-- One table for both sides of the batch. `role` says which way the stock went,
-- which keeps a batch's inputs and outputs in one place and in one order.
CREATE TABLE IF NOT EXISTS public.production_items (
  id                uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id     uuid NOT NULL DEFAULT public.current_restaurant_id()
                      REFERENCES public.restaurants(id) ON DELETE CASCADE,
  batch_id          uuid NOT NULL REFERENCES public.production_batches(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  role              text NOT NULL,                     -- 'output' | 'input'
  qty               numeric NOT NULL CHECK (qty > 0),  -- as typed, in entry_unit
  entry_unit        text NOT NULL DEFAULT 'base',      -- 'base' | 'purchase'
  qty_base          numeric NOT NULL,                  -- converted, what hits stock
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT production_items_pkey PRIMARY KEY (id),
  CONSTRAINT production_items_role_check CHECK (role IN ('output','input')),
  CONSTRAINT production_items_unit_check CHECK (entry_unit IN ('purchase','base'))
);

CREATE INDEX IF NOT EXISTS idx_production_items_parent
  ON public.production_items (restaurant_id, batch_id);

-- ----------------------------------------------------------------------------
-- 2. Post a batch
--
--    Outputs add, inputs deduct, both dated to the day the batch was made so
--    the stock lands on the day the cooking happened rather than the day
--    someone got round to typing it.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_production(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  b        record;
  ln       record;
  v_tz     text;
  v_at     timestamptz;
  n_out    integer := 0;
  n_in     integer := 0;
BEGIN
  SELECT * INTO b FROM public.production_batches WHERE id = p_batch_id;
  IF b IS NULL THEN RAISE EXCEPTION 'Batch % not found', p_batch_id; END IF;
  IF b.restaurant_id IS DISTINCT FROM public.current_restaurant_id()
     AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;
  IF b.status <> 'draft' THEN RAISE EXCEPTION 'This batch is already %', b.status; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.production_items
                  WHERE batch_id = p_batch_id AND role = 'output') THEN
    RAISE EXCEPTION 'A batch needs at least one thing that was made';
  END IF;

  SELECT COALESCE(r.timezone, 'Asia/Kolkata') INTO v_tz
  FROM public.restaurants r WHERE r.id = b.restaurant_id;
  v_tz := COALESCE(v_tz, 'Asia/Kolkata');

  -- Mid-evening on the day it was made: after the day's purchases, before the
  -- closing count, which is the order a kitchen actually works in.
  v_at := (b.made_on::timestamp + interval '18 hours') AT TIME ZONE v_tz;

  FOR ln IN
    SELECT * FROM public.production_items WHERE batch_id = p_batch_id
    ORDER BY role DESC          -- outputs first, so a batch never dips below zero
  LOOP
    PERFORM public.post_stock_movement(
      b.restaurant_id, b.outlet_id, ln.inventory_item_id,
      CASE WHEN ln.role = 'output' THEN ln.qty_base ELSE -ln.qty_base END,
      CASE WHEN ln.role = 'output' THEN 'production_in' ELSE 'production_out' END,
      CASE WHEN ln.role = 'output' THEN 'Made in kitchen' ELSE 'Used in production' END,
      'production_batches', b.id, NULL, b.note, v_at);

    IF ln.role = 'output' THEN n_out := n_out + 1; ELSE n_in := n_in + 1; END IF;
  END LOOP;

  UPDATE public.production_batches
     SET status = 'posted', posted_at = now(), updated_at = now()
   WHERE id = p_batch_id;

  RETURN jsonb_build_object('made', n_out, 'used', n_in, 'on', b.made_on);
END;
$fn$;

-- ----------------------------------------------------------------------------
-- 3. Unpost — reverses every movement the batch made, then reopens it.
--    Reversing rather than deleting, for the same reason a wrong invoice gets
--    a credit note: the batch and its correction both stay visible.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_production(p_batch_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  b  record;
  m  record;
BEGIN
  SELECT * INTO b FROM public.production_batches WHERE id = p_batch_id;
  IF b IS NULL THEN RAISE EXCEPTION 'Batch % not found', p_batch_id; END IF;
  IF b.restaurant_id IS DISTINCT FROM public.current_restaurant_id()
     AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;
  IF b.status <> 'posted' THEN RAISE EXCEPTION 'This batch is %, not posted', b.status; END IF;

  FOR m IN
    SELECT * FROM public.stock_movements
    WHERE ref_table = 'production_batches' AND ref_id = p_batch_id
  LOOP
    PERFORM public.post_stock_movement(
      b.restaurant_id, m.outlet_id, m.inventory_item_id,
      -m.delta, m.movement_type, 'Production batch cancelled',
      'production_batches', b.id, NULL, NULL, m.created_at);
  END LOOP;

  UPDATE public.production_batches
     SET status = 'cancelled', updated_at = now()
   WHERE id = p_batch_id;
END;
$fn$;

-- ----------------------------------------------------------------------------
-- 4. RLS and grants — the same tenant_isolation shape as every other table.
-- ----------------------------------------------------------------------------
DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['production_batches','production_items'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON public.%I
        FOR ALL TO authenticated
        USING (restaurant_id = (SELECT public.current_restaurant_id())
               OR (SELECT public.is_platform_admin()))
        WITH CHECK (restaurant_id = (SELECT public.current_restaurant_id())
               OR (SELECT public.is_platform_admin()))
    $f$, t);
  END LOOP;
END $do$;

GRANT EXECUTE ON FUNCTION public.post_production(uuid)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_production(uuid) TO authenticated;

-- =============================================================================
-- VERIFY
-- =============================================================================
SELECT jsonb_pretty(jsonb_build_object(
  'tables', (SELECT COALESCE(jsonb_agg(tablename ORDER BY tablename), '[]'::jsonb)
             FROM pg_tables WHERE schemaname = 'public'
               AND tablename IN ('production_batches','production_items')),
  'functions', (SELECT COALESCE(jsonb_agg(proname ORDER BY proname), '[]'::jsonb)
                FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public'
                  AND proname IN ('post_production','cancel_production')),
  'items_never_stocked_in', (
    SELECT count(*) FROM public.inventory_items i
    WHERE i.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
      AND i.is_active
      AND NOT EXISTS (SELECT 1 FROM public.stock_movements m
                       WHERE m.inventory_item_id = i.id
                         AND m.movement_type IN ('purchase','opening','transfer_in','production_in')))
)) AS result;
