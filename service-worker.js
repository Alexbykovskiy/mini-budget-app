const STATIC_CACHE = "my-apps-static-v50";
const RUNTIME_CACHE = "my-apps-runtime-v50";

const APP_SHELL = [
  './shared/vendor/12.19.0/firebase-app-compat.js',
  './shared/vendor/12.19.0/firebase-auth-compat.js',
  './shared/vendor/12.19.0/firebase-firestore-compat.js',
  './shared/firebase-config.js',
  './shared/owner-access.js',
  './shared/auth.js',
  './shared/auth.css',
  "/mini-budget-app/",
  "/mini-budget-app/index.html",
  "/mini-budget-app/style.css",
  "/mini-budget-app/manifest.json",
  "/mini-budget-app/apple-touch-icon.png",
  "/mini-budget-app/icon-192.png",
  "/mini-budget-app/icon-512.png",
  "/mini-budget-app/favicon.ico",
  "/mini-budget-app/budget-control/index.html",
  "/mini-budget-app/budget-control/style.css",
  "/mini-budget-app/budget-control/app.mjs",
  "/mini-budget-app/budget-control/core.mjs",
  "/mini-budget-app/budget-control/seed.mjs",
  "/mini-budget-app/budget-control/adapters.mjs",
  "/mini-budget-app/budget-control/commands.mjs",
  "/mini-budget-app/budget-control/store.mjs",
  "/mini-budget-app/budget-control/config.mjs",
  "/mini-budget-app/budget-control/reminders.mjs"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await Promise.allSettled(APP_SHELL.map(async url => {
      try {
        const response = await fetch(new Request(url, { cache: "reload" }));
        if (response.ok) await cache.put(url, response.clone());
      } catch (error) {
        console.warn("[My Apps SW] Skip", url, error);
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith("my-apps-") && key !== STATIC_CACHE && key !== RUNTIME_CACHE)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.pathname.startsWith('/__/auth/') || url.pathname.startsWith('/__/firebase/')) return;
  if (url.origin !== self.location.origin) return;

  const fresh = request.mode === "navigate" || ["document", "style", "script"].includes(request.destination);

  if (fresh) {
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
        if (request.mode === "navigate") {
          if (url.pathname.startsWith("/mini-budget-app/budget-control/")) {
            const budget = await caches.match("/mini-budget-app/budget-control/index.html");
            if (budget) return budget;
          }
          const fallback = await caches.match("/mini-budget-app/index.html");
          if (fallback) return fallback;
        }
        return new Response("Offline", { status: 503, statusText: "Offline" });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    const network = fetch(request).then(async response => {
      if (response && response.ok) {
        const cache = await caches.open(RUNTIME_CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    }).catch(() => null);

    if (cached) {
      event.waitUntil(network);
      return cached;
    }

    return (await network) || new Response("Offline", { status: 503, statusText: "Offline" });
  })());
});
