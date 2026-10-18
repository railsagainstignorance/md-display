// md-display's service worker, generated at build time (build/offline.ts
// fills in the version and file list): the whole app is cached on install,
// Mermaid's chunks included, so it works offline. A new version is used once
// every tab of the old one has closed.

const CACHE = "mddisplay-__VERSION__";
const FILES = __FILES__;
const PAGE = new URL("./", self.registration.scope).href;
/** The local server's docs and changes (server/): always fetched fresh. */
const API = new URL("./api/", self.registration.scope).href;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(["./", ...FILES])));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("mddisplay-") && k !== CACHE).map((k) => caches.delete(k)))),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.href.startsWith(API)) return;
  // The page itself, whatever doc its query names (?doc=…).
  const isPage = request.mode === "navigate" && (url.href.split(/[?#]/)[0] === PAGE || url.pathname.endsWith("/index.html"));
  const key = isPage ? PAGE : request;
  // ignoreVary: module scripts send an Origin header the cached copies were fetched without.
  event.respondWith(
    caches.open(CACHE).then(async (cache) => (await cache.match(key, { ignoreSearch: true, ignoreVary: true })) ?? fetch(request)),
  );
});
