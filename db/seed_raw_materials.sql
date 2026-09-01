-- =============================================================================
-- Seed raw materials from RawMaterial_Report_2026_08_31 (Baba Foods SOUTHX)
-- 200 materials, 6 categories, 8 units.
-- Run in the Supabase SQL Editor. Read the final result.
-- =============================================================================
-- BEFORE RUNNING: replace every b88e5c07-24d7-4386-8c47-e48f4cab23ee with the target restaurant's
-- id (Find & Replace All). A temp view would have held it in one place, but
-- temp objects do not survive this editor, which commits each statement
-- separately.
--
--   Wali Baba     b88e5c07-24d7-4386-8c47-e48f4cab23ee
--   Baba Biryani  c94db408-80b7-4461-8c2d-153721ed5761
--
-- What the source file does and does not carry:
--   * No stock quantities. This is a master export, so every material lands
--     with zero stock. Load balances afterwards via Opening Stock or a count,
--     so they arrive on the ledger with a reason attached.
--   * No prices (every Purchase Price is 0), so last_purchase_rate stays null
--     and stock valuation reads zero until the first purchase is entered.
--   * Every Conversion Qty is 0, which is not a usable factor — they are set
--     to 1 here. Three materials have a purchase unit that differs from their
--     consumption unit and will need a real factor typing in:
--     Bread Crumbs, Tandoori Masala, Zeera Powder.
--
-- Re-running updates existing materials by name rather than duplicating them.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Units the file uses that the master does not have yet
-- ----------------------------------------------------------------------------
INSERT INTO public.inventory_units (restaurant_id, symbol, name)
SELECT 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'::uuid, v.symbol, v.symbol
FROM (VALUES

  ('Dish'),
  ('GM'),
  ('Kg'),
  ('Ltr.'),
  ('Mtr'),
  ('Piece'),
  ('Pkts'),
  ('plate')
) AS v(symbol)
ON CONFLICT (restaurant_id, symbol) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. Categories
-- ----------------------------------------------------------------------------
INSERT INTO public.inventory_categories (restaurant_id, name)
SELECT 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'::uuid, v.name
FROM (VALUES

  ('Beverages'),
  ('Disposals'),
  ('Raw Materials'),
  ('Semi Finished'),
  ('Uncategorised'),
  ('Vegetables')
) AS v(name)
ON CONFLICT (restaurant_id, name) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. The 200 raw materials
-- ----------------------------------------------------------------------------
INSERT INTO public.inventory_items (
  restaurant_id, item_name, category, category_id, unit, purchase_unit,
  conversion_factor, barcode, is_favourite, stock_cycle, is_active,
  stock, reorder_at, item_type
)
SELECT 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'::uuid,
       v.item_name, v.category_name, c.id, v.unit, v.purchase_unit,
       v.conversion, v.barcode, v.favourite, v.cycle, v.active,
       0, 0,
       CASE WHEN lower(v.category_name) LIKE '%semi%' THEN 'semi_finished' ELSE 'raw' END
