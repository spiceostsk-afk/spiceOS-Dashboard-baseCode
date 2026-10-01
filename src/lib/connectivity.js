/**
 * One shared answer to "can we reach the server right now?".
 *
 * navigator.onLine only says a network interface is up. On café Wi-Fi with no
 * internet behind it, it stays true, every save goes to Supabase, fails, and
 * the till shows an error instead of saving locally. So "online" here means
 * the browser thinks so AND the last probe of Supabase got an answer.
 *
 * A request that fails with a network error calls reportNetworkFailure(),
 * which flips the whole app offline at once instead of waiting for the next
 * probe.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const PROBE_TIMEOUT_MS = 5000;
const PROBE_EVERY_ONLINE_MS = 60000;
const PROBE_EVERY_OFFLINE_MS = 10000;

let reachable = true;
let started = false;
let timer = null;
const listeners = new Set();

function browserOnline() {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

export function isOnlineNow() {
  return browserOnline() && reachable;
}

function setReachable(value) {
  const before = isOnlineNow();
  reachable = value;
  const after = isOnlineNow();
  if (before !== after) listeners.forEach((fn) => fn(after));
  schedule();
}

/** Any HTTP answer from Supabase — even a 401 — means the line is up. */
export async function probe() {
  if (!browserOnline()) { setReachable(false); return false; }
  if (!SUPABASE_URL || typeof fetch === 'undefined') { setReachable(true); return true; }
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = controller ? setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS) : null;
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      method: 'GET',
      headers: SUPABASE_KEY ? { apikey: SUPABASE_KEY } : {},
      cache: 'no-store',
      signal: controller?.signal,
    });
    setReachable(true);
    return true;
  } catch {
    setReachable(false);
    return false;
  } finally {
    if (t) clearTimeout(t);
  }
}

function schedule() {
  if (!started || typeof window === 'undefined') return;
  clearTimeout(timer);
  timer = setTimeout(probe, isOnlineNow() ? PROBE_EVERY_ONLINE_MS : PROBE_EVERY_OFFLINE_MS);
}

function start() {
  if (started || typeof window === 'undefined') return;
  started = true;
  const onChange = () => {
    listeners.forEach((fn) => fn(isOnlineNow()));
    probe();
  };
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  probe();
}

/** Subscribe to online/offline changes. Returns the unsubscribe function. */
export function subscribeConnectivity(fn) {
  start();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * True for "the request never reached the server" — as opposed to the server
 * answering with an error, which saving locally would not fix.
 */
export function isNetworkError(err) {
  if (!err) return false;
  const msg = String(err.message || err.details || err).toLowerCase();
  // Not err.name === 'TypeError' on its own: a plain bug is a TypeError too,
  // and must not be mistaken for "offline, save it for later".
  return err.name === 'AbortError'
    || err.name === 'AuthRetryableFetchError'
    || msg.includes('failed to fetch')
    || msg.includes('networkerror')
    || msg.includes('network request failed')
    || msg.includes('load failed')
    || msg.includes('fetch failed');
}

export function reportNetworkFailure() {
  setReachable(false);
}
