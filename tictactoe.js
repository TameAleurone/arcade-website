/* TIC TAC TOE (2-player hotseat) */
(function(){
  let container, board, turn, over;
  const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  function checkWinner(){
    for(const [a,b,c] of LINES){ if(board[a] && board[a]===board[b] && board[a]===board[c]) return board[a]; }
    if(board.every(v=>v)) return 'draw';
    return null;
  }
  function render(){
    const grid = document.getElementById('ttt-grid');
    grid.innerHTML='';
    board.forEach((v,i)=>{
      const cell = document.createElement('div');
      cell.className='cell';
      cell.textContent = v || '';
      cell.style.color = v==='X' ? '#50c8ff' : '#ff5050';
      cell.addEventListener('click', ()=>play(i));
      grid.appendChild(cell);
    });
  }
  function play(i){
    if(over || board[i]) return;
    board[i]=turn;
    const w = checkWinner();
    if(w){
      over=true;
      document.getElementById('ttt-msg').textContent = w==='draw' ? "It's a draw!" : `${w} wins!`;
    } else {
      turn = turn==='X'?'O':'X';
      document.getElementById('ttt-msg').textContent = `${turn}'s turn`;
    }
    render();
  }
  function newGame(){
    board = Array(9).fill(null); turn='X'; over=false;
    document.getElementById('ttt-msg').textContent = `${turn}'s turn`;
    render();
  }
  function init(c){
    container=c;
    container.innerHTML = `
      <div class="msg" id="ttt-msg"></div>
      <div class="grid-3" id="ttt-grid"></div>
      <div class="controls-hint">2-player hotseat &mdash; take turns clicking a square</div>
      <button class="btn" id="ttt-new">New Game</button>
    `;
    document.getElementById('ttt-new').addEventListener('click', newGame);
    newGame();
  }
  function destroy(){}
  registerGame('tictactoe','Tic Tac Toe','⭕', true, {init, destroy});
})();
