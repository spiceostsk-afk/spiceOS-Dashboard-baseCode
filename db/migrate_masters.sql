-- =============================================================================
-- Spice OS — Masters: Auto Consumption switch
-- Run once in the Supabase SQL Editor, after db/migrate_recipes_inventory.sql
-- and db/migrate_inventory_stock.sql. Safe to re-run.
-- =============================================================================
-- Recipe depletion has always been unconditional: every order line ran the
-- dish's recipe and took its ingredients out of stock. The Recipe Management
-- screen exposes an "Auto Consumption" switch, so that has to become a
-- decision the restaurant owns.
--
-- The gate lives inside apply_recipe_stock rather than in the trigger, because
-- that function is the single door every path goes through — the KOT trigger,
-- a cancellation, a quantity change. Gating it here means the switch cannot be
-- bypassed by a code path that forgets to check.
--
-- Default is ON: absent setting behaves exactly as before, so nothing changes
-- for a restaurant that never touches the switch.
--
-- Turning it OFF stops FUTURE movements only. Stock already deducted stays
-- deducted — silently reversing history would be far worse than leaving it.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Read the switch. STABLE + SECURITY DEFINER so the diner's anon JWT can
--    reach it through the order trigger without being granted a direct read on
--    restaurant_settings.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_consumption_enabled(p_restaurant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT (s.value ->> 'auto_consumption')::boolean
       FROM public.restaurant_settings s
      WHERE s.restaurant_id = p_restaurant_id
        AND s.key = 'inventory'),
    true            -- no setting saved yet: behave as before
  )
$$;

GRANT EXECUTE ON FUNCTION public.auto_consumption_enabled(uuid) TO authenticated, anon;

-- ----------------------------------------------------------------------------
-- 2. Gate recipe depletion on it.
--    Body is otherwise identical to migrate_inventory_stock.sql's version.
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

  -- The switch. Everything downstream of here moves stock, so this is the
  -- only place it needs to be checked.
  IF NOT public.auto_consumption_enabled(p_restaurant_id) THEN
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

-- ----------------------------------------------------------------------------
-- 3. Seed the setting for every existing restaurant, so the screen shows a
--    real stored value rather than an implied default.
-- ----------------------------------------------------------------------------
INSERT INTO public.restaurant_settings (restaurant_id, key, value)
SELECT r.id, 'inventory', jsonb_build_object('auto_consumption', true)
FROM public.restaurants r
ON CONFLICT (restaurant_id, key) DO UPDATE
   SET value = public.restaurant_settings.value
             || jsonb_build_object(
                  'auto_consumption',
                  COALESCE(public.restaurant_settings.value -> 'auto_consumption',
                           'true'::jsonb));

-- =============================================================================
-- VERIFY — the only result the editor will show.
-- =============================================================================
SELECT jsonb_pretty(jsonb_build_object(
  'restaurants_with_setting', (
    SELECT count(*) FROM public.restaurant_settings WHERE key = 'inventory'),
  'auto_consumption_by_restaurant', (
    SELECT COALESCE(jsonb_object_agg(r.name, public.auto_consumption_enabled(r.id)), '{}'::jsonb)
    FROM public.restaurants r)
)) AS result;
