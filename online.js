/* ARCADE ONLINE MULTIPLAYER — PeerJS room helper. */
(function(){
  let peer=null, conn=null, role=null;
  const PEERJS_URL='https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
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
  }
  async function host({onMessage,onClose,onConnect}={}){
    await loadPeerJS(); cleanup(); role='host';
    return new Promise((resolve,reject)=>{
      const id='arcade-'+Math.random().toString(36).slice(2,10);
      peer=new Peer(id);
      peer.on('open',room=>resolve(room));
      peer.on('connection',c=>wire(c,onMessage,onClose,onConnect));
      peer.on('error',e=>{ if(e.type==='unavailable-id'){ cleanup(); host({onMessage,onClose,onConnect}).then(resolve).catch(reject); } else reject(e); });
    });
  }
  async function join(room,{onMessage,onClose,onConnect}={}){
    await loadPeerJS(); cleanup(); role='guest';
    return new Promise((resolve,reject)=>{
      peer=new Peer();
      peer.on('open',()=>{ const c=peer.connect(room,{reliable:true}); wire(c,onMessage,onClose,onConnect); resolve(true); });
      peer.on('error',reject);
    });
  }
  window.ArcadeOnline={host,join,send:d=>{if(conn&&conn.open)conn.send(d);},close:cleanup,isHost:()=>role==='host',isGuest:()=>role==='guest',connected:()=>!!(conn&&conn.open)};
})();
