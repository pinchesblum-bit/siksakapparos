const VERSION = 'kapures-admin-20260925-5';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const cacheName of await caches.keys()) {
      if (cacheName.startsWith('kapures-admin-') && cacheName !== VERSION) {
        await caches.delete(cacheName);
      }
    }
    await self.clients.claim();
  })());
});

// Network-only is deliberate. This admin app must always use the newest page,
// authentication state, and shared sales data; no business data is cached.
self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);
  if (event.request.method !== 'GET' || requestUrl.origin !== self.location.origin) return;
  event.respondWith(fetch(event.request));
});
