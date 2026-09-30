/* MEMORY MATCH */
(function(){
  let container, first=null, second=null, lock=false, moves=0, matched=0, elapsedMs=0, timerId;
  let difficulty='Easy (4x4)', cols, rows, total, peekUsesLeft, peeking=false, gameOver=false, startTs;
  let matchStreak=0, bestStreak=0;
  const SYMBOLS = ['🍎','🍋','🍇','🍒','🍉','🍓','🥝','🍑','🍍','🥥','🍌','🥭','🍈','🍑','🥑','🍐','🍊','🍏'];
  const DIFFICULTIES = { 'Easy (4x4)':[4,4], 'Medium (6x4)':[6,4], 'Hard (6x6)':[6,6] };
  const PEEK_USES = { 'Easy (4x4)':2, 'Medium (6x4)':2, 'Hard (6x6)':1 };
  const REVEAL_PAUSE = 700, PEEK_DURATION = 1500;

  function build(){
    cols = DIFFICULTIES[difficulty][0]; rows = DIFFICULTIES[difficulty][1];
    total = (cols*rows)/2;
    const chosen = [];
    for(let i=0;i<total;i++) chosen.push(SYMBOLS[i % SYMBOLS.length]);
    let deck = chosen.concat(chosen);
    for(let i=deck.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [deck[i],deck[j]]=[deck[j],deck[i]]; }
    return deck;
  }
  function render(deck){
    const grid = document.getElementById('mem-grid');
    grid.style.gridTemplateColumns = `repeat(${cols}, minmax(48px, 72px))`;
    grid.innerHTML = '';
    deck.forEach((sym, idx)=>{
      const card = document.createElement('div');
      card.className='mem-card'; card.type='button';
      card.dataset.idx = idx;
      card.dataset.sym = sym;
      card.textContent = '❓'; card.setAttribute('aria-label', 'Hidden memory card');
      card.addEventListener('click', ()=>flip(card));
      grid.appendChild(card);
    });
  }
  function flip(card){
    if(lock || peeking || gameOver || card.classList.contains('matched') || card.classList.contains('flipped')) return;
    card.classList.add('flipped');
    card.textContent = card.dataset.sym;
    card.setAttribute('aria-label', `Memory card ${card.dataset.sym}`);
    if(!first){ first = card; return; }
    second = card;
    moves++;
    updateHud();
    if(first.dataset.sym === second.dataset.sym){
      matchStreak++; bestStreak=Math.max(bestStreak,matchStreak);
      first.classList.add('matched'); second.classList.add('matched');
      matched++;
      first=null; second=null;
      if(matched===total) finish();
    } else {
      matchStreak=0;
      lock = true;
      setTimeout(()=>{
        first.classList.remove('flipped'); first.textContent='❓'; first.setAttribute('aria-label','Hidden memory card');
        second.classList.remove('flipped'); second.textContent='❓'; second.setAttribute('aria-label','Hidden memory card');
        first=null; second=null; lock=false;
      }, REVEAL_PAUSE);
    }
  }
  function doPeek(){
    if(peekUsesLeft<=0 || peeking || gameOver) return;
    peekUsesLeft--;
    peeking = true;
    document.querySelectorAll('.mem-card:not(.matched)').forEach(c=>{ c.textContent = c.dataset.sym; c.setAttribute('aria-label', `Memory card ${c.dataset.sym}`); c.classList.add('flipped'); });
    updateHud();
    setTimeout(()=>{
      document.querySelectorAll('.mem-card:not(.matched)').forEach(c=>{ c.textContent='❓'; c.setAttribute('aria-label','Hidden memory card'); c.classList.remove('flipped'); });
      peeking = false;
    }, PEEK_DURATION);
  }
  function finish(){
    gameOver = true;
    clearInterval(timerId);
    const key = 'memory_best_'+difficulty;
    const best = Store.get(key, null);
    const isNew = best===null || moves<best;
    if(isNew) Store.set(key, moves);
    document.getElementById('mem-msg').textContent = `Solved in ${moves} moves, ${(elapsedMs/1000).toFixed(1)}s!` + (isNew?' New best!':'');
    updateHud();
  }
  function updateHud(){
    document.getElementById('mem-moves').innerHTML = `Moves: <b>${moves}</b>`;
    const streakEl=document.getElementById('mem-streak'); if(streakEl) streakEl.textContent=`Match streak: ${matchStreak}`;
    document.getElementById('mem-time').innerHTML = `Time: <b>${(elapsedMs/1000).toFixed(1)}s</b>`;
    const best = Store.get('memory_best_'+difficulty, null);
    document.getElementById('mem-best').innerHTML = `Best: <b>${best===null?'-':best+' moves'}</b>`;
    const peekBtn = document.getElementById('mem-peek');
    if(peekBtn){
      peekBtn.textContent = `👁 Peek (${peekUsesLeft} left)`;
      peekBtn.disabled = peekUsesLeft<=0 || peeking || gameOver;
    }
  }
  function newGame(){
    first=null; second=null; lock=false; moves=0; matched=0; elapsedMs=0; gameOver=false; peeking=false; matchStreak=0; bestStreak=0;
    peekUsesLeft = PEEK_USES[difficulty];
    document.getElementById('mem-msg').textContent='';
    render(build());
    updateHud();
    clearInterval(timerId);
    startTs = Date.now();
    timerId = setInterval(()=>{ if(!gameOver){ elapsedMs = Date.now()-startTs; updateHud(); } }, 100);
  }
  function init(c){
    container = c;
    container.innerHTML = `
      <div style="margin-bottom:10px;">
        <select id="mem-diff" class="btn">
          ${Object.keys(DIFFICULTIES).map(d=>`<option value="${d}">${d}</option>`).join('')}
        </select>
        <button class="btn" id="mem-peek">👁 Peek</button>
        <button class="btn" id="mem-new">New Game</button>
      </div>
      <div class="hud"><div id="mem-moves">Moves: <b>0</b></div><div id="mem-time">Time: <b>0.0s</b></div><div id="mem-best">Best: <b>-</b></div><div id="mem-streak">Match streak: 0</div></div>
      <div class="mem-grid" id="mem-grid"></div>
      <div class="msg" id="mem-msg"></div>
      <div class="controls-hint">Match every pair. Peek briefly reveals the whole board (limited uses).</div>
    `;
    document.getElementById('mem-diff').value = difficulty;
    document.getElementById('mem-diff').addEventListener('change', e=>{ difficulty=e.target.value; newGame(); });
    document.getElementById('mem-peek').addEventListener('click', doPeek);
    document.getElementById('mem-new').addEventListener('click', newGame);
    newGame();
  }
  function destroy(){ clearInterval(timerId); }
  registerGame('memory','Memory Match','🧠', true, {init, destroy}, ()=>{
    const b = Store.get('memory_best_Easy (4x4)', null);
    return b===null ? '' : `Best: ${b} moves`;
  });
})();
