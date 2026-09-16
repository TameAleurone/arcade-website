/* TIC TAC TOE — hotseat + online multiplayer */
(function(){
  let container, board, turn, over, online=null, myMark=null;
  const LINES=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  function status(text){const e=document.getElementById('ttt-online-status');if(e)e.textContent=text;}
  function state(){return {board:[...board],turn,over};}
  function checkWinner(){for(const [a,b,c] of LINES)if(board[a]&&board[a]===board[b]&&board[a]===board[c])return board[a];if(board.every(Boolean))return 'draw';return null;}
  function render(){
    const grid=document.getElementById('ttt-grid'); if(!grid)return; grid.innerHTML='';
    board.forEach((v,i)=>{const cell=document.createElement('div');cell.className='cell';cell.textContent=v||'';cell.style.color=v==='X'?'#50c8ff':'#ff5050';cell.addEventListener('click',()=>play(i));grid.appendChild(cell);});
    const msg=document.getElementById('ttt-msg'); if(msg) msg.textContent=over?(checkWinner()==='draw'?"It's a draw!":`${checkWinner()} wins!`):`${turn}'s turn${online?' — online':''}`;
    const nb=document.getElementById('ttt-new'); if(nb) nb.disabled=!!online&&!ArcadeOnline.isHost();
  }
  function applyMove(i,fromNetwork=false){
    if(over||board[i])return false;
    board[i]=turn; const w=checkWinner();
    if(w)over=true; else turn=turn==='X'?'O':'X';
    render(); return true;
  }
  function play(i){
    if(over||board[i])return;
    if(online){
      if(!myMark||turn!==myMark)return;
      if(ArcadeOnline.isGuest()){ArcadeOnline.send({type:'move',i});return;}
      if(applyMove(i))ArcadeOnline.send({type:'state',state:state()});
      return;
    }
    applyMove(i);
  }
  function setState(s){board=[...s.board];turn=s.turn;over=s.over;render();}
  function newGame(){board=Array(9).fill(null);turn='X';over=false;render();if(online&&ArcadeOnline.isHost())ArcadeOnline.send({type:'state',state:state()});}
  function disconnect(){if(online)ArcadeOnline.close();online=null;myMark=null;status('Online room closed.');render();document.getElementById('ttt-setup').style.display='block';document.getElementById('ttt-online-game').style.display='none';}
  function showOnlineGame(){document.getElementById('ttt-setup').style.display='none';document.getElementById('ttt-online-game').style.display='block';}
  async function host(){
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
        onClose:()=>{status('Opponent disconnected.');online=null;myMark='X';render();}
      });
      document.getElementById('ttt-room').textContent=code;
      status('Share this room code with your friend. Waiting…');
    }catch(e){
      online=null;
      status(e && e.message ? e.message : 'Could not create room. Try again.');
      console.error(e);
    }
  }
  async function join(){
    const code=document.getElementById('ttt-room-input').value.trim();
    if(!code)return status('Enter a room code first.');
    online=true;
    showOnlineGame(); myMark='O';
    document.getElementById('ttt-room').textContent=code;
    status('Joining room…');
    try{
      await ArcadeOnline.join(code,{
        onConnect:()=>status('Connected! You are O.'),
        onMessage:m=>{if(m.type==='state')setState(m.state);},
        onClose:()=>{status('Host disconnected.');online=null;myMark=null;render();}
      });
    }catch(e){
      online=null;
      status(e && e.message ? e.message : 'Could not join that room. Check the code.');
      console.error(e);
    }
  }
  function destroy(){if(online)ArcadeOnline.close();}
  function init(c){
    container=c;
    container.innerHTML = `
      <div id="ttt-setup" class="online-panel">
        <h3>Play online <span class="online-badge">ONLINE</span></h3>
        <p>One player hosts a room (plays X) and the other joins from any device (plays O).</p>
        <div class="online-row">
          <button class="btn primary" id="ttt-host">Create Room</button>
          <input class="online-input" id="ttt-room-input" maxlength="20" placeholder="Room code">
          <button class="btn" id="ttt-join">Join Room</button>
        </div>
        <div class="online-status" id="ttt-online-status">You can still play hotseat below.</div>
      </div>
      <div id="ttt-online-game" class="online-panel" style="display:none">
        <h3>Online Room</h3>
        <p>Room code: <span class="room-code" id="ttt-room">—</span></p>
        <button class="btn" id="ttt-leave">Leave Room</button>
      </div>
      <div class="msg" id="ttt-msg"></div>
      <div class="grid-3" id="ttt-grid"></div>
      <div class="controls-hint">Online players take turns from their own devices. Hotseat also works locally.</div>
      <button class="btn" id="ttt-new">New Game</button>
    `;
    document.getElementById('ttt-host').onclick = host;
    document.getElementById('ttt-join').onclick = join;
    document.getElementById('ttt-leave').onclick = disconnect;
    document.getElementById('ttt-new').onclick = newGame;
    newGame();
  }
  registerGame('tictactoe','Tic Tac Toe','⭕',true,{init,destroy});
})();
