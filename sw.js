/* Service worker for the Delaware Doubles pitch — offline-first PWA.
   Bump CACHE to ship updated assets. */
const CACHE = 'doubles-pitch-v6';

// Everything pitch.html needs to run with no network, paths relative to this
// worker's scope (works under the GitHub Pages project subpath).
const CORE = [
  './pitch.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './apple-touch-icon.png',
  'https://cdn.jsdelivr.net/npm/d3@7'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // allSettled so one flaky CDN fetch can't fail the whole install
    await Promise.allSettled(CORE.map(url => cache.add(url)));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function fetchAndCache(request) {
  const response = await fetch(request);
  if (response && response.ok && (response.type === 'basic' || response.type === 'cors')) {
    const cache = await caches.open(CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

// Cache-first with a background refresh; navigations fall back to the cached
// shell so the story still opens fully offline.
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) {
      event.waitUntil(fetchAndCache(request).catch(() => {}));
      return cached;
    }
    try {
      return await fetchAndCache(request);
    } catch (err) {
      if (request.mode === 'navigate') {
        const shell = await caches.match('./pitch.html');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
