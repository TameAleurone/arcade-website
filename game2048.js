/* 2048 */
(function(){
  let board, score, best, over, won, container, keyHandler, size=4, undoState, undoAvailable, undoFlashTimer;
  const GRID_SIZES = {'4x4':4, '5x5':5, '6x6':6};

  function emptyBoard(n){ return Array.from({length:n},()=>Array(n).fill(0)); }
  function addRandom(){
    const empties=[];
    for(let r=0;r<size;r++)for(let c=0;c<size;c++) if(board[r][c]===0) empties.push([r,c]);
    if(!empties.length) return;
    const [r,c] = empties[Math.floor(Math.random()*empties.length)];
    board[r][c] = Math.random()<0.9 ? 2 : 4;
  }
  function slideRowLeft(row){
    let arr = row.filter(v=>v!==0);
    for(let i=0;i<arr.length-1;i++){
      if(arr[i]===arr[i+1]){ arr[i]*=2; score+=arr[i]; if(arr[i]===2048) won=true; arr.splice(i+1,1); }
    }
    while(arr.length<size) arr.push(0);
    return arr;
  }
  function rotateBoard(b){
    const n = b.length;
    const res = emptyBoard(n);
    for(let r=0;r<n;r++)for(let c=0;c<n;c++) res[c][n-1-r]=b[r][c];
    return res;
  }
  function move(dir){
    let moved=false;
    let b = board;
    let rotations = {left:0, up:1, right:2, down:3}[dir];
    for(let i=0;i<rotations;i++) b = rotateBoard(b);
    const scoreBefore = score;
    const newB = b.map(row=>{
      const before = row.join(',');
      const after = slideRowLeft(row);
      if(before !== after.join(',')) moved=true;
      return after;
    });
    let result = newB;
    for(let i=0;i<(4-rotations)%4;i++) result = rotateBoard(result);
    if(moved){
      undoState = {board: board.map(r=>r.slice()), score: scoreBefore};
      undoAvailable = true;
      board = result;
      addRandom();
      if(score>best){ best=score; Store.set('2048_best_'+size, best); }
      if(!canMove()) over=true;
    }
    render();
  }
  function undo(){
    if(!undoAvailable) return;
    board = undoState.board; score = undoState.score; over=false;
    undoAvailable = false;
    clearTimeout(undoFlashTimer);
    render();
  }
  function canMove(){
    for(let r=0;r<size;r++)for(let c=0;c<size;c++){
      if(board[r][c]===0) return true;
      if(c<size-1 && board[r][c]===board[r][c+1]) return true;
      if(r<size-1 && board[r][c]===board[r+1][c]) return true;
    }
    return false;
  }
  const colors = {0:'#20233a',2:'#3a3f5c',4:'#454b70',8:'#ff9f50',16:'#ff7f50',32:'#ff6347',64:'#ff4500',
                  128:'#ffd700',256:'#ffcc00',512:'#ffc800',1024:'#50ff9f',2048:'#50ffea'};
  function render(){
    const el = document.getElementById('g2048-board');
    el.style.gridTemplateColumns = `repeat(${size}, ${Math.floor(320/size)}px)`;
    el.style.gridTemplateRows = `repeat(${size}, ${Math.floor(320/size)}px)`;
    el.innerHTML='';
    for(let r=0;r<size;r++)for(let c=0;c<size;c++){
      const v = board[r][c];
      const tile = document.createElement('div');
      tile.className='g2048-tile';
      tile.style.background = colors[v] || '#50ffea';
      tile.style.color = v<=4 ? '#cfd3ee' : '#111';
      tile.style.fontSize = size>4 ? '1rem' : '1.4rem';
      tile.textContent = v===0?'':v;
      el.appendChild(tile);
    }
    document.getElementById('g2048-score').innerHTML = `Score: <b>${score}</b>`;
    document.getElementById('g2048-best').innerHTML = `Best: <b>${best}</b>`;
    const msg = document.getElementById('g2048-msg');
    msg.textContent = over ? 'Game Over — no more moves' : (won ? 'You made 2048! Keep going for a higher score.' : '');
    const undoBtn = document.getElementById('g2048-undo');
    if(undoBtn) undoBtn.disabled = !undoAvailable;
  }
  function newGame(){
    board = emptyBoard(size); score=0; over=false; won=false; undoAvailable=false; undoState=null;
    best = Store.get('2048_best_'+size, 0);
    addRandom(); addRandom();
    render();
  }
  function init(c){
    container = c;
    container.innerHTML = `
      <div style="margin-bottom:10px;">
        <select id="g2048-size" class="btn">
          ${Object.keys(GRID_SIZES).map(k=>`<option value="${k}">${k}</option>`).join('')}
        </select>
        <button class="btn" id="g2048-undo">↩ Undo</button>
        <button class="btn" id="g2048-new">New Game</button>
      </div>
      <div class="hud"><div id="g2048-score">Score: <b>0</b></div><div id="g2048-best">Best: <b>0</b></div></div>
      <div class="g2048-board" id="g2048-board"></div>
      <div class="msg" id="g2048-msg"></div>
      <div class="controls-hint">Arrow keys to slide tiles &bull; Undo reverts your last move (one step)</div>
    `;
    document.getElementById('g2048-size').value = Object.keys(GRID_SIZES).find(k=>GRID_SIZES[k]===size);
    document.getElementById('g2048-size').addEventListener('change', e=>{ size=GRID_SIZES[e.target.value]; newGame(); });
    document.getElementById('g2048-undo').addEventListener('click', undo);
    document.getElementById('g2048-new').addEventListener('click', newGame);
    keyHandler = function(e){
      const map={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down'};
      if(map[e.key] && !over){ move(map[e.key]); e.preventDefault(); }
      else if((e.key==='z'||e.key==='Z') && !e.ctrlKey && !e.metaKey){ undo(); }
    };
    document.addEventListener('keydown', keyHandler);
    newGame();
  }
  function destroy(){ document.removeEventListener('keydown', keyHandler); }
  registerGame('2048','2048','🔢', true, {init, destroy}, ()=>`Best: ${Store.get('2048_best_4',0)}`);
})();
