import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

/**
 * The branch the operator is currently looking at.
 *
 * Stock is held per outlet, so almost every screen in the inventory module is
 * a question about one branch. Rather than each of them owning a picker, the
 * choice lives here and the header switches it once for the whole app.
 *
 * A single-branch restaurant still has exactly one outlet — the migration
 * seeds it — so nothing needs a special case for "no outlets yet".
 */

const OutletContext = createContext(null);

/** Per-tenant, so switching accounts on a shared machine cannot cross wires. */
const storageKey = (restaurantId) => `spiceos_outlet_${restaurantId || 'none'}`;

export function OutletProvider({ children }) {
  const { restaurantId } = useAuth();
  const [outlets, setOutlets] = useState([]);
  const [outletId, setOutletId] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('outlets')
        .select('id, name, code, address, phone, is_default, is_active')
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('name');

      if (error) throw error;

      const rows = data || [];
      setOutlets(rows);

      // Restore the last choice, but never trust it blindly: an outlet can be
      // deactivated or belong to a tenant this user no longer has.
      const remembered = localStorage.getItem(storageKey(restaurantId));
      const valid = rows.some((o) => o.id === remembered);
      setOutletId(valid ? remembered : (rows[0]?.id ?? null));
    } catch (err) {
      console.error('Error loading outlets:', err);
      setOutlets([]);
      setOutletId(null);
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    load();
  }, [load]);

  const selectOutlet = useCallback((id) => {
    setOutletId(id);
    if (id) localStorage.setItem(storageKey(restaurantId), id);
  }, [restaurantId]);

  const addOutlet = useCallback(async (draft) => {
    const name = (draft.name || '').trim();
    if (!name) return { success: false, error: 'An outlet name is required.' };

    const { error } = await supabase.from('outlets').insert([{
      name,
      code: (draft.code || '').trim() || null,
      address: (draft.address || '').trim() || null,
      phone: (draft.phone || '').trim() || null,
    }]);

    if (error) {
      return {
        success: false,
        error: error.code === '23505'
          ? `An outlet called "${name}" already exists.`
          : error.message,
      };
    }
    await load();
    return { success: true };
  }, [load]);

  const outlet = outlets.find((o) => o.id === outletId) || null;

  return (
    <OutletContext.Provider value={{
      outlets, outlet, outletId, loading,
      selectOutlet, addOutlet, refresh: load,
      isMultiOutlet: outlets.length > 1,
    }}>
      {children}
    </OutletContext.Provider>
  );
}

export function useOutlet() {
  const ctx = useContext(OutletContext);
  // Views are unit-tested in isolation without the provider; a null-shaped
  // fallback keeps them rendering instead of throwing.
  return ctx || {
    outlets: [], outlet: null, outletId: null, loading: false,
    selectOutlet: () => {}, addOutlet: async () => ({ success: false }),
    refresh: async () => {}, isMultiOutlet: false,
  };
}
