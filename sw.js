const V = 'att-v9', FILES = ['./', './index.html', './app.js', './manifest.json', './icon-192.png', './icon-512.png', './lib/html5-qrcode.min.js', './generator.html', './lib/qrcode.js', './card.js', './card-config.js', './logo.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return; // طلبات الـ Apps Script بتعدي عادي
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
});
