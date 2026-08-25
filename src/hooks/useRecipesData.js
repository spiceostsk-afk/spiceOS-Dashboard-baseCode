import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Recipes: what one serving of each dish consumes from inventory.
 *
 * The screen built on this only ever writes `recipe_ingredients`. Nothing here
 * moves stock — that happens in the database, on a trigger over order_items, so
 * an order placed from any panel depletes the same way (see
 * db/migrate_recipes_inventory.sql).
 */

const round = (n) => Math.round(Number(n || 0) * 1000) / 1000;

export function useRecipesData() {
  const [dishes, setDishes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [dishRes, catRes, invRes, recipeRes] = await Promise.all([
        supabase.from('menu_items').select('*').order('item_name'),
        supabase.from('menu_categories').select('*').order('category_name'),
        supabase.from('inventory_items').select('*').eq('is_active', true).order('item_name'),
        supabase.from('recipe_ingredients').select('*'),
      ]);

      for (const res of [dishRes, catRes, invRes, recipeRes]) {
        if (res.error) throw res.error;
      }

      setDishes(dishRes.data || []);
      setCategories(catRes.data || []);
      setInventory(invRes.data || []);
      setIngredients(recipeRes.data || []);
      setError(null);
    } catch (err) {
      console.error('Error loading recipes:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /**
   * One row per dish, with its ingredient lines resolved against inventory and
   * a costing/health read-out. `servingsLeft` is the limiting ingredient — how
   * many more of this dish the current stock can actually produce.
   */
  const recipes = useMemo(() => {
    const invById = new Map(inventory.map((i) => [i.id, i]));
    const catById = new Map(categories.map((c) => [c.id, c.category_name]));
    const byDish = new Map();

    for (const line of ingredients) {
      if (!byDish.has(line.menu_item_id)) byDish.set(line.menu_item_id, []);
      byDish.get(line.menu_item_id).push(line);
    }

    return dishes.map((dish) => {
      const lines = (byDish.get(dish.id) || []).map((line) => {
        const inv = invById.get(line.inventory_item_id);
        const qty = round(line.quantity);
        const stock = round(inv?.stock ?? 0);
        return {
          id: line.id,
          inventoryItemId: line.inventory_item_id,
          name: inv?.item_name || 'Removed item',
          unit: inv?.unit || '',
          quantity: qty,
          stock,
          missing: !inv,
          // How many servings this one ingredient can still cover.
          servings: qty > 0 ? Math.floor(stock / qty) : Infinity,
        };
      }).sort((a, b) => a.name.localeCompare(b.name));

      const servingsLeft = lines.length
        ? Math.max(0, Math.min(...lines.map((l) => l.servings)))
        : null;

      let health = 'none';                       // no recipe defined yet
      if (lines.length) {
        if (servingsLeft <= 0) health = 'out';
        else if (servingsLeft <= 5) health = 'low';
        else health = 'ok';
      }

      return {
        id: dish.id,
        name: dish.item_name,
        price: Number(dish.price || 0),
        categoryId: dish.category_id,
        category: catById.get(dish.category_id) || 'Uncategorised',
        isAvailable: dish.is_available !== false,
        lines,
        servingsLeft,
        health,
      };
    });
  }, [dishes, categories, inventory, ingredients]);

  const metrics = useMemo(() => recipes.reduce((acc, r) => {
    acc.dishes += 1;
    if (r.lines.length) acc.mapped += 1;
    if (r.health === 'out') acc.out += 1;
    else if (r.health === 'low') acc.low += 1;
    return acc;
  }, { dishes: 0, mapped: 0, low: 0, out: 0 }), [recipes]);

  /**
   * Replace a dish's whole recipe in one go. Simpler than diffing individual
   * lines, and the editor always submits the complete list anyway.
   */
  const saveRecipe = useCallback(async (menuItemId, lines) => {
    const clean = lines
      .filter((l) => l.inventoryItemId && Number(l.quantity) > 0)
      .map((l) => ({
        menu_item_id: menuItemId,
        inventory_item_id: l.inventoryItemId,
        quantity: Number(l.quantity),
      }));

    const seen = new Set();
    for (const line of clean) {
      if (seen.has(line.inventory_item_id)) {
        return { success: false, error: 'The same ingredient is listed twice.' };
      }
      seen.add(line.inventory_item_id);
    }

    const { error: delError } = await supabase
      .from('recipe_ingredients')
      .delete()
      .eq('menu_item_id', menuItemId);
    if (delError) return { success: false, error: delError.message };

    if (clean.length) {
      const { error: insError } = await supabase
        .from('recipe_ingredients')
        .insert(clean);
      if (insError) return { success: false, error: insError.message };
    }

    await refresh();
    return { success: true };
  }, [refresh]);

  return {
    recipes, inventory, categories, metrics, loading, error,
    refresh, saveRecipe,
  };
}
