/* ARCADE ONLINE MULTIPLAYER
   WebSocket room transport. The game code remains authoritative:
   chess/Pong/board games validate moves on the host and broadcast state.
*/
(function(){
  let ws=null, role=null, room=null, callbacks={}, connected=false, connectTimer=null;

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

  function cleanup(notify=true){
    if(connectTimer) clearTimeout(connectTimer);
    connectTimer=null;
    const old=ws;
    ws=null; connected=false; role=null; room=null;
    if(old){ try{old.onclose=null; old.close();}catch(e){} }
    if(notify && callbacks.onClose) callbacks.onClose();
    callbacks={};
  }

  function errorText(e){
    if(!navigator.onLine) return 'You appear to be offline.';
    if(e && e.message) return e.message;
    return 'Could not connect to the multiplayer server.';
  }

  function openSocket(){
    return new Promise((resolve,reject)=>{
      let settled=false;
      try{ ws=new WebSocket(configuredUrl()); }
      catch(e){ reject(new Error(errorText(e))); return; }

      const fail=(e)=>{
        if(settled) return;
        settled=true;
        if(connectTimer) clearTimeout(connectTimer);
        connectTimer=null;
        try{ws.close();}catch(_){}
        ws=null;
        reject(new Error(errorText(e)));
      };

      ws.onopen=()=>{ settled=true; clearTimeout(connectTimer); connectTimer=null; resolve(); };
      ws.onerror=()=>fail(new Error('The multiplayer server could not be reached. Check the server URL and your internet connection.'));
      ws.onclose=()=>{
        if(!settled) fail(new Error('The multiplayer server closed the connection.'));
        else {
          connected=false;
          if(callbacks.onClose) callbacks.onClose();
        }
      };
      ws.onmessage=(ev)=>{
        let msg;
        try{msg=JSON.parse(ev.data);}catch(_){return;}
        if(msg.type==='error'){
          const e=new Error(msg.message||'Multiplayer error.');
          if(!settled) fail(e);
          else if(callbacks.onError) callbacks.onError(e);
          return;
        }
        if(msg.type==='hosted'){
          role='host'; room=msg.room; connected=true;
          if(callbacks.onHosted) callbacks.onHosted(msg.room);
          return;
        }
        if(msg.type==='joined'){
          role='guest'; room=msg.room; connected=true;
          if(callbacks.onJoined) callbacks.onJoined(msg.room);
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
      };
      connectTimer=setTimeout(()=>fail(new Error('Connection timed out. Check that the multiplayer server is running.')),12000);
    });
  }

  async function host({onMessage,onClose,onConnect}={}){
    cleanup(false);
    callbacks={onMessage,onClose,onConnect,onHosted:null,onJoined:null,onError:null};
    await openSocket();
    return new Promise((resolve,reject)=>{
      callbacks.onHosted=(code)=>resolve(code);
      callbacks.onError=(e)=>reject(e);
      sendRaw({action:'host'});
    });
  }

  async function join(code,{onMessage,onClose,onConnect}={}){
    const clean=String(code||'').trim().toUpperCase();
    if(!/^[A-Z0-9]{6}$/.test(clean)) throw new Error('Room codes are 6 letters/numbers.');
    cleanup(false);
    callbacks={onMessage,onClose,onConnect,onHosted:null,onJoined:null,onError:null};
    await openSocket();
    return new Promise((resolve,reject)=>{
      callbacks.onJoined=(roomCode)=>resolve(roomCode);
      callbacks.onError=(e)=>reject(e);
      sendRaw({action:'join',room:clean});
    });
  }

  function sendRaw(data){
    if(ws && ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify(data));
  }

  function send(payload){ sendRaw({action:'message',payload}); }

  window.ArcadeOnline={
    host, join, send,
    close:()=>cleanup(true),
    isHost:()=>role==='host',
    isGuest:()=>role==='guest',
    connected:()=>connected && !!ws && ws.readyState===WebSocket.OPEN,
    room:()=>room,
    serverUrl:configuredUrl()
  };
})();