FROM (VALUES

  ('Khada Sauf', 'Uncategorised', 'Kg', 'Kg', 1, NULL, false, 'daily', true),
  ('Pasta Masa', 'Uncategorised', 'Dish', 'Dish', 1, NULL, false, 'daily', true),
  ('Gulab Jamun', 'Raw Materials', 'Piece', 'Piece', 1, 'gulab jamun', false, 'daily', true),
  ('Papad', 'Raw Materials', 'Piece', 'Piece', 1, 'papad', false, 'daily', true),
  ('Soya Chaap Stick', 'Semi Finished', 'Piece', 'Piece', 1, 'soya chaap stick', false, 'daily', true),
  ('Hariyali Kebab', 'Semi Finished', 'Kg', 'Kg', 1, 'hariyali kebab', false, 'daily', true),
  ('Veg Kebab', 'Semi Finished', 'Kg', 'Kg', 1, 'veg kebab', false, 'daily', true),
  ('Biryani Box Lid', 'Uncategorised', 'Dish', 'Dish', 1, NULL, false, 'daily', true),
  ('Simla Mirch', 'Uncategorised', 'Dish', 'Dish', 1, NULL, false, 'daily', true),
  ('Nihari', 'Semi Finished', 'Kg', 'Kg', 1, 'nihari', false, 'daily', true),
  ('Fried Fish ( Half )', 'Semi Finished', 'Piece', 'Piece', 1, 'fried fish ( half )', false, 'daily', true),
  ('Campa Can', 'Beverages', 'Piece', 'Piece', 1, 'campa can', false, 'daily', true),
  ('Cutting', 'Uncategorised', 'Dish', 'Dish', 1, NULL, false, 'daily', true),
  ('Schezwan Sauce', 'Raw Materials', 'Kg', 'Kg', 1, 'schezwan sauce', false, 'daily', true),
  ('Baking Powder', 'Raw Materials', 'Kg', 'Kg', 1, 'baking powder', false, 'daily', true),
  ('Fish', 'Semi Finished', 'Piece', 'Piece', 1, 'fish', false, 'daily', true),
  ('Shimla', 'Uncategorised', 'Dish', 'Dish', 1, NULL, false, 'daily', true),
  ('Coal', 'Uncategorised', 'Dish', 'Dish', 1, NULL, false, 'daily', true),
  ('Tandoori', 'Uncategorised', 'Dish', 'Dish', 1, NULL, false, 'daily', true),
  ('Tandoori Masala', 'Raw Materials', 'GM', 'Kg', 1, 'tandoori masala', false, 'daily', true),
  ('Seekh', 'Uncategorised', 'Dish', 'Dish', 1, NULL, false, 'daily', true),
  ('Khada Dhaniya', 'Raw Materials', 'Kg', 'Kg', 1, 'khada dhaniya', false, 'daily', true),
  ('Daal', 'Raw Materials', 'Kg', 'Kg', 1, 'daal', false, 'daily', true),
  ('Khada Mircha', 'Raw Materials', 'Kg', 'Kg', 1, 'khada mircha', false, 'daily', true),
  ('Bread Crumbs', 'Raw Materials', 'GM', 'Kg', 1000.0, 'bread crumbs', false, 'daily', true),
  ('Malai', 'Raw Materials', 'Kg', 'Kg', 1, 'malai', false, 'daily', true),
  ('Maghaj', 'Raw Materials', 'Kg', 'Kg', 1, 'maghaj', false, 'daily', true),
  ('Chirounji', 'Raw Materials', 'Kg', 'Kg', 1, 'chirounji', false, 'daily', true),
  ('Khaskhas', 'Raw Materials', 'Kg', 'Kg', 1, 'khaskhas', false, 'daily', true),
  ('Chicken Tandoori Half', 'Semi Finished', 'Piece', 'Piece', 1, 'chicken tandoori hal', false, 'daily', true),
  ('Zaffran', 'Raw Materials', 'GM', 'GM', 1, 'zaffran', false, 'daily', true),
  ('Kaala Namak (black Salt)', 'Raw Materials', 'Kg', 'Kg', 1, 'kaala namak (black s', false, 'daily', true),
  ('Marination', 'Raw Materials', 'Kg', 'Kg', 1, 'marination', false, 'daily', true),
  ('Zeera', 'Raw Materials', 'Kg', 'Kg', 1, 'zeera', false, 'daily', true),
  ('White Pepper Powder', 'Raw Materials', 'Kg', 'Kg', 1, 'white pepper powder', false, 'daily', true),
  ('Soya Sauce', 'Raw Materials', 'Kg', 'Kg', 1, 'soya sauce', false, 'daily', true),
  ('Mint', 'Raw Materials', 'Kg', 'Kg', 1, 'mint', false, 'daily', true),
  ('Mouth Freshner Loose', 'Raw Materials', 'Kg', 'Kg', 1, 'mouth freshner loose', false, 'daily', true),
  ('Meat Masala', 'Raw Materials', 'Kg', 'Kg', 1, 'meat masala', false, 'daily', true),
  ('Laal Mirch Powder', 'Raw Materials', 'Kg', 'Kg', 1, 'laal mirch powder', false, 'daily', true),
  ('Kaju Whole', 'Raw Materials', 'Kg', 'Kg', 1, 'kaju whole', false, 'daily', true),
  ('Javitri', 'Raw Materials', 'Kg', 'Kg', 1, 'javitri', false, 'daily', true),
  ('Jaifal', 'Raw Materials', 'Kg', 'Kg', 1, 'jaifal', false, 'daily', true),
  ('Honey', 'Raw Materials', 'Kg', 'Kg', 1, 'honey', false, 'daily', true),
  ('Gravy Bowl Lid', 'Raw Materials', 'Piece', 'Piece', 1, 'gravy bowl lid', false, 'daily', true),
  ('Adrak Lehsun (ginger & Garlic) Paste', 'Raw Materials', 'Kg', 'Kg', 1, 'adrak lehsun (ginger', false, 'daily', true),
  ('Garam Masala', 'Raw Materials', 'Kg', 'Kg', 1, 'garam masala', false, 'daily', true),
  ('Dalcheeni', 'Raw Materials', 'Kg', 'Kg', 1, 'dalcheeni', false, 'daily', true),
  ('Coffee Powder', 'Raw Materials', 'Kg', 'Kg', 1, 'coffee powder', false, 'daily', true),
  ('Chilly Sauce', 'Raw Materials', 'Kg', 'Kg', 1, 'chilly sauce', false, 'daily', true),
  ('Cheese Block', 'Raw Materials', 'Kg', 'Kg', 1, 'cheese block', false, 'daily', true),
  ('Ajinomotto', 'Raw Materials', 'Kg', 'Kg', 1, 'ajinomotto', false, 'daily', true),
  ('Aata (flour)', 'Raw Materials', 'Kg', 'Kg', 1, 'aata (flour)', false, 'daily', true),
  ('Potato', 'Raw Materials', 'Kg', 'Kg', 1, 'potato', false, 'daily', true),
  ('Peanuts', 'Raw Materials', 'Kg', 'Kg', 1, 'peanuts', false, 'daily', true),
  ('Raddish', 'Raw Materials', 'Piece', 'Piece', 1, 'raddish', false, 'daily', true),
  ('Kheera', 'Raw Materials', 'Piece', 'Piece', 1, 'kheera', false, 'daily', true),
  ('Beetroot', 'Raw Materials', 'Kg', 'Kg', 1, 'beetroot', false, 'daily', true),
  ('Bandha (cabbage)', 'Raw Materials', 'Piece', 'Piece', 1, 'bandha (cabbage)', false, 'daily', true),
  ('Prawns Masala', 'Raw Materials', 'Kg', 'Kg', 1, 'prawns masala', false, 'daily', true),
  ('Chicken Patty', 'Raw Materials', 'Kg', 'Kg', 1, NULL, false, 'daily', true),
  ('Water [250 Ml]', 'Beverages', 'Piece', 'Piece', 1, 'water [250 ml]', false, 'daily', true),
  ('Tegan Fish', 'Semi Finished', 'Piece', 'Piece', 1, 'tegan fish', false, 'daily', true),
  ('Red Bull', 'Beverages', 'Piece', 'Piece', 1, 'red bull', false, 'daily', true),
  ('Lassi', 'Beverages', 'Piece', 'Piece', 1, 'lassi', false, 'daily', true),
  ('Kheer', 'Semi Finished', 'Piece', 'Piece', 1, NULL, false, 'daily', true),
  ('Shahi Tukda', 'Semi Finished', 'Piece', 'Piece', 1, NULL, true, 'daily', true),
  ('Bun', 'Semi Finished', 'Piece', 'Piece', 1, NULL, false, 'daily', true),
  ('Dhaniya Powder', 'Raw Materials', 'Kg', 'Kg', 1, NULL, false, 'daily', true),
  ('Ajwain', 'Raw Materials', 'Kg', 'Kg', 1, NULL, false, 'daily', true),
  ('Wooden Disposable Spoon Big', 'Raw Materials', 'Piece', 'Piece', 1, NULL, false, 'daily', true),
  ('Vinegar', 'Raw Materials', 'Ltr.', 'Ltr.', 1, NULL, false, 'daily', true),
  ('Kitchen King', 'Raw Materials', 'Kg', 'Kg', 1, NULL, false, 'daily', true),
  ('Biryani Masala', 'Semi Finished', 'Kg', 'Kg', 1, NULL, false, 'daily', true),
  ('Biryani Packing Roll', 'Raw Materials', 'Kg', 'Kg', 1, NULL, false, 'daily', true),
  ('Biryani Box', 'Raw Materials', 'Piece', 'Piece', 1, NULL, false, 'daily', true),
  ('Chaat Masala', 'Raw Materials', 'Kg', 'Kg', 1, NULL, false, 'daily', true),
  ('Cling Wrap', 'Raw Materials', 'Piece', 'Piece', 1, NULL, false, 'daily', true),
  ('Coriander ( Dhaniya)', 'Raw Materials', 'Kg', 'Kg', 1, NULL, false, 'daily', true),
  ('Corn Flour', 'Raw Materials', 'Kg', 'Kg', 1, NULL, false, 'daily', true),
  ('Curd', 'Raw Materials', 'Kg', 'Kg', 1, NULL, false, 'daily', true),
  ('Deggi Mirch', 'Raw Materials', 'Kg', 'Kg', 1, NULL, false, 'daily', true),
  ('Duster Large', 'Raw Materials', 'Piece', 'Piece', 1, NULL, false, 'daily', true),
  ('Egg', 'Raw Materials', 'Piece', 'Piece', 1, NULL, false, 'daily', true),
  ('Gau Marka Rang', 'Raw Materials', 'Kg', 'Kg', 1, NULL, false, 'daily', true),
  ('Kaali Mirch Powder', 'Raw Materials', 'Kg', 'Kg', 1, NULL, false, 'daily', true),
  ('Kasuri Methi', 'Raw Materials', 'Kg', 'Kg', 1, NULL, false, 'daily', true),
  ('Katha', 'Raw Materials', 'Piece', 'Piece', 1, NULL, false, 'daily', true),
  ('Khada Masala', 'Semi Finished', 'Kg', 'Kg', 1, NULL, false, 'daily', true),
  ('Khada Namak', 'Raw Materials', 'Kg', 'Kg', 1, NULL, false, 'daily', true),
  ('Leg Masala', 'Raw Materials', 'Kg', 'Kg', 1, NULL, false, 'daily', true),
  ('Markeen', 'Raw Materials', 'Mtr', 'Mtr', 1, NULL, false, 'daily', true),
  ('Milk', 'Raw Materials', 'Ltr.', 'Ltr.', 1, NULL, false, 'daily', true),
  ('Mustard Oil', 'Raw Materials', 'Ltr.', 'Ltr.', 1, NULL, false, 'daily', true),
  ('Pisa Namak ( Salt )', 'Raw Materials', 'Kg', 'Kg', 1, 'pisa namak ( salt )', false, 'daily', true),
  ('Paper Plates Medium', 'Raw Materials', 'Piece', 'Piece', 1, NULL, false, 'daily', true),
  ('Printer Roll', 'Raw Materials', 'Piece', 'Piece', 1, NULL, false, 'daily', true),
  ('Raita & Chutney Cup', 'Raw Materials', 'Piece', 'Piece', 1, NULL, false, 'daily', true),
  ('Red Bush Colour', 'Raw Materials', 'Kg', 'Kg', 1, NULL, false, 'daily', true),
  ('Refined Soyabean Oil', 'Raw Materials', 'Ltr.', 'Ltr.', 1, NULL, false, 'daily', true),
  ('Rumali Roti', 'Semi Finished', 'Piece', 'Piece', 1, NULL, true, 'daily', true),
  ('Scotch Brite', 'Raw Materials', 'Piece', 'Piece', 1, NULL, false, 'daily', true),
  ('Tea Cup', 'Disposals', 'Piece', 'Piece', 1, NULL, false, 'daily', true),
  ('Tej Patta', 'Raw Materials', 'Kg', 'Kg', 1, NULL, false, 'daily', true),
  ('Tissue Paper', 'Raw Materials', 'Pkts', 'Pkts', 1, NULL, false, 'daily', true),
  ('Toothpick', 'Raw Materials', 'Pkts', 'Pkts', 1, NULL, false, 'daily', true),
  ('Paper Plates Small', 'Raw Materials', 'Piece', 'Piece', 1, NULL, false, 'daily', true),
  ('Fork', 'Raw Materials', 'Piece', 'Piece', 1, NULL, false, 'daily', true),
  ('Can Big', 'Beverages', 'Piece', 'Piece', 1, NULL, false, 'daily', true),
  ('Can Mini', 'Beverages', 'Piece', 'Piece', 1, NULL, false, 'daily', true),
  ('Shower Cap', 'Disposals', 'Piece', 'Piece', 1, 'shower cap', false, 'daily', true),
  ('Hand Gloves', 'Raw Materials', 'Piece', 'Piece', 1, 'hand gloves', false, 'daily', true),
  ('Lehsun', 'Vegetables', 'Kg', 'Kg', 1, 'lehsun', false, 'daily', true),
  ('Adrak', 'Raw Materials', 'Kg', 'Kg', 1, 'adrak', false, 'daily', true),
  ('Shimla Mirch', 'Raw Materials', 'Kg', 'Kg', 1, 'shimla mirch', false, 'daily', true),
  ('Matar', 'Raw Materials', 'Kg', 'Kg', 1, 'matar', false, 'daily', true),
  ('Biryani Plates', 'Raw Materials', 'Piece', 'Piece', 1, NULL, false, 'daily', true),
  ('Cloth Carry Bag Big', 'Raw Materials', 'Kg', 'Kg', 1, NULL, false, 'daily', true),
  ('Cloth Carry Bag Small', 'Raw Materials', 'Kg', 'Kg', 1, NULL, false, 'daily', true),
  ('Water (500ml)', 'Beverages', 'Piece', 'Piece', 1, 'water (500ml)', false, 'daily', true),
  ('Wet Tissue', 'Raw Materials', 'Piece', 'Piece', 1, NULL, false, 'daily', true),
  ('Raita Packing Bag', 'Raw Materials', 'Kg', 'Kg', 1, NULL, false, 'daily', true),
  ('Shami Kebab', 'Semi Finished', 'Kg', 'Kg', 1, NULL, false, 'daily', true),
  ('Seek Kebab', 'Semi Finished', 'Piece', 'Piece', 1, NULL, true, 'daily', true),
  ('Prawns', 'Semi Finished', 'Piece', 'Piece', 1, NULL, false, 'daily', true),
  ('Butter Gravy', 'Semi Finished', 'Kg', 'Kg', 1, NULL, true, 'daily', true),
  ('Korma Gravy', 'Semi Finished', 'Kg', 'Kg', 1, NULL, true, 'daily', true),
  ('Tikka Roasted', 'Semi Finished', 'Piece', 'Piece', 1, NULL, false, 'daily', true),
  ('Chicken Aatishi', 'Semi Finished', 'Piece', 'Piece', 1, NULL, false, 'daily', true),
  ('Tandoori Murga', 'Semi Finished', 'Piece', 'Piece', 1, 'tandoori murga', true, 'daily', true),
  ('Tangdi', 'Semi Finished', 'Piece', 'Piece', 1, NULL, false, 'daily', true),
  ('Leg/chest', 'Semi Finished', 'Piece', 'Piece', 1, NULL, false, 'daily', true),
  ('Barra', 'Semi Finished', 'Piece', 'Piece', 1, NULL, true, 'daily', true),
  ('Fry Tikka', 'Semi Finished', 'Piece', 'Piece', 1, NULL, true, 'daily', true),
  ('Lollipop', 'Semi Finished', 'Piece', 'Piece', 1, NULL, true, 'daily', true),
  ('Malai Tikka', 'Semi Finished', 'Piece', 'Piece', 1, NULL, true, 'daily', true),
  ('Mutton Cooked', 'Semi Finished', 'Piece', 'Piece', 1, NULL, true, 'daily', true),
  ('Chest Boneless', 'Semi Finished', 'Kg', 'Kg', 1, NULL, false, 'daily', true),
  ('Haldi Powder', 'Raw Materials', 'Kg', 'Kg', 1, NULL, false, 'daily', true),
  ('Yellow Chilly (peela Mirch) Powder', 'Raw Materials', 'Kg', 'Kg', 1, 'yellow chilly (peela', false, 'daily', true),
  ('Paper Carry Bag Large', 'Raw Materials', 'Kg', 'Kg', 1, NULL, false, 'daily', true),
  ('Mouth Freshner Scht', 'Raw Materials', 'Piece', 'Piece', 1, NULL, false, 'daily', true),
  ('Tomato', 'Raw Materials', 'Kg', 'Kg', 1, NULL, false, 'daily', true),
  ('Gobhi ( Cauliflower )', 'Raw Materials', 'Piece', 'Piece', 1, NULL, false, 'daily', true),
  ('Beans', 'Raw Materials', 'Kg', 'Kg', 1, NULL, false, 'daily', true),
  ('Carrot', 'Raw Materials', 'Kg', 'Kg', 1, NULL, false, 'daily', true),
  ('Kheer Lid', 'Raw Materials', 'Piece', 'Piece', 1, NULL, false, 'daily', true),
  ('Lpg', 'Raw Materials', 'Piece', 'Piece', 1, 'lpg', false, 'daily', true),
  ('Kheer Bowl', 'Raw Materials', 'Piece', 'Piece', 1, NULL, false, 'daily', true),
  ('Koyla ( Coal )', 'Semi Finished', 'Kg', 'Kg', 1, NULL, false, 'daily', true),
  ('Onion', 'Semi Finished', 'Kg', 'Kg', 1, NULL, true, 'daily', true),
  ('Lemon', 'Semi Finished', 'Piece', 'Piece', 1, NULL, false, 'daily', true),
  ('Cream', 'Semi Finished', 'Ltr.', 'Ltr.', 1, NULL, false, 'daily', true),
  ('Silver Foil', 'Raw Materials', 'Piece', 'Piece', 1, NULL, false, 'daily', true),
  ('Silver Bag Small', 'Raw Materials', 'Kg', 'Kg', 1, NULL, false, 'daily', true),
  ('Silver Bag Big', 'Raw Materials', 'Kg', 'Kg', 1, NULL, false, 'daily', true),
  ('Butter', 'Semi Finished', 'Kg', 'Kg', 1, NULL, false, 'daily', true),
  ('Aata Dough', 'Semi Finished', 'Kg', 'Kg', 1, NULL, false, 'daily', true),
  ('Desi Ghee', 'Semi Finished', 'Kg', 'Kg', 1, NULL, false, 'daily', true),
  ('Akhni Ghee', 'Semi Finished', 'Kg', 'Kg', 1, NULL, false, 'daily', true),
  ('Raita', 'Semi Finished', 'Kg', 'Kg', 1, NULL, true, 'daily', true),
  ('Chutney', 'Semi Finished', 'Kg', 'Kg', 1, NULL, false, 'daily', true),
  ('Green Chilly ( Hari Mirch )', 'Raw Materials', 'Kg', 'Kg', 1, NULL, false, 'daily', true),
  ('Water 1 Ltr', 'Beverages', 'Piece', 'Piece', 1, NULL, false, 'daily', true),
  ('Water 1ltr ( Liquid )', 'Beverages', 'Piece', 'Piece', 1, NULL, false, 'daily', true),
  ('Gravy Bowl 250 Ml', 'Raw Materials', 'Piece', 'Piece', 1, NULL, false, 'daily', true),
  ('Garbage Bag Large', 'Raw Materials', 'Kg', 'Kg', 1, NULL, false, 'daily', true),
  ('Fat', 'Raw Materials', 'Kg', 'Kg', 1, NULL, false, 'daily', true),
  ('Pet Medium', 'Beverages', 'Piece', 'Piece', 1, NULL, false, 'daily', true),
  ('Mini Pet', 'Beverages', 'Piece', 'Piece', 1, NULL, false, 'daily', true),
  ('Pet Bottle', 'Beverages', 'Piece', 'Piece', 1, NULL, false, 'daily', true),
  ('Disposable Spoon', 'Raw Materials', 'Piece', 'Piece', 1, NULL, false, 'daily', true),
  ('Disposable Glass', 'Raw Materials', 'Pkts', 'Pkts', 1, NULL, false, 'daily', true),
  ('Disposable Caps', 'Raw Materials', 'Piece', 'Piece', 1, NULL, false, 'daily', true),
  ('Rice', 'Semi Finished', 'Kg', 'Kg', 1, NULL, true, 'daily', true),
  ('Kaleji', 'Semi Finished', 'plate', 'plate', 1, NULL, false, 'daily', true),
  ('Akhni Chicken Boti', 'Semi Finished', 'Piece', 'Piece', 1, NULL, true, 'daily', true),
  ('Paneer', 'Semi Finished', 'Kg', 'Kg', 1, NULL, true, 'daily', true),
  ('Maida', 'Raw Materials', 'Kg', 'Kg', 1, 'maida', false, 'daily', true),
  ('Gravy Panni', 'Raw Materials', 'Kg', 'Kg', 1, 'gravy panni', false, 'daily', true),
  ('Hara Rang', 'Raw Materials', 'Kg', 'Kg', 1, 'hara rang', false, 'daily', true),
  ('Kewda', 'Raw Materials', 'Kg', 'Kg', 1, 'kewda', false, 'daily', true),
  ('Jeera', 'Raw Materials', 'Kg', 'Kg', 1, 'jeera', false, 'daily', true),
  ('White Till', 'Raw Materials', 'Kg', 'Kg', 1, 'white till', false, 'daily', true),
  ('Sugar', 'Raw Materials', 'Kg', 'Kg', 1, 'sugar', false, 'daily', true),
  ('Tomato Ketchup', 'Raw Materials', 'Kg', 'Kg', 1, 'tomato ketchup', false, 'daily', true),
  ('Mayonnaise', 'Raw Materials', 'Kg', 'Kg', 1, 'mayonnaise', false, 'daily', true),
  ('Stew Gravy', 'Semi Finished', 'Kg', 'Kg', 1, NULL, false, 'daily', true),
  ('Biryani Lid', 'Raw Materials', 'Piece', 'Piece', 1, 'biryani lid', false, 'daily', true),
  ('Fennal ( Saunf )', 'Raw Materials', 'Kg', 'Kg', 1, 'fennal ( saunf )', false, 'daily', true),
  ('Red Chilly', 'Raw Materials', 'Kg', 'Kg', 1, 'red chilly', false, 'daily', true),
  ('Green Chilli Souce', 'Raw Materials', 'Kg', 'Kg', 1, 'green chilli souce', false, 'daily', true),
  ('Garbage Bag Small', 'Raw Materials', 'Kg', 'Kg', 1, 'garbage bag small', false, 'daily', true),
  ('Pisi Khatai', 'Raw Materials', 'Kg', 'Kg', 1, 'pisi khatai', false, 'daily', true),
  ('Heeng', 'Raw Materials', 'Kg', 'Kg', 1, 'heeng', false, 'daily', true),
  ('Wooden Disposable Spoon Small', 'Raw Materials', 'Piece', 'Piece', 1, 'wooden disposable sp', false, 'daily', true),
  ('Gravy Packing Roll', 'Raw Materials', 'Kg', 'Kg', 1, NULL, false, 'daily', true),
  ('Cheese', 'Raw Materials', 'Kg', 'Kg', 1, 'cheese', false, 'daily', true),
  ('Duster Small', 'Raw Materials', 'Piece', 'Piece', 1, 'duster small', false, 'daily', true),
  ('Zeera Powder', 'Raw Materials', 'Piece', 'Kg', 1, NULL, false, 'daily', true)
) AS v(item_name, category_name, unit, purchase_unit, conversion,
       barcode, favourite, cycle, active)
