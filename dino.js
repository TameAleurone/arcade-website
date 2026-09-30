/* T-REX RUNNER (dino) */
(function(){
  let canvas, ctx, container, W=600, H=260, groundY=210, animId, keys={}, lastTs=null;
  let paused=false;
  let dino, obstacles, pickups, score, best, gameOver, speed, spawnTimer, itemTimer, elapsed;
  let shieldHits, extraLives, scoreMultTimer, slowTimer, magnetTimer, invincibleTimer, floatingTexts;
  let jumps=0, stompStreak=0;
  const MAX_EXTRA_LIVES=3;
  const PICKUP_INFO = {
    shield:{color:'#50ffea', label:'S', dur:10},
    apple:{color:'#ffd700', label:'2x', dur:8},
    slow:{color:'#a050ff', label:'SM', dur:6},
    magnet:{color:'#ff50c8', label:'M', dur:8},
    life:{color:'#50ff50', label:'+1', dur:0},
  };
  const KINDS = Object.keys(PICKUP_INFO);

  function initState(){
    dino = {x:60, y:groundY-40, w:32, h:40, vy:0, onGround:true, ducking:false};
    obstacles=[]; pickups=[]; floatingTexts=[];
    score=0; gameOver=false; paused=false; speed=250; spawnTimer=1; itemTimer=rand(3,6); elapsed=0;
    shieldHits=0; extraLives=0; scoreMultTimer=0; slowTimer=0; magnetTimer=0; invincibleTimer=0; jumps=0; stompStreak=0;
  }
  function rand(a,b){ return a+Math.random()*(b-a); }
  function jump(){
    if(gameOver) return;
    if(dino.onGround){ dino.vy=-630; dino.onGround=false; jumps=1; }
    else if(jumps===1){ dino.vy=-500; jumps=2; }
  }
  function spawnObstacle(){
    const isBird = score>150 && Math.random()<0.3;
    if(isBird){
      obstacles.push({x:W, y:groundY-70-Math.random()*40, w:34, h:24, type:'bird'});
    } else {
      const h = 30+Math.random()*20;
      obstacles.push({x:W, y:groundY-h, w:18+Math.random()*10, h, type:'cactus'});
    }
  }
  function spawnPickup(){
    const kind = KINDS[Math.floor(Math.random()*KINDS.length)];
    pickups.push({x:W, y:groundY-60-Math.random()*60, r:12, kind});
  }
  function applyPickup(kind){
    const info = PICKUP_INFO[kind];
    if(kind==='shield'){ shieldHits = Math.min(2, shieldHits+1); }
    else if(kind==='apple'){ scoreMultTimer = info.dur; }
    else if(kind==='slow'){ slowTimer = info.dur; }
    else if(kind==='magnet'){ magnetTimer = info.dur; }
    else if(kind==='life'){ extraLives = Math.min(MAX_EXTRA_LIVES, extraLives+1); }
    floatingTexts.push({x:dino.x, y:dino.y-10, text:kind==='life'?'+1 Life':info.label, life:1000});
  }
  let groundScrollX=0;
  function loop(ts){
    // Use real frame-to-frame elapsed time instead of assuming 60fps, so
    // speed/scoring don't run faster on 90/120/144Hz+ displays. Clamp to
    // avoid a huge jump after the tab was backgrounded.
    const dt = lastTs!=null ? Math.min(1/20, (ts-lastTs)/1000) : 1/60;
    lastTs = ts;
    if(!gameOver && !paused){
      const timeScale = slowTimer>0 ? 0.5 : 1;
      groundScrollX = (groundScrollX + speed*dt) % 40;
      elapsed += dt*timeScale;
      score += Math.round(12*dt*(scoreMultTimer>0?2:1));
      speed = (250 + Math.min(200, elapsed*5)) * timeScale;
      if(shieldHits>0) shieldHits=shieldHits; // no decay, consumed on hit
      if(scoreMultTimer>0) scoreMultTimer=Math.max(0,scoreMultTimer-dt);
      if(slowTimer>0) slowTimer=Math.max(0,slowTimer-dt);
      if(magnetTimer>0) magnetTimer=Math.max(0,magnetTimer-dt);
      if(invincibleTimer>0) invincibleTimer=Math.max(0,invincibleTimer-dt);

      dino.ducking = !!(keys['ArrowDown']||keys['s']);
      const h = dino.ducking ? 24 : 40;
      dino.h = h;
      dino.vy += 1600*dt;
      dino.y += dino.vy*dt;
      if(dino.y >= groundY-dino.h){ dino.y=groundY-dino.h; dino.vy=0; dino.onGround=true; }

      spawnTimer -= dt;
      if(spawnTimer<=0){ spawnObstacle(); spawnTimer = Math.max(0.6, 1.4-elapsed*0.02); }
      itemTimer -= dt;
      if(itemTimer<=0){ spawnPickup(); itemTimer = rand(4,7); }

      obstacles.forEach(o=> o.x -= speed*dt);
      obstacles = obstacles.filter(o=>{
        if(o.x+o.w<0) return false;
        if(dino.x<o.x+o.w && dino.x+dino.w>o.x && dino.y<o.y+o.h && dino.y+dino.h>o.y){
          if(invincibleTimer<=0){
            if(shieldHits>0){ shieldHits--; invincibleTimer=0.6; return false; }
            else if(extraLives>0){ extraLives--; invincibleTimer=0.6; return false; }
            else {
              gameOver=true;
              if(score>best){ best=score; Store.set('dino_high', best); }
              if(score>=200) (typeof Achievements!=='undefined'&&Achievements.unlock('dino_score_200'));
              if(score>=1000) (typeof Achievements!=='undefined'&&Achievements.unlock('dino_score_1000'));
            }
          }
        }
        return true;
      });
      pickups.forEach(p=>{
        p.x -= speed*dt;
        if(magnetTimer>0){
          const dx=dino.x-p.x, dy=(dino.y+dino.h/2)-p.y;
          const d=Math.hypot(dx,dy);
          if(d>1 && d<160){ p.x += dx/d*220*dt; p.y += dy/d*220*dt; }
        }
      });
      pickups = pickups.filter(p=>{
        if(p.x+p.r<0) return false;
        const dx=(dino.x+dino.w/2)-p.x, dy=(dino.y+dino.h/2)-p.y;
        if(Math.hypot(dx,dy) < p.r+20){ applyPickup(p.kind); return false; }
        return true;
      });
      floatingTexts.forEach(f=>{ f.y -= 30*dt; f.life -= dt*1000; });
      floatingTexts = floatingTexts.filter(f=>f.life>0);
    }
    draw();
    animId = requestAnimationFrame(loop);
  }
  function roundRect(ctx,x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  }
  function draw(){
    const sky = ctx.createLinearGradient(0,0,0,groundY);
    sky.addColorStop(0,'#2a2a4a'); sky.addColorStop(1,'#5a4a6a');
    ctx.fillStyle=sky; ctx.fillRect(0,0,W,groundY);
    // distant hill silhouettes for depth
    ctx.fillStyle='rgba(20,15,35,0.5)';
    for(let i=0;i<5;i++){
      const hx = ((i*160 - groundScrollX*0.3) % (W+160)) - 80;
      ctx.beginPath(); ctx.ellipse(hx,groundY,90,34,0,Math.PI,0); ctx.fill();
    }
    // ground with subtle scrolling texture
    ctx.strokeStyle='#8a7a9a'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(0,groundY); ctx.lineTo(W,groundY); ctx.stroke();
    ctx.strokeStyle='rgba(255,255,255,0.15)'; ctx.lineWidth=2; ctx.beginPath();
    for(let gx=-groundScrollX; gx<W; gx+=40){ ctx.moveTo(gx,groundY+6); ctx.lineTo(gx+18,groundY+6); }
    ctx.stroke();

    pickups.forEach(p=>{
      const info = PICKUP_INFO[p.kind];
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fillStyle=info.color; ctx.fill();
      ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.lineWidth=1.5; ctx.stroke();
      ctx.fillStyle='#111'; ctx.font='bold 9px sans-serif'; ctx.textAlign='center';
      ctx.fillText(info.label, p.x, p.y+3);
    });

    // dino: rounded body + simple alternating running legs
    const flashing = invincibleTimer>0 && Math.floor(invincibleTimer*20)%2===0;
    ctx.globalAlpha = flashing ? 0.4 : 1;
    if(dino.onGround){
      const legPhase = Math.floor(groundScrollX/10)%2;
      ctx.fillStyle = shieldHits>0 ? '#7fffe8' : '#0a5a5a';
      roundRect(ctx, dino.x+4+(legPhase===0?0:6), dino.y+dino.h-6, 8, 10, 2); ctx.fill();
      roundRect(ctx, dino.x+dino.w-12-(legPhase===0?6:0), dino.y+dino.h-6, 8, 10, 2); ctx.fill();
    }
    const bodyGrad = ctx.createLinearGradient(dino.x,dino.y,dino.x,dino.y+dino.h);
    bodyGrad.addColorStop(0, shieldHits>0?'#a0fff5':'#12a0a0'); bodyGrad.addColorStop(1, shieldHits>0?'#50ffea':'#0a5a5a');
    ctx.fillStyle=bodyGrad;
    roundRect(ctx, dino.x, dino.y, dino.w, dino.h, 8); ctx.fill();
    if(shieldHits>0){ ctx.strokeStyle='#50ffea'; ctx.lineWidth=2; roundRect(ctx,dino.x-2,dino.y-2,dino.w+4,dino.h+4,9); ctx.stroke(); }
    // eye
    ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(dino.x+dino.w-9, dino.y+9, 4, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle='#111'; ctx.beginPath(); ctx.arc(dino.x+dino.w-8, dino.y+9, 2, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;

    obstacles.forEach(o=>{
      if(o.type==='bird'){
        ctx.fillStyle='#ff9f50';
        const flap = Math.sin(groundScrollX*0.5)*6;
        ctx.beginPath();
        ctx.moveTo(o.x, o.y+o.h/2);
        ctx.quadraticCurveTo(o.x+o.w/2, o.y+o.h/2-10-flap, o.x+o.w, o.y+o.h/2);
        ctx.quadraticCurveTo(o.x+o.w/2, o.y+o.h/2+6, o.x, o.y+o.h/2);
        ctx.fill();
      } else {
        const grad = ctx.createLinearGradient(o.x,o.y,o.x,o.y+o.h);
        grad.addColorStop(0,'#6fff6f'); grad.addColorStop(1,'#2fa62f');
        ctx.fillStyle=grad;
        roundRect(ctx,o.x,o.y,o.w,o.h,4); ctx.fill();
      }
    });
    floatingTexts.forEach(f=>{
      ctx.fillStyle='#ffd700'; ctx.font='bold 13px sans-serif'; ctx.textAlign='center';
      ctx.globalAlpha = Math.max(0, f.life/1000);
      ctx.fillText(f.text, f.x, f.y);
      ctx.globalAlpha=1;
    });

    ctx.fillStyle='rgba(10,15,30,0.4)'; roundRect(ctx,6,4,150,34,8); ctx.fill();
    ctx.textAlign='left'; ctx.fillStyle='#e8e8f0'; ctx.font='bold 13px monospace';
    ctx.fillText('Score: '+score, 14, 20);
    ctx.fillStyle='#9090a8'; ctx.font='11px monospace';
    ctx.fillText('Best: '+best, 14, 34);
    let y=54;
    const effects=[];
    if(shieldHits>0) effects.push(['Shield x'+shieldHits,'#50ffea']);
    if(extraLives>0) effects.push(['Extra lives: '+extraLives,'#50ff50']);
    if(scoreMultTimer>0) effects.push(['2x score '+scoreMultTimer.toFixed(1)+'s','#ffd700']);
    if(slowTimer>0) effects.push(['Slow-Mo '+slowTimer.toFixed(1)+'s','#a050ff']);
    if(magnetTimer>0) effects.push(['Magnet '+magnetTimer.toFixed(1)+'s','#ff50c8']);
    if(effects.length){
      ctx.fillStyle='rgba(10,15,30,0.4)'; roundRect(ctx,6,44,150,effects.length*14+8,8); ctx.fill();
      effects.forEach(([label,color])=>{ ctx.fillStyle=color; ctx.font='11px sans-serif'; ctx.fillText(label, 12, y); y+=14; });
    }
    if(paused){ ctx.fillStyle='rgba(0,0,0,.62)'; ctx.fillRect(0,0,W,H); ctx.fillStyle='#50c8ff'; ctx.font='bold 24px sans-serif'; ctx.textAlign='center'; ctx.fillText('Paused',W/2,H/2); ctx.font='14px sans-serif'; ctx.fillText('Press P or Pause to resume',W/2,H/2+24); }
    if(gameOver){
      ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(0,0,W,H);
      ctx.textAlign='center'; ctx.fillStyle='#ffff50'; ctx.font='bold 20px sans-serif';
      ctx.fillText('Game Over — press Space / click Restart', W/2, H/2);
    }
  }
  function keydown(e){
    keys[e.key]=true;
    if(e.key===' '||e.key==='ArrowUp'||e.key==='w'){
      if(gameOver){ initState(); } else jump();
      e.preventDefault();
    }
  }
  function keyup(e){ keys[e.key]=false; }
  function init(c){
    container=c; best=Store.get('dino_high',0);
    container.innerHTML = `
      <canvas id="dino-canvas" width="${W}" height="${H}"></canvas>
      <div class="controls-hint">Space / Up / click canvas to jump &bull; Down to duck<br>
        Pickups: <span style="color:#50ffea;">S shield</span> &bull; <span style="color:#ffd700;">2x score</span> &bull;
        <span style="color:#a050ff;">SM slow-mo</span> &bull; <span style="color:#ff50c8;">M magnet</span> &bull;
        <span style="color:#50ff50;">+1 life</span>
      </div>
      <button class="btn" id="dino-pause">Pause</button>
      <button class="btn" id="dino-restart">Restart</button>
    `;
    canvas=document.getElementById('dino-canvas'); ctx=canvas.getContext('2d');
    canvas.addEventListener('mousedown', ()=>{ if(gameOver) initState(); else jump(); });
    canvas.addEventListener('touchstart', (e)=>{ e.preventDefault(); if(gameOver) initState(); else jump(); }, {passive:false});
    document.getElementById('dino-restart').addEventListener('click', initState);
    document.getElementById('dino-pause').addEventListener('click', ()=>{ paused=!paused; document.getElementById('dino-pause').textContent=paused?'Resume':'Pause'; });
    document.addEventListener('keydown', keydown);
    document.addEventListener('keyup', keyup);
    initState();
    animId = requestAnimationFrame(loop);
    if(window.TouchControls){
      TouchControls.buttons(container, [{label:'DUCK', key:'ArrowDown', hold:true, className:'wide'}]);
    }
  }
  function destroy(){
    cancelAnimationFrame(animId);
    document.removeEventListener('keydown', keydown);
    document.removeEventListener('keyup', keyup);
  }
  registerGame('dino','Dino Game','🦖', true, {init, destroy}, ()=>`Best: ${Store.get('dino_high',0)}`);
})();
