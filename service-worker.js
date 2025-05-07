
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open('mini-budget-cache-v1').then(function(cache) {
      return cache.addAll([
        './',
        './index.html',
        './style.css',
        './app.js',
        './firebase-config.js',
        './mini-coin-icon-transparent-192.png',
        './mini-coin-icon-transparent-256.png',
        './mini-coin-icon-transparent-512.png',
        './manifest-v2.json'
      ]);
    })
  );
});

self.addEventListener('activate', function(event) {
  const cacheWhitelist = ['mini-budget-cache-v1'];  // Updated cache name
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (!cacheWhitelist.includes(cacheName)) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request).then(function(response) {
      return response || fetch(event.request);
    })
  );
});
