const CACHE_NAME = "mini-budget-cache-v1";
const urlsToCache = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
  "/firebase-config.js",
  "/manifest.json",
  "/icon-192.png",
  "/icon-256.png",
  "/icon-512.png",
  "https://cdn.jsdelivr.net/npm/chart.js"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
