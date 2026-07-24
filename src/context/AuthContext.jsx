import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Auth + tenant context for the POS Dashboard.
 *
 * The tenant (restaurant_id) and role are NOT stored client-side by us — they
 * are custom claims stamped into the JWT by the Postgres access-token hook
 * (public.custom_access_token_hook). We decode them from the access token so
 * the UI can react to them, but the database enforces scoping via RLS from the
 * same claims. If restaurantId comes back null on a logged-in user, the hook is
 * either disabled or the user has no restaurant_members row.
 */

const AuthContext = createContext(null);

const DEFAULT_CTX = {
  session: null,
  user: null,
  restaurantId: null,
  role: null,
  isPlatformAdmin: false,
  loading: false,
  signIn: async () => {},
  signOut: async () => {},
};

/** Decode the payload of a JWT without verifying it (claims are for UI only). */
function decodeClaims(accessToken) {
  if (!accessToken) return {};
  try {
    const payload = accessToken.split('.')[1];
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(normalized)) || {};
  } catch {
    return {};
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    // 'local' clears the client session without a server round-trip, so logout
    // still works if the network/token revoke call fails.
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // ignore — the explicit storage wipe + reload below guarantee sign-out
    }
    // Belt-and-suspenders: remove any persisted Supabase session token so the
    // reload below cannot restore the session and bounce us back into the app.
    try {
      Object.keys(window.localStorage)
        .filter((k) => k.startsWith('sb-') && k.includes('-auth-token'))
        .forEach((k) => window.localStorage.removeItem(k));
    } catch {
      // storage unavailable — reload still re-runs getSession()
    }
    setSession(null);
    // Hard reload re-initializes the app with no session, so the Gate lands on
    // Login regardless of any in-flight state or cached component tree.
    window.location.assign('/');
  }, []);

  // Platform-admin status (RLS on platform_admins returns a row only to admins).
  useEffect(() => {
    if (!session) { setIsPlatformAdmin(false); return; }
    let active = true;
    supabase
      .from('platform_admins')
      .select('user_id')
      .maybeSingle()
      .then(({ data }) => { if (active) setIsPlatformAdmin(!!data); });
    return () => { active = false; };
  }, [session]);

  const claims = decodeClaims(session?.access_token);

  const value = {
    session,
    user: session?.user ?? null,
    restaurantId: claims.restaurant_id ?? null,
    role: claims.user_role ?? null,
    isPlatformAdmin,
    loading,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Returns the auth context. Outside an AuthProvider (e.g. in isolated component
 * tests) it returns a safe no-op default instead of throwing.
 */
export function useAuth() {
  return useContext(AuthContext) ?? DEFAULT_CTX;
}
