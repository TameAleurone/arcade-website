# Arcade Hub — Online Multiplayer

This version replaces the browser-only PeerJS transport with a small WebSocket server that you control.

## What is online

The existing online modes are wired through the new transport:

- Standard Chess
- Fischer Random
- Antichess
- Dice Chess
- Spell Chess
- Drawback Chess
- Tic Tac Toe
- Connect Four
- Pong

The chess variants keep the host-authoritative design already present in the project. The host validates the game action and broadcasts the resulting state. Pong is host-authoritative for the simulation; the remote player sends paddle input.

## Run locally

Requires Node.js 18+.

```bash
npm install
npm start
```

Then open:

`http://localhost:8080`

Open the site in two browser windows/devices and use **Create Room** on one and **Join Room** on the other.

## Deploying online

The included Node server serves both the arcade and `/ws`, so a single Node-capable host is enough.

If the arcade is served by a different host, edit `online-config.js`:

```js
window.ARCADE_ONLINE_SERVER = 'https://your-server.example.com';
```

The browser will convert that to `wss://your-server.example.com/ws`.

For production, use HTTPS so the multiplayer socket is WSS.

### GitHub Pages

GitHub Pages can serve the static arcade files, but it cannot run the Node WebSocket server. You therefore need to run `server/server.js` on a separate Node-capable host and put that host's URL in `online-config.js`.

## Room/security model

Rooms are short-lived and kept in server memory. A room disappears when both players leave. The server does not persist game states or accounts.

The server limits each room to two connections and caps WebSocket messages at 256 KB.

Important: the current game implementations are still intentionally client/game-code authoritative rather than a full anti-cheat platform. The server provides transport and room isolation; for competitive games, the next step would be server-side validation of every move/state transition.

## Files added/changed

- `online.js` — WebSocket client transport
- `online-config.js` — multiplayer server URL
- `server/server.js` — room server + static file server
- `package.json` — Node dependency/start command
- `sw.js` — cache version bumped
- game HTML pages — load `online-config.js`
