import { supabase } from './supabase';

/**
 * The restaurant's trading day.
 *
 * A restaurant that serves until 3am does not start a new day at midnight: a
 * bill settled at 1am belongs to the night it was eaten in, and the day-wise
 * sale should not tip over into "tomorrow" while service is still running.
 * Each restaurant sets the hour its day closes in Settings (0 = midnight,
 * which is how every day was counted before this existed).
 *
 * Every sales screen asks this module which day an instant belongs to and
 * where a day starts and ends, so the dashboard, the reports and the order
 * history cannot disagree about it.
 *
 * The hour is held here, in memory, because date arithmetic runs all over the
 * app synchronously. It is loaded once when the app opens (see
 * BusinessDayGate in App.jsx) and kept in localStorage per restaurant so the
 * next start does not wait for it.
 */

export const MAX_CLOSE_HOUR = 6;
const HOUR_MS = 60 * 60 * 1000;
const SETTINGS_KEY = 'businessDay';

let closeHour = 0;

const clampHour = (h) => {
  const n = Math.trunc(Number(h));
  return Number.isFinite(n) && n >= 0 && n <= MAX_CLOSE_HOUR ? n : 0;
};

export function getDayCloseHour() {
  return closeHour;
}

export function setDayCloseHour(hour) {
  closeHour = clampHour(hour);
}

const pad = (n) => String(n).padStart(2, '0');
const cacheKey = (restaurantId) => `spiceos.dayCloseHour.${restaurantId}`;

/** The hour this device saw last time; true when there was one. */
export function loadCachedDayClose(restaurantId) {
  try {
    const raw = window.localStorage.getItem(cacheKey(restaurantId));
    if (raw === null) return false;
    setDayCloseHour(raw);
    return true;
  } catch {
    return false;
  }
}

export function rememberDayClose(restaurantId, hour) {
  setDayCloseHour(hour);
  try {
    window.localStorage.setItem(cacheKey(restaurantId), String(closeHour));
  } catch { /* the hour still holds for this visit */ }
}

/** Reads the restaurant's saved hour. Offline, the last known one stands. */
export async function refreshDayClose(restaurantId) {
  const { data, error } = await supabase
    .from('restaurant_settings')
    .select('value')
    // Explicit, not left to RLS: a platform admin can read every tenant's rows.
    .eq('restaurant_id', restaurantId)
    .eq('key', SETTINGS_KEY)
    .maybeSingle();
  if (error) throw error;
  rememberDayClose(restaurantId, data?.value?.closeHour ?? 0);
}

/**
 * The trading day an instant belongs to, as local midnight of that date.
 * With the day closing at 3am, 01:30 on the 5th is the 4th.
 */
export function tradingDate(value = new Date()) {
  const t = value instanceof Date ? value : new Date(value);
  const shifted = new Date(t.getTime() - closeHour * HOUR_MS);
  return new Date(shifted.getFullYear(), shifted.getMonth(), shifted.getDate());
}

/** yyyy-mm-dd of the trading day an instant belongs to; '' when unusable. */
export function tradingDayKey(value) {
  if (!value) return '';
  const d = tradingDate(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Today's trading day — still yesterday's date until the day closes. */
export function tradingToday() {
  return tradingDate(new Date());
}

/** The instant the trading day on this calendar date opens. */
export function dayOpens(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), closeHour, 0, 0, 0);
}

/** The last instant of the trading day on this calendar date. */
export function dayCloses(d) {
  return new Date(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, closeHour, 0, 0, 0).getTime() - 1);
}
