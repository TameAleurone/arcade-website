const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT || 8080);
const ROOT = path.resolve(__dirname, '..');
const MAX_MESSAGE = 256 * 1024;
const MAX_ROOMS = 2000;
const ACTION_WINDOW_MS = 10000;
const ACTION_LIMIT = 20; // host/join attempts per window, per connection or IP
// Some static hosts (Neocities free tier, notably) send every page a
// Content-Security-Policy with `connect-src 'self'`, which blocks fetch,
// XHR, *and* WebSocket to any other origin — the browser refuses to even
// try, and there's no way for the page itself to loosen a server-sent
// header. `script-src` on those same hosts is normally wide open, though,
// which is what makes classic JSONP (data delivered as the body of a
// <script src="..."> tag, which isn't subject to connect-src at all) the
// standard workaround. The /jsonp/* routes below are that workaround: a
// parallel transport offering the exact same room protocol as the
// WebSocket path, so a page that can't open a socket can still play.
// Since JSONP has no persistent connection, "presence" is simulated with
// a poll the client is expected to keep re-issuing; the poll is held open
// (classic long-polling) so delivery still feels close to instant instead
// of only arriving on a fixed timer.
// Render's free-tier proxy has been reported to cut off a single request
// at around 15s (community.render.com/t/15-second-request-timeout/568) —
// holding a long-poll open for exactly that long meant it could get cut
// off by the *platform* before this server ever got to respond, with no
// error surfacing anywhere except the guest's screen quietly never
// updating again. 9s leaves real margin under that, and the periodic
// keep-alive write below (see pollWaiters) is a second line of defense
// in case some other host's proxy times out on idle bytes rather than
// total duration.
const JSONP_LONGPOLL_MS = 9000;
const JSONP_KEEPALIVE_MS = 4000; // how often to write a harmless keep-alive chunk while a poll waits
const JSONP_STALE_MS = 20000; // a jsonp peer that hasn't polled in this long is treated as gone
const rooms = new Map();

function roomCode(){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({length:6},()=>chars[Math.floor(Math.random()*chars.length)]).join('');
  } while(rooms.has(code));
  return code;
}

function makeToken(){
  return crypto.randomBytes(16).toString('hex');
}

