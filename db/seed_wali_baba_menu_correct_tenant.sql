-- =============================================================================
-- Move the Wali Baba Foods menu to the right restaurant
--
--   Wali Baba    b88e5c07-24d7-4386-8c47-e48f4cab23ee  <- gets the 63 PDF items
--   Baba Biryani c94db408-80b7-4461-8c2d-153721ed5761  <- cleared back to empty
--
-- Run in the Supabase SQL Editor. Every statement is independently safe and
-- re-runnable. The LAST statement is the verification — the editor only shows
-- the final result set, so that is the one to read and paste back.
-- =============================================================================
-- Evidence this is the right tenant: Wali Baba already held an older edition
-- of this same menu (Chicken Biryani 200, Chicken Tikka Rice 250, Chicken
-- Lollipop Rice 250, Shahi Tukda 100 ...), which the PDF replaces with newer
-- prices. The file is named "NEW WALI BABA MENU.pdf".
--
-- Per your decision: the old "Roasted" category (Chicken Chest Roasted,
-- Chicken Leg Roasted, Chicken Tangdi, Chicken Tikka Roasted, Murg Malai
-- Tikka) is REMOVED, along with everything else not on the PDF. Dishes with
-- order history cannot be deleted (order_items has no ON DELETE rule) so they
-- are marked unavailable instead, which takes them off sale while leaving past
-- orders and reports intact.
-- =============================================================================


-- =============================================================================
-- PART A — Baba Biryani: undo the wrong load
-- =============================================================================

-- A1. Remove the 63 items that were loaded here by mistake. Only dishes with
--     order history survive this, because they cannot be deleted.
DELETE FROM public.menu_items m
 WHERE m.restaurant_id = 'c94db408-80b7-4461-8c2d-153721ed5761'
   AND NOT EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.menu_item_id = m.id);

-- A2. Take the two survivors off sale, so the live menu reads empty and the
--     tenant can be rebuilt from scratch. They stay in the table because
--     deleting them would mean deleting the order lines that reference them.
UPDATE public.menu_items
   SET is_available = false
 WHERE restaurant_id = 'c94db408-80b7-4461-8c2d-153721ed5761';

-- A3. Drop categories nothing points at any more.
DELETE FROM public.menu_categories c
 WHERE c.restaurant_id = 'c94db408-80b7-4461-8c2d-153721ed5761'
   AND NOT EXISTS (SELECT 1 FROM public.menu_items m WHERE m.category_id = c.id);


-- =============================================================================
-- PART B — Wali Baba: load the new menu
-- =============================================================================

-- B1. Retire dishes that carry sales history.
UPDATE public.menu_items m
   SET is_available = false
 WHERE m.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
   AND EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.menu_item_id = m.id);

-- B2. Delete the rest of the old menu outright.
DELETE FROM public.menu_items m
 WHERE m.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
   AND NOT EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.menu_item_id = m.id);

-- B3. Drop now-empty categories (Fried, Roasted, Dessert, ...).
DELETE FROM public.menu_categories c
 WHERE c.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
   AND NOT EXISTS (SELECT 1 FROM public.menu_items m WHERE m.category_id = c.id);

-- B4. The nine categories from the PDF.
INSERT INTO public.menu_categories (restaurant_id, category_name)
VALUES
  ('b88e5c07-24d7-4386-8c47-e48f4cab23ee', 'Biryani & Rice'),
  ('b88e5c07-24d7-4386-8c47-e48f4cab23ee', 'Fry'),
  ('b88e5c07-24d7-4386-8c47-e48f4cab23ee', 'Shaan & Tandoor'),
  ('b88e5c07-24d7-4386-8c47-e48f4cab23ee', 'Kebabs'),
  ('b88e5c07-24d7-4386-8c47-e48f4cab23ee', 'Chinese'),
  ('b88e5c07-24d7-4386-8c47-e48f4cab23ee', 'Gravy'),
  ('b88e5c07-24d7-4386-8c47-e48f4cab23ee', 'Veg'),
  ('b88e5c07-24d7-4386-8c47-e48f4cab23ee', 'Breads'),
  ('b88e5c07-24d7-4386-8c47-e48f4cab23ee', 'Dessert & Beverages')
ON CONFLICT (restaurant_id, category_name) DO NOTHING;

-- B5. The 63 dishes.
INSERT INTO public.menu_items
  (restaurant_id, category_id, item_name, description, price, is_available)
SELECT 'b88e5c07-24d7-4386-8c47-e48f4cab23ee',
       c.id, v.item_name, v.description, v.price, true
