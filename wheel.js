/* WHEEL OF FORTUNE */
(function(){
  let container, angle=0, spinning=false, speed=0, score, best, history, animId;
  let multiplier=1, streak=0, lockTimer=0, jackpotPot, lastTs;
  const JACKPOT_BASE=1000, JACKPOT_GROWTH_PER_SPIN=25;
  const MAX_STREAK_BONUS_STEPS=10, STREAK_BONUS_PER_STEP=0.05;
  const segments = [
    {prize:'100 Pts', value:100, color:'#ff5050'},
    {prize:'50 Pts', value:50, color:'#50c8ff'},
    {prize:'Bankrupt', value:'bankrupt', color:'#222'},
    {prize:'200 Pts', value:200, color:'#50ff50'},
    {prize:'Spin X2', value:'x2', color:'#ffff50'},
    {prize:'10 Pts', value:10, color:'#a050ff'},
    {prize:'Jackpot!', value:'jackpot', color:'#ff9f50'},
    {prize:'Free Spin', value:'free', color:'#50ffea'},
    {prize:'Lose Turn', value:'lose', color:'#888'},
  ];
  const n = segments.length, sliceAngle = 360/n;

  function streakMultiplier(){ return 1 + Math.min(streak, MAX_STREAK_BONUS_STEPS)*STREAK_BONUS_PER_STEP; }
  function drawWheel(){
    const canvas = document.getElementById('wheel-canvas');
    const ctx = canvas.getContext('2d');
    const cx=canvas.width/2, cy=canvas.height/2, r=canvas.width/2-10;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for(let i=0;i<n;i++){
      const start = (angle + i*sliceAngle) * Math.PI/180;
      const end = start + sliceAngle*Math.PI/180;
      ctx.beginPath(); ctx.moveTo(cx,cy);
      ctx.arc(cx,cy,r,start,end);
      ctx.fillStyle = segments[i].color; ctx.fill();
      ctx.strokeStyle='#111'; ctx.stroke();
      ctx.save();
      ctx.translate(cx,cy);
      ctx.rotate(start + (sliceAngle*Math.PI/180)/2);
      ctx.textAlign='right';
      ctx.fillStyle = segments[i].color==='#222'?'#fff':'#111';
      ctx.font='bold 12px sans-serif';
      ctx.fillText(segments[i].prize, r-10, 4);
      ctx.restore();
    }
    ctx.beginPath();
    ctx.moveTo(cx+r+6, cy-12); ctx.lineTo(cx+r+30, cy); ctx.lineTo(cx+r+6, cy+12);
    ctx.fillStyle='#ffff50'; ctx.fill();
  }
  function loop(ts){
    if(lastTs==null) lastTs=ts;
    let dt=(ts-lastTs)/1000; lastTs=ts;
    if(!Number.isFinite(dt) || dt<0) dt=0;
    dt = Math.min(dt, 0.1);
    if(lockTimer>0) lockTimer=Math.max(0,lockTimer-dt);
    if(spinning){
      speed -= 250*dt;
      if(speed<=0){ speed=0; spinning=false; determinePrize(); }
      angle = (angle + speed*dt) % 360;
    }
    drawWheel();
    updateHud();
    animId = requestAnimationFrame(loop);
  }
  function bonusSuffix(extra){
    const parts=[];
    if(multiplier>1) parts.push('x'+multiplier);
    const sm = streakMultiplier();
    if(sm>1) parts.push('streak x'+sm.toFixed(2));
    if(extra) parts.push(extra);
    return parts.length ? ` (${parts.join(', ')})` : '';
  }
  function determinePrize(){
    const pointerAngle = 270;
    const normalized = ((pointerAngle - angle) % 360 + 360) % 360;
    const idx = Math.floor(normalized / sliceAngle) % n;
    const seg = segments[idx];
    const sm = streakMultiplier();
    let text;
    if(seg.value==='bankrupt'){
      score=0; multiplier=1; streak=0;
      text='Bankrupt! Score and streak reset.';
    } else if(seg.value==='jackpot'){
      const gained = Math.round(jackpotPot*multiplier*sm);
      score+=gained;
      text = `JACKPOT! +${gained}${bonusSuffix()}`;
      multiplier=1; streak++;
      jackpotPot = JACKPOT_BASE;
    } else if(seg.value==='x2'){
      multiplier=2; streak++;
      text = 'Spin X2! Your next prize will be doubled.';
    } else if(seg.value==='lose'){
      lockTimer=1.5;
      text = 'Lose a Turn! Wait a moment before spinning again.';
    } else if(seg.value==='free'){
      lockTimer=0;
      const gained = Math.round(25*multiplier*sm);
      score+=gained; multiplier=1; streak++;
      text = `Free Spin! +${gained} bonus, spin again right away.`;
    } else {
      const gained = Math.round(seg.value*multiplier*sm);
      score+=gained;
      text = `You got: ${seg.prize}${bonusSuffix()}`;
      multiplier=1; streak++;
    }
    if(seg.value!=='jackpot') jackpotPot += JACKPOT_GROWTH_PER_SPIN;
    history.unshift(text);
    history = history.slice(0,5);
    if(score>best){ best=score; Store.set('wheel_high', best); }
    Store.set('wheel_jackpot_pot', jackpotPot);
    updateHud();
  }
  function updateHud(){
    document.getElementById('wheel-score').innerHTML = `Score: <b>${score}</b>`;
    document.getElementById('wheel-best').innerHTML = `Best: <b>${best}</b>`;
    document.getElementById('wheel-mult').innerHTML = `Multiplier: <b>x${multiplier}</b>`;
    document.getElementById('wheel-streak').innerHTML = `Streak: <b>${streak}</b> (x${streakMultiplier().toFixed(2)})`;
    document.getElementById('wheel-jackpot').innerHTML = `Jackpot pot: <b>${jackpotPot}</b>`;
    document.getElementById('wheel-history').innerHTML = history.map(h=>`<div>${h}</div>`).join('');
    const btn = document.getElementById('wheel-spin');
    btn.disabled = spinning || lockTimer>0;
    btn.textContent = lockTimer>0 ? `Wait ${lockTimer.toFixed(1)}s...` : 'Spin';
  }
  function spin(){
    if(spinning || lockTimer>0) return;
    speed = 600+Math.random()*400;
    spinning=true;
  }
  function key(e){ if(e.key===' '){ spin(); e.preventDefault(); } }
  function init(c){
    container=c;
    score=0; multiplier=1; streak=0; lockTimer=0; history=[]; lastTs=null;
    best=Store.get('wheel_high',0);
    jackpotPot=Store.get('wheel_jackpot_pot', JACKPOT_BASE);
    container.innerHTML = `
      <div class="hud">
        <div id="wheel-score">Score: <b>0</b></div>
        <div id="wheel-mult">Multiplier: <b>x1</b></div>
        <div id="wheel-streak">Streak: <b>0</b></div>
        <div id="wheel-jackpot">Jackpot pot: <b>${jackpotPot}</b></div>
        <div id="wheel-best">Best: <b>${best}</b></div>
      </div>
      <canvas id="wheel-canvas" width="360" height="360"></canvas>
      <div class="msg" id="wheel-msg">Press Space or click Spin!</div>
      <button class="btn primary" id="wheel-spin">Spin</button>
      <div class="controls-hint">Land consecutive point prizes to build a streak bonus (up to +50%). The jackpot grows every non-jackpot spin.</div>
      <div id="wheel-history" style="margin-top:10px;color:var(--dim);font-size:0.85rem;text-align:center;"></div>
    `;
    document.getElementById('wheel-spin').addEventListener('click', spin);
    document.addEventListener('keydown', key);
    updateHud();
    animId = requestAnimationFrame(loop);
  }
  function destroy(){ cancelAnimationFrame(animId); document.removeEventListener('keydown', key); }
  registerGame('wheel','Wheel of Fortune','🎡', true, {init, destroy}, ()=>`Best: ${Store.get('wheel_high',0)}`);
})();
