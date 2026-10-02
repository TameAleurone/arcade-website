# Arcade Hub

A collection of browser games and chess variants — no build step, just static files.
Installable as an offline-capable PWA, with optional WebSocket/JSONP online multiplayer.

## Run it

```bash
npm install
npm start          # http://localhost:8080 (serves the site + multiplayer server)
```

Or serve the folder with any static host (GitHub Pages, Neocities, …).
For online play from a static host, set `ARCADE_ONLINE_SERVER` in `online-config.js`
to wherever `server/server.js` is deployed.

## Layout

| Path | What it is |
|---|---|
| `index.html`, `hub.js`, `main.js` | Main hub, game registry (`registerGame`), shared helpers |
| `*.html` + matching `*.js` | One page per game |
| `engine.js`, `variant-ui.js`, `drawbacks.js`, `three-player.js` | Chess engine, variants and UI |
| `online.js`, `server/server.js` | Online multiplayer client and server |
| `sw.js`, `manifest.json`, `icon-*.png` | PWA / offline support |
| `tools/` | Dev-only prototypes (not served by the server) |

## Adding a game

1. Create `mygame.js` that calls `registerGame('mygame', 'My Game', '🎮', true, {init, destroy}, bestFn)`.
2. Copy any existing game page (e.g. `snake.html`) to `mygame.html` and change the ids/titles.
3. Add `<script src="mygame.js">` to `index.html` and a category in its `categories` map.
4. Add both files to `ASSETS_TO_CACHE` in `sw.js` and bump `CACHE_NAME`.
