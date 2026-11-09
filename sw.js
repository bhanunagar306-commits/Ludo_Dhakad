/* sw.js - service worker: game ko offline chalane ke liye files cache karta hai */
const CACHE = "ludo-v9";   // game update karte waqt isse badlo: "ludo-v2", "ludo-v3"...
const FILES = ["./", "index.html", "style.css", "game.js", "ui.js", "manifest.json",
               "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png",
               "images/logo.png", "images/logo-animated.gif"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
