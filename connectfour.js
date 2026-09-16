/* CONNECT FOUR (2-player hotseat) */
(function(){
  let container, board, turn, over, ROWS=6, COLS=7;
  function newGame(){
    board = Array.from({length:ROWS},()=>Array(COLS).fill(null));
    turn=1; over=false;
    document.getElementById('c4-msg').textContent = `Player 1's turn (red)`;
    render();
  }
  function drop(col){
    if(over) return;
    let row=-1;
    for(let r=ROWS-1;r>=0;r--){ if(!board[r][col]){ row=r; break; } }
    if(row===-1) return;
    board[row][col]=turn;
    if(checkWin(row,col)){
      over=true;
      document.getElementById('c4-msg').textContent = `Player ${turn} wins!`;
    } else if(board.every(r=>r.every(v=>v))){
      over=true;
      document.getElementById('c4-msg').textContent = `It's a draw!`;
    } else {
      turn = turn===1?2:1;
      document.getElementById('c4-msg').textContent = `Player ${turn}'s turn (${turn===1?'red':'yellow'})`;
    }
    render();
  }
  function checkWin(r,c){
    const dirs = [[0,1],[1,0],[1,1],[1,-1]];
    const val = board[r][c];
    for(const [dr,dc] of dirs){
      let count=1;
      for(let s=1;s<4;s++){ const nr=r+dr*s, nc=c+dc*s; if(nr>=0&&nr<ROWS&&nc>=0&&nc<COLS&&board[nr][nc]===val) count++; else break; }
      for(let s=1;s<4;s++){ const nr=r-dr*s, nc=c-dc*s; if(nr>=0&&nr<ROWS&&nc>=0&&nc<COLS&&board[nr][nc]===val) count++; else break; }
      if(count>=4) return true;
    }
    return false;
  }
  function render(){
    const el = document.getElementById('c4-board');
    el.innerHTML='';
    for(let c=0;c<COLS;c++){
      const colDiv = document.createElement('div');
      colDiv.className='c4-col';
      colDiv.addEventListener('click', ()=>drop(c));
      for(let r=0;r<ROWS;r++){
        const cell = document.createElement('div');
        cell.className='c4-cell' + (board[r][c]===1?' p1':board[r][c]===2?' p2':'');
        colDiv.appendChild(cell);
      }
      el.appendChild(colDiv);
    }
  }
  function init(c){
    container=c;
    container.innerHTML = `
      <div class="msg" id="c4-msg"></div>
      <div class="c4-board" id="c4-board"></div>
      <div class="controls-hint">2-player hotseat &mdash; click a column to drop your piece</div>
      <button class="btn" id="c4-new">New Game</button>
    `;
    document.getElementById('c4-new').addEventListener('click', newGame);
    newGame();
  }
  function destroy(){}
  registerGame('connect_four','Connect Four','🔴', true, {init, destroy});
})();
