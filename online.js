/* ARCADE ONLINE MULTIPLAYER
   Two transports behind one API. The game code remains authoritative:
   chess/Pong/board games validate moves on the host and broadcast state.

   WebSocket is tried first — it's a real persistent connection, lowest
   latency. Some static hosts, though (Neocities' free tier is the common
   one), send every page a Content-Security-Policy with `connect-src
   'self'`, which blocks fetch, XHR, *and* WebSocket to any other origin.
   That's a server-sent header the page can't loosen itself, so if the
   WebSocket attempt fails this module falls back automatically to a
   JSONP long-poll transport (data delivered as the body of a
   <script src="..."> tag, which isn't subject to connect-src at all —
   the standard workaround for this exact restriction). Once one
   transport has worked in this page's lifetime it's tried first on
   later host()/join() calls, so a "New Game" doesn't re-probe WebSocket
   every time on a host that's never going to allow it.

   Auto-reconnect: if the connection drops unexpectedly (phone lost
   signal, the tab was backgrounded and the OS killed the connection,
   brief wifi blip) this module quietly tries to re-establish the same
   room a few times before giving up — a guest just re-joins the still-
   open room, and a host "reclaims" it with a one-time token issued when
   they first hosted, since the server has no other way to know a fresh
   connection is the same person who was hosting a moment ago. This
   works the same way regardless of which transport is in use.
*/
(function(){
  const RECONNECT_MAX_ATTEMPTS = 6;
  const RECONNECT_BASE_DELAY_MS = 900;
  const RECONNECT_MAX_DELAY_MS = 8000;
  const JSONP_CALL_TIMEOUT_MS = 12000;
  const JSONP_POLL_TIMEOUT_MS = 30000; // must comfortably exceed the server's long-poll hold time

  let transport=null;      // 'ws' | 'jsonp' — which transport the CURRENT connection uses
  let preferredTransport=null; // sticky once one has worked this page load, so later calls skip re-probing
  let ws=null;
  let role=null, room=null, myToken=null;
  let callbacks={};
  let connected=false;
  let deliberateClose=false;
  let reconnectAttempt=0;
  let reconnectTimer=null;
  // One-shot resolver for whichever host/join/reclaim call is currently
  // in flight, so handleMessage() can settle it when the server replies.
  let pending=null;
  let jsonpGen=0; // bumped on every close()/reconnect so old poll loops stop touching state

  function wsUrl(){
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

  function httpBaseUrl(){
    const configured = (window.ARCADE_ONLINE_SERVER || '').trim();
    if(configured){
      if(configured.startsWith('ws://')) return 'http://' + configured.slice(5).replace(/\/$/,'');
      if(configured.startsWith('wss://')) return 'https://' + configured.slice(6).replace(/\/$/,'');
      if(configured.startsWith('http://') || configured.startsWith('https://')) return configured.replace(/\/$/,'');
      return 'https://' + configured.replace(/\/$/,'');
    }
    return `${location.protocol}//${location.host}`;
  }

  function errorText(e){
    if(!navigator.onLine) return 'You appear to be offline.';
    if(e && e.message) return e.message;
    return 'Could not connect to the multiplayer server.';
  }

  // Shared by both transports: a poll response is just an array of these
  // same message envelopes, so the exact same dispatcher handles either.
  function handleMessage(msg){
    if(msg.type==='error'){
      const e=new Error(msg.message||'Multiplayer error.');
      if(pending){ const p=pending; pending=null; p.reject(e); return; }
      if(callbacks.onError) callbacks.onError(e);
      return;
    }
    if(msg.type==='hosted'){
      role='host'; room=msg.room; connected=true;
      if(msg.token) myToken=msg.token;
      reconnectAttempt=0;
      if(pending){ const p=pending; pending=null; p.resolve(msg.room); }
      return;
    }
    if(msg.type==='joined'){
      role='guest'; room=msg.room; connected=true;
      if(msg.token) myToken=msg.token;
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
    // 'ping'/'ack' messages need no reply; the transport-level pong (ws)
    // or next poll (jsonp) is automatic.
  }

  // ---- WebSocket transport ----------------------------------------

  // Opens one fresh WebSocket, sends `actionMsg`, and resolves once the
  // server confirms with a 'hosted'/'joined' message (or rejects on error/
  // timeout/close). Used both for the user-initiated host()/join() and for
  // each background reconnect attempt.
  function openFreshWs(actionMsg){
    return new Promise((resolve,reject)=>{
      let sock;
      try{ sock=new WebSocket(wsUrl()); }
      catch(e){ reject(new Error(errorText(e))); return; }
      let settled=false;
      const timer=setTimeout(()=>{
        if(settled) return; settled=true;
        try{sock.close();}catch(_){}
        reject(new Error('Connection timed out. Check that the multiplayer server is running.'));
      },12000);
      sock.onopen=()=>{
        ws=sock; transport='ws';
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
        sendRawWs(actionMsg);
      };
      sock.onerror=()=>{ if(settled) return; settled=true; clearTimeout(timer); reject(new Error(errorText())); };
      sock.onclose=()=>{ if(settled) return; settled=true; clearTimeout(timer); reject(new Error('The multiplayer server closed the connection.')); };
    });
  }

  function sendRawWs(data){
    if(ws && ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify(data));
  }

  // ---- JSONP fallback transport -------------------------------------

  let jsonpCounter=0;
  // Delivers data via <script src="...">, which is not subject to a
  // page's connect-src CSP directive the way fetch/XHR/WebSocket are.
  function jsonpScriptCall(action, params, timeoutMs){
    return new Promise((resolve,reject)=>{
      const cbName='__arcadeJsonp'+(jsonpCounter++)+'_'+Date.now();
      const script=document.createElement('script');
      let done=false;
      const timer=setTimeout(()=>{ if(done) return; done=true; cleanup(); reject(new Error('Request timed out.')); }, timeoutMs);
      function cleanup(){
        delete window[cbName];
        if(script.parentNode) script.parentNode.removeChild(script);
        clearTimeout(timer);
      }
      window[cbName]=(data)=>{ if(done) return; done=true; cleanup(); resolve(data); };
      script.onerror=()=>{ if(done) return; done=true; cleanup(); reject(new Error('Could not reach the multiplayer server.')); };
      const qs=new URLSearchParams(Object.assign({}, params, {callback:cbName})).toString();
      script.src = httpBaseUrl()+'/jsonp/'+action+'?'+qs;
      document.head.appendChild(script);
    });
  }

  function jsonpCall(action, params){
    return jsonpScriptCall(action, params, action==='poll' ? JSONP_POLL_TIMEOUT_MS : JSONP_CALL_TIMEOUT_MS);
  }

  // Resolves once the server confirms 'hosted'/'joined' over JSONP, then
  // starts the poll loop that keeps delivering messages afterward —
  // the JSONP equivalent of openFreshWs() settling and then leaving the
  // socket's onmessage handler live.
  function openFreshJsonp(action, params){
    return jsonpCall(action, params).then(msg=>{
      transport='jsonp';
      handleMessage(msg);
      if(msg.type==='error') throw new Error(msg.message||'Multiplayer error.');
      startJsonpPolling();
      return room;
    });
  }

  function startJsonpPolling(){
    const myGen=++jsonpGen;
    let failCount=0;
    function loopOnce(){
      if(myGen!==jsonpGen) return; // superseded by a close()/reconnect
      jsonpCall('poll', {room, role, token:myToken}).then(msgs=>{
        if(myGen!==jsonpGen) return;
        failCount=0;
        (msgs||[]).forEach(handleMessage);
        loopOnce();
      }).catch(()=>{
        if(myGen!==jsonpGen) return;
        failCount++;
        if(failCount>=3){
          connected=false;
          if(deliberateClose) return;
          attemptReconnect();
          return;
        }
        setTimeout(loopOnce, 1200); // brief backoff, then keep polling
      });
    }
    loopOnce();
  }

  function sendRawJsonp(payload){
    jsonpCall('send', {room, role, token:myToken, payload:JSON.stringify(payload)}).catch(()=>{});
  }

  // ---- Transport-agnostic public API ---------------------------------

  // Tries the preferred transport (or WebSocket first, the first time
  // this page connects at all); on failure, tries the other one before
  // giving up. Once a transport succeeds it becomes preferred for the
  // rest of this page's lifetime, so a host stuck behind a restrictive
  // CSP isn't re-probing (and waiting on) WebSocket on every "New Game".
  function attemptConnect(action, jsonpParams){
    const wsActionMsg = action==='join' ? {action:'join', room:jsonpParams.room} : {action};
    const tryWs = ()=>openFreshWs(wsActionMsg);
    const tryJsonp = ()=>openFreshJsonp(action, jsonpParams);
    if(preferredTransport==='jsonp'){
      return tryJsonp().then(r=>{ preferredTransport='jsonp'; return r; })
        .catch(()=> tryWs().then(r=>{ preferredTransport='ws'; return r; }));
    }
    return tryWs().then(r=>{ preferredTransport='ws'; return r; })
      .catch(()=> tryJsonp().then(r=>{ preferredTransport='jsonp'; return r; }));
  }

  function attemptReconnect(){
    if(!room || deliberateClose){ if(callbacks.onClose) callbacks.onClose(); return; }
    if(reconnectAttempt>=RECONNECT_MAX_ATTEMPTS){ if(callbacks.onClose) callbacks.onClose(); return; }
    reconnectAttempt++;
    if(callbacks.onReconnecting) callbacks.onReconnecting(reconnectAttempt, RECONNECT_MAX_ATTEMPTS);
    const delay=Math.min(RECONNECT_BASE_DELAY_MS*Math.pow(1.6,reconnectAttempt-1), RECONNECT_MAX_DELAY_MS);
    reconnectTimer=setTimeout(()=>{
      const attempt = transport==='jsonp'
        ? (role==='host' ? openFreshJsonp('reclaim',{token:myToken}) : openFreshJsonp('join',{room}))
        : (role==='host' ? openFreshWs({action:'reclaim',room,token:myToken}) : openFreshWs({action:'join',room}));
      attempt.then(()=>{
        if(callbacks.onReconnected) callbacks.onReconnected();
      }).catch(()=>{ attemptReconnect(); });
    }, delay);
  }

  async function host({onMessage,onClose,onConnect,onReconnecting,onReconnected}={}){
    close();
    deliberateClose=false;
    callbacks={onMessage,onClose,onConnect,onReconnecting,onReconnected};
    return attemptConnect('host', {});
  }

  async function join(code,{onMessage,onClose,onConnect,onReconnecting,onReconnected}={}){
    const clean=String(code||'').trim().toUpperCase();
    if(!/^[A-Z0-9]{6}$/.test(clean)) throw new Error('Room codes are 6 letters/numbers.');
    close();
    deliberateClose=false;
    callbacks={onMessage,onClose,onConnect,onReconnecting,onReconnected};
    return attemptConnect('join', {room:clean});
  }

  function send(payload){
    if(transport==='jsonp') sendRawJsonp(payload);
    else sendRawWs({action:'message',payload});
  }

  // Deliberate exit — e.g. the user hit "Leave Room" or the page is
  // navigating away. Unlike a dropped connection, this never triggers a
  // reconnect attempt.
  function close(){
    deliberateClose=true;
    jsonpGen++; // stop any in-flight poll loop from acting on stale state
    if(reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer=null;
    const old=ws, oldTransport=transport, oldRoom=room, oldRole=role, oldToken=myToken;
    ws=null; connected=false; role=null; room=null; myToken=null; pending=null; reconnectAttempt=0; transport=null;
    callbacks={};
    if(old){ try{ old.onclose=null; old.close(); }catch(e){} }
    if(oldTransport==='jsonp' && oldRoom && oldRole){
      jsonpCall('leave', {room:oldRoom, role:oldRole, token:oldToken}).catch(()=>{});
    }
  }

  window.ArcadeOnline={
    host, join, send,
    close,
    isHost:()=>role==='host',
    isGuest:()=>role==='guest',
    connected:()=> transport==='ws' ? (connected && !!ws && ws.readyState===WebSocket.OPEN) : (transport==='jsonp' && connected),
    room:()=>room,
    serverUrl:wsUrl()
  };
})();
