/* ARCADE ONLINE MULTIPLAYER
   WebSocket room transport. The game code remains authoritative:
   chess/Pong/board games validate moves on the host and broadcast state.

   Auto-reconnect: if the socket drops unexpectedly (phone lost signal, the
   tab was backgrounded and the OS killed the connection, brief wifi blip)
   this module quietly tries to re-establish the same room a few times
   before giving up — a guest just re-joins the still-open room, and a host
   "reclaims" it with a one-time token issued when they first hosted, since
   the server has no other way to know a fresh connection is the same
   person who was hosting a moment ago.
*/
(function(){
  const RECONNECT_MAX_ATTEMPTS = 6;
  const RECONNECT_BASE_DELAY_MS = 900;
  const RECONNECT_MAX_DELAY_MS = 8000;

  let ws=null, role=null, room=null, hostToken=null;
  let callbacks={};
  let connected=false;
  let deliberateClose=false;
  let reconnectAttempt=0;
  let reconnectTimer=null;
  // One-shot resolver for whichever host/join/reclaim call is currently
  // in flight, so handleMessage() can settle it when the server replies.
  let pending=null;

  function configuredUrl(){
    const configured = (window.ARCADE_ONLINE_SERVER || '').trim();
    if(configured){
      if(configured.startsWith('ws://') || configured.startsWith('wss://')) return configured.replace(/\/$/,'') + '/ws';
      if(configured.startsWith('http://') || configured.startsWith('https://')){
        return configured.replace(/^http:/,'ws:').replace(/^https:/,'wss:').replace(/\/$/,'') + '/ws';
      }
      return 'wss://' + configured.replace(/\/$/,'') + '/ws';
    }
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/ws`;
  }

  function errorText(e){
    if(!navigator.onLine) return 'You appear to be offline.';
    if(e && e.message) return e.message;
    return 'Could not connect to the multiplayer server.';
  }

  function handleMessage(msg){
    if(msg.type==='error'){
      const e=new Error(msg.message||'Multiplayer error.');
      if(pending){ const p=pending; pending=null; p.reject(e); return; }
      if(callbacks.onError) callbacks.onError(e);
      return;
    }
    if(msg.type==='hosted'){
      role='host'; room=msg.room; connected=true;
      if(msg.token) hostToken=msg.token;
      reconnectAttempt=0;
      if(pending){ const p=pending; pending=null; p.resolve(msg.room); }
      return;
    }
    if(msg.type==='joined'){
      role='guest'; room=msg.room; connected=true;
      reconnectAttempt=0;
      if(pending){ const p=pending; pending=null; p.resolve(msg.room); }
      return;
    }
    if(msg.type==='peer-connected'){
      if(callbacks.onConnect) callbacks.onConnect();
      return;
    }
    if(msg.type==='peer-disconnected'){
      if(callbacks.onClose) callbacks.onClose();
      return;
    }
    if(msg.type==='message'){
      if(callbacks.onMessage) callbacks.onMessage(msg.payload);
    }
    // 'ping' messages need no reply; the transport-level pong is automatic.
  }

  // Opens one fresh WebSocket, sends `actionMsg`, and resolves once the
  // server confirms with a 'hosted'/'joined' message (or rejects on error/
  // timeout/close). Used both for the user-initiated host()/join() and for
  // each background reconnect attempt.
  function openFresh(actionMsg){
    return new Promise((resolve,reject)=>{
      let sock;
      try{ sock=new WebSocket(configuredUrl()); }
      catch(e){ reject(new Error(errorText(e))); return; }
      let settled=false;
      const timer=setTimeout(()=>{
        if(settled) return; settled=true;
        try{sock.close();}catch(_){}
        reject(new Error('Connection timed out. Check that the multiplayer server is running.'));
      },12000);
      sock.onopen=()=>{
        ws=sock;
        sock.onmessage=(ev)=>{
          let msg; try{msg=JSON.parse(ev.data);}catch(_){return;}
          handleMessage(msg);
        };
        sock.onclose=()=>{
          if(pending){ const p=pending; pending=null; p.reject(new Error('The multiplayer server closed the connection.')); return; }
          connected=false;
          if(deliberateClose){ if(callbacks.onClose) callbacks.onClose(); return; }
          attemptReconnect();
        };
        pending={
          resolve:(v)=>{ if(settled) return; settled=true; clearTimeout(timer); resolve(v); },
          reject:(e)=>{ if(settled) return; settled=true; clearTimeout(timer); try{sock.close();}catch(_){} reject(e); }
        };
        sendRaw(actionMsg);
      };
      sock.onerror=()=>{ if(settled) return; settled=true; clearTimeout(timer); reject(new Error(errorText())); };
      sock.onclose=()=>{ if(settled) return; settled=true; clearTimeout(timer); reject(new Error('The multiplayer server closed the connection.')); };
    });
  }

  function attemptReconnect(){
    if(!room || deliberateClose){ if(callbacks.onClose) callbacks.onClose(); return; }
    if(reconnectAttempt>=RECONNECT_MAX_ATTEMPTS){ if(callbacks.onClose) callbacks.onClose(); return; }
    reconnectAttempt++;
    if(callbacks.onReconnecting) callbacks.onReconnecting(reconnectAttempt, RECONNECT_MAX_ATTEMPTS);
    const delay=Math.min(RECONNECT_BASE_DELAY_MS*Math.pow(1.6,reconnectAttempt-1), RECONNECT_MAX_DELAY_MS);
    reconnectTimer=setTimeout(()=>{
      const actionMsg = role==='host' ? {action:'reclaim',room,token:hostToken} : {action:'join',room};
      openFresh(actionMsg).then(()=>{
        if(callbacks.onReconnected) callbacks.onReconnected();
      }).catch(()=>{ attemptReconnect(); });
    }, delay);
  }

  async function host({onMessage,onClose,onConnect,onReconnecting,onReconnected}={}){
    close();
    deliberateClose=false;
    callbacks={onMessage,onClose,onConnect,onReconnecting,onReconnected};
    return openFresh({action:'host'});
  }

  async function join(code,{onMessage,onClose,onConnect,onReconnecting,onReconnected}={}){
    const clean=String(code||'').trim().toUpperCase();
    if(!/^[A-Z0-9]{6}$/.test(clean)) throw new Error('Room codes are 6 letters/numbers.');
    close();
    deliberateClose=false;
    callbacks={onMessage,onClose,onConnect,onReconnecting,onReconnected};
    return openFresh({action:'join',room:clean});
  }

  function sendRaw(data){
    if(ws && ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify(data));
  }

  function send(payload){ sendRaw({action:'message',payload}); }

  // Deliberate exit — e.g. the user hit "Leave Room" or the page is
  // navigating away. Unlike a dropped connection, this never triggers a
  // reconnect attempt.
  function close(){
    deliberateClose=true;
    if(reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer=null;
    const old=ws;
    ws=null; connected=false; role=null; room=null; hostToken=null; pending=null; reconnectAttempt=0;
    callbacks={};
    if(old){ try{ old.onclose=null; old.close(); }catch(e){} }
  }

  window.ArcadeOnline={
    host, join, send,
    close,
    isHost:()=>role==='host',
    isGuest:()=>role==='guest',
    connected:()=>connected && !!ws && ws.readyState===WebSocket.OPEN,
    room:()=>room,
    serverUrl:configuredUrl()
  };
})();
