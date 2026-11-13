# Backrooms Nextbots: Render deployment

A tiny Node server that serves the game and relays multiplayer over WebSockets.
No database. Rooms live in memory.

## Deploy on Render
1. Put the **contents of this folder** (`server.js`, `package.json`, `render.yaml`, `public/`) at the ROOT of a GitHub/GitLab repo, not inside a subfolder (or set Root Directory in Render). `public/index.html` is ~14 MB, which is fine.
2. On https://dashboard.render.com choose **New + > Blueprint** and pick the repo (it reads `render.yaml`),
   or **New + > Web Service** with:
   - Runtime: Node
   - Build command: `npm install`
   - Start command: `node server.js`
   - Health check path: `/healthz`
3. Open the `https://<your-service>.onrender.com` URL and share it.

## Rooms
- Everyone who opens the same link is in the same room (`main`).
- Use `https://<your-service>.onrender.com/?room=friends` for a private room (letters, numbers, `-`, `_`).
- Max 16 players per room.

## Notes
- Run exactly **one instance** (rooms are held in memory, so 2+ instances would split players).
- The free plan sleeps after ~15 min idle; the first load afterwards takes ~30-60 s to wake up.
- Run locally: `npm install && npm start`, then open http://localhost:3000
- If the server can't be reached the game still works in single player.
