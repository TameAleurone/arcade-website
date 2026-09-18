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
const ACTION_LIMIT = 20; // host/join attempts per window, per connection
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

function send(ws, msg){
  if(ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function fail(ws, message){
  send(ws,{type:'error',message});
}

function leave(ws){
  const code=ws.roomCode;
  if(!code) return;
  const room=rooms.get(code);
  if(!room) return;
  if(room.host===ws) room.host=null;
  if(room.guest===ws) room.guest=null;
  const other=room.host || room.guest;
  if(other) send(other,{type:'peer-disconnected'});
  if(!room.host && !room.guest) rooms.delete(code);
  ws.roomCode=null;
  ws.role=null;
}

const server=http.createServer((req,res)=>{
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname); }
  catch { res.writeHead(400); return res.end('Bad request'); }

  if(pathname==='/health'){
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
    return res.end(JSON.stringify({ok:true,rooms:rooms.size}));
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
  ws.roomCode=null; ws.role=null;
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

  ws.on('message',(raw)=>{
    if(raw.length>MAX_MESSAGE) return fail(ws,'Message too large.');
    let msg;
    try { msg=JSON.parse(raw.toString()); } catch { return fail(ws,'Invalid message.'); }

    if(msg.action==='host'){
      if(ws.roomCode) return fail(ws,'You are already in a room.');
      if(rateLimited()) return fail(ws,'Too many attempts. Please slow down.');
      if(rooms.size>=MAX_ROOMS) return fail(ws,'The server is at capacity. Please try again shortly.');
      const code=roomCode();
      const token=makeToken();
      rooms.set(code,{host:ws,guest:null,hostToken:token});
      ws.roomCode=code; ws.role='host';
      return send(ws,{type:'hosted',room:code,token});
    }

    if(msg.action==='join'){
      if(ws.roomCode) return fail(ws,'You are already in a room.');
      if(rateLimited()) return fail(ws,'Too many attempts. Please slow down.');
      const code=String(msg.room||'').toUpperCase();
      const room=rooms.get(code);
      if(!room) return fail(ws,'Room not found. Check the code and make sure the host is still connected.');
      if(room.guest) return fail(ws,'That room is already full.');
      room.guest=ws; ws.roomCode=code; ws.role='guest';
      send(ws,{type:'joined',room:code});
      if(room.host) send(room.host,{type:'peer-connected'});
      return;
    }

    // Lets a host whose connection dropped (phone lost signal, laptop went
    // to sleep, etc) get their same room back — matched by a secret token
    // only they ever received — instead of the room being unrecoverable
    // the instant their socket closes. The guest, if still there, keeps
    // their seat and their view of the game the whole time.
    if(msg.action==='reclaim'){
      if(ws.roomCode) return fail(ws,'You are already in a room.');
      if(rateLimited()) return fail(ws,'Too many attempts. Please slow down.');
      const code=String(msg.room||'').toUpperCase();
      const token=String(msg.token||'');
      const room=rooms.get(code);
      if(!room) return fail(ws,'That room no longer exists.');
      if(room.host) return fail(ws,'That room already has a host connected.');
      if(!token || room.hostToken!==token) return fail(ws,'Could not reclaim that room.');
      room.host=ws; ws.roomCode=code; ws.role='host';
      send(ws,{type:'hosted',room:code,token});
      if(room.guest) send(room.guest,{type:'peer-connected'});
      return;
    }

    if(msg.action==='message'){
      if(!ws.roomCode) return fail(ws,'You are not in a room.');
      const room=rooms.get(ws.roomCode);
      if(!room) return fail(ws,'Room no longer exists.');
      const other=ws===room.host ? room.guest : room.host;
      if(other) send(other,{type:'message',payload:msg.payload});
      return;
    }

    if(msg.action==='leave'){
      leave(ws);
      return;
    }

    fail(ws,'Unknown action.');
  });

  ws.on('close',()=>leave(ws));
  ws.on('error',()=>leave(ws));
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
    send(ws,{type:'ping'});
  }
},30000);

process.on('SIGINT',()=>{clearInterval(heartbeat);server.close(()=>process.exit(0));});
process.on('SIGTERM',()=>{clearInterval(heartbeat);server.close(()=>process.exit(0));});

server.listen(PORT,()=>console.log(`Arcade Hub running at http://localhost:${PORT}`));
