const CACHE_NAME = 'arcade-v4';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './style.css',
  './b.png',
  './d_b.png',
  './d_k.png',
  './d_n.png',
  './d_p.png',
  './d_q.png',
  './d_r.png',
  './k.png',
  './n.png',
  './p.png',
  './q.png',
  './r.png'
];

// Keep HTML and JavaScript fresh so updated game/multiplayer code is used.
const NETWORK_FIRST_EXTENSIONS = [
  '.html',
  '.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => key !== CACHE_NAME ? caches.delete(key) : undefined)
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isFreshFile =
    isSameOrigin &&
    NETWORK_FIRST_EXTENSIONS.some((ext) => url.pathname.toLowerCase().endsWith(ext));

  if (isFreshFile) {
    // Always try the newest HTML/JS first. Fall back to cache when offline.
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Images/CSS and other cached assets use cache-first.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((response) => {
        if (response.ok && isSameOrigin) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      });
    })
  );
});
