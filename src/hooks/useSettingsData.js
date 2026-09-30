import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import * as db from '../lib/db';

const DEFAULTS = {
  restaurant: { name: 'Spice OS', address: '', phone: '', email: '', gstin: '' },
  tax: { gstRate: 10 },
  serviceCharge: { enabled: false, defaultRate: 10 },
  receipt: { footerText: 'Thank you for dining with us!', showGst: true },
};

async function loadFromSupabase() {
  const { data, error } = await supabase
    .from('restaurant_settings')
    .select('key, value');
  if (error) return null;
  const settings = {};
  for (const row of data || []) {
    settings[row.key] = row.value;
  }
  return settings;
}

async function saveToSupabase(key, value) {
  const { error } = await supabase
    .from('restaurant_settings')
    // PK is (restaurant_id, key); restaurant_id defaults to current_restaurant_id().
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'restaurant_id,key' });
  if (error) throw error;
}

async function loadFromLocal() {
  const saved = await db.getMeta('settings');
  return saved || {};
}

export function useSettingsData() {
  const [settings, setSettings] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saved, setSaved] = useState(false);

  const refreshSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const remote = await loadFromSupabase();
      if (remote) {
        const merged = {};
        for (const key of Object.keys(DEFAULTS)) {
          merged[key] = { ...DEFAULTS[key], ...(remote[key] || {}) };
        }
        setSettings(merged);
        await db.setMeta('settings', merged);
      } else {
        const local = await loadFromLocal();
        const merged = {};
        for (const key of Object.keys(DEFAULTS)) {
          merged[key] = { ...DEFAULTS[key], ...(local[key] || {}) };
        }
        setSettings(merged);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSettings();
  }, [refreshSettings]);

  const updateSetting = useCallback((section, field, value) => {
    setSettings((prev) => ({
      ...prev,
      [section]: { ...prev[section], [field]: value },
    }));
    setSaved(false);
  }, []);

  const saveSettings = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await db.setMeta('settings', settings);
      for (const key of Object.keys(settings)) {
        await saveToSupabase(key, settings[key]);
      }
      setSaved(true);
      return { success: true };
    } catch (err) {
      // Surface it: a silent failure here meant the next load pulled the old
      // values back from Supabase and the edit looked like it "didn't stick".
      setSaveError(err.message);
      return { success: false, error: err.message };
    } finally {
      setSaving(false);
    }
  }, [settings]);

  return {
    settings, loading, error, saving, saveError, saved,
    updateSetting, saveSettings, refreshSettings,
  };
}
