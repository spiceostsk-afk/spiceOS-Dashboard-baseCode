import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import * as db from '../lib/db';

const STAFF_KEY = 'staff_members';

const ROLES = {
  manager: 'manager',
  staff: 'staff',
};

async function loadFromSupabase() {
  const { data, error } = await supabase
    .from('staff')
    .select('*')
    .order('name');
  if (error) return null;
  return data || [];
}

async function saveToSupabase(member) {
  const { data, error } = await supabase
    .from('staff')
    .upsert(member, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function deleteFromSupabase(id) {
  const { error } = await supabase.from('staff').delete().eq('id', id);
  if (error) throw error;
}

function generatePin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export function useStaffData() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const fetchStaff = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const local = await db.getMeta(STAFF_KEY);
      const remote = await loadFromSupabase();
      if (remote) {
        setStaff(remote);
        await db.setMeta(STAFF_KEY, remote);
      } else if (local) {
        setStaff(local);
      } else {
        setStaff([]);
      }
    } catch (err) {
      const local = await db.getMeta(STAFF_KEY);
      if (local) {
        setStaff(local);
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const addStaff = useCallback(async (data) => {
    setSaving(true);
    setError(null);
    try {
      const member = {
        id: data.id || crypto.randomUUID?.() || `staff_${Date.now()}`,
        name: data.name.trim(),
        phone: data.phone?.trim() || '',
        email: data.email?.trim() || '',
        role: data.role || ROLES.staff,
        pin: data.pin || generatePin(),
        active: true,
        created_at: new Date().toISOString(),
      };
      const local = (await db.getMeta(STAFF_KEY)) || [];
      local.push(member);
      await db.setMeta(STAFF_KEY, local);
      setStaff(local);
      try {
        await saveToSupabase(member);
      } catch {
        // Supabase table may not exist
      }
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  const updateStaff = useCallback(async (id, updates) => {
    setSaving(true);
    setError(null);
    try {
      const local = (await db.getMeta(STAFF_KEY)) || [];
      const index = local.findIndex((m) => m.id === id);
      if (index === -1) throw new Error('Staff member not found');
      local[index] = { ...local[index], ...updates, updated_at: new Date().toISOString() };
      await db.setMeta(STAFF_KEY, local);
      setStaff(local);
      try {
        await saveToSupabase(local[index]);
      } catch {
        // Supabase table may not exist
      }
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  const deleteStaff = useCallback(async (id) => {
    if (!confirm('Remove this staff member?')) return;
    setSaving(true);
    setError(null);
    try {
      const local = (await db.getMeta(STAFF_KEY)) || [];
      const filtered = local.filter((m) => m.id !== id);
      await db.setMeta(STAFF_KEY, filtered);
      setStaff(filtered);
      try {
        await deleteFromSupabase(id);
      } catch {
        // Supabase table may not exist
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, []);

  const regeneratePin = useCallback(async (id) => {
    const newPin = generatePin();
    await updateStaff(id, { pin: newPin });
    return newPin;
  }, [updateStaff]);

  return {
    staff,
    loading,
    error,
    saving,
    roles: ROLES,
    fetchStaff,
    addStaff,
    updateStaff,
    deleteStaff,
    regeneratePin,
  };
}
