const CACHE = "kana-terror-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./css/game.css",
  "./js/main.js",
  "./js/game.js",
  "./js/romaji.js",
  "./js/srs.js",
  "./js/content.js",
  "./js/render.js",
  "./js/audio.js",
  "./js/storage.js",
  "./data/n5-vocab.json",
  "./data/kanji.json",
  "./data/NOTICE.txt",
  "./manifest.webmanifest",
  "./favicon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((cache) => cache.put("./index.html", copy));
      return res;
    }).catch(() => caches.match("./index.html")));
    return;
  }
  event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((cache) => cache.put(req, copy));
    }
    return res;
  })));
});
