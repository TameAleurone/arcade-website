/* CONNECT FOUR — hotseat, AI (Easy/Hard), and online multiplayer */
(function(){
  let container,board,turn,over,online=null,myPlayer=null;const ROWS=6,COLS=7;
  let mode='hotseat'; // 'hotseat' | 'ai' | 'online'
  let aiDifficulty='hard'; // 'easy' | 'hard'
  const AI_PLAYER=2, HUMAN_PLAYER=1;
  let aiTimer=null;
  function state(){return {board:board.map(r=>[...r]),turn,over};}
  function status(t){document.querySelectorAll('.c4-online-status').forEach(e=>e.textContent=t);}
  function checkWinOn(bd,r,c){const dirs=[[0,1],[1,0],[1,1],[1,-1]],v=bd[r][c];for(const[dr,dc]of dirs){let n=1;for(let s=1;s<4;s++){let nr=r+dr*s,nc=c+dc*s;if(nr<0||nr>=ROWS||nc<0||nc>=COLS||bd[nr][nc]!==v)break;n++;}for(let s=1;s<4;s++){let nr=r-dr*s,nc=c-dc*s;if(nr<0||nr>=ROWS||nc<0||nc>=COLS||bd[nr][nc]!==v)break;n++;}if(n>=4)return true;}return false;}
  function checkWin(r,c){return checkWinOn(board,r,c);}

  function validCols(bd){const cols=[];for(let c=0;c<COLS;c++)if(!bd[0][c])cols.push(c);return cols;}
  function dropRow(bd,c){for(let r=ROWS-1;r>=0;r--)if(!bd[r][c])return r;return -1;}
  function cloneBoard(bd){return bd.map(r=>[...r]);}
  function orderColumns(cols){const center=Math.floor(COLS/2);return cols.slice().sort((a,b)=>Math.abs(a-center)-Math.abs(b-center));}
  function scoreWindow(win, piece){
    const opp = piece===1?2:1;
    const pieceCount = win.filter(v=>v===piece).length;
    const oppCount = win.filter(v=>v===opp).length;
    const emptyCount = win.filter(v=>v===null).length;
    let score=0;
    if(pieceCount===4) score+=100;
    else if(pieceCount===3 && emptyCount===1) score+=5;
    else if(pieceCount===2 && emptyCount===2) score+=2;
    if(oppCount===3 && emptyCount===1) score-=4;
    return score;
  }
  function evaluateBoard(bd, piece){
    let score=0;
    const centerCol=Math.floor(COLS/2);
    for(let r=0;r<ROWS;r++) if(bd[r][centerCol]===piece) score+=3;
    for(let r=0;r<ROWS;r++) for(let c=0;c<=COLS-4;c++) score+=scoreWindow([bd[r][c],bd[r][c+1],bd[r][c+2],bd[r][c+3]], piece);
    for(let c=0;c<COLS;c++) for(let r=0;r<=ROWS-4;r++) score+=scoreWindow([bd[r][c],bd[r+1][c],bd[r+2][c],bd[r+3][c]], piece);
    for(let r=0;r<=ROWS-4;r++) for(let c=0;c<=COLS-4;c++) score+=scoreWindow([bd[r][c],bd[r+1][c+1],bd[r+2][c+2],bd[r+3][c+3]], piece);
    for(let r=3;r<ROWS;r++) for(let c=0;c<=COLS-4;c++) score+=scoreWindow([bd[r][c],bd[r-1][c+1],bd[r-2][c+2],bd[r-3][c+3]], piece);
    return score;
  }
  function findWinner(bd){
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) if(bd[r][c] && checkWinOn(bd,r,c)) return bd[r][c];
    return null;
  }
  function c4Minimax(bd, depth, alpha, beta, maximizing, aiPiece, humanPiece){
    const cols = orderColumns(validCols(bd));
    const winner = findWinner(bd);
    if(winner || cols.length===0 || depth===0){
      if(winner===aiPiece) return {score: 1000000 + depth, col:null};
      if(winner===humanPiece) return {score: -1000000 - depth, col:null};
      if(cols.length===0) return {score:0, col:null};
      return {score: evaluateBoard(bd, aiPiece), col:null};
    }
    let bestCol = cols[0];
    if(maximizing){
      let value=-Infinity;
      for(const c of cols){
        const row=dropRow(bd,c);
        const clone=cloneBoard(bd); clone[row][c]=aiPiece;
        const res=c4Minimax(clone, depth-1, alpha, beta, false, aiPiece, humanPiece);
        if(res.score>value){ value=res.score; bestCol=c; }
        alpha=Math.max(alpha,value);
        if(alpha>=beta) break;
      }
      return {score:value, col:bestCol};
    } else {
      let value=Infinity;
      for(const c of cols){
        const row=dropRow(bd,c);
        const clone=cloneBoard(bd); clone[row][c]=humanPiece;
        const res=c4Minimax(clone, depth-1, alpha, beta, true, aiPiece, humanPiece);
        if(res.score<value){ value=res.score; bestCol=c; }
        beta=Math.min(beta,value);
        if(alpha>=beta) break;
      }
      return {score:value, col:bestCol};
    }
  }
  function c4PickMove(){
    const depth = aiDifficulty==='easy' ? 2 : 6;
    const res = c4Minimax(board, depth, -Infinity, Infinity, true, AI_PLAYER, HUMAN_PLAYER);
    if(res.col!==null && res.col!==undefined) return res.col;
    const cols = validCols(board);
    return cols[Math.floor(Math.random()*cols.length)];
  }
  function maybeTriggerAi(){
    if(mode!=='ai' || over || turn!==AI_PLAYER) return;
    clearTimeout(aiTimer);
    aiTimer=setTimeout(()=>{
      if(over || turn!==AI_PLAYER) return;
      const c = c4PickMove();
      if(c!==undefined) doDrop(c);
    }, 350);
  }

  function render(){const el=document.getElementById('c4-board');if(!el)return;el.innerHTML='';for(let c=0;c<COLS;c++){const col=document.createElement('button');col.type='button';col.className='c4-col';col.setAttribute('aria-label',`Drop in column ${c+1}`);col.disabled = mode==='ai' && turn===AI_PLAYER && !over;col.onclick=()=>drop(c);for(let r=0;r<ROWS;r++){const cell=document.createElement('span');cell.className='c4-cell'+(board[r][c]===1?' p1':board[r][c]===2?' p2':'');col.appendChild(cell);}el.appendChild(col);}
    const msg=document.getElementById('c4-msg');
    if(msg){
      if(over) msg.textContent = over==='draw' ? "It's a draw!" : (mode==='ai' ? (over===HUMAN_PLAYER?'You win!':'AI wins!') : `Player ${over} wins!`);
      else if(mode==='ai' && turn===AI_PLAYER) msg.textContent='AI is thinking…';
      else msg.textContent = mode==='ai' ? "Your turn" : `Player ${turn}'s turn${online?' — online':''}`;
    }
    const nb=document.getElementById('c4-new');if(nb)nb.disabled=!!online&&!ArcadeOnline.isHost();
    document.querySelectorAll('.c4-mode-btn').forEach(b=>b.setAttribute('aria-pressed', String(b.dataset.mode===mode && (b.dataset.mode!=='ai' || b.dataset.diff===aiDifficulty))));
  }
  function drop(c){
    if(over)return;
    if(mode==='ai'){ if(turn!==HUMAN_PLAYER)return; if(doDrop(c)) maybeTriggerAi(); return; }
    let row=-1;for(let r=ROWS-1;r>=0;r--)if(!board[r][c]){row=r;break;}if(row<0)return;
    if(online){if(turn!==myPlayer)return;if(ArcadeOnline.isGuest()){ArcadeOnline.send({type:'move',c});return;}if(doDrop(c))ArcadeOnline.send({type:'state',state:state()});return;}
    doDrop(c);
  }
  function doDrop(c){
    let row=-1;for(let r=ROWS-1;r>=0;r--)if(!board[r][c]){row=r;break;}if(row<0)return false;
    board[row][c]=turn;
    if(checkWin(row,c)){
      over=turn;
      const humanWon = mode==='ai' ? turn===HUMAN_PLAYER : true;
      if(humanWon){
        (typeof Achievements!=='undefined'&&Achievements.unlock('connect_four_win'));
        if(mode==='ai' && aiDifficulty==='hard') (typeof Achievements!=='undefined'&&Achievements.unlock('connect_four_beat_hard_ai'));
      }
    } else if(board.every(r=>r.every(Boolean))) over='draw';
    else turn=turn===1?2:1;
    render();
    return true;
  }
  function setState(s){board=s.board.map(r=>[...r]);turn=s.turn;over=s.over;render();}
  function newGame(){
    clearTimeout(aiTimer);
    board=Array.from({length:ROWS},()=>Array(COLS).fill(null));turn=1;over=false;render();
    if(online&&ArcadeOnline.isHost())ArcadeOnline.send({type:'state',state:state()});
    maybeTriggerAi();
  }
  function setMode(newMode, difficulty){
    clearTimeout(aiTimer);
    if(online){ ArcadeOnline.close(); online=null; myPlayer=null; }
    mode=newMode;
    if(difficulty) aiDifficulty=difficulty;
    document.getElementById('c4-setup').style.display = mode==='online' ? 'block' : 'none';
    document.getElementById('c4-online-game').style.display='none';
    if(mode!=='online') status('');
    newGame();
  }
  function disconnect(){if(online)ArcadeOnline.close();online=null;myPlayer=null;status('Online room closed.');document.getElementById('c4-setup').style.display='block';document.getElementById('c4-online-game').style.display='none';render();}
  function showOnline(){document.getElementById('c4-setup').style.display='none';document.getElementById('c4-online-game').style.display='block';}
  async function host(){mode='online';const hostBtn=document.getElementById('c4-host');if(hostBtn)hostBtn.disabled=true;showOnline();myPlayer=1;online=true;status('Creating room…');try{const code=await ArcadeOnline.host({onConnect:()=>{status('Opponent connected! You are Player 1.');newGame();},onMessage:m=>{if(m.type==='move'&&ArcadeOnline.isHost()){if(turn===2&&doDrop(m.c))ArcadeOnline.send({type:'state',state:state()});}},onClose:()=>status('Opponent disconnected.'),onReconnecting:()=>status('Connection dropped — reconnecting…'),onReconnected:()=>status('Reconnected.')});online=true;document.getElementById('c4-room').textContent=code;status('Share this room code. Waiting for Player 2…');}catch(e){console.error('[Connect Four online host]',e);status(e&&e.message?e.message:'Could not create room.');if(hostBtn)hostBtn.disabled=false;}}
  async function join(){mode='online';const joinBtn=document.getElementById('c4-join');if(joinBtn)joinBtn.disabled=true;online=true;const code=document.getElementById('c4-room-input').value.trim();if(!code){if(joinBtn)joinBtn.disabled=false;return status('Enter a room code first.');}showOnline();myPlayer=2;status('Joining room…');try{await ArcadeOnline.join(code,{onConnect:()=>status('Connected! You are Player 2.'),onMessage:m=>{if(m.type==='state')setState(m.state);},onClose:()=>status('Host disconnected.'),onReconnecting:()=>status('Connection dropped — reconnecting…'),onReconnected:()=>status('Reconnected.')});online=true;status('Connected! You are Player 2.');}catch(e){console.error('[Connect Four online join]',e);status(e&&e.message?e.message:'Could not join that room. Check the code.');online=null;if(joinBtn)joinBtn.disabled=false;}}
  function init(c){
    container=c;
    container.innerHTML=`
      <div class="mode-row" style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:10px;">
        <button class="btn c4-mode-btn" id="c4-mode-hotseat" data-mode="hotseat">2 Player (Hotseat)</button>
        <button class="btn c4-mode-btn" id="c4-mode-ai-easy" data-mode="ai" data-diff="easy">vs AI (Easy)</button>
        <button class="btn c4-mode-btn" id="c4-mode-ai-hard" data-mode="ai" data-diff="hard">vs AI (Hard)</button>
        <button class="btn c4-mode-btn" id="c4-mode-online" data-mode="online">Online</button>
      </div>
      <div id="c4-setup" class="online-panel" style="display:none"><h3>Play Connect Four online <span class="online-badge">ONLINE</span></h3><p>Share a room code with a friend to play from different devices.</p><div class="online-row"><button class="btn primary" id="c4-host">Create Room</button><input class="online-input" id="c4-room-input" maxlength="20" placeholder="Room code"><button class="btn" id="c4-join">Join Room</button></div><div class="online-status c4-online-status" id="c4-online-status"></div></div>
      <div id="c4-online-game" class="online-panel" style="display:none"><h3>Online Room</h3><p>Room code: <span class="room-code" id="c4-room">—</span></p><div class="online-status c4-online-status"></div><button class="btn" id="c4-leave">Leave Room</button></div>
      <div class="msg" id="c4-msg"></div>
      <div class="c4-board" id="c4-board"></div>
      <div class="controls-hint">You're Player 1 (red), first to move. Switch modes any time with the buttons above.</div>
      <button class="btn" id="c4-new">New Game</button>`;
    document.getElementById('c4-host').onclick=host;
    document.getElementById('c4-join').onclick=join;
    document.getElementById('c4-leave').onclick=disconnect;
    document.getElementById('c4-new').onclick=newGame;
    document.getElementById('c4-mode-hotseat').onclick=()=>setMode('hotseat');
    document.getElementById('c4-mode-ai-easy').onclick=()=>setMode('ai','easy');
    document.getElementById('c4-mode-ai-hard').onclick=()=>setMode('ai','hard');
    document.getElementById('c4-mode-online').onclick=()=>{ mode='online'; document.getElementById('c4-setup').style.display='block'; document.getElementById('c4-online-game').style.display='none'; render(); };
    mode='hotseat';
    newGame();
  }
  function destroy(){clearTimeout(aiTimer);if(online)ArcadeOnline.close();}
  registerGame('connect_four','Connect Four','🔴',true,{init,destroy});
})();
