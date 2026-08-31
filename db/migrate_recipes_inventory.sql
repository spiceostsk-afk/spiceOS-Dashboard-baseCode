-- =============================================================================
-- Spice OS — Recipes & live inventory depletion
-- Run once in the Supabase SQL Editor, after db/schema.sql.
-- =============================================================================
-- Adds three tables and one trigger:
--
--   inventory_items    the raw-material roster (paneer, oil, gas...) — replaces
--                      the localStorage shim the Inventory screen used to run on.
--   stock_movements    an append-only audit of every change to that stock.
--   recipe_ingredients what one serving of a dish consumes. This is the link
--                      between a menu item and the raw materials behind it.
--
-- The trigger fires on order_items, NOT in the app, so a dish ordered from the
-- captain panel, the diner's phone or the dashboard all deplete stock the same
-- way. Deduction happens the moment the item is sent to the kitchen (KOT), and
-- cancelling or voiding the line puts the stock back.
--
-- Stock is allowed to go negative on consumption: if the kitchen served it, the
-- books should say so rather than silently floor at zero.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id            uuid NOT NULL DEFAULT uuid_generate_v4(),
  restaurant_id uuid NOT NULL DEFAULT public.current_restaurant_id()
                  REFERENCES public.restaurants(id) ON DELETE CASCADE,
  item_name     text NOT NULL,
  category      text DEFAULT 'Uncategorised',
  unit          text NOT NULL DEFAULT 'units',   -- kg, litres, pcs...
  stock         numeric NOT NULL DEFAULT 0,
  reorder_at    numeric NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  CONSTRAINT inventory_items_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_items_name_key UNIQUE (restaurant_id, item_name)
);

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id                uuid NOT NULL DEFAULT uuid_generate_v4(),
  restaurant_id     uuid NOT NULL DEFAULT public.current_restaurant_id()
                      REFERENCES public.restaurants(id) ON DELETE CASCADE,
  inventory_item_id uuid REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  item_name         text,            -- denormalised so the log survives deletion
  delta             numeric NOT NULL,
  balance_after     numeric,
  reason            text NOT NULL,
  order_item_id     uuid,            -- set when the movement came from an order
  menu_item_id      uuid REFERENCES public.menu_items(id) ON DELETE SET NULL,
  created_at        timestamptz DEFAULT now(),
  CONSTRAINT stock_movements_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.recipe_ingredients (
  id                uuid NOT NULL DEFAULT uuid_generate_v4(),
  restaurant_id     uuid NOT NULL DEFAULT public.current_restaurant_id()
                      REFERENCES public.restaurants(id) ON DELETE CASCADE,
  menu_item_id      uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  quantity          numeric NOT NULL CHECK (quantity > 0),  -- per ONE serving
  created_at        timestamptz DEFAULT now(),
  CONSTRAINT recipe_ingredients_pkey PRIMARY KEY (id),
  CONSTRAINT recipe_ingredients_unique UNIQUE (menu_item_id, inventory_item_id)
);

-- ----------------------------------------------------------------------------
-- 2. Indexes — restaurant_id leading, per the schema's RLS rule.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_inventory_items_rest ON public.inventory_items (restaurant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_stock_movements_at   ON public.stock_movements (restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON public.stock_movements (restaurant_id, inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_recipe_menu_item     ON public.recipe_ingredients (restaurant_id, menu_item_id);
CREATE INDEX IF NOT EXISTS idx_recipe_inv_item      ON public.recipe_ingredients (restaurant_id, inventory_item_id);

