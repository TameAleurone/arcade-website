/* Shared polish for Arcade Hub game pages. */
(function(){
  function init(){
    const target=document.getElementById('game-container');
    if(!target || target.dataset.qualityReady) return;
    target.dataset.qualityReady='1';
    const bar=document.createElement('div');
    bar.className='game-tools';
    bar.innerHTML=`
      <button class="btn game-tool" id="quality-focus" type="button" aria-pressed="false">⛶ Focus</button>
      <button class="btn game-tool" id="quality-copy" type="button">🔗 Copy Link</button>
      <button class="btn game-tool" id="quality-help" type="button" aria-expanded="false">? Controls</button>
      <div class="game-help hidden" id="quality-help-panel" role="note"></div>`;
    target.appendChild(bar);
    const focus=bar.querySelector('#quality-focus');
    focus.addEventListener('click',()=>{
      const active=target.classList.toggle('focus-mode');
      focus.setAttribute('aria-pressed',String(active));
      focus.textContent=active?'↙ Exit Focus':'⛶ Focus';
      if(active && target.requestFullscreen){ target.requestFullscreen().catch(()=>{}); }
      else if(!active && document.fullscreenElement){ document.exitFullscreen().catch(()=>{}); }
    });
    bar.querySelector('#quality-copy').addEventListener('click',async()=>{
      const btn=bar.querySelector('#quality-copy');
      try{ await navigator.clipboard.writeText(location.href); btn.textContent='✓ Copied'; }
      catch(e){ btn.textContent='Copy unavailable'; }
      setTimeout(()=>btn.textContent='🔗 Copy Link',1200);
    });
    const helpBtn=bar.querySelector('#quality-help'), panel=bar.querySelector('#quality-help-panel');
    helpBtn.addEventListener('click',()=>{
      const open=panel.classList.toggle('hidden')===false;
      helpBtn.setAttribute('aria-expanded',String(open));
      if(open){
        const hints=[...target.querySelectorAll('.controls-hint')].map(e=>e.innerText.trim()).filter(Boolean);
        panel.textContent=hints.length?hints.join(' '):'Use the buttons on screen and your keyboard where supported.';
      }
    });
    document.addEventListener('fullscreenchange',()=>{
      if(!document.fullscreenElement && target.classList.contains('focus-mode')){
        target.classList.remove('focus-mode'); focus.setAttribute('aria-pressed','false'); focus.textContent='⛶ Focus';
      }
    });
  }
  window.addEventListener('arcadegamebooted',init);
  if(document.readyState!=='loading') setTimeout(init,0); else document.addEventListener('DOMContentLoaded',init);
})();
