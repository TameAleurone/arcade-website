/* MARIO (3 levels ported from the python version, simplified) */
(function(){
  let canvas, ctx, container, animId, keys={};
  const VIEW_W=800, VIEW_H=500, GROUND_Y=400, GRAVITY=1500, JUMP_FORCE=-620, MOVE_SPEED=220, RUN_SPEED=330, TERMINAL_V=1200;
  const PW=22, PH=32, ENEMY_SIZE=24, COIN_R=11, STAR_R=14, STOMP_BOUNCE=0.6, STAR_DURATION=8, HIT_INVULN=1.5;
  const FLYER_AMPLITUDE=30, FLYER_PERIOD=2.2, HOPPER_INTERVAL=1.4, HOPPER_JUMP=-380;
  // y-scale from the original 700-tall canvas (ground at 560) down to our 500-tall view (ground at 400)
  const ORIGINAL_GROUND=560;
  const YS = GROUND_Y/ORIGINAL_GROUND;

  function walker(x,min,max,vx,y){ return {type:'walker', x, min, max, vx, y:y-ENEMY_SIZE, alive:true}; }
  function groundEnemy(x,min,max,vx){ return walker(x,min,max,vx, ORIGINAL_GROUND); }
  function platformEnemy(x,min,max,vx,platformY){ return walker(x,min,max,vx, platformY); }
  function flyingEnemy(x,min,max,vx,baseY){ return {type:'flyer', x, min, max, vx, baseY:baseY-ENEMY_SIZE, y:baseY-ENEMY_SIZE, t:0, alive:true}; }
  function hopperEnemy(x,min,max,vx,surfaceY){ return {type:'hopper', x, min, max, vx, surfaceY:surfaceY-ENEMY_SIZE, y:surfaceY-ENEMY_SIZE, vy:0, hopTimer:HOPPER_INTERVAL, onGround:true, alive:true}; }

  function sy(y){ return y*YS; }

  const LEVELS = [
    { name:'Mushroom Meadow',
      ground:[[0,650],[800,1350],[1500,2150],[2300,4000]],
      platforms:[[280,500,100,20],[420,460,100,20],[560,420,100,20],
                 [950,440,140,20],[1150,350,120,20],
                 [1650,460,120,20],[1820,460,120,20],
                 [2450,440,150,20],[2650,340,120,20]],
      coins:[[300,460],[440,420],[580,380],[620,560],
             [990,400],[1020,400],[1050,400],[1180,310],[1210,310],
             [1700,420],[1730,420],[1860,420],[1890,420],
             [2000,560],[2040,560],[2080,560],[2500,400],[2530,400],
             [2690,300],[2720,300],[2900,560],[2940,560],[2980,560]],
      enemyFactories:[
        ()=>groundEnemy(400,350,600,60),
        ()=>platformEnemy(1000,950,1085,50,440),
        ()=>flyingEnemy(1700,1650,1940,40,380),
        ()=>groundEnemy(1700,1550,2100,70),
        ()=>groundEnemy(2000,1950,2100,55),
        ()=>groundEnemy(2500,2350,2750,65),
      ],
      star:[2500,370],
    },
    { name:'Broken Bridge',
      ground:[[0,340],[400,900],[1050,1500],[1600,2150],[2300,4000]],
      platforms:[[120,480,80,20],[230,440,80,20],[340,400,80,20],
                 [930,470,60,20],[1000,430,60,20],
                 [1300,380,120,20],
                 [1530,450,60,20],
                 [1650,440,150,20],[1930,340,120,20],
                 [2180,460,60,20],[2250,410,60,20]],
      coins:[[150,440],[260,400],[370,360],[500,560],
             [955,430],[1025,390],[1330,340],[1360,340],
             [1555,410],[1690,400],[1720,400],[1750,560],
             [1970,300],[2000,300],[2205,420],[2275,370],[2400,560]],
      enemyFactories:[
        ()=>groundEnemy(400,400,600,60),
        ()=>platformEnemy(1340,1300,1400,50,380),
        ()=>hopperEnemy(1700,1650,1790,40,440),
        ()=>groundEnemy(1700,1650,2100,70),
        ()=>groundEnemy(2000,1950,2100,55),
        ()=>groundEnemy(2500,2350,2750,65),
      ],
      star:[1970,260],
    },
    { name:'Sky Steps',
      ground:[[0,500],[650,1050],[1200,1650],[1800,2250],[2400,2850],[3000,4000]],
      platforms:[[180,470,120,20],
                 [650,440,90,20],[760,380,90,20],[870,320,90,20],[980,260,90,20],
                 [1260,450,140,20],[1480,350,130,20],
                 [1850,430,90,20],[1960,370,90,20],[2070,310,90,20],
                 [2350,450,140,20],
                 [2650,400,90,20],[2760,340,90,20],[2870,280,90,20],
                 [2980,340,90,20],[3090,400,90,20],
                 [3300,420,140,20],[3550,320,130,20]],
      coins:[[300,430],[690,400],[800,340],[910,280],[1020,220],
             [1300,410],[1330,410],[1520,310],[1550,310],
             [1890,390],[2000,330],[2110,270],[2390,410],[2420,410],
             [2690,360],[2800,300],[2910,240],[3020,300],[3130,360],
             [3340,380],[3370,380],[3590,280],[3620,280],
             [1650,560],[3700,560]],
      enemyFactories:[
        ()=>groundEnemy(280,180,440,65),
        ()=>platformEnemy(800,760,850,55,380),
        ()=>groundEnemy(1320,1200,1600,75),
        ()=>hopperEnemy(1300,1260,1400,40,450),
        ()=>platformEnemy(2400,2350,2470,60,450),
        ()=>groundEnemy(2550,2400,2800,80),
        ()=>flyingEnemy(2870,2650,3180,45,220),
        ()=>groundEnemy(3250,3050,3700,75),
      ],
      star:[2870,220],
    },
  ];

  let levelIdx, level, camera, coins, enemies, platforms, gaps, star, starCollected;
  let player, score, best, lives, state, starTimer, hitInvuln, levelWidth, flag, lastTs, flashText, flashTimer;

  function loadLevel(idx){
    levelIdx = idx;
    level = LEVELS[idx];
    const groundSegs = level.ground.map(([a,b])=>[a,b]);
    levelWidth = groundSegs[groundSegs.length-1][1];
    gaps = [];
    for(let i=0;i<groundSegs.length-1;i++) gaps.push({x:groundSegs[i][1], w:groundSegs[i+1][0]-groundSegs[i][1]});
    platforms = level.platforms.map(([x,y,w,h])=>({x, y:sy(y), w, h}));
    coins = level.coins.map(([x,y])=>({x, y:sy(y), r:COIN_R, got:false}));
    enemies = level.enemyFactories.map(f=>{
      const e = f();
      e.y = sy(e.y + ENEMY_SIZE) - ENEMY_SIZE; // re-scale the y baked into the factory helpers
      if(e.baseY!==undefined) e.baseY = sy(e.baseY + ENEMY_SIZE) - ENEMY_SIZE;
      if(e.surfaceY!==undefined) e.surfaceY = sy(e.surfaceY);
      return e;
    });
    star = level.star ? {x:level.star[0], y:sy(level.star[1]), r:STAR_R} : null;
    starCollected = false;
    flag = levelWidth - 100;
    camera = 0;
    resetPlayer();
  }
  function onGroundAt(x){ return !gaps.some(g => x > g.x-10 && x < g.x+g.w+10); }
  function resetPlayer(){
    player = {x:60, y:GROUND_Y-PH, vx:0, vy:0, onGround:true, facing:1};
    hitInvuln = 0.4;
  }
  function newRun(){
    score=0; lives=3; state='play'; starTimer=0; flashText=''; flashTimer=0;
    loadLevel(0);
  }
  function loseLife(){
    lives--;
    if(lives<=0){
      state='dead';
      if(score>best){ best=score; Store.set('mario_high', best); }
    } else {
      resetPlayer();
      camera = Math.max(0, player.x-100);
    }
  }
  function showFlash(text){ flashText=text; flashTimer=1.0; }
  function update(dt){
    if(state!=='play') return;
    if(starTimer>0) starTimer=Math.max(0,starTimer-dt);
    if(hitInvuln>0) hitInvuln=Math.max(0,hitInvuln-dt);
    if(flashTimer>0) flashTimer=Math.max(0,flashTimer-dt);

    const running = keys['Shift'];
    const speed = running ? RUN_SPEED : MOVE_SPEED;
    if(keys['ArrowLeft']||keys['a']){ player.vx=-speed; player.facing=-1; }
    else if(keys['ArrowRight']||keys['d']){ player.vx=speed; player.facing=1; }
    else player.vx=0;
    if((keys[' ']||keys['ArrowUp']||keys['w']) && player.onGround){ player.vy=JUMP_FORCE; player.onGround=false; }

    player.vy = Math.min(TERMINAL_V, player.vy+GRAVITY*dt);
    player.x += player.vx*dt;
    player.x = Math.max(0, Math.min(levelWidth-PW, player.x));
    player.y += player.vy*dt;

    player.onGround=false;
    const feetY = player.y+PH;
    if(player.vy>=0){
      if(feetY>=GROUND_Y && onGroundAt(player.x+PW/2)){
        player.y = GROUND_Y-PH; player.vy=0; player.onGround=true;
      }
      platforms.forEach(p=>{
        if(player.x+PW>p.x && player.x<p.x+p.w && feetY>=p.y && feetY<=p.y+14 && player.y+PH-player.vy*dt<=p.y+2){
          player.y = p.y-PH; player.vy=0; player.onGround=true;
        }
      });
    }
    if(player.y+PH>VIEW_H+100){ loseLife(); return; }

    enemies.forEach(e=>{
      if(!e.alive) return;
      if(e.type==='walker'){
        e.x += e.vx*dt;
        if(e.x<e.min||e.x>e.max) e.vx*=-1;
      } else if(e.type==='flyer'){
        e.x += e.vx*dt;
        if(e.x<e.min||e.x>e.max) e.vx*=-1;
        e.t += dt;
        e.y = e.baseY + Math.sin(e.t*(2*Math.PI/FLYER_PERIOD))*FLYER_AMPLITUDE*YS;
      } else if(e.type==='hopper'){
        e.x += e.vx*dt;
        if(e.x<e.min||e.x>e.max) e.vx*=-1;
        e.hopTimer -= dt;
        if(e.onGround && e.hopTimer<=0){ e.vy=HOPPER_JUMP; e.onGround=false; e.hopTimer=HOPPER_INTERVAL; }
        if(!e.onGround){
          e.vy += GRAVITY*dt; e.y += e.vy*dt;
          if(e.y>=e.surfaceY){ e.y=e.surfaceY; e.vy=0; e.onGround=true; }
        }
      }
      const ex=e.x, ey=e.y, ew=ENEMY_SIZE, eh=ENEMY_SIZE;
      if(player.x<ex+ew && player.x+PW>ex && player.y<ey+eh && player.y+PH>ey){
        if(starTimer>0){ e.alive=false; score+=50; showFlash('+50'); }
        else if(player.vy>0 && player.y+PH-ey < 16){
          e.alive=false; player.vy=JUMP_FORCE*STOMP_BOUNCE; score+=50; showFlash('+50');
        } else if(hitInvuln<=0){
          loseLife();
        }
      }
    });

    coins.forEach(c=>{
      if(c.got) return;
      const dx=(player.x+PW/2)-c.x, dy=(player.y+PH/2)-c.y;
      if(Math.sqrt(dx*dx+dy*dy) < c.r+16){ c.got=true; score+=10; }
    });
    if(star && !starCollected){
      const dx=(player.x+PW/2)-star.x, dy=(player.y+PH/2)-star.y;
      if(Math.sqrt(dx*dx+dy*dy) < star.r+16){ starCollected=true; starTimer=STAR_DURATION; score+=100; showFlash('Star Power!'); }
    }

    if(player.x+PW>=flag){
      if(levelIdx+1<LEVELS.length){
        score += 200;
        loadLevel(levelIdx+1);
      } else {
        state='win';
        if(score>best){ best=score; Store.set('mario_high', best); }
      }
    }
    camera = Math.max(0, Math.min(levelWidth-VIEW_W, player.x-VIEW_W/2));
  }
  function draw(){
    ctx.fillStyle='#5c94fc'; ctx.fillRect(0,0,VIEW_W,VIEW_H);
    ctx.fillStyle='rgba(255,255,255,0.8)';
    for(let i=0;i<8;i++){ const cx=(i*420 - camera*0.3)%(VIEW_W+300)-100; ctx.beginPath(); ctx.arc(cx,60+((i%3)*20),22,0,Math.PI*2); ctx.arc(cx+24,60+((i%3)*20),16,0,Math.PI*2); ctx.fill(); }

    ctx.save(); ctx.translate(-camera,0);
    ctx.fillStyle='#8b5a2b';
    let segStart=0;
    const sortedGaps = [...gaps].sort((a,b)=>a.x-b.x);
    sortedGaps.forEach(g=>{ ctx.fillRect(segStart, GROUND_Y, g.x-segStart, VIEW_H-GROUND_Y+40); segStart=g.x+g.w; });
    ctx.fillRect(segStart, GROUND_Y, levelWidth-segStart, VIEW_H-GROUND_Y+40);
    ctx.fillStyle='#3fa63f';
    segStart=0;
    sortedGaps.forEach(g=>{ ctx.fillRect(segStart, GROUND_Y, g.x-segStart, 8); segStart=g.x+g.w; });
    ctx.fillRect(segStart, GROUND_Y, levelWidth-segStart, 8);

    ctx.fillStyle='#c98a3f';
    platforms.forEach(p=> ctx.fillRect(p.x,p.y,p.w,p.h));

    coins.forEach(c=>{
      if(c.got) return;
      ctx.beginPath(); ctx.arc(c.x,c.y,c.r,0,Math.PI*2); ctx.fillStyle='#ffd700'; ctx.fill();
      ctx.strokeStyle='#a67c00'; ctx.stroke();
    });
    if(star && !starCollected){
      ctx.save(); ctx.translate(star.x,star.y);
      ctx.fillStyle='#ffd700';
      ctx.beginPath();
      for(let i=0;i<10;i++){ const r=i%2===0?star.r:star.r*0.5; const ang=Math.PI/5*i-Math.PI/2; const px=Math.cos(ang)*r, py=Math.sin(ang)*r; i===0?ctx.moveTo(px,py):ctx.lineTo(px,py); }
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    enemies.forEach(e=>{
      if(!e.alive) return;
      ctx.fillStyle = e.type==='flyer' ? '#c85a8b' : (e.type==='hopper' ? '#5a9bc8' : '#8b4513');
      ctx.fillRect(e.x,e.y,ENEMY_SIZE,ENEMY_SIZE);
      ctx.fillStyle='#000'; ctx.fillRect(e.x+5,e.y+7,3,3); ctx.fillRect(e.x+16,e.y+7,3,3);
    });

    ctx.fillStyle='#ccc'; ctx.fillRect(flag+10,GROUND_Y-160,4,160);
    ctx.fillStyle='#ff5050'; ctx.beginPath(); ctx.moveTo(flag+14,GROUND_Y-160); ctx.lineTo(flag+50,GROUND_Y-145); ctx.lineTo(flag+14,GROUND_Y-130); ctx.fill();

    const flashing = starTimer>0 && Math.floor(starTimer*10)%2===0;
    const hitFlash = hitInvuln>0 && Math.floor(hitInvuln*12)%2===0;
    ctx.globalAlpha = hitFlash ? 0.4 : 1;
    ctx.fillStyle = starTimer>0 ? (flashing?'#ffd700':'#fff59d') : '#e63946';
    ctx.fillRect(player.x,player.y,PW,PH);
    ctx.globalAlpha=1;
    ctx.fillStyle='#ffe0b2';
    ctx.fillRect(player.x+ (player.facing>0?PW-8:0), player.y+6, 8, 8);
    ctx.restore();

    ctx.fillStyle='#fff'; ctx.font='bold 16px sans-serif'; ctx.textAlign='left';
    ctx.fillText('Score: '+score, 10, 24);
    ctx.font='12px sans-serif';
    ctx.fillText('Best: '+best+'   '+level.name+' ('+(levelIdx+1)+'/'+LEVELS.length+')', 10, 42);
    ctx.font='bold 16px sans-serif';
    ctx.fillText('Lives: '+lives, VIEW_W-100, 24);
    if(starTimer>0){ ctx.fillStyle='#ffd700'; ctx.font='12px sans-serif'; ctx.fillText('Star '+starTimer.toFixed(1)+'s', VIEW_W-100, 42); }
    if(flashTimer>0){
      ctx.globalAlpha = Math.min(1,flashTimer);
      ctx.fillStyle='#ffd700'; ctx.font='bold 18px sans-serif'; ctx.textAlign='center';
      ctx.fillText(flashText, VIEW_W/2, 60);
      ctx.globalAlpha=1;
    }

    if(state==='dead'){
      ctx.fillStyle='rgba(0,0,0,0.65)'; ctx.fillRect(0,0,VIEW_W,VIEW_H);
      ctx.fillStyle='#ffff50'; ctx.font='bold 22px sans-serif'; ctx.textAlign='center';
      ctx.fillText('Game Over', VIEW_W/2, VIEW_H/2);
      ctx.font='14px sans-serif';
      ctx.fillText('Click Restart to try again', VIEW_W/2, VIEW_H/2+24);
    } else if(state==='win'){
      ctx.fillStyle='rgba(0,0,0,0.65)'; ctx.fillRect(0,0,VIEW_W,VIEW_H);
      ctx.fillStyle='#ffff50'; ctx.font='bold 22px sans-serif'; ctx.textAlign='center';
      ctx.fillText('You beat all 3 levels!', VIEW_W/2, VIEW_H/2);
      ctx.font='14px sans-serif';
      ctx.fillText('Score: '+score, VIEW_W/2, VIEW_H/2+24);
    }
  }
  function loop(ts){
    const dt = lastTs!=null ? Math.min(0.033,(ts-lastTs)/1000) : 0;
    lastTs = ts;
    update(dt);
    draw();
    animId = requestAnimationFrame(loop);
  }
  function keydown(e){
    keys[e.key]=true;
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
  }
  function keyup(e){ keys[e.key]=false; }
  function init(c){
    container=c; best = Store.get('mario_high',0); lastTs=null;
    container.innerHTML = `
      <canvas id="mario-canvas" width="${VIEW_W}" height="${VIEW_H}"></canvas>
      <div class="controls-hint">Arrow keys / WASD to move &bull; Space/Up to jump &bull; Shift to run &bull; stomp or star-touch enemies, collect coins, reach the flag &mdash; 3 levels</div>
      <button class="btn" id="mario-restart">Restart</button>
    `;
    canvas=document.getElementById('mario-canvas'); ctx=canvas.getContext('2d');
    document.getElementById('mario-restart').addEventListener('click', newRun);
    document.addEventListener('keydown', keydown);
    document.addEventListener('keyup', keyup);
    newRun();
    animId = requestAnimationFrame(loop);
  }
  function destroy(){
    cancelAnimationFrame(animId);
    document.removeEventListener('keydown', keydown);
    document.removeEventListener('keyup', keyup);
  }
  registerGame('mario','Mario','🍄', true, {init, destroy}, ()=>`Best: ${Store.get('mario_high',0)}`);
})();
