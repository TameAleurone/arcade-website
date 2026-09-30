/* REACTION TEST (reflex) */
(function(){
  let container, state, startTime, timeoutId;
  let rounds=0, totalMs=0, streak=0, bestStreak=0;
  function setState(s, text){
    state=s;
    const zone = document.getElementById('reflex-zone');
    zone.textContent = text;
    zone.style.background = s==='go' ? '#1f7a1f' : (s==='fail' ? '#7a1f1f' : '#20233a');
  }
  function startRound(){
    setState('wait','Wait for green...');
    const delay = 1000 + Math.random()*2500;
    timeoutId = setTimeout(()=>{
      startTime = performance.now();
      setState('go','CLICK NOW!');
    }, delay);
  }
  function onZoneClick(){
    if(state==='idle'){ startRound(); return; }
    if(state==='wait'){
      clearTimeout(timeoutId);
      streak=0;
      setState('fail','Too soon! Click to try again.');
      state='idle-fail';
      return;
    }
    if(state==='go'){
      const rt = performance.now()-startTime;
      rounds++; totalMs+=rt; streak++; bestStreak=Math.max(bestStreak,streak);
      const best = Store.get('reflex_best', null);
      if(best===null || rt<best) Store.set('reflex_best', Math.round(rt));
      document.getElementById('reflex-result').textContent = `Reaction time: ${rt.toFixed(0)} ms • Session avg: ${(totalMs/rounds).toFixed(0)} ms • Streak: ${streak}`;
      updateBest();
      setState('idle','Click to try again');
      state='idle';
      return;
    }
    if(state==='idle-fail' || state==='idle'){ startRound(); }
  }
  function updateBest(){
    const best = Store.get('reflex_best', null);
    document.getElementById('reflex-best').innerHTML = `Best: <b>${best===null?'-':best+'ms'}</b>`;
  }
  function init(c){
    container=c;
    container.innerHTML = `
      <div class="hud"><div id="reflex-best">Best: <b>-</b></div><div id="reflex-session">Session: 0 rounds</div></div>
      <button type="button" id="reflex-zone" style="width:min(92vw,340px);height:200px;border-radius:12px;display:flex;align-items:center;justify-content:center;
        background:#20233a;color:#fff;font-size:1.2rem;cursor:pointer;text-align:center;padding:10px;">Click to start</button>
      <div class="msg" id="reflex-result"></div>
      <div class="controls-hint">Click the box, wait for it to turn green, then click as fast as you can.</div>
    `;
    document.getElementById('reflex-zone').addEventListener('click', onZoneClick);
    state='idle'; rounds=0; totalMs=0; streak=0; bestStreak=0;
    updateBest();
    const updateSession=()=>{const e=document.getElementById('reflex-session');if(e)e.textContent=`Session: ${rounds} rounds${rounds?` • avg ${(totalMs/rounds).toFixed(0)}ms • best streak ${bestStreak}`:''}`};
    const old=document.getElementById('reflex-result');
    const obs=new MutationObserver(updateSession); if(old) obs.observe(old,{childList:true,characterData:true,subtree:true}); container._reflexObs=obs;
  }
  function destroy(){ clearTimeout(timeoutId); if(container._reflexObs) container._reflexObs.disconnect(); }
  registerGame('reflex','Reaction Test','⚡', true, {init, destroy}, ()=>{
    const b = Store.get('reflex_best', null);
    return b===null ? '' : `Best: ${b}ms`;
  });
})();
