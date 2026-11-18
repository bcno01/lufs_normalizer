const CACHE_VERSION = "v5";
const SHELL_CACHE = `lufs-normalizer-shell-${CACHE_VERSION}`;

const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/style.css",
  "./src/main.js",
  "./src/lufsMeter.js",
  "./src/presets.js",
  "./src/wavEncoder.js",
  "./src/player.js",
  "./src/ruler.js",
  "./fonts/BarlowCondensed-600.woff2",
  "./fonts/BarlowCondensed-700.woff2",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    // HTTPキャッシュ(GitHub Pagesは約10分)に残った古いファイルを拾わないよう、毎回サーバーから取り直す
    caches
      .open(SHELL_CACHE)
      .then((cache) => Promise.all(SHELL_FILES.map((file) => cache.add(new Request(file, { cache: "reload" })))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
