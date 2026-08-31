-- =============================================================================
-- Wali Baba — drop the three leftover categories from the old menu
-- Restaurant: b88e5c07-24d7-4386-8c47-e48f4cab23ee
-- Run in the Supabase SQL Editor. Read the final result.
-- =============================================================================
-- After the menu swap, Wali Baba has 12 categories instead of 9. "Fried",
-- "Roasted" and "Dessert" survived because the nine retired dishes still point
-- at them, and a category cannot be deleted while anything references it.
--
-- Menu Catalog builds its category tabs from the category list, not from what
-- is on sale, so those three show up as empty tabs — including "Roasted",
-- which you asked to remove.
--
-- Fix: unhook the retired dishes from their category. They keep existing (the
-- order lines that reference them must not break) but they no longer hold a
-- category open. Nothing is lost: a retired dish needs no category, and past
-- orders resolve their name through menu_item_id, not through the category.
-- =============================================================================

-- 1. Detach every retired dish from its category.
UPDATE public.menu_items
   SET category_id = NULL
 WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
   AND NOT is_available;

-- 2. Drop the categories that are now unreferenced.
DELETE FROM public.menu_categories c
 WHERE c.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
   AND NOT EXISTS (
     SELECT 1 FROM public.menu_items m WHERE m.category_id = c.id);

-- ----------------------------------------------------------------------------
-- VERIFY — expect categories 9, live_items 63, and the nine retired dishes
-- still present but detached.
-- ----------------------------------------------------------------------------
SELECT jsonb_pretty(jsonb_build_object(
  'categories', (SELECT count(*) FROM public.menu_categories
                  WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'),
  'category_names', (
    SELECT COALESCE(jsonb_agg(category_name ORDER BY category_name), '[]'::jsonb)
    FROM public.menu_categories
    WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'),
  'live_items', (SELECT count(*) FROM public.menu_items
                  WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
                    AND is_available),
  'retired_kept_for_history', (SELECT count(*) FROM public.menu_items
                  WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
                    AND NOT is_available),
  'order_lines_still_resolving', (
    SELECT count(*) FROM public.order_items oi
    JOIN public.menu_items m ON m.id = oi.menu_item_id
    WHERE oi.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'),
  'orphaned_order_lines', (
    SELECT count(*) FROM public.order_items
    WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
      AND menu_item_id IS NULL)
)) AS result;
