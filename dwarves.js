/* DWARVES: DEATH, LOOT & GLORY */
(function(){
  let container, canvas, ctx, animId, lastTs;
  const W=640, H=380;
  const SHOP = [
    {name:'Shield Dwarf', role:'Tank', hp:120, atk:8, spd:1.0, range:30, color:'#5090c8', cost:20},
    {name:'Berserker', role:'DPS', hp:70, atk:18, spd:1.4, range:30, color:'#dc5050', cost:25},
    {name:'Crossbowman', role:'Ranged', hp:50, atk:14, spd:1.1, range:220, color:'#dcb450', cost:25},
    {name:'Rune Cleric', role:'Cleric', hp:60, atk:12, spd:0.9, range:180, color:'#b4dc64', cost:30},
  ];
  let gold, wave, state, statMult, dwarves, enemies, highScore;

  function makeUnit(def, isPlayer){
    return {name:def.name, role:def.role, maxHp:Math.floor(def.hp*(isPlayer?statMult:1)), hp:Math.floor(def.hp*(isPlayer?statMult:1)),
            attack:Math.floor(def.atk*(isPlayer?statMult:1)), atkSpeed:def.spd, range:def.range, color:def.color,
            isPlayer, cooldown:0, x:0, y:0};
  }
  function setupBattlefield(){
    dwarves.forEach((d,i)=>{ d.hp=d.maxHp; d.cooldown=0; d.x=100+(i%3)*40; d.y=200+Math.floor(i/3)*60; });
    enemies=[];
    const count = 2+wave;
    for(let i=0;i<count;i++){
      const hp=40+wave*15, atk=6+wave*3;
      enemies.push({name:`Goblin ${i+1}`, role:'Enemy', maxHp:hp, hp, attack:atk, atkSpeed:1.0, range:35, color:'#64c864',
                    isPlayer:false, cooldown:0, x:W-120-(i%3)*40, y:180+Math.floor(i/3)*60});
    }
  }
  function updateUnit(u, allies, foes, dt){
    if(u.hp<=0) return;
    u.cooldown = Math.max(0, u.cooldown-dt);
    const living = foes.filter(f=>f.hp>0);
    if(!living.length) return;
    living.sort((a,b)=> ((a.x-u.x)**2+(a.y-u.y)**2) - ((b.x-u.x)**2+(b.y-u.y)**2));
    const target = living[0];
    const dist = Math.abs(target.x-u.x);
    if(dist>u.range){
      const mv = 70*dt;
      u.x += u.x<target.x ? mv : -mv;
    } else if(u.cooldown<=0){
      u.cooldown = 1/u.atkSpeed;
      if(u.role==='Cleric'){
        const hurt = allies.filter(a=>a.hp>0 && a.hp<a.maxHp);
        if(hurt.length){
          hurt.sort((a,b)=>(a.hp/a.maxHp)-(b.hp/b.maxHp));
          hurt[0].hp = Math.min(hurt[0].maxHp, hurt[0].hp+u.attack);
        }
      } else {
        target.hp -= u.attack;
      }
    }
  }
  function buy(i){
    const item = SHOP[i];
    if(gold>=item.cost && dwarves.length<9){
      gold -= item.cost;
      dwarves.push(makeUnit(item, true));
      render();
    }
  }
  function upgrade(){
    if(gold<30) return;
    gold -= 30; statMult += 0.10;
    dwarves.forEach(d=>{ d.maxHp=Math.floor(d.maxHp*1.1); d.hp=d.maxHp; d.attack=Math.max(1,Math.floor(d.attack*1.1)); });
    render();
  }
  function startBattle(){
    setupBattlefield(); state='BATTLE';
  }
  function nextWave(){
    wave++; gold += 20+wave*5; state='PREPARE'; render();
  }
  function restartRun(){
    gold=50; wave=1; state='PREPARE'; statMult=1.0;
    dwarves=[makeUnit(SHOP[0], true)];
    enemies=[];
    render();
  }
  function loop(ts){
    const dt = lastTs ? Math.min(0.033,(ts-lastTs)/1000) : 0;
    lastTs = ts;
    if(state==='BATTLE'){
      dwarves.forEach(d=>updateUnit(d, dwarves, enemies, dt));
      enemies.forEach(e=>updateUnit(e, enemies, dwarves, dt));
      const aliveP = dwarves.filter(d=>d.hp>0), aliveE = enemies.filter(e=>e.hp>0);
      if(!aliveE.length){
        state='VICTORY';
        if(wave>highScore){ highScore=wave; Store.set('dwarves_high', highScore); }
        if(wave>=5) (typeof Achievements!=='undefined'&&Achievements.unlock('dwarves_wave_5'));
        if(wave>=10) (typeof Achievements!=='undefined'&&Achievements.unlock('dwarves_wave_10'));
      } else if(!aliveP.length){
        state='DEFEAT';
      }
    }
    draw();
    animId = requestAnimationFrame(loop);
  }
  function drawUnit(u){
    if(u.hp<=0) return;
    ctx.beginPath(); ctx.arc(u.x,u.y,18,0,Math.PI*2);
    ctx.fillStyle=u.color; ctx.fill();
    ctx.strokeStyle = u.isPlayer ? '#fff' : '#ff5050'; ctx.lineWidth=2; ctx.stroke();
    const ratio = Math.max(0,u.hp/u.maxHp);
    ctx.fillStyle='#ff5050'; ctx.fillRect(u.x-15,u.y-28,30,5);
    ctx.fillStyle='#50ff50'; ctx.fillRect(u.x-15,u.y-28,30*ratio,5);
    ctx.fillStyle='#fff'; ctx.font='11px sans-serif'; ctx.textAlign='center';
    ctx.fillText(u.role[0], u.x, u.y+4);
  }
  function draw(){
    ctx.fillStyle='#191420'; ctx.fillRect(0,0,W,H);
    ctx.fillStyle='#ffd700'; ctx.font='bold 20px sans-serif'; ctx.textAlign='center';
    ctx.fillText('Dwarves: Death, Loot & Glory', W/2, 28);
    ctx.fillStyle='#fff'; ctx.font='14px sans-serif';
    ctx.fillText(`Wave: ${wave}  |  Gold: ${gold}g  |  Dwarves: ${dwarves.length}/9`, W/2, 52);
    ctx.strokeStyle='#3c3246'; ctx.beginPath(); ctx.moveTo(30,70); ctx.lineTo(W-30,70); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(30,300); ctx.lineTo(W-30,300); ctx.stroke();
    dwarves.forEach(drawUnit);
    if(state!=='PREPARE') enemies.forEach(drawUnit);
    if(state==='VICTORY'){
      ctx.fillStyle='rgba(0,0,0,0.65)'; ctx.fillRect(0,0,W,H);
      ctx.fillStyle='#ffff50'; ctx.font='bold 22px sans-serif';
      ctx.fillText(`Wave ${wave} Cleared!`, W/2, H/2);
      ctx.font='14px sans-serif';
      ctx.fillText("Press 'Next Wave' below", W/2, H/2+24);
    } else if(state==='DEFEAT'){
      ctx.fillStyle='rgba(0,0,0,0.65)'; ctx.fillRect(0,0,W,H);
      ctx.fillStyle='#ff5050'; ctx.font='bold 22px sans-serif';
      ctx.fillText('Defeat!', W/2, H/2);
      ctx.font='14px sans-serif';
      ctx.fillText(`You reached wave ${wave}. Click Restart to try again.`, W/2, H/2+24);
    }
  }
  function render(){
    document.getElementById('dw-gold').textContent = `Gold: ${gold}g`;
    document.getElementById('dw-wave').textContent = `Wave: ${wave}`;
    document.getElementById('dw-best').textContent = `Best wave: ${highScore}`;
    const shopEl = document.getElementById('dw-shop');
    const controlsEl = document.getElementById('dw-controls');
    if(state==='PREPARE'){
      shopEl.style.display='flex';
      controlsEl.innerHTML = `
        <button class="btn primary" id="dw-start">Start Battle</button>
        <button class="btn" id="dw-upgrade" ${gold<30?'disabled':''}>+10% Stats (30g)</button>
      `;
      shopEl.innerHTML = SHOP.map((s,i)=>`
        <button class="btn ${gold>=s.cost && dwarves.length<9 ? 'primary':''}" data-i="${i}" ${gold<s.cost||dwarves.length>=9?'disabled':''}>
          Recruit ${s.role}<br>(${s.cost}g)
        </button>`).join('');
      shopEl.querySelectorAll('button').forEach(b=>b.addEventListener('click', ()=>buy(+b.dataset.i)));
      document.getElementById('dw-start').addEventListener('click', startBattle);
      document.getElementById('dw-upgrade').addEventListener('click', upgrade);
    } else if(state==='VICTORY'){
      shopEl.style.display='none';
      controlsEl.innerHTML = `<button class="btn primary" id="dw-next">Next Wave</button>`;
      document.getElementById('dw-next').addEventListener('click', nextWave);
    } else if(state==='DEFEAT'){
      shopEl.style.display='none';
      controlsEl.innerHTML = `<button class="btn primary" id="dw-restart">Restart</button>`;
      document.getElementById('dw-restart').addEventListener('click', restartRun);
    } else {
      shopEl.style.display='none';
      controlsEl.innerHTML = '';
    }
  }
  function tick(){ render(); }
  let renderInterval;
  function init(c){
    container=c; highScore = Store.get('dwarves_high',0); lastTs=null;
    container.innerHTML = `
      <div class="hud"><div id="dw-gold">Gold: 50g</div><div id="dw-wave">Wave: 1</div><div id="dw-best">Best wave: 0</div></div>
      <canvas id="dw-canvas" width="${W}" height="${H}"></canvas>
      <div id="dw-shop" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:12px;max-width:600px;"></div>
      <div id="dw-controls" style="margin-top:10px;"></div>
      <div class="controls-hint">Recruit dwarves, then start the battle. Units auto-fight; Clerics heal your weakest ally instead of attacking.</div>
    `;
    canvas=document.getElementById('dw-canvas'); ctx=canvas.getContext('2d');
    restartRun();
    renderInterval = setInterval(tick, 300);
    animId = requestAnimationFrame(loop);
  }
  function destroy(){ cancelAnimationFrame(animId); clearInterval(renderInterval); }
  registerGame('dwarves','Dwarves: Glory','🛡️', true, {init, destroy}, ()=>{
    const b = Store.get('dwarves_high',0);
    return b>0 ? `Best wave: ${b}` : '';
  });
})();
