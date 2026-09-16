/* IDLE POWER GENERATOR (clicker) */
(function(){
  let container, tickId;
  const GROWTH = 1.15;
  const CRIT_CHANCE = 0.10, CRIT_MULT = 3;
  const SURGE_MULT = 50, SURGE_DURATION = 4.0;
  const PRESTIGE_THRESHOLD = 100000;
  const ACHIEVEMENTS = [[1000,'Novice Harvester'],[10000,'Energy Adept'],[100000,'Power Broker'],[1000000,'Energy Tycoon']];
  const OFFLINE_EFFICIENCY = 0.5, MAX_OFFLINE_SECONDS = 4*3600, MIN_OFFLINE_SECONDS = 20;
  let UPGRADES; // [name, baseCost, cps, clickPower]
  let coins, lifetime, prestigePoints, achievements, counts, surgeActive, surgeTimeLeft, surgeTimer, lastTs;

  function upgradeCost(base, count){ return Math.floor(base * Math.pow(GROWTH, count)); }
  function prestigeMult(){ return 1 + 0.10*prestigePoints; }
  function clickPower(){ let p=1; UPGRADES.forEach((u,i)=>p+=counts[i]*u[3]); return p; }
  function cps(){ let c=0; UPGRADES.forEach((u,i)=>c+=counts[i]*u[2]); return c; }

  function save(){
    Store.set('clicker_coins', coins);
    Store.set('clicker_lifetime', lifetime);
    Store.set('clicker_prestige', prestigePoints);
    Store.set('clicker_achievements', achievements);
    Store.set('clicker_counts', counts);
    Store.set('clicker_ts', Date.now());
  }
  function load(){
    UPGRADES = [
      ['Training Weights', 15, 0.5, 0],
      ['Energy Drinks', 100, 4, 1],
      ['Auto-Clicker Bot', 500, 32, 0],
      ['Quantum Supercomputer', 3000, 150, 25],
    ];
    coins = Store.get('clicker_coins', 0);
    lifetime = Store.get('clicker_lifetime', 0);
    prestigePoints = Store.get('clicker_prestige', 0);
    achievements = Store.get('clicker_achievements', []);
    counts = Store.get('clicker_counts', UPGRADES.map(()=>0));
    surgeActive=false; surgeTimeLeft=0; surgeTimer = 20+Math.random()*20;

    const lastTsSaved = Store.get('clicker_ts', null);
    if(lastTsSaved){
      const elapsed = Math.max(0, (Date.now()-lastTsSaved)/1000);
      if(elapsed >= MIN_OFFLINE_SECONDS){
        const capped = Math.min(elapsed, MAX_OFFLINE_SECONDS);
        const earned = cps()*prestigeMult()*capped*OFFLINE_EFFICIENCY;
        if(earned>0){
          coins += earned; lifetime += earned;
          setTimeout(()=>showMsg(`Welcome back! +${Math.floor(earned).toLocaleString()} Wh while away`),50);
        }
      }
    }
    save();
  }
  function showMsg(t){ const el=document.getElementById('clk-msg'); if(el) el.textContent=t; }
  function checkAchievements(){
    ACHIEVEMENTS.forEach(([threshold,name])=>{
      if(lifetime>=threshold && !achievements.includes(name)){
        achievements.push(name);
        showMsg(`🏆 Achievement unlocked: ${name}!`);
        save();
      }
    });
  }
  function doHarvest(){
    let gained = clickPower()*prestigeMult();
    if(Math.random()<CRIT_CHANCE) gained *= CRIT_MULT;
    if(surgeActive){ gained *= SURGE_MULT; surgeActive=false; surgeTimeLeft=0; surgeTimer=20+Math.random()*20; }
    coins += gained; lifetime += gained;
  }
  function buy(i){
    const cost = upgradeCost(UPGRADES[i][1], counts[i]);
    if(coins>=cost){ coins-=cost; counts[i]++; render(); }
  }
  function doPrestige(){
    if(coins<PRESTIGE_THRESHOLD) return;
    if(!confirm('Prestige resets your Energy and upgrades for a permanent +10% production bonus. Continue?')) return;
    prestigePoints++; coins=0; counts = UPGRADES.map(()=>0);
    save(); render();
  }
  function doResetAll(){
    if(!confirm('Reset ALL clicker progress? This cannot be undone.')) return;
    coins=0; lifetime=0; prestigePoints=0; achievements=[]; counts=UPGRADES.map(()=>0);
    save(); render();
  }
  function render(){
    document.getElementById('clk-energy').textContent = `Energy: ${Math.floor(coins).toLocaleString()} Wh`;
    document.getElementById('clk-cps').textContent = `+${(cps()*prestigeMult()).toFixed(1)}/s  •  Click power: ${clickPower().toFixed(1)}`;
    document.getElementById('clk-prestige-info').textContent = `Prestige: ${prestigePoints} (x${prestigeMult().toFixed(1)} bonus)`;
    document.getElementById('clk-lifetime').textContent = `Lifetime: ${Math.floor(lifetime).toLocaleString()} Wh`;
    document.getElementById('clk-achievements').textContent = achievements.length ? '🏆 ' + achievements.join(', ') : '';
    const list = document.getElementById('clk-upgrades');
    list.innerHTML='';
    UPGRADES.forEach((u,i)=>{
      const cost = upgradeCost(u[1], counts[i]);
      const row = document.createElement('div');
      row.style.cssText='display:flex;justify-content:space-between;align-items:center;width:360px;background:var(--panel2);border:1px solid var(--border);border-radius:8px;padding:8px 12px;margin-bottom:6px;';
      row.innerHTML = `<div><b>${u[0]}</b><br><span style="color:var(--dim);font-size:0.8rem;">owned ${counts[i]} &bull; +${u[2]}/s${u[3]?` &bull; +${u[3]} click`:''}</span></div>`;
      const btn = document.createElement('button');
      btn.className='btn'+(coins>=cost?' primary':'');
      btn.textContent = `Buy (${cost.toLocaleString()})`;
      btn.disabled = coins<cost;
      btn.addEventListener('click', ()=>buy(i));
      row.appendChild(btn);
      list.appendChild(row);
    });
    const pbtn = document.getElementById('clk-prestige-btn');
    pbtn.disabled = coins<PRESTIGE_THRESHOLD;
    pbtn.className = 'btn' + (coins>=PRESTIGE_THRESHOLD?' primary':'');
    const surgeEl = document.getElementById('clk-surge');
    surgeEl.textContent = surgeActive ? `⚡ SURGE ACTIVE (${SURGE_MULT}x)! ${surgeTimeLeft.toFixed(1)}s` : '';
  }
  function tick(){
    const now = performance.now();
    const dt = lastTs ? (now-lastTs)/1000 : 0;
    lastTs = now;
    const gained = cps()*prestigeMult()*dt;
    coins += gained; lifetime += gained;
    checkAchievements();
    if(surgeActive){
      surgeTimeLeft -= dt;
      if(surgeTimeLeft<=0){ surgeActive=false; surgeTimer=20+Math.random()*20; }
    } else {
      surgeTimer -= dt;
      if(surgeTimer<=0){ surgeActive=true; surgeTimeLeft=SURGE_DURATION; }
    }
    render();
  }
  function key(e){ if(e.key===' '){ doHarvest(); e.preventDefault(); } }
  function init(c){
    container=c; load(); lastTs=null;
    container.innerHTML = `
      <div style="display:flex;gap:24px;flex-wrap:wrap;justify-content:center;align-items:flex-start;">
        <div style="text-align:center;">
          <div id="clk-energy" style="font-size:1.4rem;color:#ffbe3c;font-weight:700;"></div>
          <div id="clk-cps" style="color:var(--dim);font-size:0.85rem;margin-bottom:10px;"></div>
          <button id="clk-harvest" class="btn primary" style="width:180px;height:180px;border-radius:50%;font-size:1.3rem;font-weight:700;">HARVEST</button>
          <div id="clk-surge" style="color:var(--yellow);margin-top:10px;min-height:1.2em;"></div>
          <div id="clk-msg" class="msg" style="min-height:1.4em;"></div>
          <div class="controls-hint">Click HARVEST or press Space &bull; 10% crit chance &bull; random x50 surges</div>
          <div style="margin-top:14px;">
            <div id="clk-prestige-info" style="color:var(--dim);font-size:0.85rem;"></div>
            <button id="clk-prestige-btn" class="btn">PRESTIGE (needs 100,000 Wh)</button>
            <button id="clk-reset" class="btn" style="border-color:var(--red);">Reset All</button>
          </div>
          <div id="clk-lifetime" style="color:var(--dim);font-size:0.8rem;margin-top:8px;"></div>
          <div id="clk-achievements" style="color:var(--yellow);font-size:0.8rem;margin-top:4px;max-width:360px;"></div>
        </div>
        <div id="clk-upgrades"></div>
      </div>
    `;
    document.getElementById('clk-harvest').addEventListener('click', doHarvest);
    document.getElementById('clk-prestige-btn').addEventListener('click', doPrestige);
    document.getElementById('clk-reset').addEventListener('click', doResetAll);
    document.addEventListener('keydown', key);
    render();
    tickId = setInterval(tick, 200);
  }
  function destroy(){ save(); clearInterval(tickId); document.removeEventListener('keydown', key); }
  registerGame('clicker','Idle Power Generator','⚡', true, {init, destroy}, ()=>{
    const l = Store.get('clicker_lifetime', 0);
    return l>0 ? `Lifetime: ${Math.floor(l).toLocaleString()} Wh` : '';
  });
})();
