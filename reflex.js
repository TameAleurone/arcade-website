/* REACTION TEST (reflex) */
(function(){
  let container, state, startTime, timeoutId;
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
      setState('fail','Too soon! Click to try again.');
      state='idle-fail';
      return;
    }
    if(state==='go'){
      const rt = performance.now()-startTime;
      const best = Store.get('reflex_best', null);
      if(best===null || rt<best) Store.set('reflex_best', Math.round(rt));
      document.getElementById('reflex-result').textContent = `Reaction time: ${rt.toFixed(0)} ms`;
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
      <div class="hud"><div id="reflex-best">Best: <b>-</b></div></div>
      <div id="reflex-zone" style="width:340px;height:200px;border-radius:12px;display:flex;align-items:center;justify-content:center;
        background:#20233a;color:#fff;font-size:1.2rem;cursor:pointer;text-align:center;padding:10px;">Click to start</div>
      <div class="msg" id="reflex-result"></div>
      <div class="controls-hint">Click the box, wait for it to turn green, then click as fast as you can.</div>
    `;
    document.getElementById('reflex-zone').addEventListener('click', onZoneClick);
    state='idle';
    updateBest();
  }
  function destroy(){ clearTimeout(timeoutId); }
  registerGame('reflex','Reaction Test','⚡', true, {init, destroy}, ()=>{
    const b = Store.get('reflex_best', null);
    return b===null ? '' : `Best: ${b}ms`;
  });
})();
