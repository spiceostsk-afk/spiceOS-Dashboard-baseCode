-- =============================================================================
-- What is in Wali Baba's raw material master after the seed?
-- Read-only. One statement — the editor only returns the last result.
-- =============================================================================
SELECT jsonb_pretty(jsonb_build_object(

  -- The 21 that were already there. They did not come from the file, and they
  -- are inactive — worth knowing whether they are real materials that should
  -- be switched back on, or leftovers worth deleting.
  'pre_existing_inactive', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'name', i.item_name,
             'category', COALESCE(c.name, '—'),
             'unit', i.unit,
             'stock', i.stock,
             'created', i.created_at::date
           ) ORDER BY i.item_name), '[]'::jsonb)
    FROM public.inventory_items i
    LEFT JOIN public.inventory_categories c ON c.id = i.category_id
    WHERE i.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
      AND NOT i.is_active),

  -- Categories that look like duplicates of each other.
  'categories', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'name', c.name,
             'materials', (SELECT count(*) FROM public.inventory_items i
                            WHERE i.category_id = c.id)
           ) ORDER BY c.name), '[]'::jsonb)
    FROM public.inventory_categories c
    WHERE c.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'),

  -- Units, same question: the file brought its own spellings.
  'units', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'symbol', u.symbol,
             'used_by', (SELECT count(*) FROM public.inventory_items i
                          WHERE i.unit_id = u.id OR i.purchase_unit_id = u.id)
           ) ORDER BY u.symbol), '[]'::jsonb)
    FROM public.inventory_units u
    WHERE u.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'),

  -- Anything with stock on it. The seed set every new material to zero, so a
  -- non-zero balance here belongs to one of the pre-existing 21.
  'materials_with_stock', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'name', i.item_name, 'stock', i.stock, 'unit', i.unit
           ) ORDER BY i.item_name), '[]'::jsonb)
    FROM public.inventory_items i
    WHERE i.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
      AND i.stock <> 0)

)) AS result;
