// ===== SERVICE WORKER UNTUK KELASKU =====
// Security-oriented PWA caching:
// - Tidak pernah melakukan cache untuk Firebase/Auth/Firestore/Storage.
// - index.html menggunakan network-first agar patch keamanan cepat masuk.
// - Asset statis menggunakan cache-first.
// - Hanya GET request yang diproses.

const CACHE_NAME = 'kelasku-static-v2';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons-192.png',
  '/icons-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // Jangan intercept request selain GET.
  if (request.method !== 'GET') return;

  // Jangan cache Firebase, Google APIs, Auth, Firestore,
  // Realtime Database, Cloud Storage, atau Cloud Functions.
  const isFirebaseRequest =
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firebaseapp.com') ||
    url.hostname.includes('firebasestorage.googleapis.com') ||
    url.hostname.includes('cloudfunctions.net');

  if (isFirebaseRequest) {
    event.respondWith(fetch(request));
    return;
  }

  // Navigasi / index.html => network-first.
  // Tujuannya agar update keamanan segera diterima.
  if (
    request.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname.endsWith('/index.html')
  ) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put('/index.html', copy);
            });
          }
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Asset statis => cache-first, fallback ke network.
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request).then(response => {
        if (response && response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, copy);
          });
        }
        return response;
      });
    })
  );
});

// Memungkinkan update service worker dipicu dari aplikasi.
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
