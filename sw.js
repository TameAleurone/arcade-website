const CACHE_NAME = 'arcade-v3';

const ASSETS_TO_CACHE = ['./', './index.html', './2048.html', './antichess.html', './b.png', './breakout.html', './breakout.js', './chess.html', './chess_hub.html', './clicker.html', './clicker.js', './connect_four.html', './connectfour.js', './d_b.png', './d_k.png', './d_n.png', './d_p.png', './d_q.png', './d_r.png', './dice_chess.html', './dino.html', './dino.js', './dodger.html', './dodger.js', './drawback_chess.html', './drawbacks.js', './dwarves.html', './dwarves.js', './engine.js', './fischer_random.html', './flyer.html', './flyer.js', './game2048.js', './hub.js', './idle_miner.html', './idle_miner.js', './k.png', './main.js', './manifest.json', './mario.html', './mario.js', './memory.html', './memory.js', './minesweeper.html', './minesweeper.js', './n.png', './p.png', './pong.html', './pong.js', './q.png', './r.png', './reflex.html', './reflex.js', './snake.html', './snake.js', './spell_chess.html', './stats.js', './stats_hub.html', './style.css', './tetris.html', './tetris.js', './three-player.js', './three_player_chess.html', './tictactoe.html', './tictactoe.js', './two_player_hub.html', './two_player_hub.js', './variant-ui.js', './wheel.html', './wheel.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((key) => key !== CACHE_NAME ? caches.delete(key) : undefined)
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return response;
    }))
  );
});
