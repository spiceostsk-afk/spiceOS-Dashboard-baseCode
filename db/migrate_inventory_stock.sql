-- =============================================================================
-- Spice OS — PetPooja-grade inventory & stock control
-- Run once in the Supabase SQL Editor, AFTER db/schema.sql and
-- db/migrate_recipes_inventory.sql. Safe to re-run.
-- =============================================================================
-- What this adds, and why:
--
--   outlets              A restaurant can now have branches. Stock is held per
--                        outlet; transfers move it between them. Every existing
--                        restaurant gets one default outlet, so a single-branch
--                        tenant sees no change.
--
--   inventory_stock      Per-outlet balances. `inventory_items.stock` survives
--                        as the roll-up across outlets, so Recipes and every
--                        existing read keep working untouched.
--
--   movement_type        stock_movements gains a typed reason. Free text could
--                        never be bucketed into Purchase / Consumption /
--                        Wastage / Transfer columns; this is what makes the
--                        Stock Summary report possible at all.
--
--   purchases, wastage, transfers, stock_counts
--                        The four ways stock moves that the app could not
--                        record before. Each posts through one function so the
--                        ledger stays the single source of truth.
--
--   stock_counts         The heart of it: the closing-stock count. A count
--                        snapshots what the system THINKS is there (ideal),
--                        takes what was actually counted (physical), and on
--                        submit posts the difference (variance) to the ledger
--                        so the books agree with the shelf.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Outlets
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.outlets (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL DEFAULT public.current_restaurant_id()
                  REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  code          text,
  address       text,
  phone         text,
  is_default    boolean NOT NULL DEFAULT false,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outlets_pkey PRIMARY KEY (id),
  CONSTRAINT outlets_name_key UNIQUE (restaurant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_outlets_rest ON public.outlets (restaurant_id, is_active);

-- Exactly one default per restaurant.
CREATE UNIQUE INDEX IF NOT EXISTS idx_outlets_one_default
  ON public.outlets (restaurant_id) WHERE is_default;

-- Every restaurant that exists today gets its default outlet.
INSERT INTO public.outlets (restaurant_id, name, code, is_default)
SELECT r.id, r.name, 'MAIN', true
FROM public.restaurants r
WHERE NOT EXISTS (SELECT 1 FROM public.outlets o WHERE o.restaurant_id = r.id)
ON CONFLICT DO NOTHING;

-- New restaurants get one too.
CREATE OR REPLACE FUNCTION public.restaurants_seed_outlet()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  INSERT INTO public.outlets (restaurant_id, name, code, is_default)
  VALUES (NEW.id, NEW.name, 'MAIN', true)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_restaurants_seed_outlet ON public.restaurants;
CREATE TRIGGER trg_restaurants_seed_outlet
  AFTER INSERT ON public.restaurants
  FOR EACH ROW EXECUTE FUNCTION public.restaurants_seed_outlet();

/** The outlet to use when a caller has not named one. */
CREATE OR REPLACE FUNCTION public.default_outlet_id(p_restaurant_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT id FROM public.outlets
  WHERE restaurant_id = COALESCE(p_restaurant_id, public.current_restaurant_id())
  ORDER BY is_default DESC, created_at ASC
  LIMIT 1
$fn$;

-- Orders now know which branch served them, so consumption lands in the right
-- place. Existing orders are backfilled to the default outlet.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS outlet_id uuid REFERENCES public.outlets(id) ON DELETE SET NULL;

UPDATE public.orders o
   SET outlet_id = public.default_outlet_id(o.restaurant_id)
 WHERE o.outlet_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_outlet ON public.orders (restaurant_id, outlet_id);

-- ----------------------------------------------------------------------------
-- 2. Category master
--    inventory_items.category was free text. The stock screens need a stable
--    list to build their left rail from, so text becomes a foreign key while
--    the old column stays put as a denormalised label.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_categories (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL DEFAULT public.current_restaurant_id()
                  REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  sort_order    integer NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_categories_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_categories_name_key UNIQUE (restaurant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_inv_categories_rest
  ON public.inventory_categories (restaurant_id, is_active, sort_order);

-- Promote every distinct free-text category already in use.
INSERT INTO public.inventory_categories (restaurant_id, name)
SELECT DISTINCT i.restaurant_id, COALESCE(NULLIF(btrim(i.category), ''), 'Uncategorised')
FROM public.inventory_items i
ON CONFLICT (restaurant_id, name) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. Raw-material master, extended
--    `unit` remains the BASE unit — everything in the ledger, in recipes and in
--    inventory_stock is stored in it, always. purchase_unit is an entry-time
--    convenience: buy a 25 Kg bag, store 25. One canonical unit internally
--    means no conversion bugs can reach the balances.
-- ----------------------------------------------------------------------------
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS category_id        uuid REFERENCES public.inventory_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS purchase_unit      text,
  ADD COLUMN IF NOT EXISTS conversion_factor  numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS barcode            text,
  ADD COLUMN IF NOT EXISTS is_favourite       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stock_cycle        text NOT NULL DEFAULT 'daily',
  ADD COLUMN IF NOT EXISTS last_purchase_rate numeric,
  ADD COLUMN IF NOT EXISTS item_type          text NOT NULL DEFAULT 'raw',
  ADD COLUMN IF NOT EXISTS description        text;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_items_conversion_positive') THEN
    ALTER TABLE public.inventory_items
      ADD CONSTRAINT inventory_items_conversion_positive CHECK (conversion_factor > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_items_cycle_check') THEN
    ALTER TABLE public.inventory_items
      ADD CONSTRAINT inventory_items_cycle_check CHECK (stock_cycle IN ('daily','weekly','monthly'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_items_type_check') THEN
    ALTER TABLE public.inventory_items
      ADD CONSTRAINT inventory_items_type_check CHECK (item_type IN ('raw','semi_finished'));
  END IF;
END $do$;

-- Point every item at its category row.
UPDATE public.inventory_items i
   SET category_id = c.id
  FROM public.inventory_categories c
 WHERE c.restaurant_id = i.restaurant_id
   AND c.name = COALESCE(NULLIF(btrim(i.category), ''), 'Uncategorised')
   AND i.category_id IS NULL;

-- Default the purchase unit to the base unit: 1-to-1 until someone says otherwise.
UPDATE public.inventory_items
   SET purchase_unit = unit
 WHERE purchase_unit IS NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_items_cat
  ON public.inventory_items (restaurant_id, category_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_barcode
  ON public.inventory_items (restaurant_id, barcode) WHERE barcode IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 4. Per-outlet balances
--    inventory_items.stock stays as the roll-up across outlets so every screen
--    that reads it today keeps working. inventory_stock is the detail.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_stock (
  restaurant_id     uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  outlet_id         uuid NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  qty               numeric NOT NULL DEFAULT 0,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_stock_pkey PRIMARY KEY (outlet_id, inventory_item_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_stock_rest
  ON public.inventory_stock (restaurant_id, outlet_id);

-- Existing single-branch balances belong to the default outlet.
INSERT INTO public.inventory_stock (restaurant_id, outlet_id, inventory_item_id, qty)
SELECT i.restaurant_id, public.default_outlet_id(i.restaurant_id), i.id, i.stock
FROM public.inventory_items i
WHERE public.default_outlet_id(i.restaurant_id) IS NOT NULL
ON CONFLICT (outlet_id, inventory_item_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 5. The ledger, typed
--    Everything below hangs off movement_type. Without it the Stock Summary
--    report cannot exist: 'Order placed' and 'Stock in' are prose, not columns.
-- ----------------------------------------------------------------------------
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS outlet_id     uuid REFERENCES public.outlets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS movement_type text NOT NULL DEFAULT 'adjustment',
  ADD COLUMN IF NOT EXISTS ref_table     text,
  ADD COLUMN IF NOT EXISTS ref_id        uuid,
  ADD COLUMN IF NOT EXISTS rate          numeric,
  ADD COLUMN IF NOT EXISTS note          text,
  ADD COLUMN IF NOT EXISTS created_by    uuid;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_movements_type_check') THEN
    ALTER TABLE public.stock_movements
      ADD CONSTRAINT stock_movements_type_check CHECK (movement_type IN (
        'opening','purchase','purchase_return','consumption','transfer_in',
        'transfer_out','wastage','shortage','production_in','production_out',
        'adjustment','physical_count'));
  END IF;
END $do$;

-- Backfill the type of every movement recorded before this migration, reading
-- the prose the old code wrote. Anything unrecognised stays 'adjustment'.
UPDATE public.stock_movements SET movement_type = CASE
  WHEN reason IN ('Order placed','Quantity changed','Dish changed',
                  'Item cancelled','Cancellation reversed','Order line deleted')
       THEN 'consumption'
  WHEN reason = 'Item added'   THEN 'opening'
  WHEN reason = 'Item removed' THEN 'adjustment'
  WHEN reason IN ('Stock in','Stock out') THEN 'adjustment'
  ELSE 'adjustment'
END
WHERE movement_type = 'adjustment' AND reason IS NOT NULL;

UPDATE public.stock_movements m
   SET outlet_id = public.default_outlet_id(m.restaurant_id)
 WHERE m.outlet_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_stock_movements_summary
  ON public.stock_movements (restaurant_id, outlet_id, inventory_item_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type
  ON public.stock_movements (restaurant_id, movement_type, created_at DESC);

-- ----------------------------------------------------------------------------
-- 6. The one way stock moves
--    Every feature below — purchase, wastage, transfer, count, recipe
--    depletion — posts through this. Balances and the ledger can never drift
--    apart because nothing is allowed to write one without the other.
--
--    SECURITY DEFINER for the same reason apply_recipe_stock is: a diner's anon
--    JWT must be able to deplete stock through an order without being handed
--    write access to inventory_stock. Every statement is pinned to
--    p_restaurant_id, which callers take from the row they already own.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_stock_movement(
  p_restaurant_id uuid,
  p_outlet_id     uuid,
  p_item_id       uuid,
  p_delta         numeric,
  p_type          text,
  p_reason        text,
  p_ref_table     text DEFAULT NULL,
  p_ref_id        uuid DEFAULT NULL,
  p_rate          numeric DEFAULT NULL,
  p_note          text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_outlet  uuid := COALESCE(p_outlet_id, public.default_outlet_id(p_restaurant_id));
  v_balance numeric;
  v_name    text;
  v_id      uuid;
BEGIN
  IF p_item_id IS NULL OR COALESCE(p_delta, 0) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT item_name INTO v_name
  FROM public.inventory_items
  WHERE id = p_item_id AND restaurant_id = p_restaurant_id;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Inventory item % does not belong to restaurant %', p_item_id, p_restaurant_id;
  END IF;

  -- Per-outlet balance.
  INSERT INTO public.inventory_stock (restaurant_id, outlet_id, inventory_item_id, qty, updated_at)
  VALUES (p_restaurant_id, v_outlet, p_item_id, p_delta, now())
  ON CONFLICT (outlet_id, inventory_item_id)
  DO UPDATE SET qty = public.inventory_stock.qty + EXCLUDED.qty, updated_at = now()
  RETURNING qty INTO v_balance;

  -- Roll-up on the item, kept in step so existing reads stay correct.
  UPDATE public.inventory_items
     SET stock = (
           SELECT COALESCE(SUM(s.qty), 0)
           FROM public.inventory_stock s
           WHERE s.inventory_item_id = p_item_id
         ),
         updated_at = now()
   WHERE id = p_item_id AND restaurant_id = p_restaurant_id;

  INSERT INTO public.stock_movements (
    restaurant_id, outlet_id, inventory_item_id, item_name, delta, balance_after,
    reason, movement_type, ref_table, ref_id, rate, note
  ) VALUES (
    p_restaurant_id, v_outlet, p_item_id, v_name, p_delta, v_balance,
    COALESCE(p_reason, p_type), p_type, p_ref_table, p_ref_id, p_rate, p_note
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.post_stock_movement(uuid,uuid,uuid,numeric,text,text,text,uuid,numeric,text) FROM public;

-- ----------------------------------------------------------------------------
-- 7. Recipe depletion, rewired through the ledger
--    Same trigger and same behaviour as before; it now records the type as
--    'consumption' and lands on the outlet that took the order, so the
--    Consumption column of the report has something real behind it.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_recipe_stock(
  p_restaurant_id uuid,
  p_menu_item_id  uuid,
  p_servings      numeric,   -- signed: negative consumes, positive restores
  p_order_item_id uuid,
  p_reason        text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  ing      record;
  v_outlet uuid;
BEGIN
  IF p_menu_item_id IS NULL OR p_servings = 0 THEN
    RETURN;
  END IF;

  SELECT o.outlet_id INTO v_outlet
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.id = p_order_item_id;

  v_outlet := COALESCE(v_outlet, public.default_outlet_id(p_restaurant_id));

  FOR ing IN
    SELECT ri.inventory_item_id, ri.quantity
    FROM public.recipe_ingredients ri
    JOIN public.inventory_items inv ON inv.id = ri.inventory_item_id
    WHERE ri.menu_item_id  = p_menu_item_id
      AND ri.restaurant_id = p_restaurant_id
      AND inv.is_active
  LOOP
    PERFORM public.post_stock_movement(
      p_restaurant_id, v_outlet, ing.inventory_item_id,
      ing.quantity * p_servings, 'consumption', p_reason,
      'order_items', p_order_item_id, NULL, NULL);
  END LOOP;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.apply_recipe_stock(uuid, uuid, numeric, uuid, text) FROM public;

-- Stamp new orders with an outlet when the caller did not name one.
CREATE OR REPLACE FUNCTION public.orders_default_outlet()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.outlet_id IS NULL THEN
    NEW.outlet_id := public.default_outlet_id(NEW.restaurant_id);
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_orders_default_outlet ON public.orders;
CREATE TRIGGER trg_orders_default_outlet
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_default_outlet();

-- ----------------------------------------------------------------------------
-- 8. Vendors & purchases
--    A purchase is a draft until it is posted. Drafts touch no stock, so a
--    half-typed invoice never pollutes the books; posting writes one movement
--    per line and stamps the item's last purchase rate.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vendors (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL DEFAULT public.current_restaurant_id()
                  REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  phone         text,
  email         text,
  gstin         text,
  address       text,
  note          text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendors_pkey PRIMARY KEY (id),
  CONSTRAINT vendors_name_key UNIQUE (restaurant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_vendors_rest ON public.vendors (restaurant_id, is_active);

CREATE TABLE IF NOT EXISTS public.purchases (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL DEFAULT public.current_restaurant_id()
                  REFERENCES public.restaurants(id) ON DELETE CASCADE,
  outlet_id     uuid REFERENCES public.outlets(id) ON DELETE SET NULL,
  vendor_id     uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  invoice_no    text,
  invoice_date  date NOT NULL DEFAULT CURRENT_DATE,
  status        text NOT NULL DEFAULT 'draft',
  subtotal      numeric NOT NULL DEFAULT 0,
  tax_amount    numeric NOT NULL DEFAULT 0,
  discount      numeric NOT NULL DEFAULT 0,
  total         numeric NOT NULL DEFAULT 0,
  note          text,
  posted_at     timestamptz,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchases_pkey PRIMARY KEY (id),
  CONSTRAINT purchases_status_check CHECK (status IN ('draft','posted','cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_purchases_rest
  ON public.purchases (restaurant_id, invoice_date DESC);

CREATE TABLE IF NOT EXISTS public.purchase_items (
  id                uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id     uuid NOT NULL DEFAULT public.current_restaurant_id()
                      REFERENCES public.restaurants(id) ON DELETE CASCADE,
  purchase_id       uuid NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  qty               numeric NOT NULL CHECK (qty > 0),   -- as typed, in entry_unit
  entry_unit        text NOT NULL DEFAULT 'purchase',   -- 'purchase' | 'base'
  qty_base          numeric NOT NULL,                   -- converted, what hits stock
  rate              numeric NOT NULL DEFAULT 0,         -- per entry_unit
  tax_pct           numeric NOT NULL DEFAULT 0,
  amount            numeric NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_items_pkey PRIMARY KEY (id),
  CONSTRAINT purchase_items_entry_unit_check CHECK (entry_unit IN ('purchase','base'))
);

CREATE INDEX IF NOT EXISTS idx_purchase_items_parent
  ON public.purchase_items (restaurant_id, purchase_id);

/** Post a draft purchase: stock in, rate stamped, invoice frozen. */
CREATE OR REPLACE FUNCTION public.post_purchase(p_purchase_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  p   record;
  ln  record;
  v_rate_base numeric;
BEGIN
  SELECT * INTO p FROM public.purchases WHERE id = p_purchase_id;
  IF p IS NULL THEN RAISE EXCEPTION 'Purchase % not found', p_purchase_id; END IF;
  IF p.restaurant_id IS DISTINCT FROM public.current_restaurant_id() AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;
  IF p.status <> 'draft' THEN
    RAISE EXCEPTION 'Purchase is already %', p.status;
  END IF;

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
      'purchases', p.id, v_rate_base, NULL);

    UPDATE public.inventory_items
       SET last_purchase_rate = v_rate_base
     WHERE id = ln.inventory_item_id;
  END LOOP;

  UPDATE public.purchases
     SET status = 'posted', posted_at = now()
   WHERE id = p_purchase_id;
END;
$fn$;

/** Reverse a posted purchase. Stock goes back out; the invoice stays on record. */
CREATE OR REPLACE FUNCTION public.cancel_purchase(p_purchase_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  p  record;
  ln record;
BEGIN
  SELECT * INTO p FROM public.purchases WHERE id = p_purchase_id;
  IF p IS NULL THEN RAISE EXCEPTION 'Purchase % not found', p_purchase_id; END IF;
  IF p.restaurant_id IS DISTINCT FROM public.current_restaurant_id() AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;

  IF p.status = 'posted' THEN
    FOR ln IN SELECT * FROM public.purchase_items WHERE purchase_id = p_purchase_id LOOP
      PERFORM public.post_stock_movement(
        p.restaurant_id, p.outlet_id, ln.inventory_item_id,
        -ln.qty_base, 'purchase_return',
        'Purchase cancelled ' || COALESCE(p.invoice_no, ''),
        'purchases', p.id, NULL, NULL);
    END LOOP;
  END IF;

  UPDATE public.purchases SET status = 'cancelled' WHERE id = p_purchase_id;
END;
$fn$;

-- ----------------------------------------------------------------------------
-- 9. Wastage
--    Same draft-then-post shape as purchases, for the same reason.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_wastage (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL DEFAULT public.current_restaurant_id()
                  REFERENCES public.restaurants(id) ON DELETE CASCADE,
  outlet_id     uuid REFERENCES public.outlets(id) ON DELETE SET NULL,
  wasted_on     date NOT NULL DEFAULT CURRENT_DATE,
  status        text NOT NULL DEFAULT 'draft',
  note          text,
  total_value   numeric NOT NULL DEFAULT 0,
  posted_at     timestamptz,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_wastage_pkey PRIMARY KEY (id),
  CONSTRAINT stock_wastage_status_check CHECK (status IN ('draft','posted','cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_stock_wastage_rest
  ON public.stock_wastage (restaurant_id, wasted_on DESC);

CREATE TABLE IF NOT EXISTS public.stock_wastage_items (
  id                uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id     uuid NOT NULL DEFAULT public.current_restaurant_id()
                      REFERENCES public.restaurants(id) ON DELETE CASCADE,
  wastage_id        uuid NOT NULL REFERENCES public.stock_wastage(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  qty_base          numeric NOT NULL CHECK (qty_base > 0),
  reason            text NOT NULL DEFAULT 'Spoilage',
  rate              numeric,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_wastage_items_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_stock_wastage_items_parent
  ON public.stock_wastage_items (restaurant_id, wastage_id);

CREATE OR REPLACE FUNCTION public.post_wastage(p_wastage_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  w  record;
  ln record;
BEGIN
  SELECT * INTO w FROM public.stock_wastage WHERE id = p_wastage_id;
  IF w IS NULL THEN RAISE EXCEPTION 'Wastage entry % not found', p_wastage_id; END IF;
  IF w.restaurant_id IS DISTINCT FROM public.current_restaurant_id() AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;
  IF w.status <> 'draft' THEN RAISE EXCEPTION 'Wastage entry is already %', w.status; END IF;

  FOR ln IN SELECT * FROM public.stock_wastage_items WHERE wastage_id = p_wastage_id LOOP
    PERFORM public.post_stock_movement(
      w.restaurant_id, w.outlet_id, ln.inventory_item_id,
      -ln.qty_base, 'wastage', ln.reason,
      'stock_wastage', w.id, ln.rate, w.note);
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
-- 10. Outlet-to-outlet transfers
--     Two steps on purpose. Sending takes the stock off the source outlet
--     immediately; receiving puts it on the destination. Between the two the
--     goods are in transit and belong to neither, which is the honest answer
--     and the only way a receiving branch can dispute a short delivery.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_transfers (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id   uuid NOT NULL DEFAULT public.current_restaurant_id()
                    REFERENCES public.restaurants(id) ON DELETE CASCADE,
  from_outlet_id  uuid NOT NULL REFERENCES public.outlets(id) ON DELETE RESTRICT,
  to_outlet_id    uuid NOT NULL REFERENCES public.outlets(id) ON DELETE RESTRICT,
  transfer_date   date NOT NULL DEFAULT CURRENT_DATE,
  reference_no    text,
  status          text NOT NULL DEFAULT 'draft',
  note            text,
  sent_at         timestamptz,
  received_at     timestamptz,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_transfers_pkey PRIMARY KEY (id),
  CONSTRAINT stock_transfers_status_check
    CHECK (status IN ('draft','sent','received','cancelled')),
  CONSTRAINT stock_transfers_distinct_outlets CHECK (from_outlet_id <> to_outlet_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_rest
  ON public.stock_transfers (restaurant_id, transfer_date DESC);

CREATE TABLE IF NOT EXISTS public.stock_transfer_items (
  id                uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id     uuid NOT NULL DEFAULT public.current_restaurant_id()
                      REFERENCES public.restaurants(id) ON DELETE CASCADE,
  transfer_id       uuid NOT NULL REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  qty_base          numeric NOT NULL CHECK (qty_base > 0),
  received_qty_base numeric,          -- null until received; may differ from sent
  rate              numeric,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_transfer_items_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_parent
  ON public.stock_transfer_items (restaurant_id, transfer_id);

/** Send: stock leaves the source outlet. */
CREATE OR REPLACE FUNCTION public.send_transfer(p_transfer_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  t  record;
  ln record;
BEGIN
  SELECT * INTO t FROM public.stock_transfers WHERE id = p_transfer_id;
  IF t IS NULL THEN RAISE EXCEPTION 'Transfer % not found', p_transfer_id; END IF;
  IF t.restaurant_id IS DISTINCT FROM public.current_restaurant_id() AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;
  IF t.status <> 'draft' THEN RAISE EXCEPTION 'Transfer is already %', t.status; END IF;

  FOR ln IN SELECT * FROM public.stock_transfer_items WHERE transfer_id = p_transfer_id LOOP
    PERFORM public.post_stock_movement(
      t.restaurant_id, t.from_outlet_id, ln.inventory_item_id,
      -ln.qty_base, 'transfer_out',
      'Transfer out ' || COALESCE(t.reference_no, ''),
      'stock_transfers', t.id, ln.rate, t.note);
  END LOOP;

  UPDATE public.stock_transfers SET status = 'sent', sent_at = now() WHERE id = p_transfer_id;
END;
$fn$;

/** Receive: stock lands at the destination, at the quantity actually accepted. */
CREATE OR REPLACE FUNCTION public.receive_transfer(p_transfer_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  t  record;
  ln record;
  v_qty numeric;
BEGIN
  SELECT * INTO t FROM public.stock_transfers WHERE id = p_transfer_id;
  IF t IS NULL THEN RAISE EXCEPTION 'Transfer % not found', p_transfer_id; END IF;
  IF t.restaurant_id IS DISTINCT FROM public.current_restaurant_id() AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;
  IF t.status <> 'sent' THEN RAISE EXCEPTION 'Transfer must be sent before it can be received'; END IF;

  FOR ln IN SELECT * FROM public.stock_transfer_items WHERE transfer_id = p_transfer_id LOOP
    v_qty := COALESCE(ln.received_qty_base, ln.qty_base);

    PERFORM public.post_stock_movement(
      t.restaurant_id, t.to_outlet_id, ln.inventory_item_id,
      v_qty, 'transfer_in',
      'Transfer in ' || COALESCE(t.reference_no, ''),
      'stock_transfers', t.id, ln.rate, t.note);

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
        'stock_transfers', t.id, ln.rate, t.note);

      PERFORM public.post_stock_movement(
        t.restaurant_id, t.to_outlet_id, ln.inventory_item_id,
        -(ln.qty_base - v_qty), 'shortage', 'Transfer shortage',
        'stock_transfers', t.id, ln.rate,
        'Sent ' || ln.qty_base::text || ', received ' || v_qty::text);
    END IF;
  END LOOP;

  UPDATE public.stock_transfers SET status = 'received', received_at = now() WHERE id = p_transfer_id;
END;
$fn$;

-- ----------------------------------------------------------------------------
-- 11. Stock counts — closing stock and available stock
--
--     This is the part the client cares most about, so it is worth being
--     precise about what the three numbers mean:
--
--       ideal_qty     what the system believes is on the shelf, taken as a
--                     snapshot the moment the count sheet is opened.
--       physical_qty  what a human actually counted.
--       variance      physical - ideal. Positive means more was found than the
--                     books expected; negative means it walked.
--
--     Submitting a count posts the variance to the ledger as a
--     'physical_count' movement, so from that instant the books agree with the
--     shelf and tomorrow's opening stock is a counted number, not a guess.
--
--     'closing' is the end-of-day close for a given date. 'available' is a
--     spot-check of what is on hand right now. Same mechanics; they are kept
--     apart so an operator can spot-check mid-service without it being read as
--     the day's official close.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_counts (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL DEFAULT public.current_restaurant_id()
                  REFERENCES public.restaurants(id) ON DELETE CASCADE,
  outlet_id     uuid NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
  count_type    text NOT NULL DEFAULT 'closing',
  count_date    date NOT NULL DEFAULT CURRENT_DATE,
  cycle         text NOT NULL DEFAULT 'daily',
  status        text NOT NULL DEFAULT 'draft',
  note          text,
  created_by    uuid,
  submitted_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_counts_pkey PRIMARY KEY (id),
  CONSTRAINT stock_counts_type_check   CHECK (count_type IN ('closing','available')),
  CONSTRAINT stock_counts_cycle_check  CHECK (cycle IN ('daily','weekly','monthly')),
  CONSTRAINT stock_counts_status_check CHECK (status IN ('draft','submitted','cancelled'))
);

-- One sheet per outlet per type per day. Re-opening the screen resumes the
-- draft that is already there rather than starting a rival copy.
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_counts_unique
  ON public.stock_counts (outlet_id, count_type, count_date)
  WHERE status <> 'cancelled';

CREATE INDEX IF NOT EXISTS idx_stock_counts_rest
  ON public.stock_counts (restaurant_id, count_type, count_date DESC);

CREATE TABLE IF NOT EXISTS public.stock_count_items (
  id                uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id     uuid NOT NULL DEFAULT public.current_restaurant_id()
                      REFERENCES public.restaurants(id) ON DELETE CASCADE,
  count_id          uuid NOT NULL REFERENCES public.stock_counts(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  ideal_qty         numeric NOT NULL DEFAULT 0,
  physical_qty      numeric,           -- null = not counted yet
  entry_qty         numeric,           -- as typed, before unit conversion
  entry_unit        text NOT NULL DEFAULT 'base',
  variance          numeric,
  rate              numeric,
  remark            text,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_count_items_pkey PRIMARY KEY (id),
  CONSTRAINT stock_count_items_unique UNIQUE (count_id, inventory_item_id),
  CONSTRAINT stock_count_items_entry_unit_check CHECK (entry_unit IN ('purchase','base'))
);

CREATE INDEX IF NOT EXISTS idx_stock_count_items_parent
  ON public.stock_count_items (restaurant_id, count_id);

/**
 * Open (or resume) a count sheet and refresh every line's ideal quantity to
 * what the system believes right now.
 *
 * Refreshing on open matters: a sheet saved as a draft at 9pm and submitted at
 * 11pm would otherwise measure the physical count against a two-hour-old
 * expectation and invent a variance out of the orders served in between.
 */
CREATE OR REPLACE FUNCTION public.open_stock_count(
  p_outlet_id  uuid,
  p_count_type text DEFAULT 'closing',
  p_count_date date DEFAULT CURRENT_DATE,
  p_cycle      text DEFAULT 'daily'
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_rest   uuid := public.current_restaurant_id();
  v_outlet uuid := COALESCE(p_outlet_id, public.default_outlet_id(v_rest));
  v_id     uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.outlets WHERE id = v_outlet AND restaurant_id = v_rest) THEN
    RAISE EXCEPTION 'Outlet does not belong to this restaurant';
  END IF;

  SELECT id INTO v_id
  FROM public.stock_counts
  WHERE outlet_id = v_outlet AND count_type = p_count_type
    AND count_date = p_count_date AND status <> 'cancelled';

  IF v_id IS NULL THEN
    INSERT INTO public.stock_counts (restaurant_id, outlet_id, count_type, count_date, cycle)
    VALUES (v_rest, v_outlet, p_count_type, p_count_date, p_cycle)
    RETURNING id INTO v_id;
  END IF;

  -- A submitted sheet is history; do not touch it.
  IF (SELECT status FROM public.stock_counts WHERE id = v_id) = 'submitted' THEN
    RETURN v_id;
  END IF;

  -- Add any item that has appeared since the sheet was created.
  INSERT INTO public.stock_count_items (restaurant_id, count_id, inventory_item_id, ideal_qty, rate)
  SELECT v_rest, v_id, i.id,
         COALESCE(s.qty, 0),
         i.last_purchase_rate
  FROM public.inventory_items i
  LEFT JOIN public.inventory_stock s
         ON s.inventory_item_id = i.id AND s.outlet_id = v_outlet
  WHERE i.restaurant_id = v_rest AND i.is_active
  ON CONFLICT (count_id, inventory_item_id) DO NOTHING;

  -- Re-snapshot ideal for every line that has not been counted yet.
  UPDATE public.stock_count_items ci
     SET ideal_qty = COALESCE(s.qty, 0)
    FROM public.inventory_items i
    LEFT JOIN public.inventory_stock s
           ON s.inventory_item_id = i.id AND s.outlet_id = v_outlet
   WHERE ci.count_id = v_id
     AND ci.inventory_item_id = i.id
     AND ci.physical_qty IS NULL;

  UPDATE public.stock_counts SET cycle = p_cycle, updated_at = now() WHERE id = v_id;

  RETURN v_id;
END;
$fn$;

/**
 * Submit a count: freeze it and reconcile the shelf to the books.
 *
 * Only lines that were actually counted move stock. An untouched line means
 * "nobody looked at this", which is not the same as "there is none" — writing
 * those to zero would be the single most destructive thing this module could
 * do, so it does not.
 */
CREATE OR REPLACE FUNCTION public.submit_stock_count(p_count_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  c  record;
  ln record;
BEGIN
  SELECT * INTO c FROM public.stock_counts WHERE id = p_count_id;
  IF c IS NULL THEN RAISE EXCEPTION 'Stock count % not found', p_count_id; END IF;
  IF c.restaurant_id IS DISTINCT FROM public.current_restaurant_id() AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;
  IF c.status <> 'draft' THEN RAISE EXCEPTION 'Stock count is already %', c.status; END IF;

  FOR ln IN
    SELECT * FROM public.stock_count_items
    WHERE count_id = p_count_id AND physical_qty IS NOT NULL
  LOOP
    -- Recompute the variance against live stock at the moment of submission,
    -- rather than trusting whatever the browser last wrote.
    DECLARE
      v_ideal numeric;
      v_var   numeric;
    BEGIN
      SELECT COALESCE(qty, 0) INTO v_ideal
      FROM public.inventory_stock
      WHERE outlet_id = c.outlet_id AND inventory_item_id = ln.inventory_item_id;

      v_ideal := COALESCE(v_ideal, 0);
      v_var   := ln.physical_qty - v_ideal;

      UPDATE public.stock_count_items
         SET ideal_qty = v_ideal, variance = v_var, updated_at = now()
       WHERE id = ln.id;

      IF v_var <> 0 THEN
        PERFORM public.post_stock_movement(
          c.restaurant_id, c.outlet_id, ln.inventory_item_id,
          v_var, 'physical_count',
          CASE WHEN c.count_type = 'closing' THEN 'Closing stock count'
               ELSE 'Available stock count' END,
          'stock_counts', c.id, ln.rate, ln.remark);
      END IF;
    END;
  END LOOP;

  UPDATE public.stock_counts
     SET status = 'submitted', submitted_at = now(), updated_at = now()
   WHERE id = p_count_id;
END;
$fn$;

-- ----------------------------------------------------------------------------
-- 12. Stock Summary report
--
--     The eleven columns the client asked for, computed in one pass over the
--     ledger. Doing this in SQL rather than in the browser is not an
--     optimisation — a date-ranged opening balance means summing every
--     movement since the beginning of time, and that is not data you want to
--     ship to a laptop.
--
--     Sign convention: the ledger is signed (consumption is negative), but a
--     report column reads better as a magnitude. Everything that takes stock
--     away is returned positive, so a manager reading across the row can do
--     the arithmetic in their head:
--
--       ideal = opening + purchase + transfer_in + production
--                       - consumption - transfer_out - wastage - shortage
--
--     `ideal_stock` deliberately excludes physical_count movements: it is what
--     the books say BEFORE a count corrects them, which is the only thing
--     worth comparing a physical count against. `closing_stock` includes them,
--     so it is the balance actually carried forward.
--
--     Dates are resolved in the restaurant's own timezone. A day that ends at
--     midnight UTC would cut an Indian dinner service in half.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.stock_summary(uuid, date, date, uuid, text, text);

CREATE OR REPLACE FUNCTION public.stock_summary(
  p_outlet_id   uuid DEFAULT NULL,      -- null = every outlet, added together
  p_from        date DEFAULT CURRENT_DATE,
  p_to          date DEFAULT CURRENT_DATE,
  p_category_id uuid DEFAULT NULL,
  p_search      text DEFAULT NULL,
  p_unit_type   text DEFAULT 'base'     -- 'base' | 'purchase'
)
RETURNS TABLE (
  inventory_item_id uuid,
  item_name         text,
  category_id       uuid,
  category_name     text,
  unit              text,
  opening_stock     numeric,
  purchase_stock    numeric,
  total_stock       numeric,
  consumption       numeric,
  transfer_in       numeric,
  transfer_out      numeric,
  wastage           numeric,
  shortage          numeric,
  production        numeric,
  adjustment        numeric,
  ideal_stock       numeric,
  physical_stock    numeric,
  variance          numeric,
  closing_stock     numeric,
  remark            text,
  rate              numeric,
  ideal_value       numeric
)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $fn$
-- Every RETURNS TABLE column above is also a PL/pgSQL variable in here, and
-- several of them (unit, variance, consumption, wastage, rate) are named after
-- real columns in the query below. Resolving ties in favour of the column is
-- what the query means everywhere; the OUT names are only ever filled by
-- RETURN QUERY, never assigned to directly.
#variable_conflict use_column
DECLARE
  v_rest uuid := public.current_restaurant_id();
  v_tz   text;
BEGIN
  SELECT COALESCE(r.timezone, 'Asia/Kolkata') INTO v_tz
  FROM public.restaurants r WHERE r.id = v_rest;
  v_tz := COALESCE(v_tz, 'Asia/Kolkata');

  RETURN QUERY
  WITH items AS (
    SELECT i.id, i.item_name, i.category_id, i.unit, i.purchase_unit,
           GREATEST(COALESCE(i.conversion_factor, 1), 0.000001) AS cf,
           i.last_purchase_rate,
           COALESCE(c.name, i.category, 'Uncategorised') AS category_name
    FROM public.inventory_items i
    LEFT JOIN public.inventory_categories c ON c.id = i.category_id
    WHERE i.restaurant_id = v_rest
      AND i.is_active
      AND (p_category_id IS NULL OR i.category_id = p_category_id)
      AND (p_search IS NULL OR btrim(p_search) = ''
           OR i.item_name ILIKE '%' || btrim(p_search) || '%'
           OR i.barcode   ILIKE '%' || btrim(p_search) || '%')
  ),
  scoped AS (
    SELECT m.inventory_item_id AS item_id,
           m.movement_type,
           m.delta,
           (m.created_at AT TIME ZONE v_tz)::date AS local_date
    FROM public.stock_movements m
    WHERE m.restaurant_id = v_rest
      AND (p_outlet_id IS NULL OR m.outlet_id = p_outlet_id)
      AND m.inventory_item_id IS NOT NULL
  ),
  agg AS (
    SELECT s.item_id,
           SUM(s.delta) FILTER (WHERE s.local_date <  p_from) AS opening,
           SUM(s.delta) FILTER (WHERE s.local_date BETWEEN p_from AND p_to
                                  AND s.movement_type IN ('purchase','purchase_return')) AS purchase,
           SUM(s.delta) FILTER (WHERE s.local_date BETWEEN p_from AND p_to
                                  AND s.movement_type = 'transfer_in')  AS tr_in,
           SUM(s.delta) FILTER (WHERE s.local_date BETWEEN p_from AND p_to
                                  AND s.movement_type = 'transfer_out') AS tr_out,
           SUM(s.delta) FILTER (WHERE s.local_date BETWEEN p_from AND p_to
                                  AND s.movement_type = 'consumption')  AS consumed,
           SUM(s.delta) FILTER (WHERE s.local_date BETWEEN p_from AND p_to
                                  AND s.movement_type = 'wastage')      AS wasted,
           SUM(s.delta) FILTER (WHERE s.local_date BETWEEN p_from AND p_to
                                  AND s.movement_type = 'shortage')     AS short,
           SUM(s.delta) FILTER (WHERE s.local_date BETWEEN p_from AND p_to
                                  AND s.movement_type IN ('production_in','production_out')) AS produced,
           SUM(s.delta) FILTER (WHERE s.local_date BETWEEN p_from AND p_to
                                  AND s.movement_type IN ('adjustment','opening')) AS adjusted,
           SUM(s.delta) FILTER (WHERE s.local_date BETWEEN p_from AND p_to
                                  AND s.movement_type = 'physical_count') AS counted,
           SUM(s.delta) FILTER (WHERE s.local_date <= p_to) AS closing
    FROM scoped s
    GROUP BY s.item_id
  ),
  -- The most recent submitted count in range wins: that is the number a
  -- manager physically stood in the store and wrote down.
  counted AS (
    SELECT DISTINCT ON (ci.inventory_item_id)
           ci.inventory_item_id AS item_id,
           ci.physical_qty,
           ci.remark
    FROM public.stock_count_items ci
    JOIN public.stock_counts sc ON sc.id = ci.count_id
    WHERE sc.restaurant_id = v_rest
      AND sc.status = 'submitted'
      AND sc.count_date BETWEEN p_from AND p_to
      AND (p_outlet_id IS NULL OR sc.outlet_id = p_outlet_id)
      AND ci.physical_qty IS NOT NULL
    ORDER BY ci.inventory_item_id, sc.count_date DESC, sc.submitted_at DESC
  ),
  calc AS (
    SELECT it.id, it.item_name, it.category_id, it.category_name,
           CASE WHEN p_unit_type = 'purchase'
                THEN COALESCE(it.purchase_unit, it.unit) ELSE it.unit END AS unit_label,
           CASE WHEN p_unit_type = 'purchase' THEN it.cf ELSE 1 END AS div,
           it.cf,
           it.last_purchase_rate,
           COALESCE(a.opening, 0)                  AS opening,
           COALESCE(a.purchase, 0)                 AS purchase,
           COALESCE(a.tr_in, 0)                    AS tr_in,
           -COALESCE(a.tr_out, 0)                  AS tr_out,
           -COALESCE(a.consumed, 0)                AS consumed,
           -COALESCE(a.wasted, 0)                  AS wasted,
           -COALESCE(a.short, 0)                   AS short,
           COALESCE(a.produced, 0)                 AS produced,
           COALESCE(a.adjusted, 0)                 AS adjusted,
           COALESCE(a.closing, 0)                  AS closing,
           cn.physical_qty,
           cn.remark
    FROM items it
    LEFT JOIN agg     a  ON a.item_id  = it.id
    LEFT JOIN counted cn ON cn.item_id = it.id
  )
  SELECT
    c.id,
    c.item_name,
    c.category_id,
    c.category_name,
    c.unit_label,
    ROUND(c.opening / c.div, 3),
    ROUND(c.purchase / c.div, 3),
    ROUND((c.opening + c.purchase + c.tr_in) / c.div, 3),
    ROUND(c.consumed / c.div, 3),
    ROUND(c.tr_in / c.div, 3),
    ROUND(c.tr_out / c.div, 3),
    ROUND(c.wasted / c.div, 3),
    ROUND(c.short / c.div, 3),
    ROUND(c.produced / c.div, 3),
    ROUND(c.adjusted / c.div, 3),
    -- Ideal: the books before any count corrected them.
    ROUND((c.opening + c.purchase + c.tr_in + c.produced + c.adjusted
           - c.consumed - c.tr_out - c.wasted - c.short) / c.div, 3),
    CASE WHEN c.physical_qty IS NULL THEN NULL
         ELSE ROUND(c.physical_qty / c.div, 3) END,
    CASE WHEN c.physical_qty IS NULL THEN NULL
         ELSE ROUND((c.physical_qty
                     - (c.opening + c.purchase + c.tr_in + c.produced + c.adjusted
                        - c.consumed - c.tr_out - c.wasted - c.short)) / c.div, 3) END,
    ROUND(c.closing / c.div, 3),
    c.remark,
    c.last_purchase_rate,
    ROUND((c.opening + c.purchase + c.tr_in + c.produced + c.adjusted
           - c.consumed - c.tr_out - c.wasted - c.short)
          * COALESCE(c.last_purchase_rate, 0), 2)
  FROM calc c
  ORDER BY c.item_name;
END;
$fn$;

-- ----------------------------------------------------------------------------
-- 13. RLS — the same tenant_isolation shape every other domain table uses.
-- ----------------------------------------------------------------------------
DO $do$
DECLARE
  t text;
  new_tables text[] := ARRAY[
    'outlets','inventory_categories','inventory_stock','vendors',
    'purchases','purchase_items','stock_wastage','stock_wastage_items',
    'stock_transfers','stock_transfer_items','stock_counts','stock_count_items'];
BEGIN
  FOREACH t IN ARRAY new_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON public.%I
        FOR ALL
        TO authenticated, anon
        USING (
          restaurant_id = (SELECT public.current_restaurant_id())
          OR (SELECT public.is_platform_admin())
        )
        WITH CHECK (
          restaurant_id = (SELECT public.current_restaurant_id())
          OR (SELECT public.is_platform_admin())
        )
    $f$, t);
  END LOOP;
END $do$;

-- ----------------------------------------------------------------------------
-- 14. Grants
--     The posting functions are SECURITY DEFINER, so being allowed to call one
--     is the whole permission. Signed-in staff may run them; an anonymous
--     diner JWT may not — the only stock an anon session moves is through the
--     order trigger, which runs as the definer and never as the caller.
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.default_outlet_id(uuid)                        TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.stock_summary(uuid, date, date, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_purchase(uuid)                            TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_purchase(uuid)                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_wastage(uuid)                             TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_transfer(uuid)                            TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_transfer(uuid)                         TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_stock_count(uuid, text, date, text)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_stock_count(uuid)                       TO authenticated;

-- A signed-in manager adjusting stock by hand goes through the ledger too.
CREATE OR REPLACE FUNCTION public.adjust_stock(
  p_outlet_id uuid,
  p_item_id   uuid,
  p_delta     numeric,
  p_reason    text DEFAULT 'Manual adjustment',
  p_note      text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_rest uuid := public.current_restaurant_id();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE id = p_item_id AND restaurant_id = v_rest) THEN
    RAISE EXCEPTION 'Item does not belong to this restaurant';
  END IF;
  RETURN public.post_stock_movement(
    v_rest, p_outlet_id, p_item_id, p_delta, 'adjustment', p_reason, NULL, NULL, NULL, p_note);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.adjust_stock(uuid, uuid, numeric, text, text) TO authenticated;

-- =============================================================================
-- End. Stock now has one ledger, one posting function, and a report that can
-- explain every number in it back to the movement that produced it.
-- =============================================================================
