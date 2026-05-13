const CACHE = 'finance-tracker-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || e.request.url.includes('/api/')) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (!r || r.status !== 200 || r.type !== 'basic') return r;
        const clone = r.clone();
        caches.open(CACHE).then((cache) => cache.put(e.request, clone));
        return r;
      })
      .catch(() => caches.match(e.request).then((cached) => cached || fetch(e.request)))
  );
});
