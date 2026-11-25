/* PEARL App service worker: keeps the app and all lessons available offline. */
var CACHE = 'pearl-app-v1.2.0';
var CORE = ['./', 'index.html', 'config.js', 'default-content.js', 'css/app.css', 'js/core.js', 'js/checker.js', 'js/student.js', 'js/teacher.js', 'js/reports.js', 'js/main.js',
  'gas-shim.js', 'demo-server.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/pearl-logo.png'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) { return Promise.all(keys.filter(function (k) { return k !== CACHE && k !== CACHE + '-fonts'; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return; // API calls (POST) always go to the network
  var url = new URL(req.url);
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) { // cache the app fonts for offline use
    e.respondWith(caches.open(CACHE + '-fonts').then(function (c) { return c.match(req).then(function (r) { return r || fetch(req).then(function (res) { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }); }); }));
    return;
  }
  if (url.origin !== location.origin) return;
  // network-first for the page and config (gets updates), cache-first for everything else
  var networkFirst = req.mode === 'navigate' || /config\.js$/.test(url.pathname);
  if (networkFirst) {
    e.respondWith(fetch(req).then(function (res) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); return res; })
      .catch(function () { return caches.match(req).then(function (r) { return r || caches.match('index.html'); }); }));
    return;
  }
  e.respondWith(caches.match(req).then(function (r) {
    return r || fetch(req).then(function (res) { if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); } return res; });
  }));
});
