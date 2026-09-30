/* PONG — AI, hotseat, and online multiplayer */
(function(){
  let canvas,ctx,container,W=480,H=360,p1,p2,ball,keys={},score1,score2,animId,winner,mode,difficulty,aiReactionTimer,aiTargetY,serveTimer,record,online=null,mySide=null,lastNet=0,remoteKeys={up:false,down:false},lastTs=null;
  const PADDLE_H=90,PADDLE_SPEED=380,BALL_SPEED_START=280,BALL_SPEED_MAX=680,BALL_SPEED_STEP=18,WIN_SCORE=7;const AI_REACTION={Easy:320,Hard:60},AI_SPEED={Easy:260,Hard:410};
  function status(t){document.querySelectorAll('.pong-online-status').forEach(e=>e.textContent=t);}
  function netState(){return {p1y:p1.y,p2y:p2.y,ball:{...ball},score1,score2,winner,serveTimer};}
  function newMatch(){p1={x:14,y:H/2-PADDLE_H/2,w:10,h:PADDLE_H};p2={x:W-24,y:H/2-PADDLE_H/2,w:10,h:PADDLE_H};score1=0;score2=0;winner=null;aiReactionTimer=0;aiTargetY=p2.y;serve(Math.random()<0.5?-1:1);}
  function serve(dir){ball={x:W/2,y:H/2,r:7,vx:dir*BALL_SPEED_START,vy:(Math.random()*2-1)*140};serveTimer=600;}
  function endMatch(win){winner=win;record[win]++;Store.set('pong_record',record);}
  function updateAI(dt){aiReactionTimer-=dt;if(aiReactionTimer<=0){aiReactionTimer=AI_REACTION[difficulty];aiTargetY=ball.vx>0?ball.y-PADDLE_H/2:H/2-PADDLE_H/2;}const speed=AI_SPEED[difficulty];if(p2.y<aiTargetY)p2.y=Math.min(aiTargetY,p2.y+speed*dt/1000);else if(p2.y>aiTargetY)p2.y=Math.max(aiTargetY,p2.y-speed*dt/1000);p2.y=Math.max(0,Math.min(H-PADDLE_H,p2.y));}
  function simulate(dt){if(keys.w)p1.y-=PADDLE_SPEED*dt/1000;if(keys.s)p1.y+=PADDLE_SPEED*dt/1000;p1.y=Math.max(0,Math.min(H-PADDLE_H,p1.y));if(mode==='online'){if(remoteKeys.up)p2.y-=PADDLE_SPEED*dt/1000;if(remoteKeys.down)p2.y+=PADDLE_SPEED*dt/1000;p2.y=Math.max(0,Math.min(H-PADDLE_H,p2.y));}else if(mode==='2p'){if(keys.ArrowUp)p2.y-=PADDLE_SPEED*dt/1000;if(keys.ArrowDown)p2.y+=PADDLE_SPEED*dt/1000;p2.y=Math.max(0,Math.min(H-PADDLE_H,p2.y));}else if(!winner)updateAI(dt);
    if(!winner){if(serveTimer>0)serveTimer-=dt;else{ball.x+=ball.vx*dt/1000;ball.y+=ball.vy*dt/1000;if(ball.y-ball.r<0){ball.y=ball.r;ball.vy*=-1;}if(ball.y+ball.r>H){ball.y=H-ball.r;ball.vy*=-1;}if(ball.vx<0&&ball.x-ball.r<p1.x+p1.w&&ball.y>p1.y&&ball.y<p1.y+p1.h){const speed=Math.min(BALL_SPEED_MAX,Math.hypot(ball.vx,ball.vy)+BALL_SPEED_STEP),rel=(ball.y-(p1.y+p1.h/2))/(p1.h/2);ball.vx=Math.abs(Math.cos(rel*.6))*speed;ball.vy=Math.sin(rel*.6)*speed;ball.x=p1.x+p1.w+ball.r;}if(ball.vx>0&&ball.x+ball.r>p2.x&&ball.y>p2.y&&ball.y<p2.y+p2.h){const speed=Math.min(BALL_SPEED_MAX,Math.hypot(ball.vx,ball.vy)+BALL_SPEED_STEP),rel=(ball.y-(p2.y+p2.h/2))/(p2.h/2);ball.vx=-Math.abs(Math.cos(rel*.6))*speed;ball.vy=Math.sin(rel*.6)*speed;ball.x=p2.x-ball.r;}if(ball.x<0){score2++;if(score2>=WIN_SCORE)endMatch('p2');else serve(1);}if(ball.x>W){score1++;if(score1>=WIN_SCORE)endMatch('p1');else serve(-1);}}}
  }
  let trail=[];function draw(){const bg=ctx.createRadialGradient(W/2,H/2,20,W/2,H/2,W*.75);bg.addColorStop(0,'#14142a');bg.addColorStop(1,'#08080f');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);ctx.textAlign='center';ctx.font='bold 90px sans-serif';ctx.fillStyle='rgba(255,255,255,.05)';ctx.fillText(score1,W/4,H/2+32);ctx.fillText(score2,W*3/4,H/2+32);ctx.strokeStyle='#3a3a55';ctx.setLineDash([6,8]);ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(W/2,0);ctx.lineTo(W/2,H);ctx.stroke();ctx.setLineDash([]);ctx.strokeStyle='rgba(255,255,255,.08)';ctx.beginPath();ctx.arc(W/2,H/2,50,0,Math.PI*2);ctx.stroke();const p1g=ctx.createLinearGradient(p1.x,0,p1.x+p1.w,0);p1g.addColorStop(0,'#2a8fd0');p1g.addColorStop(1,'#70d8ff');ctx.fillStyle=p1g;ctx.fillRect(p1.x,p1.y,p1.w,p1.h);const p2g=ctx.createLinearGradient(p2.x,0,p2.x+p2.w,0);p2g.addColorStop(0,'#ff8080');p2g.addColorStop(1,'#d02a2a');ctx.fillStyle=p2g;ctx.fillRect(p2.x,p2.y,p2.w,p2.h);if(!winner){trail.push({x:ball.x,y:ball.y});if(trail.length>6)trail.shift();}trail.forEach((p,i)=>{ctx.globalAlpha=(i/trail.length)*.35;ctx.beginPath();ctx.arc(p.x,p.y,ball.r*.8,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();});ctx.globalAlpha=1;ctx.beginPath();ctx.arc(ball.x,ball.y,ball.r,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();if(winner){const label=mode==='2p'||mode==='online'?(winner==='p1'?'Player 1':'Player 2'):(winner==='p1'?'You':'The AI');ctx.fillStyle='rgba(0,0,0,.65)';ctx.fillRect(0,0,W,H);ctx.fillStyle='#ffff50';ctx.font='bold 22px sans-serif';ctx.fillText(`${label} wins!`,W/2,H/2);ctx.font='14px sans-serif';ctx.fillText('Click New Match to play again',W/2,H/2+24);}}
  function hud(){document.getElementById('pong-score').innerHTML=`<b style="color:#50c8ff">${score1}</b> &mdash; <b style="color:#ff5050">${score2}</b>`;document.getElementById('pong-record').textContent=`Record — P1: ${record.p1}  P2/AI: ${record.p2}`;}
  // Real elapsed time in ms since the last frame (clamped so a backgrounded
  // tab doesn't cause a huge physics jump on return), instead of assuming a
  // fixed 60fps/16.67ms step — the ball/paddles were running proportionally
  // faster on any display refreshing above 60Hz (120/144Hz, etc).
  function loop(ts){lastTs==null&&(lastTs=ts);const dt=Math.min(50,ts-lastTs);lastTs=ts;if(mode==='online'&&ArcadeOnline.isHost()){simulate(dt);if(performance.now()-lastNet>50){ArcadeOnline.send({type:'state',state:netState()});lastNet=performance.now();}}else if(mode!=='online'){simulate(dt);}draw();hud();animId=requestAnimationFrame(loop);}
  function updateHint(){
    const hint=document.getElementById('pong-hint');
    if(!hint) return;
    if(mode==='online'){
      const mine=mySide==='p1'?'W / S':'↑ / ↓';
      hint.textContent=`Your controls: ${mine} \u2022 First to ${WIN_SCORE} wins`;
    } else if(mode==='2p'){
      hint.textContent=`Player 1: W / S \u2022 Player 2: \u2191 / \u2193 \u2022 First to ${WIN_SCORE} wins`;
    } else {
      hint.textContent=`Your controls: W / S \u2022 First to ${WIN_SCORE} wins`;
    }
  }
  function startMatch(m,d){mode=m;difficulty=d||'Hard';document.getElementById('pong-setup').style.display='none';document.getElementById('pong-play').style.display='block';newMatch();setupTouchControls();updateHint();if(!animId)animId=requestAnimationFrame(loop);}
  function onlineHost(){online=true;status('Creating room…');ArcadeOnline.host({onConnect:()=>{status('Opponent connected! You are Player 1.');startMatch('online');},onMessage:m=>{if(m.type==='input'&&ArcadeOnline.isHost())remoteKeys=m.keys||{};},onClose:()=>status('Opponent disconnected.'),onReconnecting:()=>status('Connection dropped — reconnecting…'),onReconnected:()=>status('Reconnected.')}).then(code=>{online=true;mySide='p1';document.getElementById('pong-room').textContent=code;document.getElementById('pong-online-game').style.display='block';status('Share this room code. Waiting for Player 2…');}).catch(e=>{console.error('[Pong online host]',e);status(e&&e.message?e.message:'Could not create room.');});}
  async function onlineJoin(){
    online=true;
    const code=document.getElementById('pong-room-input').value.trim();
    if(!code)return status('Enter a room code first.');
    document.getElementById('pong-room').textContent=code;
    status('Joining room…');
    try{
      // The server only ever sends 'peer-connected' to the HOST (it's how
      // the host learns someone joined) — it is never sent to the guest,
      // so this join() promise resolving is the guest's *only* signal that
      // they're in. Putting all of the guest's game setup inside onConnect
      // meant it never ran at all: joining as guest did nothing visible.
      await ArcadeOnline.join(code,{
        onMessage:m=>{
          if(m.type==='state'&&!ArcadeOnline.isHost()){
            const s=m.state;p1.y=s.p1y;p2.y=s.p2y;ball=s.ball;score1=s.score1;score2=s.score2;winner=s.winner;serveTimer=s.serveTimer;
          }
        },
        onClose:()=>status('Host disconnected.'),
        // A reconnect mid-match should NOT reset the score/ball — the host
        // will resume sending authoritative state. Just report it.
        onReconnecting:()=>status('Connection dropped — reconnecting…'),
        onReconnected:()=>status('Reconnected.')
      });
      online=true;mySide='p2';
      p1={x:14,y:H/2-PADDLE_H/2,w:10,h:PADDLE_H};
      p2={x:W-24,y:H/2-PADDLE_H/2,w:10,h:PADDLE_H};
      ball={x:W/2,y:H/2,r:7,vx:0,vy:0};
      score1=0;score2=0;winner=null;
      document.getElementById('pong-setup').style.display='none';
      document.getElementById('pong-play').style.display='block';
      status('Connected! You are Player 2.');
      setupTouchControls();
      updateHint();
      if(!animId)animId=requestAnimationFrame(loop);
    }catch(e){
      console.error('[Pong online join]',e);
      status(e&&e.message?e.message:'Could not join that room. Check the code.');
    }
  }
  function setupTouchControls(){const host=document.getElementById('pong-touch');if(!host)return;host.innerHTML='';if(!window.TouchControls||!TouchControls.isTouchDevice())return;if(mode==='online'){const up=mySide==='p1'?'w':'ArrowUp',down=mySide==='p1'?'s':'ArrowDown';TouchControls.buttons(host,[{label:'▲',key:up,hold:true},{label:'▼',key:down,hold:true}]);}else if(mode==='2p'){TouchControls.buttons(host,[{label:'P1 ▲',key:'w',hold:true},{label:'P1 ▼',key:'s',hold:true},{label:'P2 ▲',key:'ArrowUp',hold:true},{label:'P2 ▼',key:'ArrowDown',hold:true}]);}else{TouchControls.buttons(host,[{label:'▲',key:'w',hold:true},{label:'▼',key:'s',hold:true}]);}}
  function keydown(e){keys[e.key]=true;if(mode==='online'&&mySide==='p2'&&ArcadeOnline.connected())ArcadeOnline.send({type:'input',keys:{up:!!keys.ArrowUp,down:!!keys.ArrowDown}});}
  function keyup(e){keys[e.key]=false;if(mode==='online'&&mySide==='p2'&&ArcadeOnline.connected())ArcadeOnline.send({type:'input',keys:{up:!!keys.ArrowUp,down:!!keys.ArrowDown}});}
  function init(c){container=c;record=Store.get('pong_record',{p1:0,p2:0});container.innerHTML=`<div id="pong-setup"><div class="online-panel"><h3>Play Pong online <span class="online-badge">ONLINE</span></h3><p>One player hosts a room and the other joins from another device.</p><div class="online-row"><button class="btn primary" id="pong-host">Create Room</button><input class="online-input" id="pong-room-input" maxlength="20" placeholder="Room code"><button class="btn" id="pong-join">Join Room</button></div><div class="online-status pong-online-status" id="pong-online-status">You can also use the local modes below.</div></div><div class="online-row"><button class="btn primary" id="pong-2p">2 Player Hotseat</button><button class="btn" id="pong-ai-easy">vs AI (Easy)</button><button class="btn" id="pong-ai-hard">vs AI (Hard)</button></div></div><div id="pong-online-game" class="online-panel" style="display:none"><h3>Online Room</h3><p>Room code: <span class="room-code" id="pong-room">—</span></p><div class="online-status pong-online-status"></div></div><div id="pong-play" style="display:none"><div class="hud"><div id="pong-score">0 — 0</div></div><canvas id="pong-canvas" width="${W}" height="${H}"></canvas><div id="pong-touch"></div><div class="controls-hint" id="pong-hint">Player 1: W / S &nbsp;•&nbsp; Player 2: ↑ / ↓ &nbsp;•&nbsp; First to ${WIN_SCORE} wins</div><div id="pong-record" style="color:var(--dim);font-size:.8rem;margin-top:6px"></div><button class="btn" id="pong-restart">New Match</button><button class="btn" id="pong-change-mode">Change Mode</button></div>`;canvas=document.getElementById('pong-canvas');ctx=canvas.getContext('2d');document.getElementById('pong-host').onclick=onlineHost;document.getElementById('pong-join').onclick=onlineJoin;document.getElementById('pong-2p').onclick=()=>startMatch('2p');document.getElementById('pong-ai-easy').onclick=()=>startMatch('ai','Easy');document.getElementById('pong-ai-hard').onclick=()=>startMatch('ai','Hard');document.getElementById('pong-restart').onclick=newMatch;document.getElementById('pong-change-mode').onclick=()=>{
  // Leaving an active online match without closing the socket left the
  // connection (and the server-side room) open in the background: if the
  // player then started a local 2P/AI match, the old host/guest message
  // handlers kept firing and silently overwrote the new match's paddles,
  // ball and score with stale online state.
  if(mode==='online'){ArcadeOnline.close();online=false;mySide=null;}
  document.getElementById('pong-setup').style.display='block';document.getElementById('pong-play').style.display='none';document.getElementById('pong-online-game').style.display='none';status('You can also use the local modes below.');
};document.addEventListener('keydown',keydown);document.addEventListener('keyup',keyup);}
  function destroy(){cancelAnimationFrame(animId);document.removeEventListener('keydown',keydown);document.removeEventListener('keyup',keyup);if(online)ArcadeOnline.close();}
  registerGame('pong','Pong','🏓',true,{init,destroy},()=>{const r=Store.get('pong_record',null);return r?`Record: ${r.p1}-${r.p2}`:'';});
})();