LEFT JOIN public.inventory_categories c
       ON c.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'::uuid
      AND c.name = v.category_name
ON CONFLICT (restaurant_id, item_name) DO UPDATE SET
  category         = EXCLUDED.category,
  category_id      = EXCLUDED.category_id,
  unit             = EXCLUDED.unit,
  purchase_unit    = EXCLUDED.purchase_unit,
  conversion_factor= EXCLUDED.conversion_factor,
  barcode          = EXCLUDED.barcode,
  is_favourite     = EXCLUDED.is_favourite,
  stock_cycle      = EXCLUDED.stock_cycle,
  is_active        = EXCLUDED.is_active,
  item_type        = EXCLUDED.item_type;

-- ----------------------------------------------------------------------------
-- 4. Point the materials at the unit master
-- ----------------------------------------------------------------------------
UPDATE public.inventory_items i
   SET unit_id = u.id
  FROM public.inventory_units u
 WHERE u.restaurant_id = i.restaurant_id
   AND u.symbol = btrim(i.unit)
   AND i.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'::uuid;

UPDATE public.inventory_items i
   SET purchase_unit_id = u.id
  FROM public.inventory_units u
 WHERE u.restaurant_id = i.restaurant_id
   AND u.symbol = btrim(i.purchase_unit)
   AND i.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'::uuid;

-- =============================================================================
-- VERIFY
-- =============================================================================
SELECT jsonb_pretty(jsonb_build_object(
  'restaurant', (SELECT name FROM public.restaurants WHERE id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'::uuid),
  'materials',  (SELECT count(*) FROM public.inventory_items WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'::uuid),
  'active',     (SELECT count(*) FROM public.inventory_items WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'::uuid AND is_active),
  'favourites', (SELECT count(*) FROM public.inventory_items WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'::uuid AND is_favourite),
  'without_unit_link', (SELECT count(*) FROM public.inventory_items WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'::uuid AND unit_id IS NULL),
  'by_category', (
    SELECT COALESCE(jsonb_object_agg(cat, n), '{}'::jsonb) FROM (
      SELECT COALESCE(c.name, 'Uncategorised') AS cat, count(*) AS n
      FROM public.inventory_items i
      LEFT JOIN public.inventory_categories c ON c.id = i.category_id
      WHERE i.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'::uuid
      GROUP BY 1) s),
  'units', (SELECT count(*) FROM public.inventory_units WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'::uuid)
)) AS result;
