/* ARCADE ONLINE MULTIPLAYER — PeerJS room helper. */
(function(){
  let peer=null, conn=null, role=null;
  const PEERJS_URL='https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
  const PEER_CONFIG={host:'0.peerjs.com',port:443,path:'/',secure:true,debug:1,config:{iceServers:[
    {urls:'stun:stun.l.google.com:19302'},
    {urls:'stun:stun1.l.google.com:19302'},
    // TURN relay fallback — required when a direct P2P path can't be found
    // (symmetric NAT, mobile carrier networks, restrictive firewalls). Without
    // this, two players on stricter networks can never connect no matter how
    // correct the room code is.
    {urls:'turn:openrelay.metered.ca:80', username:'openrelayproject', credential:'openrelayproject'},
    {urls:'turn:openrelay.metered.ca:443', username:'openrelayproject', credential:'openrelayproject'},
    {urls:'turn:openrelay.metered.ca:443?transport=tcp', username:'openrelayproject', credential:'openrelayproject'}
  ]}};
  function loadPeerJS(){
    if(window.Peer) return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const s=document.createElement('script'); s.src=PEERJS_URL; s.onload=resolve; s.onerror=()=>reject(new Error('Could not load the online multiplayer service.')); document.head.appendChild(s);
    });
  }
  function cleanup(){ try{if(conn)conn.close();}catch(e){} try{if(peer)peer.destroy();}catch(e){} conn=null; peer=null; role=null; }
  function wire(c,onMessage,onClose,onConnect){
    conn=c;
    conn.on('open',()=>{ if(onConnect) onConnect(); });
    conn.on('data',d=>{ if(onMessage) onMessage(d); });
    conn.on('close',()=>{ if(onClose) onClose(); });
    conn.on('error',e=>{ console.warn('Online connection error',e); if(onClose) onClose(e); });
    setTimeout(()=>{ if(!conn.open && onClose) onClose(new Error('Connection timed out')); },20000);
  }
  async function host({onMessage,onClose,onConnect}={}){
    await loadPeerJS(); cleanup(); role='host';
    return new Promise((resolve,reject)=>{
      const id='arcade-'+Math.random().toString(36).slice(2,10);
      peer=new Peer(id,PEER_CONFIG);
      peer.on('open',room=>resolve(room));
      peer.on('connection',c=>wire(c,onMessage,onClose,onConnect));
      peer.on('error',e=>{ if(e.type==='unavailable-id'){ cleanup(); host({onMessage,onClose,onConnect}).then(resolve).catch(reject); } else reject(e); });
    });
  }
  async function join(room,{onMessage,onClose,onConnect}={}){
    await loadPeerJS(); cleanup(); role='guest';
    return new Promise((resolve,reject)=>{
      peer=new Peer(undefined,PEER_CONFIG);
      peer.on('open',()=>{
      const c=peer.connect(room,{reliable:true});
      wire(c,onMessage,onClose,()=>{
        if(onConnect) onConnect();
        resolve(true);
      });
    });
      peer.on('error',e=>{
        let msg='Could not connect.';
        if(e.type==='peer-unavailable') msg='No room found with that code — double-check it and make sure the host still has the page open.';
        else if(e.type==='network'||e.type==='server-error'||e.type==='socket-error'||e.type==='socket-closed') msg='Could not reach the multiplayer service. Check your internet connection and try again.';
        else if(e.type==='webrtc') msg='Your network is blocking the connection (common on some WiFi/mobile/campus networks). Try a different network or a mobile hotspot.';
        reject(new Error(msg));
      });
    });
  }
  window.ArcadeOnline={host,join,send:d=>{if(conn&&conn.open)conn.send(d);},close:cleanup,isHost:()=>role==='host',isGuest:()=>role==='guest',connected:()=>!!(conn&&conn.open)};
})();
