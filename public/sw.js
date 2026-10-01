/*
 * Lets the dashboard open with no internet.
 *
 * Without this, offline billing only worked if the tab was already open when
 * the line dropped; a refresh or a fresh start showed the browser's "no
 * internet" page. This keeps the app itself (HTML, JS, CSS, icons) on the
 * device. It never touches Supabase or any other site: data offline comes
 * from IndexedDB, not from here.
 *
 * - Pages: network first, so a new deploy is picked up as soon as there is a
 *   connection; the saved copy only when the network fails.
 * - /assets/*: Vite puts a content hash in every file name, so a saved copy
 *   can never be stale. Served from the device first.
 */
const CACHE = 'spiceos-shell-v1';
const SHELL = '/index.html';

async function precacheShell() {
  const cache = await caches.open(CACHE);
  const res = await fetch(SHELL, { cache: 'no-store' });
  if (!res.ok) return;
  await cache.put(SHELL, res.clone());
  // The assets this build's page loads, so the very first visit is enough.
  const html = await res.text();
  const urls = [...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)].map((m) => m[1]);
  await Promise.all(urls.map((u) => cache.add(u).catch(() => {})));
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheShell().catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('spiceos-shell-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase, fonts, CDNs: never

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh.ok) {
          const cache = await caches.open(CACHE);
          cache.put(SHELL, fresh.clone());
        }
        return fresh;
      } catch {
        // Every route is the same single-page app.
        const saved = await caches.match(SHELL);
        return saved || Response.error();
      }
    })());
    return;
  }

  if (url.pathname.startsWith('/assets/') || /\.(svg|png|ico|webmanifest)$/.test(url.pathname)) {
    event.respondWith((async () => {
      const saved = await caches.match(req);
      if (saved) return saved;
      const fresh = await fetch(req);
      if (fresh.ok) {
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
      }
      return fresh;
    })());
  }
});
