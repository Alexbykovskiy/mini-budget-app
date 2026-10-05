const CACHE_NAME = "mini-budget-cache-v5";

const APP_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./firebase-config.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-256.png",
  "./icon-512.png"
];


/* =========================================================
   INSTALL
   ========================================================= */

self.addEventListener("install", event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      /*
       * Кэшируем файлы по одному.
       * Если какого-то файла нет, установка Service Worker
       * всё равно не упадёт целиком.
       */
      await Promise.allSettled(
        APP_ASSETS.map(async path => {
          try {
            const url = new URL(
              path,
              self.registration.scope
            );

            const response = await fetch(
              url.href,
              {
                cache: "reload"
              }
            );

            if (!response.ok) {
              console.warn(
                "SW: файл не закэширован:",
                url.href,
                response.status
              );

              return;
            }

            await cache.put(
              url.href,
              response
            );

          } catch (error) {
            console.warn(
              "SW: ошибка кэширования:",
              path,
              error
            );
          }
        })
      );

      /*
       * Не ждём закрытия старых вкладок.
       */
      await self.skipWaiting();
    })()
  );
});


/* =========================================================
   ACTIVATE
   ========================================================= */

self.addEventListener("activate", event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();

      /*
       * Удаляем старые версии кэша Mini Budget.
       */
      await Promise.all(
        keys
          .filter(
            key =>
              key.startsWith("mini-budget-cache-") &&
              key !== CACHE_NAME
          )
          .map(key => caches.delete(key))
      );

      /*
       * Новый Service Worker сразу берёт страницу под контроль.
       */
      await self.clients.claim();
    })()
  );
});


/* =========================================================
   FETCH
   ========================================================= */

self.addEventListener("fetch", event => {
  const request = event.request;

  /*
   * POST, Firebase и другие не-GET запросы не трогаем.
   */
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  /*
   * Не вмешиваемся в CDN, Firebase и другие внешние сайты.
   */
  if (url.origin !== self.location.origin) {
    return;
  }


  /*
   * HTML / CSS / JS
   *
   * Сначала интернет.
   * Если новая версия доступна, сразу показываем её.
   * Кэш используется только при отсутствии сети.
   */
  const networkFirst =
    request.mode === "navigate" ||
    request.destination === "document" ||
    request.destination === "style" ||
    request.destination === "script";

  if (networkFirst) {
    event.respondWith(
      networkFirstResponse(request)
    );

    return;
  }


  /*
   * Картинки, иконки и прочая статика:
   * показываем кэш сразу,
   * параллельно обновляем его из сети.
   */
  event.respondWith(
    staleWhileRevalidate(request)
  );
});


/* =========================================================
   NETWORK FIRST
   ========================================================= */

async function networkFirstResponse(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(
      request,
      {
        cache: "no-store"
      }
    );

    if (response && response.ok) {
      await cache.put(
        request,
        response.clone()
      );
    }

    return response;

  } catch (error) {

    const cached =
      await caches.match(request);

    if (cached) {
      return cached;
    }


    /*
     * Если офлайн открываем страницу,
     * пытаемся показать сохранённый index.html.
     */
    if (request.mode === "navigate") {
      const indexUrl = new URL(
        "./index.html",
        self.registration.scope
      );

      const fallback =
        await caches.match(indexUrl.href);

      if (fallback) {
        return fallback;
      }
    }


    return new Response(
      "Нет соединения с интернетом",
      {
        status: 503,
        headers: {
          "Content-Type":
            "text/plain; charset=utf-8"
        }
      }
    );
  }
}


/* =========================================================
   STALE WHILE REVALIDATE
   ========================================================= */

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);

  const cached =
    await cache.match(request);

  const networkPromise = fetch(request)
    .then(async response => {

      if (
        response &&
        response.ok
      ) {
        await cache.put(
          request,
          response.clone()
        );
      }

      return response;
    })
    .catch(() => null);


  /*
   * Если файл уже есть в кэше,
   * возвращаем его мгновенно.
   */
  if (cached) {
    networkPromise;
    return cached;
  }


  /*
   * Если кэша нет, ждём сеть.
   */
  const response =
    await networkPromise;

  if (response) {
    return response;
  }


  return new Response(
    "",
    {
      status: 504
    }
  );
}