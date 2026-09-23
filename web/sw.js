var VERSION = "pdg-party-v8";
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
  "/js/progress-merge.js",
  "/js/account.js",
  "/js/host.js",
  "/js/player.js",
  "/js/modes/boards.js",
  "/js/modes/lightning.js",
  "/js/modes/decoy.js",
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
  "/assets/audio/roast.wav",
  "/assets/img/logo.svg",
  "/assets/img/favicon.svg",
  "/assets/img/ramp.svg",
  "/assets/img/chief-idle.svg",
  "/assets/img/chief-talk.svg",
  "/assets/img/chief-roast.svg",
  "/assets/img/chief-celebrate.svg",
  "/assets/img/chief-facepalm.svg",
  "/assets/img/avatar-break-time.svg",
  "/assets/img/avatar-chk-ride.svg",
  "/assets/img/avatar-coffee-nco.svg",
  "/assets/img/avatar-fast-rope.svg",
  "/assets/img/avatar-hot-wash.svg",
  "/assets/img/avatar-last-light.svg",
  "/assets/img/avatar-open-book.svg",
  "/assets/img/avatar-regs-demon.svg",
  "/assets/img/chapter-1.svg",
  "/assets/img/chapter-2.svg",
  "/assets/img/chapter-3.svg",
  "/assets/img/chapter-4.svg",
  "/assets/img/chapter-5.svg",
  "/assets/img/chapter-6.svg",
  "/assets/img/chapter-7.svg",
  "/assets/img/chapter-8.svg",
  "/assets/img/chapter-9.svg",
  "/assets/img/chapter-10.svg",
  "/assets/img/chapter-11.svg",
  "/assets/img/chapter-12.svg",
  "/assets/img/chapter-13.svg",
  "/assets/img/chapter-14.svg",
  "/assets/img/chapter-15.svg",
  "/assets/img/chapter-16.svg",
  "/assets/img/chapter-17.svg",
  "/assets/img/chapter-18.svg",
  "/assets/img/chapter-19.svg",
  "/assets/img/chapter-20.svg",
  "/assets/img/chapter-21.svg",
  "/assets/img/chapter-22.svg",
  "/assets/img/chapter-23.svg",
  "/assets/img/chapter-24.svg",
  "/assets/img/icon-192.png",
  "/assets/img/icon-512.png",
  "/assets/icons/award.svg",
  "/assets/icons/book-open.svg",
  "/assets/icons/flag.svg",
  "/assets/icons/heart-pulse.svg",
  "/assets/icons/messages-square.svg",
  "/assets/icons/qr-code.svg",
  "/assets/icons/scale.svg",
  "/assets/icons/shield.svg",
  "/assets/icons/sun-moon.svg",
  "/assets/icons/timer.svg",
  "/assets/icons/users.svg",
  "/assets/icons/volume-2.svg",
  "/assets/icons/volume-x.svg",
  "/assets/icons/zap.svg"
];

function addEach(cache, urls) {
  return Promise.all(urls.map(function (url) {
    return cache.add(url).catch(function () { return null; });
  }));
}

self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(VERSION).then(function (cache) {
    return addEach(cache, CORE);
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
