// Build-time versioning ensures that every release installs a new app shell.
const VERSION = "__VELORA_BUILD__";
const CACHE = `velora-shell-${VERSION}`;
const BUILD_ASSETS = ["__VELORA_ASSETS__"];
const PRECACHE = [
  "/",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/brand-mark.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  ...BUILD_ASSETS,
];
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll(
          PRECACHE.map((url) => new Request(url, { cache: "reload" })),
        ),
      ),
  );
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "GET_VERSION")
    event.ports[0]?.postMessage({ version: VERSION });
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = (await caches.keys()).filter((key) =>
        key.startsWith("velora-shell-"),
      );
      const previous = keys.filter((key) => key !== CACHE).at(-1);
      await Promise.all(
        keys
          .filter((key) => key !== CACHE && key !== previous)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/files/") ||
    url.pathname === "/version.json" ||
    url.pathname === "/sw.js"
  )
    return;
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(new Request(event.request, { cache: "no-cache" })).catch(async () =>
        (await caches.open(CACHE)).match("/", { ignoreVary: true }),
      ),
    );
  } else if (PRECACHE.includes(url.pathname)) {
    event.respondWith(
      caches.open(CACHE).then(
        async (cache) =>
          // These are public build assets; Origin-dependent server headers must not break offline reads.
          (await cache.match(url.pathname, { ignoreVary: true })) ||
          fetch(event.request),
      ),
    );
  }
});
