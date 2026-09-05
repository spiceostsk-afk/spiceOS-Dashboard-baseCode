-- =============================================================================
-- Spice OS — delete the "Semi Finish" duplicates
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- =============================================================================
-- WHAT THIS IS
--
-- There are two categories a keystroke apart: "Semi Finished", which is the
-- real one and holds the live materials, and "Semi Finish", which holds 22
-- duplicates created by mistake. Twenty of them are already deactivated. They
-- are invisible on the Raw Materials screen and in Stock Summary, which both
-- filter on is_active, but they still carry -105.46 on the books and still
-- appear on every count sheet.
--
-- Checked before writing this — none of them is referenced by anything that
-- matters:
--
--     recipes                 0
--     purchase lines          0
--     wastage lines           0
--     transfer lines          0
--     production lines        0
--     counted in a submitted count   0
--
-- So nothing depends on them and no counted figure is lost.
--
-- WHAT IS PERMANENTLY DELETED
--
-- The 21 items below, and by ON DELETE CASCADE their 61 stock movements, their
-- inventory_stock balances and their blank stock-count lines. This is not a
-- deactivation — the rows are gone and cannot be brought back. Total stock
-- rises by 105.46 as the phantom negatives go with them.
--
-- THE ONE THAT IS NOT DELETED
--
-- "Gulab Jamun" is in the wrong category but it is NOT a duplicate — there is
-- no other Gulab Jamun anywhere, it is active, and it sits on 13 count sheets.
-- Deleting it would throw away a real dessert because it was filed in the
-- wrong drawer, so it is MOVED to "Semi Finished" instead.
--
-- "Coal" IS deleted: "Koyla ( Coal )" already exists under "Semi Finished".
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. LOOK FIRST — exactly what will go, before anything goes.
-- ----------------------------------------------------------------------------
SELECT jsonb_pretty(jsonb_build_object(
  'will_delete', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'item', i.item_name, 'active', i.is_active,
             'balance', COALESCE(s.qty, 0),
             'movements', (SELECT count(*) FROM public.stock_movements m
                            WHERE m.inventory_item_id = i.id)
           ) ORDER BY i.item_name), '[]'::jsonb)
    FROM public.inventory_items i
    LEFT JOIN public.inventory_stock s ON s.inventory_item_id = i.id
    WHERE i.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
      AND COALESCE((SELECT c.name FROM public.inventory_categories c
                     WHERE c.id = i.category_id), i.category) = 'Semi Finish'
      AND i.item_name <> 'Gulab Jamun'),
  'will_move_instead', 'Gulab Jamun',
  'stock_that_disappears', (
    SELECT COALESCE(SUM(s.qty), 0) FROM public.inventory_stock s
    JOIN public.inventory_items i ON i.id = s.inventory_item_id
    WHERE i.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
      AND COALESCE((SELECT c.name FROM public.inventory_categories c
                     WHERE c.id = i.category_id), i.category) = 'Semi Finish'
      AND i.item_name <> 'Gulab Jamun')
)) AS before_state;


-- ----------------------------------------------------------------------------
-- 2. THE REMOVAL
--
--    In a function because the SQL Editor commits each statement on its own: a
--    bare script that failed halfway would leave the job half done. A function
--    body is one transaction.
--
--    It refuses to run if anything has since come to depend on these items,
--    rather than letting a RESTRICT foreign key fail it mid-way.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remove_semi_finish_duplicates()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_rest    uuid := 'b88e5c07-24d7-4386-8c47-e48f4cab23ee';
  v_ids     uuid[];
  v_real    uuid;
  v_blocked integer;
  v_moved   integer := 0;
  v_stock   numeric;
  n_items   integer := 0;
  n_moves   integer := 0;