FROM (VALUES
  ('Biryani & Rice',      'Chicken Biryani',            NULL,               160),
  ('Biryani & Rice',      'Chicken Tikka Rice',         NULL,               240),
  ('Biryani & Rice',      'Chicken Lollipop Rice',      NULL,               220),
  ('Biryani & Rice',      'Chicken Tangdi Rice',        NULL,               250),
  ('Biryani & Rice',      'Chicken Barra Rice',         NULL,               270),
  ('Biryani & Rice',      'Chicken Leg Rice',           NULL,               270),
  ('Biryani & Rice',      'Mutton Biryani (2 Pcs)',     '2 pieces',         250),
  ('Biryani & Rice',      'Mutton Biryani (3 Pcs)',     '3 pieces',         300),
  ('Biryani & Rice',      'Biryani Rice',               NULL,               130),
  ('Biryani & Rice',      'Zeera Rice',                 NULL,               120),
  ('Biryani & Rice',      'Steam Rice',                 NULL,               100),

  ('Fry',                 'Chicken Leg / Chest',        NULL,               140),
  ('Fry',                 'Chicken Lollipop',           '4 pieces',         180),
  ('Fry',                 'Chicken Tikka Fry',          '6 pieces',         220),
  ('Fry',                 'Crispy Chicken',             '5 pieces',         260),
  ('Fry',                 'Chicken Kaleji',             NULL,               130),

  ('Shaan & Tandoor',     'Murgh Malai Tikka',          NULL,               250),
  ('Shaan & Tandoor',     'Chicken Tikka',              NULL,               250),
  ('Shaan & Tandoor',     'Chicken Afghani Barra',      '4 pieces',         280),
  ('Shaan & Tandoor',     'Chicken Peshawari Tangdi',   '4 pieces',         220),
  ('Shaan & Tandoor',     'Chicken Aatishi',            NULL,               300),
  ('Shaan & Tandoor',     'Amritsari Chicken Chaap',    NULL,               300),
  -- The PDF prints "600/900" with no labels; Half/Full is inferred.
  ('Shaan & Tandoor',     'Chicken Sizzler (Half)',     NULL,               600),
  ('Shaan & Tandoor',     'Chicken Sizzler (Full)',     NULL,               900),
  ('Shaan & Tandoor',     'Chicken Tandoori (Full)',    'Full bird',        500),

  ('Kebabs',              'Chicken Seekh Adana Kebab',  NULL,               270),
  ('Kebabs',              'Chicken Shami Kebab',        NULL,               180),
  ('Kebabs',              'Mutton Kakori Kebab',        NULL,               340),
  ('Kebabs',              'Mutton Galawti Kebab',       NULL,               270),

  ('Chinese',             'Chilly Paneer',              'Gravy or dry',     240),
  ('Chinese',             'Chilly Chicken',             'Gravy or dry',     250),
  ('Chinese',             'Thai Sesame Chicken',        NULL,               300),

  ('Gravy',               'Butter Chicken',             'Bone or boneless', 250),
  ('Gravy',               'Chicken Stew',               'Bone or boneless', 250),
  ('Gravy',               'Chicken Korma',              'Bone or boneless', 250),
  ('Gravy',               'Chicken Peshawari Kadhai',   NULL,               280),
  ('Gravy',               'Chicken Tikka Masala',       NULL,               280),
  ('Gravy',               'Kadhai Chicken',             NULL,               280),
  ('Gravy',               'Mutton Stew (2 Pcs)',        '2 pieces',         250),
  ('Gravy',               'Mutton Stew (4 Pcs)',        '4 pieces',         450),
  ('Gravy',               'Mutton Korma (2 Pcs)',       '2 pieces',         250),
  ('Gravy',               'Mutton Korma (4 Pcs)',       '4 pieces',         450),
  ('Gravy',               'Mutton Rogan Josh (2 Pcs)',  '2 pieces',         250),
  ('Gravy',               'Mutton Rogan Josh (4 Pcs)',  '4 pieces',         450),
  ('Gravy',               'Mutton Nalli Nihari',        'Seasonal',         300),

  ('Veg',                 'Paneer Tikka Masala',        NULL,               250),
  ('Veg',                 'Paneer Makhani',             NULL,               250),
  ('Veg',                 'Kadhai Paneer',              NULL,               250),
  ('Veg',                 'Paneer Kaali Mirch',         NULL,               250),
  ('Veg',                 'Paneer Tikka',               '6 pieces',         250),
  ('Veg',                 'Paneer Malai Tikka',         '6 pieces',         250),

  ('Breads',              'Rumali Roti',                NULL,                15),
  ('Breads',              'Tandoori Roti',              NULL,                20),
  ('Breads',              'Butter Tandoori Roti',       NULL,                25),
  ('Breads',              'Lachcha Paratha',            NULL,                30),
  ('Breads',              'Plain Naan',                 NULL,                35),
  ('Breads',              'Butter Naan',                NULL,                40),
  ('Breads',              'Garlic Naan',                NULL,                45),
  ('Breads',              'Garlic Butter Naan',         NULL,                50),

  ('Dessert & Beverages', 'Lassi',                      NULL,                50),
  ('Dessert & Beverages', 'Butter Bun',                 NULL,                35),
  ('Dessert & Beverages', 'Zafrani Kheer',              NULL,                70),
  ('Dessert & Beverages', 'Shahi Tukda',                NULL,                80)
) AS v(category_name, item_name, description, price)
JOIN public.menu_categories c
  ON c.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
 AND c.category_name = v.category_name
