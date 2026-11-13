// Static file server + WebSocket room relay for the Backrooms Nextbots game.
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib'), crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary' };
const MAX_PER_ROOM = 16, MAX_ROOMS = 200, TICK_MS = 66;
const rooms = new Map(); // name -> Map(id -> {ws, presence, last})

// Serve the game (pre-compressed once, the page is large)
const page = fs.readFileSync(path.join(PUBLIC, 'index.html'));
const pageGz = zlib.gzipSync(page, { level: 9 });
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  if (url === '/' || url === '/index.html') {
    const gz = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', ...(gz ? { 'Content-Encoding': 'gzip' } : {}) });
    return res.end(gz ? pageGz : page);
  }
  // Any other file inside public/ (images, extra JS/CSS). Path traversal is blocked.
  const file = path.normalize(path.join(PUBLIC, decodeURIComponent(url)));
  if (file.startsWith(PUBLIC + path.sep)) {
    return fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      res.end(data);
    });
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found');
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8192 });
wss.on('connection', (ws, req) => {
  const q = new URL(req.url, 'http://x').searchParams.get('room') || 'main';
  const name = /^[\w-]{1,32}$/.test(q) ? q : 'main';
  let room = rooms.get(name);
  if (!room) {
    if (rooms.size >= MAX_ROOMS) return ws.close(1013, 'busy');
    rooms.set(name, room = { clients: new Map(), dirty: false });
  }
  if (room.clients.size >= MAX_PER_ROOM) return ws.close(1013, 'room full');
  const id = crypto.randomBytes(3).toString('hex');
  const c = { ws, presence: null, last: 0, alive: true };
  room.clients.set(id, c); room.dirty = true;

  ws.on('pong', () => { c.alive = true; });
  ws.on('message', data => {
    let m; try { m = JSON.parse(data); } catch { return; }
    if (!m || m.t !== 'p' || !m.p || typeof m.p !== 'object' || Array.isArray(m.p)) return;
    const now = Date.now(); if (now - c.last < 25) return; c.last = now; // rate limit
    if (typeof m.p.n === 'string') m.p.n = m.p.n.slice(0, 24);
    c.presence = m.p; room.dirty = true;
  });
  ws.on('close', () => {
    room.clients.delete(id); room.dirty = true;
    if (!room.clients.size) rooms.delete(name);
  });
  ws.on('error', () => {});
});

// Broadcast room snapshots at a fixed rate (only when something changed)
setInterval(() => {
  for (const room of rooms.values()) {
    if (!room.dirty) continue; room.dirty = false;
    const peers = [...room.clients].map(([peer, c]) => ({ peer, presence: c.presence }));
    for (const [me, c] of room.clients) if (c.ws.readyState === 1) c.ws.send(JSON.stringify({ t: 'peers', me, peers }));
  }
}, TICK_MS);

// Drop dead connections
setInterval(() => {
  for (const room of rooms.values()) for (const c of room.clients.values()) {
    if (!c.alive) { c.ws.terminate(); continue; }
    c.alive = false; try { c.ws.ping(); } catch {}
  }
}, 15000);

server.listen(PORT, '0.0.0.0', () => console.log(`Server is running on port ${PORT}`));