BEGIN
  SELECT array_agg(i.id) INTO v_ids
  FROM public.inventory_items i
  WHERE i.restaurant_id = v_rest
    AND COALESCE((SELECT c.name FROM public.inventory_categories c
                   WHERE c.id = i.category_id), i.category) = 'Semi Finish'
    AND i.item_name <> 'Gulab Jamun';

  IF v_ids IS NULL THEN
    RETURN jsonb_build_object('status', 'nothing to do — already removed');
  END IF;

  -- Anything that would block the delete, or that would make it a bad idea.
  SELECT (SELECT count(*) FROM public.purchase_items       WHERE inventory_item_id = ANY(v_ids))
       + (SELECT count(*) FROM public.stock_wastage_items  WHERE inventory_item_id = ANY(v_ids))
       + (SELECT count(*) FROM public.stock_transfer_items WHERE inventory_item_id = ANY(v_ids))
       + (SELECT count(*) FROM public.production_items     WHERE inventory_item_id = ANY(v_ids))
       + (SELECT count(*) FROM public.recipe_ingredients   WHERE inventory_item_id = ANY(v_ids))
       + (SELECT count(*) FROM public.stock_count_items ci
            JOIN public.stock_counts sc ON sc.id = ci.count_id
           WHERE ci.inventory_item_id = ANY(v_ids)
             AND ci.physical_qty IS NOT NULL AND sc.status = 'submitted')
    INTO v_blocked;

  IF v_blocked > 0 THEN
    RAISE EXCEPTION
      'Something now depends on these items (% references). Nothing deleted.', v_blocked;
  END IF;

  SELECT COALESCE(SUM(qty), 0) INTO v_stock
  FROM public.inventory_stock WHERE inventory_item_id = ANY(v_ids);

  SELECT count(*) INTO n_moves
  FROM public.stock_movements WHERE inventory_item_id = ANY(v_ids);

  -- Gulab Jamun is misfiled, not duplicated. Move it to the real category.
  SELECT id INTO v_real FROM public.inventory_categories
  WHERE restaurant_id = v_rest AND name = 'Semi Finished' LIMIT 1;

  IF v_real IS NOT NULL THEN
    UPDATE public.inventory_items
       SET category_id = v_real, category = 'Semi Finished', updated_at = now()
     WHERE restaurant_id = v_rest AND item_name = 'Gulab Jamun'
       AND COALESCE((SELECT c.name FROM public.inventory_categories c
                      WHERE c.id = category_id), category) = 'Semi Finish';
    GET DIAGNOSTICS v_moved = ROW_COUNT;
  END IF;

  -- stock_movements, inventory_stock, recipe_ingredients and stock_count_items
  -- all cascade from here.
  DELETE FROM public.inventory_items WHERE id = ANY(v_ids);
  GET DIAGNOSTICS n_items = ROW_COUNT;

  -- The category itself is a mistake too, once it is empty.
  DELETE FROM public.inventory_categories
   WHERE restaurant_id = v_rest AND name = 'Semi Finish'
     AND NOT EXISTS (SELECT 1 FROM public.inventory_items i
                      WHERE i.category_id = inventory_categories.id);

  RETURN jsonb_build_object(
    'items_deleted',        n_items,
    'movements_deleted',    n_moves,
    'gulab_jamun_moved',    v_moved,
    'phantom_stock_removed', -v_stock,
    'category_removed',     NOT EXISTS (SELECT 1 FROM public.inventory_categories
                                         WHERE restaurant_id = v_rest AND name = 'Semi Finish'));
END;
$fn$;

SELECT jsonb_pretty(public.remove_semi_finish_duplicates()) AS removal;


-- =============================================================================
-- VERIFY — no Semi Finish items or category left, and the negatives that came
-- from them are gone. Expect semi_finish_items 0 and a smaller negative_items.
-- =============================================================================
SELECT jsonb_pretty(jsonb_build_object(
  'semi_finish_items', (
    SELECT count(*) FROM public.inventory_items i
    WHERE i.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
      AND COALESCE((SELECT c.name FROM public.inventory_categories c
                     WHERE c.id = i.category_id), i.category) = 'Semi Finish'),
  'semi_finish_category_left', (
    SELECT count(*) FROM public.inventory_categories
    WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee' AND name = 'Semi Finish'),
  'gulab_jamun_now_in', (
    SELECT COALESCE((SELECT c.name FROM public.inventory_categories c WHERE c.id = i.category_id),
                    i.category, '—')
    FROM public.inventory_items i
    WHERE i.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
      AND i.item_name = 'Gulab Jamun'),
  'negative_items', (
    SELECT count(*) FROM public.inventory_stock s
    JOIN public.inventory_items i ON i.id = s.inventory_item_id
    WHERE i.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee' AND s.qty < 0),
  'total_stock', (
    SELECT COALESCE(SUM(stock), 0) FROM public.inventory_items
    WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee')
)) AS after_state;
