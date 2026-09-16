/* PONG */
(function(){
  let canvas, ctx, container, W=480, H=360;
  let p1, p2, ball, keys={}, score1, score2, animId, winner, mode, difficulty, aiReactionTimer, aiTargetY, serveTimer, record;
  const PADDLE_H=90, PADDLE_SPEED=380, BALL_SPEED_START=280, BALL_SPEED_MAX=680, BALL_SPEED_STEP=18, WIN_SCORE=7;
  const AI_REACTION = {Easy:320, Hard:60};
  const AI_SPEED = {Easy:260, Hard:410};

  function newMatch(){
    p1={x:14,y:H/2-PADDLE_H/2,w:10,h:PADDLE_H};
    p2={x:W-24,y:H/2-PADDLE_H/2,w:10,h:PADDLE_H};
    score1=0; score2=0; winner=null; aiReactionTimer=0; aiTargetY=p2.y;
    serve(Math.random()<0.5?-1:1);
  }
  function serve(dir){
    ball={x:W/2,y:H/2,r:7,vx:dir*BALL_SPEED_START,vy:(Math.random()*2-1)*140};
    serveTimer=600;
  }
  function endMatch(win){
    winner=win;
    record[win]++;
    Store.set('pong_record', record);
  }
  function updateAI(dt){
    aiReactionTimer -= dt;
    if(aiReactionTimer<=0){
      aiReactionTimer = AI_REACTION[difficulty];
      aiTargetY = ball.vx>0 ? ball.y-PADDLE_H/2 : H/2-PADDLE_H/2;
    }
    const speed = AI_SPEED[difficulty];
    if(p2.y < aiTargetY) p2.y = Math.min(aiTargetY, p2.y + speed*dt/1000);
    else if(p2.y > aiTargetY) p2.y = Math.max(aiTargetY, p2.y - speed*dt/1000);
    p2.y = Math.max(0, Math.min(H-PADDLE_H, p2.y));
  }
  function loop(ts){
    const dt = 16.67;
    if(keys['w']) p1.y -= PADDLE_SPEED*dt/1000;
    if(keys['s']) p1.y += PADDLE_SPEED*dt/1000;
    p1.y = Math.max(0, Math.min(H-PADDLE_H, p1.y));
    if(mode==='2p'){
      if(keys['ArrowUp']) p2.y -= PADDLE_SPEED*dt/1000;
      if(keys['ArrowDown']) p2.y += PADDLE_SPEED*dt/1000;
      p2.y = Math.max(0, Math.min(H-PADDLE_H, p2.y));
    } else if(!winner) updateAI(dt);

    if(!winner){
      if(serveTimer>0){ serveTimer-=dt; }
      else {
        ball.x += ball.vx*dt/1000; ball.y += ball.vy*dt/1000;
        if(ball.y-ball.r<0){ ball.y=ball.r; ball.vy*=-1; }
        if(ball.y+ball.r>H){ ball.y=H-ball.r; ball.vy*=-1; }
        if(ball.vx<0 && ball.x-ball.r<p1.x+p1.w && ball.y>p1.y && ball.y<p1.y+p1.h){
          const speed = Math.min(BALL_SPEED_MAX, Math.hypot(ball.vx,ball.vy)+BALL_SPEED_STEP);
          const rel = (ball.y-(p1.y+p1.h/2))/(p1.h/2);
          ball.vx = Math.abs(Math.cos(rel*0.6))*speed; ball.vy = Math.sin(rel*0.6)*speed;
          ball.x = p1.x+p1.w+ball.r;
        }
        if(ball.vx>0 && ball.x+ball.r>p2.x && ball.y>p2.y && ball.y<p2.y+p2.h){
          const speed = Math.min(BALL_SPEED_MAX, Math.hypot(ball.vx,ball.vy)+BALL_SPEED_STEP);
          const rel = (ball.y-(p2.y+p2.h/2))/(p2.h/2);
          ball.vx = -Math.abs(Math.cos(rel*0.6))*speed; ball.vy = Math.sin(rel*0.6)*speed;
          ball.x = p2.x-ball.r;
        }
        if(ball.x<0){ score2++; if(score2>=WIN_SCORE) endMatch('p2'); else serve(1); }
        if(ball.x>W){ score1++; if(score1>=WIN_SCORE) endMatch('p1'); else serve(-1); }
      }
    }
    draw();
    updateHud();
    animId = requestAnimationFrame(loop);
  }
  function roundRect(ctx,x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  }
  let ballTrail=[];
  function draw(){
    const bg = ctx.createRadialGradient(W/2,H/2,20,W/2,H/2,W*0.75);
    bg.addColorStop(0,'#14142a'); bg.addColorStop(1,'#08080f');
    ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
    // faint big score numbers behind the action, classic arcade look
    ctx.textAlign='center'; ctx.font='bold 90px sans-serif'; ctx.fillStyle='rgba(255,255,255,0.05)';
    ctx.fillText(score1, W/4, H/2+32); ctx.fillText(score2, W*3/4, H/2+32);
    ctx.strokeStyle='#3a3a55'; ctx.setLineDash([6,8]); ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(W/2,0); ctx.lineTo(W/2,H); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle='rgba(255,255,255,0.08)'; ctx.beginPath(); ctx.arc(W/2,H/2,50,0,Math.PI*2); ctx.stroke();

    const p1Grad = ctx.createLinearGradient(p1.x,0,p1.x+p1.w,0);
    p1Grad.addColorStop(0,'#2a8fd0'); p1Grad.addColorStop(1,'#70d8ff');
    ctx.fillStyle=p1Grad; roundRect(ctx,p1.x,p1.y,p1.w,p1.h,4); ctx.fill();
    const p2Grad = ctx.createLinearGradient(p2.x,0,p2.x+p2.w,0);
    p2Grad.addColorStop(0,'#ff8080'); p2Grad.addColorStop(1,'#d02a2a');
    ctx.fillStyle=p2Grad; roundRect(ctx,p2.x,p2.y,p2.w,p2.h,4); ctx.fill();

    if(!winner){
      ballTrail.push({x:ball.x,y:ball.y});
      if(ballTrail.length>6) ballTrail.shift();
    }
    ballTrail.forEach((p,i)=>{
      ctx.globalAlpha = (i/ballTrail.length)*0.35;
      ctx.beginPath(); ctx.arc(p.x,p.y,ball.r*0.8,0,Math.PI*2); ctx.fillStyle='#fff'; ctx.fill();
    });
    ctx.globalAlpha=1;
    ctx.beginPath(); ctx.arc(ball.x,ball.y,ball.r,0,Math.PI*2); ctx.fillStyle='#fff'; ctx.fill();

    if(winner){
      const label = mode==='2p' ? (winner==='p1'?'Player 1':'Player 2') : (winner==='p1'?'You':'The AI');
      ctx.fillStyle='rgba(0,0,0,0.65)'; ctx.fillRect(0,0,W,H);
      ctx.fillStyle='#ffff50'; ctx.font='bold 22px sans-serif'; ctx.textAlign='center';
      ctx.fillText(`${label} win${mode==='2p'?'s':''}!`, W/2, H/2);
      ctx.font='14px sans-serif';
      ctx.fillText('Click New Match to play again', W/2, H/2+24);
    }
  }
  function updateHud(){
    document.getElementById('pong-score').innerHTML = `<b style="color:#50c8ff">${score1}</b> &mdash; <b style="color:#ff5050">${score2}</b>`;
    document.getElementById('pong-record').textContent = `Record — P1: ${record.p1}  P2/AI: ${record.p2}`;
  }
  function keydown(e){ keys[e.key]=true; }
  function keyup(e){ keys[e.key]=false; }
  function startMatch(m, diff){
    mode=m; difficulty=diff||'Hard';
    document.getElementById('pong-setup').style.display='none';
    document.getElementById('pong-play').style.display='block';
    newMatch();
    if(!animId) animId = requestAnimationFrame(loop);
  }
  function init(c){
    container=c;
    record = Store.get('pong_record', {p1:0,p2:0});
    container.innerHTML = `
      <div id="pong-setup">
        <p class="msg">Choose a mode:</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">
          <button class="btn primary" id="pong-2p">2 Player</button>
          <button class="btn primary" id="pong-ai-easy">vs AI (Easy)</button>
          <button class="btn primary" id="pong-ai-hard">vs AI (Hard)</button>
        </div>
      </div>
      <div id="pong-play" style="display:none;">
        <div class="hud"><div id="pong-score">0 &mdash; 0</div></div>
        <canvas id="pong-canvas" width="${W}" height="${H}"></canvas>
        <div class="controls-hint">Player 1: W / S &nbsp;&bull;&nbsp; Player 2/opponent paddle: Up / Down (2P mode only) &nbsp;&bull;&nbsp; First to ${WIN_SCORE} wins</div>
        <div id="pong-record" style="color:var(--dim);font-size:0.8rem;margin-top:6px;"></div>
        <button class="btn" id="pong-restart">New Match</button>
        <button class="btn" id="pong-change-mode">Change Mode</button>
      </div>
    `;
    canvas=document.getElementById('pong-canvas'); ctx=canvas.getContext('2d');
    document.getElementById('pong-2p').addEventListener('click', ()=>startMatch('2p'));
    document.getElementById('pong-ai-easy').addEventListener('click', ()=>startMatch('ai','Easy'));
    document.getElementById('pong-ai-hard').addEventListener('click', ()=>startMatch('ai','Hard'));
    document.getElementById('pong-restart').addEventListener('click', newMatch);
    document.getElementById('pong-change-mode').addEventListener('click', ()=>{
      document.getElementById('pong-setup').style.display='block';
      document.getElementById('pong-play').style.display='none';
    });
    document.addEventListener('keydown', keydown);
    document.addEventListener('keyup', keyup);
  }
  function destroy(){
    cancelAnimationFrame(animId);
    document.removeEventListener('keydown', keydown);
    document.removeEventListener('keyup', keyup);
  }
  registerGame('pong','Pong','🏓', true, {init, destroy}, ()=>{
    const r = Store.get('pong_record', null);
    return r ? `Record: ${r.p1}-${r.p2}` : '';
  });
})();
