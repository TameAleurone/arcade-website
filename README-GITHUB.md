# Arcade Website

This version is flattened and ready for the current GitHub repository layout.

## Upload
1. Put all files in this folder directly in the repository root.
2. Make sure `index.html` is in the repository root.
3. Commit and push to the `main` branch.
4. In GitHub: Settings -> Pages -> Deploy from a branch -> `main` -> `/ (root)`.

All game HTML, JavaScript, CSS, chess assets, and service-worker paths have been updated for this root layout.


## Online multiplayer
Tic Tac Toe, Connect Four, and Pong use PeerJS/WebRTC. For reliable internet play, use HTTPS (GitHub Pages) and allow WebRTC in the browser. The room code is the full code shown by Create Room.
