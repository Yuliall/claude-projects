const CACHE = 'english-trainer-v3';
const FILES = [
  './', 'index.html', 'style.css', 'manifest.webmanifest', 'icon.svg',
  'js/db.js', 'js/srs.js', 'js/util.js', 'js/study.js', 'js/views-words.js', 'js/views-grammar.js',
  'js/expr-core.js', 'js/views-expr.js', 'js/app.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Спочатку мережа, щоб оновлення приходили одразу; без мережі працює з кешу.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
