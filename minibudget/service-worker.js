const STATIC_CACHE = "mini-budget-static-v47";
const RUNTIME_CACHE = "mini-budget-runtime-v47";

// All paths are relative to the service worker scope:
// /mini-budget-app/minibudget/
const APP_SHELL = [
  "./index.html",
  "./style.css",
  "./app.js",
  "./firebase-config.js",
  "../manifest.json",
  "./icon-192.png",
  "./icon-256.png",
  "./icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);

    // Cache files independently so one missing asset does not break
    // the whole service worker installation.
    await Promise.allSettled(
      APP_SHELL.map(async url => {
        try {
          const request = new Request(url, { cache: "reload" });
          const response = await fetch(request);

          if (!response.ok) {
            console.warn(`[SW] Skip ${url}: HTTP ${response.status}`);
            return;
          }

          await cache.put(request, response.clone());
        } catch (error) {
          console.warn(`[SW] Skip ${url}:`, error);
        }
      })
    );

    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();

    await Promise.all(
      keys
        .filter(key =>
          key.startsWith("mini-budget-") &&
          key !== STATIC_CACHE &&
          key !== RUNTIME_CACHE
        )
        .map(key => caches.delete(key))
    );

    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Do not interfere with CDN, Firebase or other external requests.
  if (url.origin !== self.location.origin) return;

  const destination = request.destination;
  const isNavigation = request.mode === "navigate";
  const isFreshCode =
    isNavigation ||
    destination === "document" ||
    destination === "style" ||
    destination === "script";

  if (isFreshCode) {
    // Network first for HTML/CSS/JS so deployments are visible immediately.
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { cache: "no-store" });

        if (response && response.ok) {
          const cache = await caches.open(RUNTIME_CACHE);
          await cache.put(request, response.clone());
        }

        return response;
      } catch (error) {
        const cached = await caches.match(request);
        if (cached) return cached;

        if (isNavigation) {
          const fallback = await caches.match("./index.html");
          if (fallback) return fallback;
        }

        throw error;
      }
    })());

    return;
  }

  // Stale-while-revalidate for images, manifest and other local assets.
  event.respondWith((async () => {
    const cached = await caches.match(request);

    const networkPromise = fetch(request)
      .then(async response => {
        if (response && response.ok) {
          const cache = await caches.open(RUNTIME_CACHE);
          await cache.put(request, response.clone());
        }
        return response;
      })
      .catch(() => null);

    if (cached) {
      event.waitUntil(networkPromise);
      return cached;
    }

    const response = await networkPromise;
    if (response) return response;

    return new Response("Offline", {
      status: 503,
      statusText: "Offline"
    });
  })());
});
