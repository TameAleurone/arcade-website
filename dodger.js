/* METEOR DODGER */
(function(){
  let canvas, ctx, container, W=480, H=560, animId, keys={};
  let paused=false;
  let player, meteors, powerups, score, best, lives, gameOver, spawnTimer, elapsed;
  let nearMisses=0, nearMissFlash=0;
  let shieldT, slowT, shrinkT, multiplierT, dodgeStreak, comboTier, eliteBannerT, nextEliteScore;
  const COMBO_STEP=5, MAX_COMBO_TIER=10, COMBO_BONUS_PER_TIER=0.2, ELITE_INTERVAL=500;
  const POWERUP_KINDS = ['shield','slow','life','shrink','multiplier'];
  const POWERUP_COLORS = {shield:'#ffd700',slow:'#50ffea',life:'#50ff50',shrink:'#c060ff',multiplier:'#ff9f50'};
  const POWERUP_LABELS = {shield:'S',slow:'SL',life:'+1',shrink:'SH',multiplier:'x2'};

  let stars=[];
  function comboMultiplier(){ return 1 + comboTier*COMBO_BONUS_PER_TIER; }
  function initState(){
    player = {x:W/2, y:H-60, size:22, speed:320};
    meteors=[]; powerups=[]; score=0; lives=3; gameOver=false; paused=false; nearMisses=0; nearMissFlash=0;
    spawnTimer=0; elapsed=0; shieldT=0; slowT=0; shrinkT=0; multiplierT=0;
    dodgeStreak=0; comboTier=0; eliteBannerT=0; nextEliteScore=ELITE_INTERVAL;
    if(!stars.length){
      for(let i=0;i<70;i++) stars.push({x:Math.random()*W, y:Math.random()*H, size:0.6+Math.random()*1.8, speed:20+Math.random()*50, phase:Math.random()*10});
    }
  }
  function jaggedPoints(size, seedIdx){
    const pts=[]; const n=8;
    for(let i=0;i<n;i++){
      const ang = (i/n)*Math.PI*2;
      const r = size/2*(0.75+((Math.sin(seedIdx*13+i*7)+1)/2)*0.4);
      pts.push([Math.cos(ang)*r, Math.sin(ang)*r]);
    }
    return pts;
  }
  function spawnMeteor(){
    const elite = score>=nextEliteScore;
    if(elite){
      nextEliteScore += ELITE_INTERVAL;
      eliteBannerT = 1.6;
      meteors.push({x: Math.random()*(W-50)+25, y:-50, size:50, speed:70+Math.min(90,score*0.15), elite:true, dodged:false, seed:Math.random()*100, rot:Math.random()*Math.PI*2, rotSpeed:(Math.random()-0.5)*1.2});
    } else {
      const size = 14 + Math.random()*22;
      meteors.push({x: Math.random()*(W-size)+size/2, y:-size, size, speed: 90+Math.random()*120 + Math.min(140, score*0.3), elite:false, dodged:false, seed:Math.random()*100, rot:Math.random()*Math.PI*2, rotSpeed:(Math.random()-0.5)*1.6});
    }
  }
  function spawnPowerup(){
    const kind = POWERUP_KINDS[Math.floor(Math.random()*POWERUP_KINDS.length)];
    powerups.push({x: Math.random()*(W-24)+12, y:-12, size:14, speed:140, kind});
  }
  function registerDodge(){
    dodgeStreak++;
    if(dodgeStreak%COMBO_STEP===0 && comboTier<MAX_COMBO_TIER) comboTier++;
  }
  function loop(ts){
    const dt = 1/60;
    if(!gameOver && !paused){
      elapsed += dt;
      score += Math.round(10*dt*comboMultiplier()*(multiplierT>0?2:1));
      if(shieldT>0) shieldT=Math.max(0,shieldT-dt);
      if(slowT>0) slowT=Math.max(0,slowT-dt);
      if(shrinkT>0) shrinkT=Math.max(0,shrinkT-dt);
      if(multiplierT>0) multiplierT=Math.max(0,multiplierT-dt);
      if(eliteBannerT>0) eliteBannerT=Math.max(0,eliteBannerT-dt);
      const slowFactor = slowT>0 ? 0.5 : 1;
      const effectiveSize = shrinkT>0 ? player.size*0.55 : player.size;
      if(keys['ArrowLeft']||keys['a']) player.x -= player.speed*dt;
      if(keys['ArrowRight']||keys['d']) player.x += player.speed*dt;
      if(keys['ArrowUp']||keys['w']) player.y -= player.speed*dt;
      if(keys['ArrowDown']||keys['s']) player.y += player.speed*dt;
      player.x = Math.max(player.size/2, Math.min(W-player.size/2, player.x));
      player.y = Math.max(player.size/2, Math.min(H-player.size/2, player.y));

      spawnTimer -= dt;
      if(spawnTimer<=0){
        spawnMeteor();
        spawnTimer = Math.max(0.18, 0.65 - elapsed*0.01);
        if(Math.random()<0.02) spawnPowerup();
      }
      meteors.forEach(m=>{ m.y += m.speed*slowFactor*dt; m.rot += m.rotSpeed*dt; });
      powerups.forEach(p=> p.y += p.speed*dt);
      meteors = meteors.filter(m=>{
        if(m.y-m.size>H){
          if(!m.dodged){ registerDodge(); if(m.elite) score += 50; }
        } else if(!m.dodged && m.y>player.y-45 && m.y<player.y+player.h+45){
          const gap=Math.abs((m.x)-(player.x+player.w/2));
          if(gap < 75 && gap > 30){ nearMisses++; score+=5; nearMissFlash=700; }
          return false;
        }
        const dx=m.x-player.x, dy=m.y-player.y;
        const dist = Math.sqrt(dx*dx+dy*dy);
        if(dist < (m.size+effectiveSize)/2){
          if(shieldT>0){ return false; }
          lives--;
          dodgeStreak=0; comboTier=0;
          if(lives<=0){
            gameOver=true;
            if(score>best){ best=score; Store.set('dodger_high', best); }
          }
          return false;
        }
        return true;
      });
      powerups = powerups.filter(p=>{
        if(p.y-p.size>H) return false;
        const dx=p.x-player.x, dy=p.y-player.y;
        if(Math.sqrt(dx*dx+dy*dy) < (p.size+effectiveSize)/2){
          if(p.kind==='shield') shieldT=5;
          else if(p.kind==='slow') slowT=5;
          else if(p.kind==='life') lives=Math.min(5,lives+1);
          else if(p.kind==='shrink') shrinkT=6;
          else if(p.kind==='multiplier') multiplierT=6;
          return false;
        }
        return true;
      });
    }
    if(nearMissFlash>0) nearMissFlash=Math.max(0,nearMissFlash-dt*1000);
    draw();
    animId = requestAnimationFrame(loop);
  }
  function roundRect(ctx,x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  }
  function draw(){
    const bg = ctx.createLinearGradient(0,0,0,H);
    bg.addColorStop(0,'#0a0a1a'); bg.addColorStop(1,'#12081c');
    ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
    stars.forEach(s=>{
      s.y = (s.y + s.speed*(1/60)*(slowT>0?0.5:1)) % H;
      const tw = 0.5 + 0.5*Math.sin(elapsed*3+s.phase);
      ctx.globalAlpha = 0.35+0.5*tw;
      ctx.fillStyle='#fff'; ctx.fillRect(s.x, s.y, s.size, s.size);
    });
    ctx.globalAlpha=1;

    meteors.forEach(m=>{
      ctx.save();
      ctx.translate(m.x,m.y); ctx.rotate(m.rot);
      const pts = jaggedPoints(m.size, m.seed);
      const grad = ctx.createRadialGradient(-m.size*0.15,-m.size*0.15,m.size*0.1,0,0,m.size*0.6);
      if(m.elite){ grad.addColorStop(0,'#ff8080'); grad.addColorStop(1,'#a10f0f'); }
      else { grad.addColorStop(0,'#ff9090'); grad.addColorStop(1,'#c53030'); }
      ctx.beginPath();
      pts.forEach(([px,py],i)=> i===0?ctx.moveTo(px,py):ctx.lineTo(px,py));
      ctx.closePath();
      ctx.fillStyle=grad; ctx.fill();
      if(m.elite){ ctx.strokeStyle='#ffd700'; ctx.lineWidth=2; ctx.stroke(); }
      else { ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.lineWidth=1; ctx.stroke(); }
      ctx.restore();
    });
    powerups.forEach(p=>{
      ctx.beginPath(); ctx.arc(p.x,p.y,p.size/2,0,Math.PI*2);
      ctx.fillStyle=POWERUP_COLORS[p.kind]; ctx.fill();
      ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.lineWidth=1.5; ctx.stroke();
      ctx.fillStyle='#000'; ctx.font='9px sans-serif'; ctx.textAlign='center';
      ctx.fillText(POWERUP_LABELS[p.kind], p.x, p.y+3);
    });

    // player: small ship with an engine glow
    const effectiveSize = shrinkT>0 ? player.size*0.55 : player.size;
    const shipColor = shieldT>0 ? '#ffd700' : (shrinkT>0 ? '#c060ff' : '#50c8ff');
    ctx.save();
    ctx.translate(player.x, player.y);
    const flicker = 6+Math.random()*6;
    ctx.beginPath(); ctx.moveTo(-effectiveSize*0.18,effectiveSize*0.4); ctx.lineTo(0,effectiveSize*0.4+flicker); ctx.lineTo(effectiveSize*0.18,effectiveSize*0.4);
    ctx.closePath(); ctx.fillStyle='rgba(255,159,80,0.85)'; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0,-effectiveSize/2); ctx.lineTo(effectiveSize/2,effectiveSize/2); ctx.lineTo(0,effectiveSize*0.25); ctx.lineTo(-effectiveSize/2,effectiveSize/2);
    ctx.closePath();
    ctx.fillStyle=shipColor; ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.lineWidth=1; ctx.stroke();
    ctx.beginPath(); ctx.arc(0,-effectiveSize*0.05,effectiveSize*0.14,0,Math.PI*2); ctx.fillStyle='rgba(255,255,255,0.8)'; ctx.fill();
    ctx.restore();
    if(shieldT>0){ ctx.strokeStyle='#ffd700'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(player.x,player.y,effectiveSize/2+6,0,Math.PI*2); ctx.stroke(); }

    ctx.fillStyle='rgba(10,15,30,0.45)'; roundRect(ctx,6,6,150,36,10); ctx.fill();
    ctx.textAlign='left'; ctx.fillStyle='#ffff50'; ctx.font='bold 15px sans-serif';
    ctx.fillText('Score: '+score, 16, 22);
    ctx.fillText('Near misses: '+nearMisses, 16, 42);
    if(nearMissFlash>0){ctx.textAlign='center';ctx.fillStyle='#ffd700';ctx.font='bold 18px sans-serif';ctx.fillText('NEAR MISS +5',W/2,48);ctx.textAlign='left';}
    ctx.fillStyle='#9090a8'; ctx.font='11px sans-serif';
    ctx.fillText('Best: '+best, 16, 36);
    for(let i=0;i<lives;i++){ ctx.beginPath(); ctx.arc(20+i*22,58,7,0,Math.PI*2); ctx.fillStyle='#ff5050'; ctx.fill(); }
    if(comboTier>0){ ctx.fillStyle='#50ff50'; ctx.font='12px sans-serif'; ctx.fillText(`Combo tier ${comboTier} (x${comboMultiplier().toFixed(1)})`, 10, 76); }
    let ry=22;
    const effects=[];
    if(slowT>0) effects.push(['Slow-Mo '+slowT.toFixed(1)+'s','#50ffea']);
    if(shieldT>0) effects.push(['Shield '+shieldT.toFixed(1)+'s','#ffd700']);
    if(shrinkT>0) effects.push(['Shrink '+shrinkT.toFixed(1)+'s','#c060ff']);
    if(multiplierT>0) effects.push(['2x Score '+multiplierT.toFixed(1)+'s','#ff9f50']);
    if(effects.length){
      ctx.fillStyle='rgba(10,15,30,0.45)'; roundRect(ctx,W-146,6,140,effects.length*16+8,10); ctx.fill();
      effects.forEach(([label,color])=>{ ctx.fillStyle=color; ctx.font='12px sans-serif'; ctx.textAlign='left'; ctx.fillText(label, W-138, ry); ry+=16; });
    }
    if(eliteBannerT>0){
      ctx.globalAlpha = Math.min(1, eliteBannerT);
      ctx.textAlign='center'; ctx.fillStyle='#ff2020'; ctx.font='bold 20px sans-serif';
      ctx.fillText('⚠ ELITE METEOR INCOMING ⚠', W/2, 100);
      ctx.globalAlpha=1;
    }

    if(paused){ ctx.fillStyle='rgba(0,0,0,.62)'; ctx.fillRect(0,0,W,H); ctx.fillStyle='#50c8ff'; ctx.font='bold 24px sans-serif'; ctx.textAlign='center'; ctx.fillText('Paused',W/2,H/2); ctx.font='14px sans-serif'; ctx.fillText('Press P or Pause to resume',W/2,H/2+24); }
    if(gameOver){
      ctx.fillStyle='rgba(0,0,0,0.65)'; ctx.fillRect(0,0,W,H);
      ctx.fillStyle='#ffff50'; ctx.font='bold 24px sans-serif'; ctx.textAlign='center';
      ctx.fillText('Game Over', W/2, H/2-10);
      ctx.font='14px sans-serif';
      ctx.fillText('Score: '+score+'  Best: '+best, W/2, H/2+16);
      ctx.fillText('Click Restart to play again', W/2, H/2+38);
    }
  }
  function keydown(e){ if(e.key==='p'||e.key==='P'){ paused=!paused; e.preventDefault(); return; } keys[e.key]=true; }
  function keyup(e){ keys[e.key]=false; }
  function init(c){
    container=c; best=Store.get('dodger_high',0);
    container.innerHTML = `
      <canvas id="dodger-canvas" width="${W}" height="${H}"></canvas>
      <div class="controls-hint">Arrow keys / WASD to dodge falling meteors &bull; dodging builds a combo streak (every 5 dodges = +20% score, up to x3)<br>
        Powerups: <span style="color:#ffd700;">S shield</span> &bull; <span style="color:#50ffea;">SL slow-mo</span> &bull;
        <span style="color:#50ff50;">+1 life</span> &bull; <span style="color:#c060ff;">SH shrink</span> &bull;
        <span style="color:#ff9f50;">x2 score</span> &bull; watch for elite meteors every 500 points
      </div>
      <button class="btn" id="dodger-pause">Pause</button>
      <button class="btn" id="dodger-restart">Restart</button>
    `;
    canvas=document.getElementById('dodger-canvas'); ctx=canvas.getContext('2d');
    document.getElementById('dodger-restart').addEventListener('click', initState);
    document.getElementById('dodger-pause').addEventListener('click', ()=>{ paused=!paused; document.getElementById('dodger-pause').textContent=paused?'Resume':'Pause'; });
    document.addEventListener('keydown', keydown);
    document.addEventListener('keyup', keyup);
    initState();
    animId = requestAnimationFrame(loop);
    if(window.TouchControls){
      TouchControls.dpad(container, {up:'ArrowUp', down:'ArrowDown', left:'ArrowLeft', right:'ArrowRight'});
    }
  }
  function destroy(){
    cancelAnimationFrame(animId);
    document.removeEventListener('keydown', keydown);
    document.removeEventListener('keyup', keyup);
  }
  registerGame('dodger','Meteor Dodger','☄️', true, {init, destroy}, ()=>`Best: ${Store.get('dodger_high',0)}`);
})();