function wsSend(ws, msg){
  if(ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function wsFail(ws, message){
  wsSend(ws,{type:'error',message});
}

// --- Peer abstraction ------------------------------------------------
// A room's host/guest slot holds a "peer": either {kind:'ws', ws} for a
// real live socket, or {kind:'jsonp', token, queue, lastSeen, waiter} for
// a client polling over plain HTTP. Everything above this line (and the
// game code in the browser) only ever deals in room codes and messages,
// never caring which transport the *other* side is using — a host on
// GitHub Pages (WebSocket) and a guest on Neocities (JSONP) can play each
// other without either side knowing the difference.
// A waiting poll's headers are sent as soon as the wait begins (see
// /jsonp/poll below), so finishing it is always a plain res.end() with
// the real payload — never a fresh writeHead. clearJsonpWaiter() alone
// (no write) is for an aborted connection, where there's nothing left to
// write to.
function clearJsonpWaiter(peer){
  const w = peer.waiter;
  if(!w) return null;
  peer.waiter = null;
  clearTimeout(w.timer);
  if(w.keepAlive) clearInterval(w.keepAlive);
  return w;
}
function finishJsonpWait(peer, data){
  const w = clearJsonpWaiter(peer);
  if(!w) return;
  try{ w.res.end(w.cb+'('+JSON.stringify(data)+');'); }catch(_){}
}

function peerSend(peer, msg){
  if(!peer) return;
  if(peer.kind==='ws'){ wsSend(peer.ws, msg); return; }
  if(peer.waiter){ finishJsonpWait(peer, [msg]); return; }
  peer.queue.push(msg);
  if(peer.queue.length>200) peer.queue.shift(); // drop oldest if a peer stops polling but isn't stale yet
}

// Keep the newest authoritative chess state in the room as well as forwarding
// it to the other player. This makes a state packet recoverable if a browser,
// proxy, or JSONP request drops that particular response.
function rememberRoomState(room, payload){
  if(!room || !payload || payload.type!=='state') return;
  room.latestState=payload;
}

function sendLatestRoomState(room, peer){
  if(!room || !peer || !room.latestState) return;
  peerSend(peer,{type:'message',payload:room.latestState});
}

function leaveRoomPeer(room, peer){
  if(!room || !peer) return;
  if(room.host===peer) room.host=null;
  if(room.guest===peer) room.guest=null;
  if(peer.kind==='jsonp' && peer.waiter) finishJsonpWait(peer, []);
  const other=room.host || room.guest;
  if(other) peerSend(other,{type:'peer-disconnected'});
  if(!room.host && !room.guest) rooms.delete(room.code);
}

// --- JSONP helpers -----------------------------------------------------
const CALLBACK_RE = /^[A-Za-z_$][\w$]{0,60}$/;

function respondJsonp(res, cbName, data){
  res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'});
  res.end(cbName+'('+JSON.stringify(data)+');');
}

const ipActionTimestamps = new Map();
function ipRateLimited(ip){
  const now=Date.now();
  const arr=(ipActionTimestamps.get(ip)||[]).filter(t=>now-t<ACTION_WINDOW_MS);
  if(arr.length>=ACTION_LIMIT){ ipActionTimestamps.set(ip,arr); return true; }
  arr.push(now); ipActionTimestamps.set(ip,arr);
  return false;
}
setInterval(()=>{
  const now=Date.now();
  for(const [ip,arr] of ipActionTimestamps){
    const fresh=arr.filter(t=>now-t<ACTION_WINDOW_MS);
    if(fresh.length) ipActionTimestamps.set(ip,fresh); else ipActionTimestamps.delete(ip);
  }
}, 60000);

function handleJsonp(req, res, pathname, params){
  const cb = params.get('callback')||'';
  if(!CALLBACK_RE.test(cb)){ res.writeHead(400,{'Content-Type':'text/plain'}); return res.end('Invalid or missing callback.'); }

  const ip = (req.socket && req.socket.remoteAddress) || 'unknown';
  const code = String(params.get('room')||'').toUpperCase();
  const role = params.get('role');
  const token = String(params.get('token')||'');

  if(pathname==='/jsonp/host'){
    if(ipRateLimited(ip)) return respondJsonp(res,cb,{type:'error',message:'Too many attempts. Please slow down.'});
    if(rooms.size>=MAX_ROOMS) return respondJsonp(res,cb,{type:'error',message:'The server is at capacity. Please try again shortly.'});
    const newCode=roomCode();
    const hostToken=makeToken();
    const peer={kind:'jsonp', token:hostToken, queue:[], lastSeen:Date.now(), waiter:null};
    rooms.set(newCode,{code:newCode, host:peer, guest:null, hostToken, latestState:null});
    return respondJsonp(res,cb,{type:'hosted',room:newCode,token:hostToken});
  }

  if(pathname==='/jsonp/join'){
    if(ipRateLimited(ip)) return respondJsonp(res,cb,{type:'error',message:'Too many attempts. Please slow down.'});
    const room=rooms.get(code);
    if(!room) return respondJsonp(res,cb,{type:'error',message:'Room not found. Check the code and make sure the host is still connected.'});
    if(room.guest) return respondJsonp(res,cb,{type:'error',message:'That room is already full.'});
    const guestToken=makeToken();
    const peer={kind:'jsonp', token:guestToken, queue:[], lastSeen:Date.now(), waiter:null};
    room.guest=peer;
    if(room.host) peerSend(room.host,{type:'peer-connected'});
    // If this is a reconnect or a guest joining after the host already has
    // an authoritative position, give the guest that position immediately.
    sendLatestRoomState(room, peer);
    return respondJsonp(res,cb,{type:'joined',room:code,token:guestToken});
  }

  if(pathname==='/jsonp/reclaim'){
    if(ipRateLimited(ip)) return respondJsonp(res,cb,{type:'error',message:'Too many attempts. Please slow down.'});
    const room=rooms.get(code);
    if(!room) return respondJsonp(res,cb,{type:'error',message:'That room no longer exists.'});
    if(room.host) return respondJsonp(res,cb,{type:'error',message:'That room already has a host connected.'});
    if(!token || room.hostToken!==token) return respondJsonp(res,cb,{type:'error',message:'Could not reclaim that room.'});
    const peer={kind:'jsonp', token, queue:[], lastSeen:Date.now(), waiter:null};
    room.host=peer;
    if(room.guest) peerSend(room.guest,{type:'peer-connected'});
    // Reclaimed hosts keep the room's cached state; no game reset is needed.
    return respondJsonp(res,cb,{type:'hosted',room:code,token});
  }

  // Everything past this point acts on an existing peer, so it needs to
  // authenticate the caller with the token that was handed out above —
  // unlike a WebSocket connection, a JSONP request has no identity of its
  // own beyond what it presents each time.
  const room=rooms.get(code);
  if(!room) return respondJsonp(res,cb,{type:'error',message:'Room no longer exists.'});
  if(role!=='host' && role!=='guest') return respondJsonp(res,cb,{type:'error',message:'Invalid role.'});
  const peer = role==='host' ? room.host : room.guest;
  if(!peer || peer.kind!=='jsonp' || peer.token!==token) return respondJsonp(res,cb,{type:'error',message:'Not authorized for that room.'});

  if(pathname==='/jsonp/send'){
    const payloadRaw=params.get('payload')||'';
    if(payloadRaw.length>MAX_MESSAGE) return respondJsonp(res,cb,{type:'error',message:'Message too large.'});
    let payload;
    try{ payload=JSON.parse(payloadRaw); }catch{ return respondJsonp(res,cb,{type:'error',message:'Invalid message.'}); }
    peer.lastSeen=Date.now();

    // A guest's sync request can be answered from the room cache directly.
    // This is important because the original request could itself have been
    // delivered while the corresponding state packet was lost.
    if(role==='guest' && payload && payload.type==='requestSync'){
      sendLatestRoomState(room, peer);
      return respondJsonp(res,cb,{type:'ack'});
    }

    if(role==='host') rememberRoomState(room,payload);
    const other = role==='host' ? room.guest : room.host;
    if(other) peerSend(other,{type:'message',payload});
    return respondJsonp(res,cb,{type:'ack'});
  }

  if(pathname==='/jsonp/poll'){
    peer.lastSeen=Date.now();
    if(peer.queue.length){
      const msgs=peer.queue.splice(0,peer.queue.length);
      return respondJsonp(res,cb,msgs);
    }
    // Nothing queued yet — hold the request open (classic long-poll) so
    // the reply can go out the instant something arrives, instead of the
    // client only finding out on its next fixed-interval poll. Headers go
    // out now (not when the wait ends) so the periodic keep-alive below
    // can write to an already-open response.
    if(peer.waiter) finishJsonpWait(peer, []);
    res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'});
    // A harmless empty statement, just to put bytes on the wire — some
    // hosts' proxies time out a request that goes quiet for too long even
    // if the overall duration is still under their hard cap.
    const keepAlive=setInterval(()=>{ try{ res.write(';\n'); }catch(_){} }, JSONP_KEEPALIVE_MS);
    const timer=setTimeout(()=>{
      if(peer.waiter && peer.waiter.res===res) finishJsonpWait(peer, []);
    }, JSONP_LONGPOLL_MS);
    peer.waiter={res,cb,timer,keepAlive};
    req.on('close',()=>{ if(peer.waiter && peer.waiter.res===res) clearJsonpWaiter(peer); });
    return;
  }

  if(pathname==='/jsonp/leave'){
    leaveRoomPeer(room, peer);
    return respondJsonp(res,cb,{type:'ok'});
  }

  res.writeHead(404,{'Content-Type':'text/plain'}); return res.end('Not found');
}

setInterval(()=>{
  const now=Date.now();
  for(const room of rooms.values()){
    if(room.host && room.host.kind==='jsonp' && now-room.host.lastSeen>JSONP_STALE_MS) leaveRoomPeer(room, room.host);
    if(room.guest && room.guest.kind==='jsonp' && now-room.guest.lastSeen>JSONP_STALE_MS) leaveRoomPeer(room, room.guest);
  }
}, 15000);

const server=http.createServer((req,res)=>{
  let parsedUrl, pathname;
  try { parsedUrl = new URL(req.url, `http://${req.headers.host}`); pathname = decodeURIComponent(parsedUrl.pathname); }
  catch { res.writeHead(400); return res.end('Bad request'); }

  if(pathname==='/health'){
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
    return res.end(JSON.stringify({ok:true,rooms:rooms.size}));
  }

  if(pathname.startsWith('/jsonp/')){
    return handleJsonp(req, res, pathname, parsedUrl.searchParams);
  }

  // The Node server can serve the whole arcade, so the online transport
  // and the website can share one origin.
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/,'');
  const file = path.resolve(ROOT, rel);
  if(file !== ROOT && !file.startsWith(ROOT + path.sep)){
    res.writeHead(403); return res.end('Forbidden');
  }
  fs.stat(file,(err,st)=>{
    if(err || !st.isFile()){
      res.writeHead(404,{'Content-Type':'text/plain'}); return res.end('Not found');
    }
    const ext=path.extname(file).toLowerCase();
    const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
      '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8',
      '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml',
      '.webp':'image/webp','.ico':'image/x-icon'};
    res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':ext==='.html'||ext==='.js'?'no-cache':'public, max-age=3600'});
    fs.createReadStream(file).pipe(res);
  });
});

