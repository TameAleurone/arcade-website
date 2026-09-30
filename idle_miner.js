/* IDLE MINER */
(function(){
  let container, tickId, lastTs;
  const GROWTH = 1.15, DIG_BONUS = 5, CRIT_CHANCE = 0.12, CRIT_MULT = 4;
  const OFFLINE_EFFICIENCY = 0.5, MAX_OFFLINE_SECONDS = 4*3600, MIN_OFFLINE_SECONDS = 20;
  const BUILDINGS = [['Pickaxe Bot',20,1],['Cart Hauler',150,8],['Deep Drill',800,45],['Mining Rig AI',5000,250]];
  let gold, gems, lifetimeGold, counts;

  function upgradeCost(base,count){ return Math.floor(base*Math.pow(GROWTH,count)); }
  function gemMult(){ return 1+0.05*gems; }
  function goldPerSec(){ let g=0; BUILDINGS.forEach((b,i)=>g+=counts[i]*b[2]); return g*gemMult(); }
  function potentialGems(){ return Math.floor(Math.sqrt(lifetimeGold/1000000)); }

  function save(){
    Store.set('im_gold', gold); Store.set('im_gems', gems);
    Store.set('im_lifetime', lifetimeGold); Store.set('im_counts', counts);
    Store.set('im_ts', Date.now());
    const best = Store.get('idle_miner_high', 0);
    if(lifetimeGold>best) Store.set('idle_miner_high', Math.floor(lifetimeGold));
  }
  function load(){
    gold = Store.get('im_gold', 0);
    gems = Store.get('im_gems', 0);
    lifetimeGold = Store.get('im_lifetime', 0);
    counts = Store.get('im_counts', BUILDINGS.map(()=>0));
    const lastTsSaved = Store.get('im_ts', null);
    if(lastTsSaved){
      const elapsed = Math.max(0,(Date.now()-lastTsSaved)/1000);
      if(elapsed>=MIN_OFFLINE_SECONDS){
        const capped = Math.min(elapsed, MAX_OFFLINE_SECONDS);
        const earned = goldPerSec()*capped*OFFLINE_EFFICIENCY;
        if(earned>0){
          gold+=earned; lifetimeGold+=earned;
          setTimeout(()=>showMsg(`Welcome back! +${Math.floor(earned).toLocaleString()} Gold while away (${fmtDuration(capped)})`),50);
        }
      }
    }
    save();
  }
  function fmtDuration(s){
    const h=Math.floor(s/3600), m=Math.floor((s%3600)/60);
    if(h>0) return `${h}h ${m}m`;
    if(m>0) return `${m}m`;
    return `${Math.floor(s)}s`;
  }
  function showMsg(t){ const el=document.getElementById('im-msg'); if(el) el.textContent=t; }
  function doDig(){
    let gained = DIG_BONUS*gemMult();
    if(Math.random()<CRIT_CHANCE) gained *= CRIT_MULT;
    gold+=gained; lifetimeGold+=gained;
  }
  function buy(i){
    const cost = upgradeCost(BUILDINGS[i][1], counts[i]);
    if(gold>=cost){ gold-=cost; counts[i]++; render(); }
  }
  function doExpedition(){
    const gained = potentialGems();
    if(gained<=0) return;
    if(!confirm(`Start an expedition? You'll gain ${gained} gem(s) (permanent +${(gained*5)}% production) but lose all current gold and buildings.`)) return;
    gems += gained; gold=0; lifetimeGold=0; counts = BUILDINGS.map(()=>0);
    save(); render();
  }
  function render(){
    document.getElementById('im-gold').textContent = `Gold: ${Math.floor(gold).toLocaleString()}`;
    document.getElementById('im-rate').textContent = `+${goldPerSec().toFixed(1)}/s  •  Gems: ${gems} (x${gemMult().toFixed(2)} bonus)`;
    document.getElementById('im-lifetime').textContent = `Lifetime gold: ${Math.floor(lifetimeGold).toLocaleString()}`;
    const list = document.getElementById('im-buildings');
    list.innerHTML='';
    BUILDINGS.forEach((b,i)=>{
      const cost = upgradeCost(b[1], counts[i]);
      const row = document.createElement('div');
      row.style.cssText='display:flex;justify-content:space-between;align-items:center;width:min(92vw,360px);background:var(--panel2);border:1px solid var(--border);border-radius:8px;padding:8px 12px;margin-bottom:6px;';
      row.innerHTML = `<div><b>${b[0]}</b><br><span style="color:var(--dim);font-size:0.8rem;">owned ${counts[i]} &bull; +${b[2]} gold/s each</span></div>`;
      const btn = document.createElement('button');
      btn.className='btn'+(gold>=cost?' primary':'');
      btn.textContent = `Buy (${cost.toLocaleString()})`;
      btn.disabled = gold<cost;
      btn.addEventListener('click', ()=>buy(i));
      row.appendChild(btn);
      list.appendChild(row);
    });
    const exBtn = document.getElementById('im-expedition');
    const pg = potentialGems();
    exBtn.textContent = `EXPEDITION (+${pg} gem${pg===1?'':'s'})`;
    exBtn.disabled = pg<=0;
    exBtn.className = 'btn' + (pg>0?' primary':'');
  }
  function tick(){
    const now = performance.now();
    const dt = lastTs ? (now-lastTs)/1000 : 0;
    lastTs = now;
    const gained = goldPerSec()*dt;
    gold += gained; lifetimeGold += gained;
    if(lifetimeGold>=10000) (typeof Achievements!=='undefined'&&Achievements.unlock('idle_miner_10000'));
    if(lifetimeGold>=1000000) (typeof Achievements!=='undefined'&&Achievements.unlock('idle_miner_1000000'));
    render();
  }
  function key(e){ if(e.key===' '){ doDig(); e.preventDefault(); } }
  function init(c){
    container=c; load(); lastTs=null;
    container.innerHTML = `
      <div style="display:flex;gap:24px;flex-wrap:wrap;justify-content:center;align-items:flex-start;">
        <div style="text-align:center;">
          <div id="im-gold" style="font-size:1.4rem;color:#ffd700;font-weight:700;"></div>
          <div id="im-rate" style="color:var(--dim);font-size:0.85rem;margin-bottom:10px;"></div>
          <button id="im-dig" class="btn primary" style="width:150px;height:90px;font-size:1.2rem;font-weight:700;">DIG!</button>
          <div id="im-msg" class="msg" style="min-height:1.4em;"></div>
          <div class="controls-hint">Click DIG! or press Space &bull; 12% crit chance x4</div>
          <div style="margin-top:14px;">
            <button id="im-expedition" class="btn">EXPEDITION</button>
          </div>
          <div id="im-lifetime" style="color:var(--dim);font-size:0.8rem;margin-top:8px;"></div>
        </div>
        <div id="im-buildings"></div>
      </div>
    `;
    document.getElementById('im-dig').addEventListener('click', doDig);
    document.getElementById('im-expedition').addEventListener('click', doExpedition);
    document.addEventListener('keydown', key);
    render();
    tickId = setInterval(tick, 200);
  }
  function destroy(){ save(); clearInterval(tickId); document.removeEventListener('keydown', key); }
  registerGame('idle_miner','Idle Miner','⛏️', true, {init, destroy}, ()=>{
    const b = Store.get('idle_miner_high', 0);
    return b>0 ? `Lifetime: ${b.toLocaleString()}` : '';
  });
})();
