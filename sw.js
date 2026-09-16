const CACHE_NAME = 'arcade-v1';

// List of all static assets to cache for offline access
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/style.css',
  './js/main.js',
  './js/games/stats.js',
  './games/chess_hub.html',
  './games/two_player_hub.html',
  './games/stats_hub.html',
  './games/2048.html',
  './games/antichess.html',
  './games/breakout.html',
  './games/chess.html',
  './games/clicker.html',
  './games/connect_four.html',
  './games/dice_chess.html',
  './games/dino.html',
  './games/dodger.html',
  './games/drawback_chess.html',
  './games/dwarves.html',
  './games/fischer_random.html',
  './games/flyer.html',
  './games/idle_miner.html',
  './games/mario.html',
  './games/memory.html',
  './games/minesweeper.html',
  './games/pong.html',
  './games/reflex.html',
  './games/snake.html',
  './games/spell_chess.html',
  './games/tetris.html',
  './games/three_player_chess.html',
  './games/tictactoe.html',
  './games/wheel.html'
];

// Cache all assets on installation
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Purge obsolete caches on activation
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Serve assets from cache first, falling back to network fetch
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        // Cache newly loaded dynamic assets on the fly
        if (event.request.method === 'GET' && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      });
    })
  );
});