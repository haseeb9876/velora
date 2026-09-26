const CACHE = "velora-shell-v1";
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll([
          "/",
          "/manifest.webmanifest",
          "/favicon.svg",
          "/icons/icon-192.png",
          "/icons/icon-512.png",
        ]),
      ),
  );
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/files/")
  )
    return;
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            event.waitUntil(
              caches.open(CACHE).then((cache) => cache.put("/", clone)),
            );
          }
          return response;
        })
        .catch(() => caches.match("/")),
    );
  } else if (
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/icons/")
  ) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              event.waitUntil(
                caches
                  .open(CACHE)
                  .then((cache) => cache.put(event.request, clone)),
              );
            }
            return response;
          }),
      ),
    );
  }
});
