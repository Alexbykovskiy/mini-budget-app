
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
  const cacheWhitelist = ['mini-budget-cache-v1'];  // New cache name
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          // Delete old caches
          if (!cacheWhitelist.includes(cacheName)) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();  // Make sure the service worker is immediately active
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

// Force service worker to update whenever the page is loaded
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js').then(function(registration) {
    registration.update();
  }).catch(function(error) {
    console.log('Service Worker registration failed:', error);
  });
}