const wss=new WebSocketServer({server,path:'/ws',maxPayload:MAX_MESSAGE});

wss.on('connection',(ws)=>{
  ws.roomCode=null; ws.role=null; ws.peer=null;
  ws.isAlive=true;
  ws.actionTimestamps=[];
  ws.on('pong',()=>{ ws.isAlive=true; });

  // Basic anti-abuse: cap how often one connection can try to host/join,
  // so a client can't hammer the server creating rooms or guessing codes.
  function rateLimited(){
    const now=Date.now();
    ws.actionTimestamps=ws.actionTimestamps.filter(t=>now-t<ACTION_WINDOW_MS);
    if(ws.actionTimestamps.length>=ACTION_LIMIT) return true;
    ws.actionTimestamps.push(now);
    return false;
  }

  function cleanup(){
    if(ws.roomCode){ const room=rooms.get(ws.roomCode); leaveRoomPeer(room, ws.peer); }
    ws.roomCode=null; ws.role=null; ws.peer=null;
  }

  ws.on('message',(raw)=>{
    if(raw.length>MAX_MESSAGE) return wsFail(ws,'Message too large.');
    let msg;
    try { msg=JSON.parse(raw.toString()); } catch { return wsFail(ws,'Invalid message.'); }

    if(msg.action==='host'){
      if(ws.roomCode) return wsFail(ws,'You are already in a room.');
      if(rateLimited()) return wsFail(ws,'Too many attempts. Please slow down.');
      if(rooms.size>=MAX_ROOMS) return wsFail(ws,'The server is at capacity. Please try again shortly.');
      const code=roomCode();
      const token=makeToken();
      const peer={kind:'ws', ws};
      rooms.set(code,{code, host:peer, guest:null, hostToken:token, latestState:null});
      ws.roomCode=code; ws.role='host'; ws.peer=peer;
      return wsSend(ws,{type:'hosted',room:code,token});
    }

    if(msg.action==='join'){
      if(ws.roomCode) return wsFail(ws,'You are already in a room.');
      if(rateLimited()) return wsFail(ws,'Too many attempts. Please slow down.');
      const code=String(msg.room||'').toUpperCase();
      const room=rooms.get(code);
      if(!room) return wsFail(ws,'Room not found. Check the code and make sure the host is still connected.');
      if(room.guest) return wsFail(ws,'That room is already full.');
      const peer={kind:'ws', ws};
      room.guest=peer; ws.roomCode=code; ws.role='guest'; ws.peer=peer;
      wsSend(ws,{type:'joined',room:code});
      if(room.host) peerSend(room.host,{type:'peer-connected'});
      sendLatestRoomState(room, peer);
      return;
    }

    // Lets a host whose connection dropped (phone lost signal, laptop went
    // to sleep, etc) get their same room back — matched by a secret token
    // only they ever received — instead of the room being unrecoverable
    // the instant their socket closes. The guest, if still there, keeps
    // their seat and their view of the game the whole time.
    if(msg.action==='reclaim'){
      if(ws.roomCode) return wsFail(ws,'You are already in a room.');
      if(rateLimited()) return wsFail(ws,'Too many attempts. Please slow down.');
      const code=String(msg.room||'').toUpperCase();
      const token=String(msg.token||'');
      const room=rooms.get(code);
      if(!room) return wsFail(ws,'That room no longer exists.');
      if(room.host) return wsFail(ws,'That room already has a host connected.');
      if(!token || room.hostToken!==token) return wsFail(ws,'Could not reclaim that room.');
      const peer={kind:'ws', ws};
      room.host=peer; ws.roomCode=code; ws.role='host'; ws.peer=peer;
      wsSend(ws,{type:'hosted',room:code,token});
      if(room.guest) peerSend(room.guest,{type:'peer-connected'});
      return;
    }

    if(msg.action==='message'){
      if(!ws.roomCode) return wsFail(ws,'You are not in a room.');
      const room=rooms.get(ws.roomCode);
      if(!room) return wsFail(ws,'Room no longer exists.');
      const payload=msg.payload;

      // Answer a guest sync request from the cached authoritative state even
      // if the host's original state packet was missed.
      if(ws.peer===room.guest && payload && payload.type==='requestSync'){
        sendLatestRoomState(room, ws.peer);
        return;
      }

      if(ws.peer===room.host) rememberRoomState(room,payload);
      const other=ws.peer===room.host ? room.guest : room.host;
      if(other) peerSend(other,{type:'message',payload});
      return;
    }

    if(msg.action==='leave'){
      cleanup();
      return;
    }

    wsFail(ws,'Unknown action.');
  });

  ws.on('close',cleanup);
  ws.on('error',cleanup);
});

const heartbeat=setInterval(()=>{
  for(const ws of wss.clients){
    if(ws.readyState!==1) continue;
    // If a connection didn't answer the previous ping, it's dead (phone
    // lost signal, tab was killed, etc). Terminate it so its room frees up
    // instead of sitting as a "ghost" player forever.
    if(ws.isAlive===false){ ws.terminate(); continue; }
    ws.isAlive=false;
    ws.ping();
    wsSend(ws,{type:'ping'});
  }
},30000);

process.on('SIGINT',()=>{clearInterval(heartbeat);server.close(()=>process.exit(0));});
process.on('SIGTERM',()=>{clearInterval(heartbeat);server.close(()=>process.exit(0));});

server.listen(PORT,()=>console.log(`Arcade Hub running at http://localhost:${PORT}`));
