/* SNAKE */
(function(){
  let canvas, ctx, container;
  let cell=20, cols=22, rows=20;
  let snake, dir, nextDir, food, score, alive, animId, lastTs, moveTimer, moveInterval;
  let powerup, powerupTimer, powerupLifeLeft;
  let portals, portalSpawnTimer, portalLifeLeft, portalCooldown;
  let paused=false;
  let slowTimer, ghostTimer, magnetTimer;
  let foodStreak=0, combo=1, comboFlash=0;

  const START_INTERVAL = 140, MIN_INTERVAL = 60, SPEEDUP_PER_FOOD = 3;
  const POWERUP_SPAWN_RANGE = [6000, 12000], POWERUP_LIFESPAN = 7000;
  const BONUS_SCORE = 5, SLOW_DURATION = 5000, SLOW_FACTOR = 1.6;
  const SHRINK_AMOUNT = 2, MIN_SNAKE_LENGTH = 3;
  const GHOST_DURATION = 6000, MAGNET_DURATION = 8000, MAGNET_RADIUS = 4;
  const PORTAL_SPAWN_RANGE = [10000, 18000], PORTAL_LIFESPAN = 12000, PORTAL_COOLDOWN = 300;
  const POWERUP_INFO = {
    bonus:  {color:'#ffd700', label:'+', desc:`+${BONUS_SCORE} bonus points`},
    slow:   {color:'#50ffea', label:'S', desc:'Slows you down'},
    shrink: {color:'#c060ff', label:'<', desc:'Shrinks your tail'},
    ghost:  {color:'#ffffff', label:'G', desc:'Wall wrap!'},
    magnet: {color:'#ff50c8', label:'M', desc:'Food spawns nearby!'},
  };
  const KINDS = Object.keys(POWERUP_INFO);
  function rand(a,b){ return a + Math.random()*(b-a); }

  function occupiedCells(){
    const occ = new Set(snake.map(s=>s.x+','+s.y));
    if(portals){ occ.add(portals.a.x+','+portals.a.y); occ.add(portals.b.x+','+portals.b.y); }
    if(food) occ.add(food.x+','+food.y);
    if(powerup) occ.add(powerup.x+','+powerup.y);
    return occ;
  }
  function randomFreeCell(near){
    const occ = occupiedCells();
    let tries=0;
    while(tries++<300){
      let x,y;
      if(near){
        x = Math.max(0,Math.min(cols-1, near.x + Math.floor(rand(-MAGNET_RADIUS,MAGNET_RADIUS+1))));
        y = Math.max(0,Math.min(rows-1, near.y + Math.floor(rand(-MAGNET_RADIUS,MAGNET_RADIUS+1))));
      } else {
        x = Math.floor(Math.random()*cols); y = Math.floor(Math.random()*rows);
      }
      if(!occ.has(x+','+y)) return {x,y};
    }
    return {x:0,y:0};
  }
  function spawnFood(){
    food = randomFreeCell(magnetTimer>0 ? snake[0] : null);
  }
  function spawnPowerup(){
    const kind = KINDS[Math.floor(Math.random()*KINDS.length)];
    const pos = randomFreeCell(null);
    powerup = {...pos, kind};
    powerupLifeLeft = POWERUP_LIFESPAN;
  }
  function spawnPortals(){
    const a = randomFreeCell(null);
    const b = randomFreeCell(null);
    portals = {a, b};
    portalLifeLeft = PORTAL_LIFESPAN;
  }
  function applyPowerup(kind){
    if(kind==='bonus'){ score += BONUS_SCORE; }
    else if(kind==='slow'){ slowTimer = SLOW_DURATION; }
    else if(kind==='shrink'){
      for(let i=0;i<SHRINK_AMOUNT;i++) if(snake.length>MIN_SNAKE_LENGTH) snake.pop();
    }
    else if(kind==='ghost'){ ghostTimer = GHOST_DURATION; }
    else if(kind==='magnet'){ magnetTimer = MAGNET_DURATION; spawnFood(); }
  }

  function resetState(){
    const cx=Math.floor(cols/2), cy=Math.floor(rows/2);
    snake = [{x:cx,y:cy},{x:cx-1,y:cy},{x:cx-2,y:cy}];
    dir = {x:1,y:0}; nextDir = {x:1,y:0};
    score = 0; alive = true; paused=false; moveInterval = START_INTERVAL; moveTimer = 0; foodStreak=0; combo=1; comboFlash=0;
    powerup=null; powerupTimer = rand(...POWERUP_SPAWN_RANGE);
    portals=null; portalSpawnTimer = rand(...PORTAL_SPAWN_RANGE); portalCooldown=0;
    slowTimer=0; ghostTimer=0; magnetTimer=0;
    spawnFood();
  }
  function roundRect(ctx,x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  }
  function draw(){
    // subtle checkerboard turf
    for(let gy=0; gy<rows; gy++) for(let gx=0; gx<cols; gx++){
      ctx.fillStyle = (gx+gy)%2===0 ? '#0e2410' : '#0a1e0a';
      ctx.fillRect(gx*cell, gy*cell, cell, cell);
    }
    if(comboFlash>0){ ctx.fillStyle='#ffd700'; ctx.font='bold 14px sans-serif'; ctx.textAlign='center'; ctx.fillText(`FOOD COMBO x${combo}`, cols*cell/2, 16); }
    // portals
    if(portals){
      const fading = portalLifeLeft < 2500 && Math.floor(portalLifeLeft/166)%2===0;
      if(!fading){
        [portals.a, portals.b].forEach((p,i)=>{
          const cx=p.x*cell+cell/2, cy=p.y*cell+cell/2;
          const glow = ctx.createRadialGradient(cx,cy,1,cx,cy,cell/2);
          const color = i===0 ? '80,200,255' : '255,80,200';
          glow.addColorStop(0, `rgba(${color},0.35)`); glow.addColorStop(1, `rgba(${color},0)`);
          ctx.fillStyle=glow; ctx.beginPath(); ctx.arc(cx,cy,cell/2,0,Math.PI*2); ctx.fill();
          ctx.strokeStyle = i===0 ? '#50c8ff' : '#ff50c8';
          ctx.lineWidth=3;
          ctx.beginPath(); ctx.arc(cx,cy,cell/2-2,0,Math.PI*2); ctx.stroke();
        });
      }
    }
    // food (apple with a little leaf)
    const fx=food.x*cell+cell/2, fy=food.y*cell+cell/2;
    ctx.beginPath(); ctx.arc(fx,fy,cell/2-3,0,Math.PI*2); ctx.fillStyle='#ff5050'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(fx+2,fy-2,3,2,-1,0,0,Math.PI*2); ctx.fillStyle='rgba(255,255,255,0.5)'; ctx.fill();
    ctx.fillStyle='#3fa63f'; ctx.beginPath(); ctx.ellipse(fx+3,fy-cell/2+5,4,2.5,0.7,0,Math.PI*2); ctx.fill();
    // powerup
    if(powerup){
      const info = POWERUP_INFO[powerup.kind];
      const fading = powerupLifeLeft < 2000 && Math.floor(powerupLifeLeft/150)%2===0;
      if(!fading){
        const cx=powerup.x*cell+cell/2, cy=powerup.y*cell+cell/2;
        ctx.beginPath(); ctx.arc(cx,cy,cell/2-2,0,Math.PI*2); ctx.fillStyle = info.color; ctx.fill();
        ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.lineWidth=1.5; ctx.stroke();
        ctx.fillStyle = '#111'; ctx.font='bold 12px sans-serif'; ctx.textAlign='center';
        ctx.fillText(info.label, cx, cy+4);
      }
    }
    // snake: rounded segments with a gradient body and a head that has eyes
    snake.forEach((s,i)=>{
      const x=s.x*cell+1, y=s.y*cell+1, w=cell-2, h=cell-2;
      if(i===0){
        ctx.fillStyle = ghostTimer>0 ? '#c8ffea' : '#50ff50';
      } else {
        const t = i/snake.length;
        ctx.fillStyle = `rgb(${Math.round(47-10*t)},${Math.round(166-40*t)},${Math.round(47-10*t)})`;
      }
      ctx.globalAlpha = ghostTimer>0 ? 0.75 : 1;
      roundRect(ctx, x, y, w, h, 6); ctx.fill();
      ctx.globalAlpha = 1;
    });
    if(snake.length){
      const head = snake[0];
      const hx=head.x*cell+cell/2, hy=head.y*cell+cell/2;
      const ex = dir.x*3, ey = dir.y*3;
      ctx.fillStyle='#fff';
      ctx.beginPath(); ctx.arc(hx+ex-dir.y*4, hy+ey+dir.x*4, 2.4, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(hx+ex+dir.y*4, hy+ey-dir.x*4, 2.4, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle='#111';
      ctx.beginPath(); ctx.arc(hx+ex-dir.y*4, hy+ey+dir.x*4, 1.2, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(hx+ex+dir.y*4, hy+ey-dir.x*4, 1.2, 0, Math.PI*2); ctx.fill();
    }
    if(paused && alive){
      ctx.fillStyle='rgba(0,0,0,0.62)'; ctx.fillRect(0,0,cols*cell,rows*cell);
      ctx.fillStyle='#50c8ff'; ctx.font='bold 22px sans-serif'; ctx.textAlign='center';
      ctx.fillText('Paused', cols*cell/2, rows*cell/2-6);
      ctx.font='14px sans-serif'; ctx.fillText('Press P or tap Pause to resume', cols*cell/2, rows*cell/2+18);
    }
    if(!alive){
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0,0,cols*cell,rows*cell);
      ctx.fillStyle = '#ffff50';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Game Over', cols*cell/2, rows*cell/2 - 6);
      ctx.font = '14px sans-serif';
      ctx.fillText('Press R or click Restart', cols*cell/2, rows*cell/2 + 18);
    }
  }
  function moveSnake(){
    dir = nextDir;
    let head = {x: snake[0].x+dir.x, y: snake[0].y+dir.y};
    if(ghostTimer>0){
      head.x = (head.x+cols)%cols; head.y = (head.y+rows)%rows;
    }
    // The tail hasn't been popped for this move yet, so it's still sitting
    // in `snake` — but if this move doesn't eat food, that tail cell is
    // about to be vacated in this same step (see snake.pop() below), so
    // moving into it is the ordinary "follow your own tail" maneuver, not
    // a collision. Only count it as occupied when the move eats food,
    // since growing means the tail stays put this frame.
    const willEat = head.x===food.x && head.y===food.y;
    const body = willEat ? snake : snake.slice(0,-1);
    const dead = head.x<0||head.x>=cols||head.y<0||head.y>=rows||body.some(s=>s.x===head.x&&s.y===head.y);
    if(dead){
      alive=false; comboFlash=0;
      const best = Store.get('snake_high', 0);
      if(score>best) Store.set('snake_high', score);
      return;
    }
    if(portals && portalCooldown<=0){
      if(head.x===portals.a.x && head.y===portals.a.y){ head={...portals.b}; portalCooldown=PORTAL_COOLDOWN; }
      else if(head.x===portals.b.x && head.y===portals.b.y){ head={...portals.a}; portalCooldown=PORTAL_COOLDOWN; }
    }
    snake.unshift(head);
    let grew=false;
    if(head.x===food.x && head.y===food.y){
      score++;
      moveInterval = Math.max(MIN_INTERVAL, moveInterval-SPEEDUP_PER_FOOD);
      spawnFood();
      grew=true;
    }
    if(powerup && head.x===powerup.x && head.y===powerup.y){
      applyPowerup(powerup.kind);
      powerup=null;
      powerupTimer = rand(...POWERUP_SPAWN_RANGE);
    }
    if(!grew) snake.pop();
  }
  function loop(ts){
    if(!lastTs) lastTs=ts;
    const dt = ts-lastTs; lastTs=ts;
    if(alive && !paused){
      if(slowTimer>0) slowTimer=Math.max(0,slowTimer-dt);
      if(ghostTimer>0) ghostTimer=Math.max(0,ghostTimer-dt);
      if(magnetTimer>0) magnetTimer=Math.max(0,magnetTimer-dt);
      if(portalCooldown>0) portalCooldown=Math.max(0,portalCooldown-dt);

      if(portals===null){
        portalSpawnTimer -= dt;
        if(portalSpawnTimer<=0) spawnPortals();
      } else {
        portalLifeLeft -= dt;
        if(portalLifeLeft<=0){ portals=null; portalSpawnTimer = rand(...PORTAL_SPAWN_RANGE); }
      }
      if(powerup===null){
        powerupTimer -= dt;
        if(powerupTimer<=0) spawnPowerup();
      } else {
        powerupLifeLeft -= dt;
        if(powerupLifeLeft<=0){ powerup=null; powerupTimer = rand(...POWERUP_SPAWN_RANGE); }
      }

      const effectiveInterval = moveInterval * (slowTimer>0 ? SLOW_FACTOR : 1);
      moveTimer += dt;
      if(moveTimer >= effectiveInterval){
        moveTimer = 0;
        moveSnake();
      }
    }
    draw();
    updateHud();
    animId = requestAnimationFrame(loop);
  }
  function updateHud(){
    const el = document.getElementById('snake-score');
    if(el) el.innerHTML = `Score: <b>${score}</b>`;
    const best = Store.get('snake_high', 0);
    const bel = document.getElementById('snake-best');
    if(bel) bel.innerHTML = `Best: <b>${best}</b>`;
    const eff = document.getElementById('snake-effects');
    if(eff){
      const parts = [];
      if(slowTimer>0) parts.push(`<span style="color:#50ffea;">Slowed ${(slowTimer/1000).toFixed(1)}s</span>`);
      if(ghostTimer>0) parts.push(`<span style="color:#fff;">Wall Wrap ${(ghostTimer/1000).toFixed(1)}s</span>`);
      if(magnetTimer>0) parts.push(`<span style="color:#ff50c8;">Magnet ${(magnetTimer/1000).toFixed(1)}s</span>`);
      eff.innerHTML = parts.join(' &bull; ');
    }
  }
  function keyHandler(e){
    if(e.key==='p' || e.key==='P'){ paused=!paused; e.preventDefault(); return; }
    if(!alive && (e.key==='Enter' || e.key==='r' || e.key==='R')){ resetState(); e.preventDefault(); return; }
    const map = {ArrowUp:{x:0,y:-1},ArrowDown:{x:0,y:1},ArrowLeft:{x:-1,y:0},ArrowRight:{x:1,y:0},
                 w:{x:0,y:-1},s:{x:0,y:1},a:{x:-1,y:0},d:{x:1,y:0}};
    if(map[e.key]){
      const m = map[e.key];
      if(!(m.x===-dir.x && m.y===-dir.y)) nextDir = m;
      e.preventDefault();
    } else if(e.key==='r' || e.key==='R'){
      resetState();
    }
  }
  function init(c){
    container = c;
    container.innerHTML = `
      <div class="hud"><div id="snake-score">Score: <b>0</b></div><div id="snake-best">Best: <b>0</b></div></div>
      <div id="snake-effects" style="min-height:1.4em;font-size:0.85rem;margin-bottom:6px;"></div>
      <canvas id="snake-canvas" width="${cols*cell}" height="${rows*cell}"></canvas>
      <div class="controls-hint">Arrow keys / WASD to move &bull; R to restart<br>
        Powerups: <span style="color:#ffd700;">+ bonus</span> &bull; <span style="color:#50ffea;">S slow</span> &bull;
        <span style="color:#c060ff;">&lt; shrink</span> &bull; <span style="color:#fff;">G wall-wrap</span> &bull;
        <span style="color:#ff50c8;">M magnet</span> &bull; rings are teleport portals
      </div>
      <button class="btn" id="snake-pause" type="button">Pause</button>
      <button class="btn" id="snake-restart">Restart</button>
    `;
    canvas = document.getElementById('snake-canvas');
    ctx = canvas.getContext('2d');
    document.getElementById('snake-restart').addEventListener('click', resetState);
    document.getElementById('snake-pause').addEventListener('click', ()=>{ if(alive){ paused=!paused; document.getElementById('snake-pause').textContent=paused?'Resume':'Pause'; } });
    document.addEventListener('keydown', keyHandler);
    lastTs=null;
    resetState();
    animId = requestAnimationFrame(loop);
    if(window.TouchControls){
      TouchControls.swipe(canvas, dir2=>{
        const map={up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight'};
        TouchControls.fireKey('keydown', map[dir2]);
      }, {preventScroll:true});
      TouchControls.dpad(container, {up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight'});
    }
  }
  function destroy(){
    cancelAnimationFrame(animId);
    document.removeEventListener('keydown', keyHandler);
  }
  registerGame('snake','Snake','🐍', true, {init, destroy}, ()=>`Best: ${Store.get('snake_high',0)}`);
})();
