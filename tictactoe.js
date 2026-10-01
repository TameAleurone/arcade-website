/* TIC TAC TOE — hotseat, AI (Easy/Hard), and online multiplayer */
(function(){
  let container, board, turn, over, online=null, myMark=null;
  let mode='hotseat'; // 'hotseat' | 'ai' | 'online'
  let aiDifficulty='hard'; // 'easy' | 'hard'
  let aiMark='O', humanMark='X';
  let aiTimer=null;
  const LINES=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  function status(text){document.querySelectorAll('.ttt-online-status').forEach(e=>e.textContent=text);}
  function state(){return {board:[...board],turn,over};}
  function checkWinnerOf(bd){for(const [a,b,c] of LINES)if(bd[a]&&bd[a]===bd[b]&&bd[a]===bd[c])return bd[a];if(bd.every(Boolean))return 'draw';return null;}
  function checkWinner(){return checkWinnerOf(board);}
  // Full minimax over the 9-cell board — small enough to search exhaustively,
  // so "Hard" is provably unbeatable (perfect-vs-perfect always draws).
  function ttcMinimax(bd, isMaximizing){
    const winner = checkWinnerOf(bd);
    if(winner===aiMark) return 10;
    if(winner===humanMark) return -10;
    if(winner==='draw') return 0;
    let best = isMaximizing ? -Infinity : Infinity;
    for(let i=0;i<9;i++){
      if(bd[i]) continue;
      bd[i] = isMaximizing ? aiMark : humanMark;
      const score = ttcMinimax(bd, !isMaximizing);
      bd[i] = null;
      best = isMaximizing ? Math.max(best,score) : Math.min(best,score);
    }
    return best;
  }
  function ttcBestMove(bd){
    let best=-Infinity, bestMoves=[];
    for(let i=0;i<9;i++){
      if(bd[i]) continue;
      bd[i]=aiMark;
      const score = ttcMinimax(bd, false);
      bd[i]=null;
      if(score>best){ best=score; bestMoves=[i]; }
      else if(score===best) bestMoves.push(i);
    }
    return bestMoves[Math.floor(Math.random()*bestMoves.length)];
  }
  function ttcRandomMove(bd){
    const open = []; for(let i=0;i<9;i++) if(!bd[i]) open.push(i);
    return open[Math.floor(Math.random()*open.length)];
  }
  function ttcAiMove(){
    // Easy plays randomly; Hard plays perfectly (full minimax search).
    return aiDifficulty==='easy' ? ttcRandomMove(board) : ttcBestMove(board);
  }
  function render(){
    const grid=document.getElementById('ttt-grid'); if(!grid)return; grid.innerHTML='';
    board.forEach((v,i)=>{const cell=document.createElement('button');cell.type='button';cell.className='cell';cell.textContent=v||'';cell.setAttribute('aria-label', v ? `Square ${i+1}: ${v}` : `Empty square ${i+1}`);cell.style.color=v==='X'?'#50c8ff':'#ff5050';cell.disabled = mode==='ai' && turn===aiMark && !over;cell.addEventListener('click',()=>play(i));grid.appendChild(cell);});
    const msg=document.getElementById('ttt-msg');
    if(msg){
      if(over){
        const w = checkWinner();
        msg.textContent = w==='draw' ? "It's a draw!" : `${w} wins!`;
      } else if(mode==='ai' && turn===aiMark){
        msg.textContent = 'AI is thinking…';
      } else {
        msg.textContent = `${turn}'s turn${online?' — online':(mode==='ai'?' (you)':'')}`;
      }
    }
    const nb=document.getElementById('ttt-new'); if(nb) nb.disabled=!!online&&!ArcadeOnline.isHost();
    document.querySelectorAll('.ttt-mode-btn').forEach(b=>b.setAttribute('aria-pressed', String(b.dataset.mode===mode && (b.dataset.mode!=='ai' || b.dataset.diff===aiDifficulty))));
  }
  function applyMove(i){
    if(over||board[i])return false;
    board[i]=turn; const w=checkWinner();
    if(w){
      over=true;
      if(w!=='draw'){
        const humanWon = mode==='ai' ? w===humanMark : true;
        if(humanWon) (typeof Achievements!=='undefined'&&Achievements.unlock('tictactoe_win'));
      } else if(mode==='ai' && aiDifficulty==='hard'){
        // Hard plays a full minimax search, so it's provably unbeatable —
        // a draw against it is the best any human can do, and only
        // happens with perfect play on the human's side too.
        (typeof Achievements!=='undefined'&&Achievements.unlock('tictactoe_draw_hard_ai'));
      }
    } else turn=turn==='X'?'O':'X';
    render();
    return true;
  }
  function maybeTriggerAi(){
    if(mode!=='ai' || over || turn!==aiMark) return;
    clearTimeout(aiTimer);
    aiTimer=setTimeout(()=>{
      if(over || turn!==aiMark) return;
      const i = ttcAiMove();
      if(i!==undefined) applyMove(i);
      maybeTriggerAi();
    }, 350);
  }
  function play(i){
    if(over||board[i])return;
    if(mode==='ai'){
      if(turn!==humanMark)return;
      applyMove(i);
      maybeTriggerAi();
      return;
    }
    if(online){
      if(!myMark||turn!==myMark)return;
      if(ArcadeOnline.isGuest()){ArcadeOnline.send({type:'move',i});return;}
      if(applyMove(i))ArcadeOnline.send({type:'state',state:state()});
      return;
    }
    applyMove(i);
  }
  function setState(s){board=[...s.board];turn=s.turn;over=s.over;render();}
  function newGame(){
    clearTimeout(aiTimer);
    board=Array(9).fill(null);turn='X';over=false;render();
    if(online&&ArcadeOnline.isHost())ArcadeOnline.send({type:'state',state:state()});
    maybeTriggerAi();
  }
  function setMode(newMode, difficulty){
    clearTimeout(aiTimer);
    if(online){ ArcadeOnline.close(); online=null; myMark=null; }
    mode=newMode;
    if(difficulty) aiDifficulty=difficulty;
    document.getElementById('ttt-setup').style.display = mode==='online' ? 'block' : 'none';
    document.getElementById('ttt-online-game').style.display='none';
    if(mode!=='online') status('');
    newGame();
  }
  function disconnect(){if(online)ArcadeOnline.close();online=null;myMark=null;status('Online room closed.');render();document.getElementById('ttt-setup').style.display='block';document.getElementById('ttt-online-game').style.display='none';}
  function showOnlineGame(){document.getElementById('ttt-setup').style.display='none';document.getElementById('ttt-online-game').style.display='block';}
  async function host(){
    mode='online';
    const hostBtn=document.getElementById('ttt-host'); if(hostBtn) hostBtn.disabled=true;
    online=true;
    showOnlineGame(); myMark='X'; status('Creating room…');
    try{
      const code=await ArcadeOnline.host({
        onConnect:()=>{status('Opponent connected! You are X.');newGame();},
        onMessage:m=>{
          if(m.type==='move'&&ArcadeOnline.isHost()){
            if(turn==='O'&&applyMove(m.i)) ArcadeOnline.send({type:'state',state:state()});
          }
        },
        onClose:()=>{status('Opponent disconnected.');render();},
        onReconnecting:()=>status('Connection dropped — reconnecting…'),
        onReconnected:()=>status('Reconnected. Waiting for your opponent…')
      });
      document.getElementById('ttt-room').textContent=code;
      status('Share this room code with your friend. Waiting…');
    }catch(e){
      online=null;
      status(e && e.message ? e.message : 'Could not create room. Try again.');
      console.error(e);
      if(hostBtn) hostBtn.disabled=false;
    }
  }
  async function join(){
    const code=document.getElementById('ttt-room-input').value.trim();
    if(!code)return status('Enter a room code first.');
    mode='online';
    const joinBtn=document.getElementById('ttt-join'); if(joinBtn) joinBtn.disabled=true;
    online=true;
    showOnlineGame(); myMark='O';
    document.getElementById('ttt-room').textContent=code;
    status('Joining room…');
    try{
      await ArcadeOnline.join(code,{
        onConnect:()=>status('Connected! You are O.'),
        onMessage:m=>{if(m.type==='state')setState(m.state);},
        onClose:()=>{status('Host disconnected.');render();},
        onReconnecting:()=>status('Connection dropped — reconnecting…'),
        onReconnected:()=>status('Reconnected!')
      });
      // The server only tells the HOST when a peer connects (onConnect,
      // above) — the guest's own confirmation is this promise resolving,
      // so update the guest's status here rather than waiting on a message
      // that's never sent to them.
      status('Connected! You are O.');
    }catch(e){
      online=null;
      status(e && e.message ? e.message : 'Could not join that room. Check the code.');
      console.error(e);
      if(joinBtn) joinBtn.disabled=false;
    }
  }
  function destroy(){clearTimeout(aiTimer);if(online)ArcadeOnline.close();}
  function init(c){
    container=c;
    container.innerHTML = `
      <div class="mode-row" style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:10px;">
        <button class="btn ttt-mode-btn" id="ttt-mode-hotseat" data-mode="hotseat">2 Player (Hotseat)</button>
        <button class="btn ttt-mode-btn" id="ttt-mode-ai-easy" data-mode="ai" data-diff="easy">vs AI (Easy)</button>
        <button class="btn ttt-mode-btn" id="ttt-mode-ai-hard" data-mode="ai" data-diff="hard">vs AI (Hard)</button>
        <button class="btn ttt-mode-btn" id="ttt-mode-online" data-mode="online">Online</button>
      </div>
      <div id="ttt-setup" class="online-panel" style="display:none">
        <h3>Play online <span class="online-badge">ONLINE</span></h3>
        <p>One player hosts a room (plays X) and the other joins from any device (plays O).</p>
        <div class="online-row">
          <button class="btn primary" id="ttt-host">Create Room</button>
          <input class="online-input" id="ttt-room-input" maxlength="20" placeholder="Room code">
          <button class="btn" id="ttt-join">Join Room</button>
        </div>
        <div class="online-status ttt-online-status" id="ttt-online-status"></div>
      </div>
      <div id="ttt-online-game" class="online-panel" style="display:none">
        <h3>Online Room</h3>
        <p>Room code: <span class="room-code" id="ttt-room">—</span></p>
        <div class="online-status ttt-online-status"></div>
        <button class="btn" id="ttt-leave">Leave Room</button>
      </div>
      <div class="msg" id="ttt-msg"></div>
      <div class="grid-3" id="ttt-grid"></div>
      <div class="controls-hint">You're X, first to move. Switch modes any time with the buttons above.</div>
      <button class="btn" id="ttt-new">New Game</button>
    `;
    document.getElementById('ttt-host').onclick = host;
    document.getElementById('ttt-join').onclick = join;
    document.getElementById('ttt-leave').onclick = disconnect;
    document.getElementById('ttt-new').onclick = newGame;
    document.getElementById('ttt-mode-hotseat').onclick = ()=>setMode('hotseat');
    document.getElementById('ttt-mode-ai-easy').onclick = ()=>setMode('ai','easy');
    document.getElementById('ttt-mode-ai-hard').onclick = ()=>setMode('ai','hard');
    document.getElementById('ttt-mode-online').onclick = ()=>{ mode='online'; document.getElementById('ttt-setup').style.display='block'; document.getElementById('ttt-online-game').style.display='none'; render(); };
    mode='hotseat';
    newGame();
  }
  registerGame('tictactoe','Tic Tac Toe','⭕',true,{init,destroy});
})();
