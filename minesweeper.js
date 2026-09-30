/* MINESWEEPER */
(function(){
  let container, rows, cols, mines, board, revealedCount, flags, gameOver, won, timer, seconds, difficulty='easy';
  const DIFFS = { easy:{rows:9,cols:9,mines:10}, medium:{rows:13,cols:13,mines:25}, hard:{rows:16,cols:16,mines:40} };

  function buildBoard(firstR, firstC){
    board = Array.from({length:rows},()=>Array.from({length:cols},()=>({mine:false,adj:0,revealed:false,flag:false})));
    let placed=0;
    while(placed<mines){
      const r=Math.floor(Math.random()*rows), c=Math.floor(Math.random()*cols);
      if(board[r][c].mine) continue;
      if(Math.abs(r-firstR)<=1 && Math.abs(c-firstC)<=1) continue;
      board[r][c].mine=true; placed++;
    }
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
      if(board[r][c].mine) continue;
      let cnt=0;
      for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){
        const nr=r+dr,nc=c+dc;
        if(nr>=0&&nr<rows&&nc>=0&&nc<cols&&board[nr][nc].mine) cnt++;
      }
      board[r][c].adj=cnt;
    }
  }
  function reveal(r,c){
    if(r<0||r>=rows||c<0||c>=cols) return;
    const cell = board[r][c];
    if(cell.revealed||cell.flag) return;
    cell.revealed=true; revealedCount++;
    if(cell.adj===0 && !cell.mine){
      for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++) if(dr||dc) reveal(r+dr,c+dc);
    }
  }
  function startTimer(){
    clearInterval(timer); seconds=0;
    timer = setInterval(()=>{ seconds++; document.getElementById('ms-time').innerHTML = `Time: <b>${seconds}s</b>`; },1000);
  }
  function checkWin(){
    const total = rows*cols;
    if(revealedCount === total-mines){
      won=true; gameOver=true; clearInterval(timer);
      const key = 'ms_best_'+difficulty;
      const best = Store.get(key, null);
      if(best===null || seconds<best) Store.set(key, seconds);
      if(difficulty==='easy') (typeof Achievements!=='undefined'&&Achievements.unlock('ms_win_easy'));
      if(difficulty==='hard') (typeof Achievements!=='undefined'&&Achievements.unlock('ms_win_hard'));
      renderMsg(`You win! ${seconds}s`);
    }
  }
  function renderMsg(t){ document.getElementById('ms-msg').textContent = t; }
  function render(){
    const el = document.getElementById('ms-board');
    // minmax(0, 26px) lets columns shrink below 26px when the board is
    // wider than the screen (16-col Hard mode is ~440px, wider than most
    // phones) instead of a fixed 26px track forcing the whole board to
    // overflow. .ms-cell drops its own fixed size on narrow screens (see
    // style.css) so cells can actually follow the track down.
    el.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 26px))`;
    el.innerHTML='';
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
      const cell = board[r][c];
      const div = document.createElement('div');
      div.className = 'ms-cell' + (cell.revealed?' revealed':'') + (cell.revealed&&cell.mine?' mine':'');
      if(cell.revealed){
        if(cell.mine) div.textContent='💣';
        else if(cell.adj>0){
          div.textContent = cell.adj;
          const palette=['','#50c8ff','#50ff50','#ff5050','#a050ff','#ff9f50','#50ffea','#fff','#aaa'];
          div.style.color = palette[cell.adj]||'#fff';
        }
      } else if(cell.flag){
        div.classList.add('flag'); div.textContent='🚩';
      }
      div.addEventListener('click', ()=>onLeftClick(r,c));
      div.addEventListener('contextmenu', (e)=>{ e.preventDefault(); onRightClick(r,c); });
      (function(){
        let lpTimer=null, lpFired=false;
        div.addEventListener('touchstart', ()=>{
          lpFired=false;
          lpTimer=setTimeout(()=>{ lpFired=true; if(navigator.vibrate) navigator.vibrate(15); onRightClick(r,c); }, 450);
        }, {passive:true});
        div.addEventListener('touchmove', ()=>{ clearTimeout(lpTimer); });
        div.addEventListener('touchend', (e)=>{
          clearTimeout(lpTimer);
          if(lpFired) e.preventDefault();
        });
      })();
      el.appendChild(div);
    }
    document.getElementById('ms-flags').innerHTML = `Flags: <b>${flags}/${mines}</b>`;
  }
  function neighborsOf(r,c){
    const list=[];
    for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){
      if(!dr&&!dc) continue;
      const nr=r+dr,nc=c+dc;
      if(nr>=0&&nr<rows&&nc>=0&&nc<cols) list.push([nr,nc]);
    }
    return list;
  }
  function chord(r,c){
    const cell = board[r][c];
    if(!cell.revealed || cell.adj===0) return;
    const neighbors = neighborsOf(r,c);
    const flaggedCount = neighbors.filter(([nr,nc])=>board[nr][nc].flag).length;
    if(flaggedCount !== cell.adj) return;
    for(const [nr,nc] of neighbors){
      if(gameOver) break;
      const n = board[nr][nc];
      if(n.flag || n.revealed) continue;
      if(n.mine){
        n.revealed=true; gameOver=true; clearInterval(timer);
        for(let rr=0;rr<rows;rr++)for(let cc=0;cc<cols;cc++) if(board[rr][cc].mine) board[rr][cc].revealed=true;
        renderMsg('Boom! Game over.');
      } else {
        reveal(nr,nc);
      }
    }
  }
  let firstClick=true;
  function onLeftClick(r,c){
    if(gameOver) return;
    const existing = board[r] && board[r][c];
    if(!firstClick && existing && existing.revealed){
      chord(r,c);
      render();
      checkWin();
      return;
    }
    if(firstClick){ buildBoard(r,c); firstClick=false; startTimer(); }
    const cell = board[r][c];
    if(cell.flag) return;
    if(cell.mine){
      cell.revealed=true; gameOver=true; clearInterval(timer);
      for(let rr=0;rr<rows;rr++)for(let cc=0;cc<cols;cc++) if(board[rr][cc].mine) board[rr][cc].revealed=true;
      renderMsg('Boom! Game over.');
      render();
      return;
    }
    reveal(r,c);
    render();
    checkWin();
  }
  function onRightClick(r,c){
    if(gameOver||firstClick) return;
    const cell = board[r][c];
    if(cell.revealed) return;
    cell.flag = !cell.flag;
    flags += cell.flag ? 1 : -1;
    render();
  }
  function newGame(){
    const d = DIFFS[difficulty];
    rows=d.rows; cols=d.cols; mines=d.mines;
    board = Array.from({length:rows},()=>Array.from({length:cols},()=>({mine:false,adj:0,revealed:false,flag:false})));
    revealedCount=0; flags=0; gameOver=false; won=false; firstClick=true;
    clearInterval(timer); seconds=0;
    document.getElementById('ms-time').innerHTML = `Time: <b>0s</b>`;
    renderMsg('Left click to reveal, right click (or long-press on touch) to flag, click a revealed number to chord. First click is always safe.');
    const best = Store.get('ms_best_'+difficulty, null);
    document.getElementById('ms-best').innerHTML = `Best: <b>${best===null?'-':best+'s'}</b>`;
    render();
  }
  function init(c){
    container = c;
    container.innerHTML = `
      <div class="hud">
        <div id="ms-time">Time: <b>0s</b></div>
        <div id="ms-flags">Flags: <b>0/0</b></div>
        <div id="ms-best">Best: <b>-</b></div>
      </div>
      <div style="margin-bottom:10px;">
        <select id="ms-diff" class="btn">
          <option value="easy">Easy 9x9</option>
          <option value="medium">Medium 13x13</option>
          <option value="hard">Hard 16x16</option>
        </select>
        <button class="btn" id="ms-new">New Game</button>
      </div>
      <div class="ms-board" id="ms-board"></div>
      <div class="msg" id="ms-msg"></div>
    `;
    document.getElementById('ms-diff').value = difficulty;
    document.getElementById('ms-diff').addEventListener('change', (e)=>{ difficulty = e.target.value; newGame(); });
    document.getElementById('ms-new').addEventListener('click', newGame);
    newGame();
  }
  function destroy(){ clearInterval(timer); }
  registerGame('minesweeper','Minesweeper','💣', true, {init, destroy}, ()=>{
    const b = Store.get('ms_best_easy', null);
    return b===null ? '' : `Best: ${b}s (easy)`;
  });
})();
