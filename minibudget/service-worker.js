const CACHE_NAME = "mini-budget-cache-v2";
const urlsToCache = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
  "/firebase-config.js",
  "/manifest.json",
  "/icon-192.png",
  "/icon-256.png",
  "/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});


self.addEventListener("activate", event => {

  event.waitUntil(

    caches.keys().then(keys =>

      Promise.all(

        keys
          .filter(
            key =>
              key !== CACHE_NAME
          )
          .map(
            key =>
              caches.delete(key)
          )

      )

    )

  );

});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
