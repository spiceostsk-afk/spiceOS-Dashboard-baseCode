-- =============================================================================
-- Spice OS — a void can say "not cooked": its ingredients go back to stock
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- =============================================================================
-- THE COMPLAINT (17 Oct 2026, Wali Baba, about the 16 Oct business day)
--   Fish Fry: Item-wise Sales 23 plates (the 1 complimentary plate is already
--   inside the 23) x 5 pcs = 115, but Stock Summary consumption = 140.
--   Barra: 9 Afghani Barra x 4 + 2 Barra Rice x 2 = 40, consumption = 48.
--
-- WHY (traced line by line, every piece accounted for)
--   Fish Semi 140 = 115 sold
--                 + 15  G1 voided at 21:10, reason "BASEMENT" (3 Fish Fry)
--                 + 10  two G8 lines voided at 20:46, a minute after being
--                       punched, reason "UY" (a double tap, never cooked)
--   Barra Semi 48 = 40 sold + 8 from the same G1 "BASEMENT" void (2 Afghani)
--
--   Since 16 Sep (migrate_void_kot_and_late_entries.sql) every void keeps its
--   stock used, because the client said a voided KOT was still cooked. But the
--   floor also voids a table to MOVE it: basement tables are punched, voided
--   with "BASEMENT BILL", and rung up again at night in one combined basement
--   bill (16 Oct 02:01 G1 holds those same 3 Fish Fry and 2 Afghani Barra).
--   The food is deducted twice. Mis-punched lines voided seconds later are
--   deducted too, though nothing was cooked.
--
-- WHAT THIS DOES
--   order_items.stock_returned — set when the cashier answers "not cooked".
--   Flipping it to true posts the line's ingredients back, dated at the order
--   so the return lands on the day the stock was taken. The sale stays out of
--   sales and the line still shows on the Void KOT report, at zero cost.
--   Cooked voids (the default) behave exactly as before.
--
--   The return is an ordinary 'consumption' movement, so the late-entry
--   trigger (trg_stock_movements_reapply_count) keeps any closing count already
--   submitted for that day: the day still closes at the count, and the
--   Consumption and Variance columns now show what really happened.
--
-- Past voids are NOT changed here. See db/return_basement_void_stock.sql.
-- =============================================================================

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS stock_returned boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.order_items.stock_returned IS
  'Voided and not cooked (or billed again elsewhere): its ingredients were returned to stock.';

CREATE OR REPLACE FUNCTION public.order_items_stock_sync()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- A line entered already cancelled was still sent, so still cooked —
    -- unless it arrives already marked as returned (an offline void replayed).
    IF NOT NEW.stock_returned THEN
      PERFORM public.apply_recipe_stock(
        NEW.restaurant_id, NEW.menu_item_id, -NEW.quantity, NEW.id, 'Order placed');
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- A delete says the line never happened, so its stock comes back — once.
    IF NOT OLD.stock_returned THEN
      PERFORM public.apply_recipe_stock(
        OLD.restaurant_id, OLD.menu_item_id, OLD.quantity, OLD.id, 'Order line deleted');
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE
  IF OLD.stock_returned IS DISTINCT FROM NEW.stock_returned THEN
    IF NEW.stock_returned THEN
      -- Give back exactly what was taken: the old dish at the old quantity.
      PERFORM public.apply_recipe_stock(
        OLD.restaurant_id, OLD.menu_item_id, OLD.quantity, OLD.id, 'Void — not cooked, stock returned');
    ELSE
      PERFORM public.apply_recipe_stock(
        NEW.restaurant_id, NEW.menu_item_id, -NEW.quantity, NEW.id, 'Void stock return undone');
    END IF;
    RETURN NEW;
  END IF;

  -- A returned line holds no stock, so editing it moves none.
  IF NEW.stock_returned THEN
    RETURN NEW;
  END IF;

  -- is_cancelled on its own moves no stock: a cooked Void KOT stays used.
  IF OLD.menu_item_id IS DISTINCT FROM NEW.menu_item_id THEN
    PERFORM public.apply_recipe_stock(
      OLD.restaurant_id, OLD.menu_item_id, OLD.quantity, OLD.id, 'Dish changed');
    PERFORM public.apply_recipe_stock(
      NEW.restaurant_id, NEW.menu_item_id, -NEW.quantity, NEW.id, 'Dish changed');
  ELSIF OLD.quantity IS DISTINCT FROM NEW.quantity THEN
    PERFORM public.apply_recipe_stock(
      NEW.restaurant_id, NEW.menu_item_id, OLD.quantity - NEW.quantity, NEW.id, 'Quantity changed');
  END IF;

  RETURN NEW;
END;
$fn$;

-- The trigger itself is unchanged (AFTER INSERT OR UPDATE OR DELETE).

-- ----------------------------------------------------------------------------
-- VERIFY — expect: has_column = true, trigger_ok = true
-- ----------------------------------------------------------------------------
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'order_items'
             AND column_name = 'stock_returned')                         AS has_column,
  position('stock_returned' IN pg_get_functiondef(
    'public.order_items_stock_sync()'::regprocedure)) > 0                AS trigger_ok;