-- ----------------------------------------------------------------------------
-- 3. The depletion engine
--    SECURITY DEFINER: an order placed on a diner's anon JWT must be able to
--    move stock, but that JWT should never get a free hand on inventory_items
--    directly. Every statement below is scoped by p_restaurant_id, which comes
--    from the order row itself, so a caller cannot reach another tenant.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_recipe_stock(
  p_restaurant_id uuid,
  p_menu_item_id  uuid,
  p_servings      numeric,   -- signed: negative consumes, positive restores
  p_order_item_id uuid,
  p_reason        text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  ing        record;
  v_delta    numeric;
  v_balance  numeric;
BEGIN
  IF p_menu_item_id IS NULL OR p_servings = 0 THEN
    RETURN;
  END IF;

  FOR ing IN
    SELECT ri.inventory_item_id, ri.quantity, inv.item_name
    FROM public.recipe_ingredients ri
    JOIN public.inventory_items inv ON inv.id = ri.inventory_item_id
    WHERE ri.menu_item_id  = p_menu_item_id
      AND ri.restaurant_id = p_restaurant_id
      AND inv.is_active
  LOOP
    v_delta := ing.quantity * p_servings;

    UPDATE public.inventory_items
       SET stock      = stock + v_delta,
           updated_at = now()
     WHERE id = ing.inventory_item_id
       AND restaurant_id = p_restaurant_id
    RETURNING stock INTO v_balance;

    INSERT INTO public.stock_movements (
      restaurant_id, inventory_item_id, item_name, delta,
      balance_after, reason, order_item_id, menu_item_id
    ) VALUES (
      p_restaurant_id, ing.inventory_item_id, ing.item_name, v_delta,
      v_balance, p_reason, p_order_item_id, p_menu_item_id
    );
  END LOOP;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.apply_recipe_stock(uuid, uuid, numeric, uuid, text) FROM public;

-- ----------------------------------------------------------------------------
-- 4. Trigger — keeps stock in step with the order line through its whole life.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.order_items_stock_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  was_live boolean;
  is_live  boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.is_cancelled, false) THEN
      RETURN NEW;
    END IF;
    PERFORM public.apply_recipe_stock(
      NEW.restaurant_id, NEW.menu_item_id, -NEW.quantity, NEW.id, 'Order placed');
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF COALESCE(OLD.is_cancelled, false) THEN
      RETURN OLD;
    END IF;
    PERFORM public.apply_recipe_stock(
      OLD.restaurant_id, OLD.menu_item_id, OLD.quantity, OLD.id, 'Order line deleted');
    RETURN OLD;
  END IF;

  -- UPDATE: compare what the line consumed before against what it consumes now.
  was_live := NOT COALESCE(OLD.is_cancelled, false);
  is_live  := NOT COALESCE(NEW.is_cancelled, false);

  IF was_live AND NOT is_live THEN
    PERFORM public.apply_recipe_stock(
      OLD.restaurant_id, OLD.menu_item_id, OLD.quantity, OLD.id, 'Item cancelled');

  ELSIF NOT was_live AND is_live THEN
    PERFORM public.apply_recipe_stock(
      NEW.restaurant_id, NEW.menu_item_id, -NEW.quantity, NEW.id, 'Cancellation reversed');

  ELSIF was_live AND is_live THEN
    -- Still live: settle the difference (a swapped dish is a return + a fresh take).
    IF OLD.menu_item_id IS DISTINCT FROM NEW.menu_item_id THEN
      PERFORM public.apply_recipe_stock(
        OLD.restaurant_id, OLD.menu_item_id, OLD.quantity, OLD.id, 'Dish changed');
      PERFORM public.apply_recipe_stock(
        NEW.restaurant_id, NEW.menu_item_id, -NEW.quantity, NEW.id, 'Dish changed');
    ELSIF OLD.quantity IS DISTINCT FROM NEW.quantity THEN
      PERFORM public.apply_recipe_stock(
        NEW.restaurant_id, NEW.menu_item_id, OLD.quantity - NEW.quantity, NEW.id, 'Quantity changed');
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_order_items_stock_sync ON public.order_items;
CREATE TRIGGER trg_order_items_stock_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.order_items_stock_sync();

-- ----------------------------------------------------------------------------
-- 5. Stamp updated_at on every manual stock edit.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.inventory_items_touch()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_inventory_items_touch ON public.inventory_items;
CREATE TRIGGER trg_inventory_items_touch
  BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.inventory_items_touch();

-- ----------------------------------------------------------------------------
-- 6. RLS — same tenant_isolation shape as every other domain table.
-- ----------------------------------------------------------------------------
DO $do$
DECLARE
  t text;
  new_tables text[] := ARRAY['inventory_items','stock_movements','recipe_ingredients'];
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

-- =============================================================================
-- End. The Recipes screen in the dashboard writes recipe_ingredients; from then
-- on every order placed anywhere in Spice OS moves stock on its own.
-- =============================================================================
