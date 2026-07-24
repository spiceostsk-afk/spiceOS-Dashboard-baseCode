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
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
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
  }, []);

  const saveSettings = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await db.setMeta('settings', settings);
      for (const key of Object.keys(settings)) {
        try {
          await saveToSupabase(key, settings[key]);
        } catch {
          // Supabase table may not exist — that's fine
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, [settings]);

  return {
    settings, loading, error, saving,
    updateSetting, saveSettings, refreshSettings,
  };
}
