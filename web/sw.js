var VERSION = "pdg-party-v3";
var CORE = [
  "/",
  "/index.html",
  "/play",
  "/play.html",
  "/manifest.webmanifest",
  "/css/app.css",
  "/js/qrcode.js",
  "/js/logic.js",
  "/js/audio.js",
  "/js/ws.js",
  "/js/sr.js",
  "/js/game.js",
  "/js/host.js",
  "/js/player.js",
  "/js/modes/boards.js",
  "/js/modes/lightning.js",
  "/js/modes/fibbage.js",
  "/js/modes/sjt.js",
  "/js/modes/teams.js",
  "/js/modes/hotwash.js",
  "/data/bundle.js",
  "/data/questions.json",
  "/data/sjt.json",
  "/data/lines.json",
  "/data/chapters.json",
  "/data/demo.json",
  "/assets/barlow-condensed-700.woff2",
  "/assets/source-sans-3-400.woff2",
  "/assets/source-sans-3-700.woff2",
  "/assets/audio/correct.wav",
  "/assets/audio/wrong.wav",
  "/assets/audio/tick.wav",
  "/assets/audio/join.wav",
  "/assets/audio/reveal.wav",
  "/assets/audio/fanfare.wav",
  "/assets/img/logo.svg",
  "/assets/img/chief-idle.svg",
  "/assets/img/icon-192.png",
  "/assets/img/icon-512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(VERSION).then(function (cache) {
    return cache.addAll(CORE).catch(function () { return cache.addAll(["/", "/index.html", "/play.html", "/css/app.css"]); });
  }));
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }));
  self.clients.claim();
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/ws" || url.pathname.indexOf("/api/") === 0) return;
  event.respondWith(caches.open(VERSION).then(function (cache) {
    return cache.match(req).then(function (hit) {
      var fetched = fetch(req).then(function (res) {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(function () { return hit; });
      return hit || fetched;
    });
  }));
});
