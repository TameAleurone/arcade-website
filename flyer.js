/* FLAPPY BIRD (flyer) */
(function(){
  let canvas, ctx, container, W=420, H=560, groundY=520, animId;
  let paused=false;
  let bird, pipes, coins, powerups, score, best, gameOver, spawnTimer, coinTimer, started;
  let lifetimeCoins, runCoins, shieldT, slowT, magnetT, doubleCoinT;
  const PIPE_GAP=160, PIPE_SPEED=125, PIPE_INTERVAL=2.0;
  const POWERUP_INFO = {
    shield:{color:'#50ffea', label:'S'},
    slow:{color:'#a050ff', label:'SM'},
    magnet:{color:'#ff50c8', label:'M'},
    doublecoin:{color:'#ffd700', label:'2x'},
  };
  const KINDS = Object.keys(POWERUP_INFO);

  function initState(){
    bird = {x:90, y:H/2, r:14, vy:0};
    pipes=[]; coins=[]; powerups=[];
    score=0; runCoins=0; gameOver=false; paused=false; spawnTimer=0; coinTimer=2; started=false;
    shieldT=0; slowT=0; magnetT=0; doubleCoinT=0;
    lifetimeCoins = Store.get('flyer_lifetime_coins', 0);
  }
  function flap(){
    if(paused && started){ ctx.fillStyle='rgba(0,0,0,.58)'; ctx.fillRect(0,0,W,H); ctx.fillStyle='#50c8ff'; ctx.font='bold 24px sans-serif'; ctx.textAlign='center'; ctx.fillText('Paused',W/2,H/2); }
    if(gameOver){ initState(); return; }
    started=true;
    bird.vy=-270;
  }
  function spawnPipe(){
    const top = 60+Math.random()*(groundY-PIPE_GAP-120);
    pipes.push({x:W, top, gap:PIPE_GAP, w:56, passed:false});
  }
  function spawnCoin(){
    const y = 80+Math.random()*(groundY-160);
    coins.push({x:W, y, r:9});
    if(Math.random()<0.25){
      const kind = KINDS[Math.floor(Math.random()*KINDS.length)];
      powerups.push({x:W+40, y:80+Math.random()*(groundY-160), r:11, kind});
    }
  }
  let wingPhase=0;
  function loop(){
    const dt=1/60;
    if(started && !gameOver) wingPhase += dt*9;
    if(started && !gameOver && !paused){
      const speedScale = slowT>0 ? 0.55 : 1;
      bird.vy += 850*dt;
      bird.y += bird.vy*dt;
      if(shieldT>0) shieldT=Math.max(0,shieldT-dt);
      if(slowT>0) slowT=Math.max(0,slowT-dt);
      if(magnetT>0) magnetT=Math.max(0,magnetT-dt);
      if(doubleCoinT>0) doubleCoinT=Math.max(0,doubleCoinT-dt);

      spawnTimer -= dt;
      if(spawnTimer<=0){ spawnPipe(); spawnTimer=PIPE_INTERVAL; }
      coinTimer -= dt;
      if(coinTimer<=0){ spawnCoin(); coinTimer=1.4+Math.random()*1.2; }

      pipes.forEach(p=> p.x -= PIPE_SPEED*speedScale*dt);
      pipes.forEach(p=>{
        if(!p.passed && p.x+p.w<bird.x){ p.passed=true; score++; }
        if(bird.x+bird.r>p.x && bird.x-bird.r<p.x+p.w){
          if(bird.y-bird.r<p.top || bird.y+bird.r>p.top+p.gap){
            if(shieldT>0){ shieldT=0; p.x=-999; }
            else {
              gameOver=true;
              finishRun();
            }
          }
        }
      });
      pipes = pipes.filter(p=>p.x+p.w>0);

      coins.forEach(c=>{
        c.x -= PIPE_SPEED*speedScale*dt;
        if(magnetT>0){
          const dx=bird.x-c.x, dy=bird.y-c.y, d=Math.hypot(dx,dy);
          if(d>1 && d<140){ c.x += dx/d*200*dt; c.y += dy/d*200*dt; }
        }
      });
      coins = coins.filter(c=>{
        if(c.x+c.r<0) return false;
        if(Math.hypot(bird.x-c.x,bird.y-c.y) < bird.r+c.r){
          const gain = doubleCoinT>0 ? 2 : 1;
          runCoins += gain; lifetimeCoins += gain;
          Store.set('flyer_lifetime_coins', lifetimeCoins);
          return false;
        }
        return true;
      });
      powerups.forEach(p=> p.x -= PIPE_SPEED*speedScale*dt);
      powerups = powerups.filter(p=>{
        if(p.x+p.r<0) return false;
        if(Math.hypot(bird.x-p.x,bird.y-p.y) < bird.r+p.r){
          if(p.kind==='shield') shieldT=8;
          else if(p.kind==='slow') slowT=6;
          else if(p.kind==='magnet') magnetT=8;
          else if(p.kind==='doublecoin') doubleCoinT=8;
          return false;
        }
        return true;
      });

      if(bird.y+bird.r>groundY || bird.y-bird.r<0){
        if(shieldT>0){ shieldT=0; bird.y=Math.max(bird.r,Math.min(groundY-bird.r,bird.y)); bird.vy=-200; }
        else { gameOver=true; finishRun(); }
      }
    }
    draw();
    animId = requestAnimationFrame(loop);
  }
  function finishRun(){
    if(score>best){ best=score; Store.set('flyer_high', best); }
  }
  function draw(){
    // sky gradient
    const sky = ctx.createLinearGradient(0,0,0,groundY);
    sky.addColorStop(0,'#4a7fd6'); sky.addColorStop(1,'#8fb8ea');
    ctx.fillStyle=sky; ctx.fillRect(0,0,W,groundY);
    // soft clouds (static parallax-ish, purely decorative)
    ctx.fillStyle='rgba(255,255,255,0.55)';
    for(let i=0;i<4;i++){
      const cx=((i*160 + (Date.now()/90))%(W+120))-60, cy=70+i*80%180;
      ctx.beginPath(); ctx.arc(cx,cy,18,0,Math.PI*2); ctx.arc(cx+20,cy+4,14,0,Math.PI*2); ctx.arc(cx-16,cy+6,12,0,Math.PI*2); ctx.fill();
    }

    ctx.fillStyle='#2f5f2f';
    pipes.forEach(p=>{
      const grad = ctx.createLinearGradient(p.x,0,p.x+p.w,0);
      grad.addColorStop(0,'#4a8f4a'); grad.addColorStop(0.5,'#3a7a3a'); grad.addColorStop(1,'#2f5f2f');
      ctx.fillStyle=grad;
      ctx.fillRect(p.x,0,p.w,p.top);
      ctx.fillRect(p.x,p.top+p.gap,p.w,groundY-(p.top+p.gap));
      // pipe lip/caps for a more finished look
      ctx.fillStyle='#255025';
      ctx.fillRect(p.x-4,p.top-18,p.w+8,18);
      ctx.fillRect(p.x-4,p.top+p.gap,p.w+8,18);
      ctx.fillStyle=grad;
    });

    coins.forEach(c=>{
      ctx.beginPath(); ctx.arc(c.x,c.y,c.r,0,Math.PI*2); ctx.fillStyle='#ffd700'; ctx.fill();
      ctx.strokeStyle='#a67c00'; ctx.lineWidth=1.5; ctx.stroke();
      ctx.strokeStyle='rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(c.x-2,c.y-2,c.r*0.5,0,Math.PI*2); ctx.stroke();
    });
    powerups.forEach(p=>{
      const info = POWERUP_INFO[p.kind];
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fillStyle=info.color; ctx.fill();
      ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.lineWidth=1.5; ctx.stroke();
      ctx.fillStyle='#111'; ctx.font='bold 9px sans-serif'; ctx.textAlign='center';
      ctx.fillText(info.label, p.x, p.y+3);
    });

    // textured ground
    const groundGrad = ctx.createLinearGradient(0,groundY,0,H);
    groundGrad.addColorStop(0,'#8a6136'); groundGrad.addColorStop(1,'#6b4a2a');
    ctx.fillStyle=groundGrad; ctx.fillRect(0,groundY,W,H-groundY);
    ctx.strokeStyle='rgba(0,0,0,0.25)'; ctx.lineWidth=3; ctx.beginPath();
    for(let gx=-((Date.now()/8)%24); gx<W; gx+=24){ ctx.moveTo(gx,groundY+4); ctx.lineTo(gx+12,groundY+4); }
    ctx.stroke();

    // bird: rotate based on vertical speed, simple flapping wing
    const angle = Math.max(-0.5, Math.min(1.1, bird.vy/500));
    const flashing = shieldT>0 && Math.floor(shieldT*8)%2===0;
    ctx.save();
    ctx.translate(bird.x,bird.y);
    ctx.rotate(angle);
    if(shieldT>0 && !flashing){ ctx.strokeStyle='#50ffea'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(0,0,bird.r+5,0,Math.PI*2); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(0,0,bird.r,0,Math.PI*2);
    ctx.fillStyle = shieldT>0 ? (flashing?'#50ffea':'#a0fff0') : '#ffd700'; ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,0.25)'; ctx.lineWidth=1.5; ctx.stroke();
    // wing
    const wingLift = Math.sin(wingPhase)*6;
    ctx.beginPath();
    ctx.ellipse(-2,2+wingLift*0.3,bird.r*0.6,bird.r*0.38,-0.3+wingLift*0.04,0,Math.PI*2);
    ctx.fillStyle='#e0a800'; ctx.fill();
    // beak
    ctx.beginPath(); ctx.moveTo(bird.r-2,-2); ctx.lineTo(bird.r+8,2); ctx.lineTo(bird.r-2,6); ctx.closePath();
    ctx.fillStyle='#ff9a2e'; ctx.fill();
    // eye
    ctx.beginPath(); ctx.arc(4,-5,2.6,0,Math.PI*2); ctx.fillStyle='#000'; ctx.fill();
    ctx.restore();

    // HUD panel
    ctx.fillStyle='rgba(10,15,30,0.45)';
    roundRect(ctx,6,6,180,doubleCoinT>0||magnetT>0||slowT>0||shieldT>0?116:70,10); ctx.fill();
    ctx.textAlign='left'; ctx.fillStyle='#fff'; ctx.font='bold 18px sans-serif';
    ctx.fillText('Score: '+score, 16, 28);
    ctx.font='12px sans-serif'; ctx.fillStyle='#cfd3ee';
    ctx.fillText('Best: '+best, 16, 46);
    ctx.fillStyle='#ffd700';
    ctx.fillText('Coins: '+runCoins+'  (total '+lifetimeCoins+')', 16, 62);
    let y=80;
    if(shieldT>0){ ctx.fillStyle='#50ffea'; ctx.fillText('Shield '+shieldT.toFixed(1)+'s', 16, y); y+=14; }
    if(slowT>0){ ctx.fillStyle='#a050ff'; ctx.fillText('Slow-Mo '+slowT.toFixed(1)+'s', 16, y); y+=14; }
    if(magnetT>0){ ctx.fillStyle='#ff50c8'; ctx.fillText('Magnet '+magnetT.toFixed(1)+'s', 16, y); y+=14; }
    if(doubleCoinT>0){ ctx.fillStyle='#ffd700'; ctx.fillText('2x Coins '+doubleCoinT.toFixed(1)+'s', 16, y); y+=14; }

    if(!started){
      ctx.textAlign='center'; ctx.fillStyle='rgba(10,15,30,0.55)'; roundRect(ctx,W/2-140,H/2-30,280,50,10); ctx.fill();
      ctx.fillStyle='#ffff50'; ctx.font='bold 18px sans-serif';
      ctx.fillText('Click / Space to flap', W/2, H/2+2);
    }
    if(gameOver){
      ctx.textAlign='center'; ctx.fillStyle='rgba(10,15,30,0.6)'; roundRect(ctx,W/2-160,H/2-30,320,50,10); ctx.fill();
      ctx.fillStyle='#ffff50'; ctx.font='bold 18px sans-serif';
      ctx.fillText('Game Over — click to restart', W/2, H/2+2);
    }
  }
  function roundRect(ctx,x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  }
  function key(e){ if(e.key==='p'||e.key==='P'){ paused=!paused; e.preventDefault(); return; } if(e.key===' '||e.key==='ArrowUp'){ flap(); e.preventDefault(); } }
  function init(c){
    container=c; best=Store.get('flyer_high',0);
    container.innerHTML = `
      <canvas id="flyer-canvas" width="${W}" height="${H}"></canvas>
      <div class="controls-hint">Click canvas or press Space to flap through the pipes<br>
        Collect coins &bull; <span style="color:#50ffea;">S shield</span> &bull; <span style="color:#a050ff;">SM slow-mo</span> &bull;
        <span style="color:#ff50c8;">M magnet</span> &bull; <span style="color:#ffd700;">2x coins</span>
      </div>
    `;
    canvas=document.getElementById('flyer-canvas'); ctx=canvas.getContext('2d');
    canvas.addEventListener('mousedown', flap);
    document.addEventListener('keydown', key);
    initState();
    animId = requestAnimationFrame(loop);
  }
  function destroy(){ cancelAnimationFrame(animId); document.removeEventListener('keydown', key); }
  registerGame('flyer','Flappy Bird','🐦', true, {init, destroy}, ()=>`Best: ${Store.get('flyer_high',0)}`);
})();
