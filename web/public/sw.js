/* eslint-disable no-restricted-globals */
const CACHE = 'finance-tracker-v5';

const APP_SHELL = [
  '/',
  '/index.html',
  '/login.html',
  '/static/style.css',
  '/manifest.json',
  '/static/icons/icon-192x192.png',
];

const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/tom-select@2.3.1/dist/css/tom-select.css',
  'https://cdn.jsdelivr.net/npm/tom-select@2.3.1/dist/js/tom-select.complete.min.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(APP_SHELL).catch(() => {})
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isCacheableRequest(url) {
  if (url.includes('/api/')) return false;
  if (url.startsWith('chrome-extension://')) return false;
  return url.startsWith('http://') || url.startsWith('https://');
}

function isCDNAsset(url) {
  return CDN_ASSETS.some((cdn) => url.startsWith(cdn.split('?')[0]));
}

function isHashedAsset(url) {
  return /\/static\/dist\/.*\.[a-f0-9]{8,}\.(js|css)/.test(url);
}

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  if (!isCacheableRequest(request.url)) return;

  if (isCDNAsset(request.url) || isHashedAsset(request.url)) {
    e.respondWith(cacheFirst(request));
    return;
  }

  e.respondWith(networkFirst(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const responseType = response.type;
      if (responseType === 'basic' || responseType === 'cors') {
        const cache = await caches.open(CACHE);
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    }

    // Non-200 (e.g. Cloudflare 530/502 tunnel error) — treat as offline for navigation
    if (request.mode === 'navigate') {
      const cached = await caches.match(request) || await caches.match('/index.html');
      if (cached) return cached;
    }

    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    if (request.mode === 'navigate') {
      const fallback = await caches.match('/index.html');
      if (fallback) return fallback;
    }

    return new Response(
      '<!DOCTYPE html><html><body style="background:#1a1a2e;color:#eee;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui"><div style="text-align:center"><h2>Нет соединения</h2><p>Данные будут доступны при восстановлении связи</p></div></body></html>',
      { headers: { 'Content-Type': 'text/html' }, status: 503 }
    );
  }
}

// Background Sync: replay queued mutations when back online
self.addEventListener('sync', (e) => {
  if (e.tag === 'sync-mutations') {
    e.waitUntil(replayMutations());
  }
});

async function replayMutations() {
  const DB_NAME = 'finance-tracker-offline';
  const QUEUE_STORE = 'mutation-queue';

  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  const tx = db.transaction(QUEUE_STORE, 'readonly');
  const store = tx.objectStore(QUEUE_STORE);
  const mutations = await new Promise((resolve) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve([]);
  });

  if (!mutations.length) {
    db.close();
    return;
  }

  for (const mutation of mutations) {
    try {
      const token =
        (await getFromClients('auth_token')) || '';
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      };

      const response = await fetch('/api' + mutation.endpoint, {
        method: mutation.method,
        headers,
        body: mutation.body,
      });

      if (response.ok || (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429)) {
        const delTx = db.transaction(QUEUE_STORE, 'readwrite');
        delTx.objectStore(QUEUE_STORE).delete(mutation.id);
        await new Promise((r) => { delTx.oncomplete = r; });
      } else {
        break;
      }
    } catch {
      break;
    }
  }

  db.close();
  notifyClients('sync-complete');
}

async function getFromClients(key) {
  const clients = await self.clients.matchAll({ type: 'window' });
  for (const client of clients) {
    try {
      const mc = new MessageChannel();
      const promise = new Promise((resolve) => {
        mc.port1.onmessage = (e) => resolve(e.data);
        setTimeout(() => resolve(null), 500);
      });
      client.postMessage({ type: 'get-storage', key }, [mc.port2]);
      const val = await promise;
      if (val) return val;
    } catch { /* skip */ }
  }
  return null;
}

function notifyClients(type) {
  self.clients.matchAll({ type: 'window' }).then((clients) => {
    clients.forEach((client) => client.postMessage({ type }));
  });
}

// Push notifications
self.addEventListener('push', (e) => {
  let data = { title: 'Finance Tracker', body: '' };
  if (e.data) {
    try {
      data = { ...data, ...JSON.parse(e.data.text()) };
    } catch (_) {}
  }
  const options = {
    body: data.body,
    tag: data.data?.type || 'push',
    data: { url: '/', ...(data.data || {}) },
  };
  const promise = self.registration.showNotification(data.title, options).catch((err) => {
    console.error('[SW] showNotification failed:', err);
  });
  e.waitUntil(promise);
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    if (list.length) list[0].focus();
    else clients.openWindow(url);
  }));
});

// Handle messages from the main app
self.addEventListener('message', (e) => {
  if (e.data?.type === 'get-storage') {
    // handled on client side
  }
});
