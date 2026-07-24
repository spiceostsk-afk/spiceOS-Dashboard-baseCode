import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { DEFAULT_TOKENS, applyDashboardTheme } from '../lib/theme';

/**
 * Loads this restaurant's brand tokens + logo from the DB, applies the tokens to
 * the dashboard CSS variables, and exposes save/upload helpers for the Branding
 * page. RLS scopes every read/write to the current restaurant automatically.
 */

const ThemeContext = createContext(null);

const BRANDING_BUCKET = 'branding';

export function ThemeProvider({ children }) {
  const { restaurantId } = useAuth();
  const [tokens, setTokens] = useState(DEFAULT_TOKENS);
  const [logoUrl, setLogoUrl] = useState(null);
  const [status, setStatus] = useState('active');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [themeRes, restRes] = await Promise.all([
        supabase.from('restaurant_themes').select('tokens, logo_url').maybeSingle(),
        supabase.from('restaurants').select('status').maybeSingle(),
      ]);
      const nextTokens = { ...DEFAULT_TOKENS, ...(themeRes.data?.tokens || {}) };
      setTokens(nextTokens);
      applyDashboardTheme(nextTokens);
      setLogoUrl(themeRes.data?.logo_url || null);
      setStatus(restRes.data?.status || 'active');
    } catch {
      applyDashboardTheme(DEFAULT_TOKENS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (restaurantId) load();
  }, [restaurantId, load]);

  const saveTheme = useCallback(async (nextTokens) => {
    const merged = { ...DEFAULT_TOKENS, ...nextTokens };
    const { error } = await supabase
      .from('restaurant_themes')
      .upsert({ restaurant_id: restaurantId, tokens: merged }, { onConflict: 'restaurant_id' });
    if (error) throw error;
    setTokens(merged);
    applyDashboardTheme(merged);
  }, [restaurantId]);

  const uploadLogo = useCallback(async (file) => {
    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const path = `${restaurantId}/logo.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(BRANDING_BUCKET)
      .upload(path, file, { upsert: true, cacheControl: '3600' });
    if (upErr) throw upErr;
    const { data: pub } = supabase.storage.from(BRANDING_BUCKET).getPublicUrl(path);
    const url = `${pub.publicUrl}?v=${Date.now()}`; // cache-bust after re-upload
    const { error: updErr } = await supabase
      .from('restaurant_themes')
      .upsert({ restaurant_id: restaurantId, logo_url: url }, { onConflict: 'restaurant_id' });
    if (updErr) throw updErr;
    setLogoUrl(url);
    return url;
  }, [restaurantId]);

  return (
    <ThemeContext.Provider value={{ tokens, logoUrl, status, loading, saveTheme, uploadLogo, reload: load }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext) ?? {
    tokens: DEFAULT_TOKENS, logoUrl: null, status: 'active', loading: false,
    saveTheme: async () => {}, uploadLogo: async () => {}, reload: async () => {},
  };
}
