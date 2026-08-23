// Service worker for PWA support (Phase 7).
//
// Design rules, in priority order:
//  1. NEVER cache anything under /api/* — this app's data (auth state,
//     server status, billing, etc.) is only ever correct when fresh. A
//     cached API response could show stale/wrong account data or, worse,
//     serve a response meant for a different signed-in user after a
//     logout/login swap on the same device. All /api/* requests are
//     passed straight to the network, uncached, no exceptions.
//  2. Only GET requests are ever intercepted. POST/PUT/PATCH/DELETE always
//     go straight to the network.
//  3. Next.js's hashed build assets (/_next/static/*) are safe to
//     cache-first and keep forever — the filename itself changes on every
//     new build, so there's no staleness risk.
//  4. Page navigations use network-first with a cached-page fallback, and
//     finally an offline.html fallback if nothing is cached either. This
//     means the app "works offline" in the sense of not showing a browser
//     error page, not in the sense of full offline functionality (this is
//     a real-time hosting control panel — most of it is meaningless
//     without a live connection to the API).

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `kerit-static-${CACHE_VERSION}`;
const PAGES_CACHE = `kerit-pages-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';

const PRECACHE_URLS = [
  OFFLINE_URL,
  '/manifest.json',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== PAGES_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isApiRequest(url) {
  return url.pathname.startsWith('/api/');
}

function isNextStaticAsset(url) {
  return url.pathname.startsWith('/_next/static/');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Cross-origin requests (e.g. the API running on a different host/port
  // in dev, or any third-party asset) are left completely alone — only
  // same-origin, non-API traffic gets the caching treatment below.
  if (url.origin !== self.location.origin) return;
  if (isApiRequest(url)) return;

  // Hashed Next.js build assets: cache-first, they never change under a
  // given filename.
  if (isNextStaticAsset(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
    return;
  }

  // Page navigations: network-first, falling back to a cached copy of the
  // same page, then to the offline page as a last resort.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(PAGES_CACHE);
          cache.put(request, response.clone());
          return response;
        } catch {
          const cache = await caches.open(PAGES_CACHE);
          const cached = await cache.match(request);
          if (cached) return cached;
          const offline = await caches.match(OFFLINE_URL);
          return offline || Response.error();
        }
      })(),
    );
    return;
  }

  // Everything else same-origin (images, fonts, manifest, etc.):
  // stale-while-revalidate — serve from cache instantly if present, and
  // refresh the cache in the background for next time.
  event.respondWith(
    caches.open(STATIC_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const networkFetch = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    }),
  );
});
