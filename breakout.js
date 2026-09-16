/* BREAKOUT */
(function(){
  let canvas, ctx, container, W=520, H=560, animId, keys={};
  let paddleW, paddleX, lives, score, level, gameOver, balls, bricks, powerups, lasers;
  let widenT, slowT, fireT, laserT, laserCooldown, stickyT, scoreboostT, best;
  const PADDLE_H=14, PADDLE_Y_OFFSET=50, PADDLE_SPEED=480, BALL_R=7, BASE_BALL_SPEED=210;
  const MAX_BALLS=6, BALL_SPIN_FACTOR=0.65, MAX_LIVES_CAP=5;
  const ROW_COLORS=['#ff5050','#ff9f50','#ffff50','#50ff50','#50ffea'];
  const ROW_HP=[3,2,2,1,1], ROW_POINTS=[30,20,20,10,10];
  const POWERUP_DROP_CHANCE=0.15, POWERUP_FALL_SPEED=140;
  const WIDEN_AMOUNT=40, WIDEN_DURATION=10000, SLOWBALL_FACTOR=0.65, SLOWBALL_DURATION=8000;
  const FIREBALL_DURATION=6000, LASER_DURATION=8000, LASER_COOLDOWN=350, LASER_SPEED=480;
  const STICKY_DURATION=10000, SCOREBOOST_DURATION=8000, NUKE_RADIUS=90;
  const POWERUP_INFO = {
    widen:{color:'#50ff50',label:'W',desc:'Paddle widened!'},
    multiball:{color:'#ff9f50',label:'M',desc:'Multiball!'},
    slow:{color:'#50ffea',label:'S',desc:'Ball slowed!'},
    life:{color:'#ffd700',label:'+1',desc:'Extra life!'},
    fireball:{color:'#ff5050',label:'F',desc:'Fireball! Smash through bricks!'},
    laser:{color:'#ffffff',label:'L',desc:'Laser paddle! Space to fire'},
    sticky:{color:'#a050ff',label:'C',desc:'Catch! Ball sticks — Space to launch'},
    scoreboost:{color:'#ffd700',label:'2x',desc:'Score boost! Double points'},
    nuke:{color:'#c060ff',label:'B',desc:'Bomb! Clears nearby bricks'},
  };
  const KINDS = Object.keys(POWERUP_INFO);

  function buildLevel(){
    bricks=[];
    const rows=5, cols=8, gap=6, bw=Math.floor((W-2*20-(cols-1)*gap)/cols), bh=20, offX=20, offY=44;
    for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){
      bricks.push({x:offX+c*(bw+gap), y:offY+r*(bh+gap), w:bw, h:bh, hp:ROW_HP[r]+Math.floor((level-1)/2),
                   maxHp:ROW_HP[r]+Math.floor((level-1)/2), points:ROW_POINTS[r], color:ROW_COLORS[r], alive:true});
    }
  }
  function resetBallOnPaddle(){
    return {x:paddleX+paddleW/2, y:H-PADDLE_Y_OFFSET-BALL_R-2, vx:0, vy:0, stuck:true, fire:false};
  }
  function launchBall(ball, angleDeg){
    const rad = angleDeg*Math.PI/180;
    const speed = BASE_BALL_SPEED*(slowT>0?SLOWBALL_FACTOR:1);
    ball.vx = Math.sin(rad)*speed; ball.vy = -Math.cos(rad)*speed;
    ball.stuck=false;
  }
  function initState(){
    paddleW=100; paddleX=W/2-paddleW/2; lives=3; score=0; level=1; gameOver=false;
    widenT=0; slowT=0; fireT=0; laserT=0; laserCooldown=0; stickyT=0; scoreboostT=0;
    powerups=[]; lasers=[];
    buildLevel();
    balls=[resetBallOnPaddle()];
  }
  function nextLevel(){
    level++;
    buildLevel();
    balls=[resetBallOnPaddle()];
    powerups=[]; lasers=[];
  }
  function spawnPowerup(x,y){
    if(Math.random()>POWERUP_DROP_CHANCE) return;
    const kind = KINDS[Math.floor(Math.random()*KINDS.length)];
    powerups.push({x,y,kind,vy:POWERUP_FALL_SPEED});
  }
  function applyPowerup(kind){
    if(kind==='widen'){ widenT=WIDEN_DURATION; }
    else if(kind==='slow'){ slowT=SLOWBALL_DURATION; }
    else if(kind==='life'){ lives=Math.min(MAX_LIVES_CAP, lives+1); }
    else if(kind==='fireball'){ fireT=FIREBALL_DURATION; }
    else if(kind==='laser'){ laserT=LASER_DURATION; }
    else if(kind==='sticky'){ stickyT=STICKY_DURATION; }
    else if(kind==='scoreboost'){ scoreboostT=SCOREBOOST_DURATION; }
    else if(kind==='multiball'){
      const existing = balls.slice();
      for(const b of existing){
        if(balls.length>=MAX_BALLS) break;
        if(b.stuck) continue;
        const speed = Math.hypot(b.vx,b.vy) || BASE_BALL_SPEED;
        const ang = Math.atan2(b.vx,-b.vy) + (Math.random()<0.5?1:-1)*(0.35+Math.random()*0.3);
        balls.push({x:b.x,y:b.y, vx:Math.sin(ang)*speed, vy:-Math.cos(ang)*speed, stuck:false, fire:b.fire});
      }
    }
    else if(kind==='nuke'){
      const cx = paddleX+paddleW/2, cy=H-PADDLE_Y_OFFSET-40;
      bricks.forEach(br=>{
        if(!br.alive) return;
        const bx=br.x+br.w/2, by=br.y+br.h/2;
        if(Math.hypot(bx-cx,by-cy)<NUKE_RADIUS){ br.alive=false; score += br.points; }
      });
    }
  }
  function hitBrick(br){
    br.hp--;
    if(br.hp<=0){
      br.alive=false;
      score += Math.round(br.points*(scoreboostT>0?2:1));
      spawnPowerup(br.x+br.w/2, br.y+br.h/2);
    }
  }
  function loop(){
    const dt=1/60;
    if(keys['ArrowLeft']||keys['a']) paddleX -= PADDLE_SPEED*dt;
    if(keys['ArrowRight']||keys['d']) paddleX += PADDLE_SPEED*dt;
    paddleX = Math.max(0, Math.min(W-paddleW, paddleX));

    if(!gameOver){
      if(widenT>0) widenT=Math.max(0,widenT-dt*1000);
      if(slowT>0) slowT=Math.max(0,slowT-dt*1000);
      if(fireT>0) fireT=Math.max(0,fireT-dt*1000);
      if(laserT>0) laserT=Math.max(0,laserT-dt*1000);
      if(stickyT>0) stickyT=Math.max(0,stickyT-dt*1000);
      if(scoreboostT>0) scoreboostT=Math.max(0,scoreboostT-dt*1000);
      if(laserCooldown>0) laserCooldown=Math.max(0,laserCooldown-dt*1000);
      paddleW = 100 + (widenT>0?WIDEN_AMOUNT:0);

      if(laserT>0 && (keys[' ']) && laserCooldown<=0){
        lasers.push({x:paddleX+8, y:H-PADDLE_Y_OFFSET-4});
        lasers.push({x:paddleX+paddleW-8, y:H-PADDLE_Y_OFFSET-4});
        laserCooldown=LASER_COOLDOWN;
      }
      lasers.forEach(l=> l.y -= LASER_SPEED*dt);
      lasers = lasers.filter(l=>{
        if(l.y<0) return false;
        for(const br of bricks){
          if(!br.alive) continue;
          if(l.x>br.x && l.x<br.x+br.w && l.y>br.y && l.y<br.y+br.h){ hitBrick(br); return false; }
        }
        return true;
      });

      balls.forEach(ball=>{
        if(ball.stuck){ ball.x = paddleX+paddleW/2; return; }
        ball.x += ball.vx*dt; ball.y += ball.vy*dt;
        if(ball.x-BALL_R<0){ ball.x=BALL_R; ball.vx*=-1; }
        if(ball.x+BALL_R>W){ ball.x=W-BALL_R; ball.vx*=-1; }
        if(ball.y-BALL_R<0){ ball.y=BALL_R; ball.vy*=-1; }
        const paddleY = H-PADDLE_Y_OFFSET;
        if(ball.vy>0 && ball.y+BALL_R>=paddleY && ball.y+BALL_R<=paddleY+10 && ball.x>=paddleX && ball.x<=paddleX+paddleW){
          if(stickyT>0 && !ball.fire){ ball.stuck=true; ball.vx=0; ball.vy=0; }
          else {
            const hit = (ball.x-(paddleX+paddleW/2))/(paddleW/2);
            const speed = Math.hypot(ball.vx,ball.vy);
            const angle = hit*60;
            const rad = angle*Math.PI/180;
            ball.vx = Math.sin(rad)*speed; ball.vy = -Math.abs(Math.cos(rad)*speed);
          }
        }
        for(const br of bricks){
          if(!br.alive) continue;
          if(ball.x+BALL_R>br.x && ball.x-BALL_R<br.x+br.w && ball.y+BALL_R>br.y && ball.y-BALL_R<br.y+br.h){
            hitBrick(br);
            if(fireT<=0) ball.vy*=-1;
            break;
          }
        }
      });
      balls = balls.filter(b=>b.y-BALL_R<=H);
      if(balls.length===0){
        lives--;
        if(lives<=0){
          gameOver=true;
          if(score>best){ best=score; Store.set('breakout_high', best); }
        } else {
          balls=[resetBallOnPaddle()];
        }
      }
      powerups.forEach(p=> p.y += p.vy*dt);
      powerups = powerups.filter(p=>{
        if(p.y>H) return false;
        if(p.y+10>=H-PADDLE_Y_OFFSET && p.x>=paddleX && p.x<=paddleX+paddleW){
          applyPowerup(p.kind);
          return false;
        }
        return true;
      });
      if(bricks.every(b=>!b.alive)) nextLevel();
    }
    draw();
    animId = requestAnimationFrame(loop);
  }
  function roundRect(ctx,x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  }
  let ballTrail=[];
  function draw(){
    const bg = ctx.createRadialGradient(W/2,H*0.35,40,W/2,H*0.35,W*0.9);
    bg.addColorStop(0,'#14142a'); bg.addColorStop(1,'#08080f');
    ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);

    bricks.forEach(b=>{
      if(!b.alive) return;
      ctx.globalAlpha = 0.45 + 0.55*(b.hp/b.maxHp);
      const grad = ctx.createLinearGradient(b.x,b.y,b.x,b.y+b.h);
      grad.addColorStop(0, shadeColor(b.color,18));
      grad.addColorStop(1, shadeColor(b.color,-18));
      ctx.fillStyle=grad;
      roundRect(ctx,b.x,b.y,b.w,b.h,4); ctx.fill();
      ctx.strokeStyle='rgba(0,0,0,0.35)'; ctx.lineWidth=1; ctx.stroke();
      ctx.globalAlpha=1;
      if(b.maxHp>1){ ctx.fillStyle='rgba(0,0,0,0.75)'; ctx.font='bold 10px sans-serif'; ctx.textAlign='center'; ctx.fillText(b.hp, b.x+b.w/2, b.y+b.h/2+3); }
    });

    // paddle with soft gradient + glow when powered
    const paddleGrad = ctx.createLinearGradient(paddleX,0,paddleX+paddleW,0);
    const pColor = laserT>0 ? '#ffffff' : '#50c8ff';
    paddleGrad.addColorStop(0, shadeColor(pColor,-10)); paddleGrad.addColorStop(0.5, shadeColor(pColor,20)); paddleGrad.addColorStop(1, shadeColor(pColor,-10));
    ctx.fillStyle=paddleGrad;
    roundRect(ctx,paddleX,H-PADDLE_Y_OFFSET,paddleW,PADDLE_H,6); ctx.fill();

    lasers.forEach(l=>{ ctx.fillStyle='#ff5050'; roundRect(ctx,l.x-2,l.y-14,4,14,2); ctx.fill(); });

    // faint ball trail for a sense of motion
    ballTrail.push(balls.filter(b=>!b.stuck).map(b=>({x:b.x,y:b.y})));
    if(ballTrail.length>5) ballTrail.shift();
    ballTrail.forEach((frame,i)=>{
      const alpha = (i/ballTrail.length)*0.25;
      frame.forEach(p=>{
        ctx.beginPath(); ctx.arc(p.x,p.y,BALL_R*0.8,0,Math.PI*2);
        ctx.fillStyle = fireT>0 ? `rgba(255,159,80,${alpha})` : `rgba(255,255,255,${alpha})`; ctx.fill();
      });
    });
    balls.forEach(ball=>{
      ctx.beginPath(); ctx.arc(ball.x,ball.y,BALL_R,0,Math.PI*2);
      ctx.fillStyle = fireT>0 ? '#ff9f50' : '#fff'; ctx.fill();
      if(fireT>0){ ctx.strokeStyle='rgba(255,159,80,0.6)'; ctx.lineWidth=4; ctx.stroke(); }
    });
    powerups.forEach(p=>{
      const info = POWERUP_INFO[p.kind];
      ctx.fillStyle=info.color;
      ctx.beginPath(); ctx.arc(p.x,p.y,11,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.lineWidth=1.5; ctx.stroke();
      ctx.fillStyle='#000'; ctx.font='bold 10px sans-serif'; ctx.textAlign='center';
      ctx.fillText(info.label, p.x, p.y+3);
    });

    // HUD panel
    ctx.fillStyle='rgba(10,15,30,0.5)';
    roundRect(ctx,6,6,180,36,10); ctx.fill();
    ctx.textAlign='left'; ctx.fillStyle='#ffff50'; ctx.font='bold 15px sans-serif';
    ctx.fillText('Score: '+score, 16, 22);
    ctx.fillStyle='#9090a8'; ctx.font='11px sans-serif';
    ctx.fillText('Best: '+best+'  •  Level '+level, 16, 36);
    for(let i=0;i<lives;i++){ ctx.beginPath(); ctx.arc(W-20-i*20,22,6,0,Math.PI*2); ctx.fillStyle='#ff5050'; ctx.fill(); ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.stroke(); }
    let effY=54;
    const effects=[];
    if(widenT>0) effects.push(['Widen', widenT, '#50ff50']);
    if(slowT>0) effects.push(['Slow', slowT, '#50ffea']);
    if(fireT>0) effects.push(['Fireball', fireT, '#ff5050']);
    if(laserT>0) effects.push(['Laser', laserT, '#fff']);
    if(stickyT>0) effects.push(['Sticky', stickyT, '#a050ff']);
    if(scoreboostT>0) effects.push(['2x Score', scoreboostT, '#ffd700']);
    if(effects.length){
      ctx.fillStyle='rgba(10,15,30,0.5)'; roundRect(ctx,6,46,150,effects.length*14+8,8); ctx.fill();
      effects.forEach(([label,t,color])=>{
        ctx.fillStyle=color; ctx.font='11px sans-serif';
        ctx.fillText(`${label} ${(t/1000).toFixed(1)}s`, 12, effY); effY+=14;
      });
    }
    if(gameOver){
      ctx.fillStyle='rgba(0,0,0,0.65)'; ctx.fillRect(0,0,W,H);
      ctx.fillStyle='#ffff50'; ctx.font='bold 22px sans-serif'; ctx.textAlign='center';
      ctx.fillText('Game Over', W/2, H/2);
      ctx.font='14px sans-serif';
      ctx.fillText('Score: '+score+'  Level: '+level, W/2, H/2+24);
      ctx.fillText('Click Restart to play again', W/2, H/2+46);
    }
  }
  function shadeColor(hex, amt){
    const num = parseInt(hex.slice(1),16);
    let r=(num>>16)+amt, g=((num>>8)&0xff)+amt, b=(num&0xff)+amt;
    r=Math.max(0,Math.min(255,r)); g=Math.max(0,Math.min(255,g)); b=Math.max(0,Math.min(255,b));
    return `rgb(${r},${g},${b})`;
  }
  function keydown(e){
    keys[e.key]=true;
    if(e.key===' '){
      balls.forEach(b=>{ if(b.stuck) launchBall(b, (Math.random()*40-20)); });
      e.preventDefault();
    }
  }
  function keyup(e){ keys[e.key]=false; }
  function mousemove(e){
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (W/rect.width);
    paddleX = Math.max(0, Math.min(W-paddleW, x-paddleW/2));
  }
  function init(c){
    container=c; best = Store.get('breakout_high',0);
    container.innerHTML = `
      <canvas id="bo-canvas" width="${W}" height="${H}"></canvas>
      <div class="controls-hint">Arrow keys / A-D / mouse to move &bull; Space to launch stuck ball or fire lasers<br>
        Powerups: <span style="color:#50ff50;">W widen</span> &bull; <span style="color:#ff9f50;">M multiball</span> &bull;
        <span style="color:#50ffea;">S slow</span> &bull; <span style="color:#ffd700;">+1 life</span> &bull;
        <span style="color:#ff5050;">F fireball</span> &bull; <span style="color:#fff;">L laser</span> &bull;
        <span style="color:#a050ff;">C sticky</span> &bull; <span style="color:#ffd700;">2x score</span> &bull;
        <span style="color:#c060ff;">B bomb</span>
      </div>
      <button class="btn" id="bo-restart">Restart</button>
    `;
    canvas = document.getElementById('bo-canvas'); ctx = canvas.getContext('2d');
    document.getElementById('bo-restart').addEventListener('click', initState);
    document.addEventListener('keydown', keydown);
    document.addEventListener('keyup', keyup);
    canvas.addEventListener('mousemove', mousemove);
    initState();
    animId = requestAnimationFrame(loop);
  }
  function destroy(){
    cancelAnimationFrame(animId);
    document.removeEventListener('keydown', keydown);
    document.removeEventListener('keyup', keyup);
  }
  registerGame('breakout','Breakout','🧱', true, {init, destroy}, ()=>`Best: ${Store.get('breakout_high',0)}`);
})();
