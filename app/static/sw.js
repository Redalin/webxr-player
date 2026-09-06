const CACHE_NAME = 'webxr-player-v1';

const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/static/css/styles.css',
  '/static/js/app.js',
  '/static/js/xr-player.js',
  '/static/icons/icon.svg',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
];

// Service Worker Install Event - Cache Core App Shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Pre-caching Core App Shell');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[ServiceWorker] Pre-cache warning:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Service Worker Activate Event - Clean old cache versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[ServiceWorker] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Service Worker Fetch Event - Intelligent Caching (Exclude Video Streaming & Range requests)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Exclude video stream endpoints and Range Requests from SW Caching
  if (url.pathname.startsWith('/api/stream') || event.request.headers.has('range')) {
    return; // Allow native browser media stream handler
  }

  // Stale-While-Revalidate for Static Web Assets
  if (
    url.pathname.startsWith('/static/') ||
    url.pathname === '/' ||
    url.pathname === '/manifest.json' ||
    url.hostname.includes('cdnjs.cloudflare.com')
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          const fetchPromise = fetch(event.request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          }).catch((err) => {
            console.log('[ServiceWorker] Fetch failed, serving cached fallback if available:', err);
          });

          return cachedResponse || fetchPromise;
        });
      })
    );
    return;
  }

  // Network-First with Cache Fallback for Browse API
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && event.request.method === 'GET') {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
    return;
  }
});