WHERE NOT EXISTS (
  SELECT 1 FROM public.menu_items x
  WHERE x.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
    AND x.is_available
    AND lower(btrim(x.item_name)) = lower(btrim(v.item_name))
);

-- B6. Merge any retired dish whose name is also in the new menu.
--     Keeps the ORIGINAL row (the order lines already point at it) and drops
--     the fresh duplicate. One statement: data-modifying CTEs are atomic on
--     their own, and a TEMP TABLE would not survive this editor.
WITH pairs AS (
  SELECT old.id          AS old_id,
         new.id          AS new_id,
         new.category_id AS category_id,
         new.price       AS price,
         new.description AS description
  FROM public.menu_items old
  JOIN public.menu_items new
    ON  new.restaurant_id = old.restaurant_id
    AND lower(btrim(new.item_name)) = lower(btrim(old.item_name))
    AND new.id <> old.id
    AND new.is_available
    AND NOT old.is_available
  WHERE old.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
),
revived AS (
  UPDATE public.menu_items m
     SET category_id  = p.category_id,
         price        = p.price,
         description  = p.description,
         is_available = true
    FROM pairs p
   WHERE m.id = p.old_id
  RETURNING m.id
)
DELETE FROM public.menu_items m
 USING pairs p
 WHERE m.id = p.new_id;

-- B7. Clean up categories emptied by the merge.
DELETE FROM public.menu_categories c
 WHERE c.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
   AND NOT EXISTS (SELECT 1 FROM public.menu_items m WHERE m.category_id = c.id);


-- =============================================================================
-- VERIFY — the only result the editor will show. Read this.
--
--   wali_baba.live_items      should be 63
--   wali_baba.duplicate_names should be 0
--   wali_baba.categories      should be 9
--   wali_baba.still_retired   old dishes kept only for their sales history
--   baba_biryani.live_items   should be 0
-- =============================================================================
SELECT jsonb_pretty(jsonb_build_object(

  'wali_baba', jsonb_build_object(
    'live_items', (SELECT count(*) FROM public.menu_items
                    WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
                      AND is_available),
    'categories', (SELECT count(*) FROM public.menu_categories
                    WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'),
    'duplicate_names', (
      SELECT count(*) FROM (
        SELECT 1 FROM public.menu_items
        WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
        GROUP BY lower(btrim(item_name)) HAVING count(*) > 1
      ) d),
    'by_category', (
      SELECT COALESCE(jsonb_object_agg(cat, n), '{}'::jsonb) FROM (
        SELECT c.category_name AS cat, count(*) AS n
        FROM public.menu_items m
        JOIN public.menu_categories c ON c.id = m.category_id
        WHERE m.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
          AND m.is_available
        GROUP BY c.category_name
      ) s),
    'still_retired', (
      SELECT COALESCE(jsonb_agg(item_name ORDER BY item_name), '[]'::jsonb)
      FROM public.menu_items
      WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
        AND NOT is_available)
  ),

  'baba_biryani', jsonb_build_object(
    'live_items', (SELECT count(*) FROM public.menu_items
                    WHERE restaurant_id = 'c94db408-80b7-4461-8c2d-153721ed5761'
                      AND is_available),
    'kept_for_history', (
      SELECT COALESCE(jsonb_agg(item_name ORDER BY item_name), '[]'::jsonb)
      FROM public.menu_items
      WHERE restaurant_id = 'c94db408-80b7-4461-8c2d-153721ed5761'),
    'orphaned_order_lines', (
      SELECT count(*) FROM public.order_items
      WHERE restaurant_id = 'c94db408-80b7-4461-8c2d-153721ed5761'
        AND menu_item_id IS NULL)
  )

)) AS result;
