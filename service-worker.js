self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open('mini-budget-cache-v1').then(function(cache) {
      return cache.addAll([
        './',
        './index.html',
        './style.css',
        './app.js',
        './firebase-config.js',
        './mini-icon.png',
        './manifest.json'
      ]);
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