/* GENERIC CHESS VARIANT UI (used by all chess games) */

/* Shared helper: maps an engine piece code (e.g. 'wP','bK') to an asset image path. */
function chessPieceImg(piece){
  if(!piece) return '';
  const color = piece[0], type = piece[1].toLowerCase();
  return color==='w' ? `${type}.png` : `d_${type}.png`;
}

function createChessVariant(variant, displayName){
  let container, state, selected, legalTargets, mode, aiColor, aiDepth, pendingPromotion, diceValues, diceRemaining, movesLeftThisTurn, spellMode, aiThinking, handoverPending, onlineRole, myColor;
  let undoStack=[];
  let redoStack=[];
  // Online state sequencing: the host is authoritative. If the guest misses
  // a state packet, it asks for the latest full state instead of remaining
  // stuck on an old board.
  let onlineStateSeq=0;
  let lastOnlineStateSeq=0;
  let onlineGameId=null;
  let syncRequestPending=false;
  let onlineSyncWatchdog=null;
  let lastOnlineStateAt=0;
  let orientation='w';

  function pieceSquareEl(r,c){ return container.querySelector(`[data-r="${r}"][data-c="${c}"]`); }

  /* --- Online multiplayer (host is always White, guest is always Black).
     Host holds the authoritative state: any state-changing action taken
     locally by the host (or received as a validated request from the
     guest) mutates `state` and is broadcast in full to the guest. The
     guest never mutates `state` itself — its clicks are sent to the host
     as requests, and its board is simply redrawn from whatever the host
     last broadcast. This avoids any risk of the two sides drifting apart
     (e.g. Dice Chess rolls, which use Math.random and must only ever run
     on one authoritative side). */
  function onlineStatus(text){ const e=container && container.querySelector('#chess-online-status'); if(e) e.textContent=text; }
  function sendOnline(msg){ if(window.ArcadeOnline && ArcadeOnline.connected()) ArcadeOnline.send(msg); }
  function fullSyncPayload(){ return {state, diceValues, diceRemaining, movesLeftThisTurn}; }
  function broadcastOnlineState(){
    if(mode==='online' && onlineRole==='host' && ArcadeOnline && ArcadeOnline.connected()){
      onlineStateSeq++;
      sendOnline({type:'state', gameId:onlineGameId, seq:onlineStateSeq, payload:fullSyncPayload()});
    }
  }
  function requestOnlineSync(){
    if(mode==='online' && onlineRole==='guest' && ArcadeOnline && ArcadeOnline.connected() && !syncRequestPending){
      syncRequestPending=true;
      sendOnline({type:'requestSync', lastSeq:lastOnlineStateSeq});
      setTimeout(()=>{ syncRequestPending=false; }, 1000);
    }
  }
  function startOnlineSyncWatchdog(){
    if(onlineSyncWatchdog) clearInterval(onlineSyncWatchdog);
    lastOnlineStateAt=Date.now();
    onlineSyncWatchdog=setInterval(()=>{
      if(mode!=='online' || onlineRole!=='guest' || !ArcadeOnline || !ArcadeOnline.connected()) return;
      // Two different things can leave the guest stuck, and both need the
      // same fix (ask the host to resend its state):
      //  - `state` is still null: the very first broadcast after joining
      //    never arrived (dropped WS message, or a JSONP race where the
      //    host's broadcast fired before the guest's poll loop was up).
      //    The board area just stays empty forever — this is the "Black's
      //    board never loads" case, and the old `state && ...` guard below
      //    meant the watchdog could never fire to recover from it.
      //  - `state` exists but is stuck showing White's turn: a later
      //    packet got dropped mid-game.
      const stuckWithNoStateYet = !state;
      const stuckMidGame = state && state.turn==='w';
      if((stuckWithNoStateYet || stuckMidGame) && Date.now()-lastOnlineStateAt>2500) requestOnlineSync();
    }, 1000);
  }
  function applyFullSync(p){
    mode='online';
    state = p.state; diceValues = p.diceValues; diceRemaining = p.diceRemaining; movesLeftThisTurn = p.movesLeftThisTurn;
    selected=null; legalTargets=[]; pendingPromotion=null; spellMode=null; aiThinking=false; handoverPending=false;
    render();
  }
  function showOnlinePlay(){
    const setupMsg = container.querySelector('#chess-setup-msg');
    if(setupMsg) setupMsg.style.display='none';
    container.querySelectorAll('#ai-difficulty,#mode-ai-white,#mode-ai-black,#mode-2p').forEach(b=>b.style.display='none');
    const onlinePanel = container.querySelector('#chess-online-panel');
    if(onlinePanel) onlinePanel.style.display='none';
    container.querySelector('#chess-play-area').style.display='block';
  }
  async function onlineHost(){
    onlineRole='host'; myColor='w';
    container.querySelector('#chess-online-room').style.display='block';
    onlineStatus('Creating room…');
    try{
      const code = await ArcadeOnline.host({
        // The server sends this exact same 'peer-connected' signal both the
        // first time a guest joins AND every time a guest's connection drops
        // and reconnects mid-game (their reconnect is just a fresh 'join').
        // There's no separate event for "this is a rejoin" — so without the
        // onlineGameId check below, any guest wifi hiccup would silently
        // wipe the whole game back to move 1 for both players. Once a game
        // has actually started, treat onConnect as "resync them", not
        // "start over".
        onConnect:()=>{
          if(onlineGameId){
            onlineStatus('Opponent reconnected! Resyncing…');
            showOnlinePlay();
            broadcastOnlineState();
          } else {
            onlineStatus('Opponent connected! You are White.');
            showOnlinePlay();
            newGame({mode:'online'});
          }
        },
        onMessage:onHostMessage,
        onClose:()=>{ onlineStatus('Opponent disconnected.'); },
        onReconnecting:()=>onlineStatus('Connection dropped — reconnecting…'),
        onReconnected:()=>{ onlineStatus('Reconnected! Resyncing opponent…'); broadcastOnlineState(); }
      });
      container.querySelector('#chess-room-code').textContent = code;
      onlineStatus('Share this room code with your friend. Waiting…');
    }catch(e){
      onlineRole=null; onlineStatus(e && e.message ? e.message : 'Could not create room. Try again.'); console.error(e);
    }
  }
  async function onlineJoin(){
    const code = container.querySelector('#chess-room-input').value.trim();
    if(!code) return onlineStatus('Enter a room code first.');
    onlineRole='guest'; myColor='b'; mode='online';
    container.querySelector('#chess-online-room').style.display='block';
    container.querySelector('#chess-room-code').textContent = code;
    onlineStatus('Joining room…');
    try{
      // The server never sends 'peer-connected' to the guest for their own
      // initial join — only the host gets that — so this join() promise
      // resolving is the guest's real signal that they made it in. Putting
      // showOnlinePlay() inside onConnect (as this used to) meant it never
      // ran: joining as guest looked like it silently did nothing.
      // BUT the server *does* send the guest a fresh 'peer-connected' if the
      // host later drops and reclaims the room (see server.js's 'reclaim'
      // handler) — that's the one case ArcadeOnline's onConnect fires here.
      // Without a handler for it, the guest's status stayed stuck on "Host
      // disconnected." forever even after the host was back and moves were
      // flowing again.
      await ArcadeOnline.join(code, {
        onMessage:onGuestMessage,
        onConnect:()=>{ onlineStatus('Opponent reconnected!'); requestOnlineSync(); },
        onClose:()=>{ onlineStatus('Host disconnected.'); },
        onReconnecting:()=>onlineStatus('Connection dropped — reconnecting…'),
        onReconnected:()=>{ onlineStatus('Reconnected!'); requestOnlineSync(); }
      });
      onlineStatus('Connected! You are Black. Waiting for the host to start…');
      showOnlinePlay();
      startOnlineSyncWatchdog();
    }catch(e){
      onlineRole=null; onlineStatus(e && e.message ? e.message : 'Could not join that room. Check the code.'); console.error(e);
    }
  }
  function onHostMessage(m){
    if(!m) return;
    if(m.type==='requestSync'){ broadcastOnlineState(); return; }
    // If the guest has a stale view and sends a move for the wrong turn,
    // don't silently discard it. Resend the authoritative position so the
    // guest can recover and become clickable again.
    if(state.turn!=='b'){ broadcastOnlineState(); return; }
    if(m.type==='requestMove') commitAndAdvance(m.move);
    else if(m.type==='requestTeleport') doTeleport(m.fr, m.fc, m.tr, m.tc);
    else if(m.type==='requestShield') doShield(m.r, m.c);
  }
  function onGuestMessage(m){
    if(!m) return;
    if(m.type==='state'){
      const seq=Number(m.seq)||0;
      const gameId=String(m.gameId||'');
      // A new game/rematch gets a fresh game id. Reset the guest's sequence
      // tracker for that game so a new game's seq=1..N is never mistaken for
      // an old packet from the previous game.
      if(gameId && gameId!==onlineGameId){
        onlineGameId=gameId;
        lastOnlineStateSeq=0;
      }
      // A gap means one or more state packets were lost. Ask the host for
      // its current authoritative state rather than waiting indefinitely.
      if(seq && lastOnlineStateSeq && seq>lastOnlineStateSeq+1) requestOnlineSync();
      if(seq && seq<=lastOnlineStateSeq) return;
      if(seq) lastOnlineStateSeq=seq;
      syncRequestPending=false;
      lastOnlineStateAt=Date.now();
      if(m.payload) applyFullSync(m.payload);
    }
  }

  function newGame(opts){
    state = ChessEngine.newState(variant);
    selected=null; legalTargets=[]; pendingPromotion=null; spellMode=null; aiThinking=false; redoStack=[]; orientation='w';
    mode = opts.mode; aiColor = opts.aiColor||'b'; aiDepth = opts.aiDepth||2;
    handoverPending = (mode==='2p'); // confirm who's starting before White's very first move too
    undoStack=[]; redoStack=[]; orientation='w';
    if(mode==='online' && onlineRole==='host'){
      // Every rematch gets a new game id. The sequence can safely restart
      // at zero because the guest uses the game id to reset its tracker.
      onlineGameId = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      onlineStateSeq=0;
    }
    if(mode==='online' && onlineRole==='guest'){
      // Do not reset the guest sequence here: the guest never starts the
      // authoritative game. It resets only when it receives a new gameId.
      syncRequestPending=false;
    }
    if(variant==='dice_chess'){ movesLeftThisTurn=3; rollDice(); skipUnplayableDiceTurns(); }
    if(variant==='drawback_chess'){ state.drawbacks = {w:assignDrawback(), b:assignDrawback()}; }
    render();
    maybeTriggerAI();
    if(mode==='online' && onlineRole==='host') broadcastOnlineState();
  }
  function rollDice(){
    const types=['P','N','B','R','Q','K'];
    diceValues = [0,0,0].map(()=>types[Math.floor(Math.random()*6)]);
    diceRemaining = {};
    diceValues.forEach(t=> diceRemaining[t] = (diceRemaining[t]||0)+1);
  }
  function typeName(t){ return {P:'Pawn',N:'Knight',B:'Bishop',R:'Rook',Q:'Queen',K:'King'}[t]; }

  function diceMatchingMoves(color){
    return ChessEngine.allLegalMoves(state, color).filter(m=>(diceRemaining[m.piece[1]]||0)>0);
  }
  function skipUnplayableDiceTurns(){
    for(let guard=0; guard<40; guard++){
      const status = ChessEngine.gameStatus(state);
      if(status.over) return;
      if(diceMatchingMoves(state.turn).length>0) return;
      state.turn = state.turn==='w'?'b':'w';
      movesLeftThisTurn = 3;
      rollDice();
    }
    // Vanishingly unlikely (needs 40 straight rolls to all miss the one
    // or two piece types that can still move), but never leave the game
    // stuck with zero legal moves for whoever's turn it lands on — drop
    // the dice restriction for this turn instead of freezing.
    diceRemaining = {P:99,N:99,B:99,R:99,Q:99,K:99};
  }
  function afterDiceMove(moverColor, movedType){
    movesLeftThisTurn--;
    diceRemaining[movedType] = Math.max(0,(diceRemaining[movedType]||0)-1);
    const status = ChessEngine.gameStatus(state);
    if(status.over) return;
    if(movesLeftThisTurn>0){
      // Same player keeps moving for the rest of this turn — but only if
      // their remaining dice still match at least one legal move. Dice
      // Chess never falls back to an unrestricted move: if the remaining
      // dice can't be used, the rest of the turn is forfeited early.
      state.turn = moverColor;
      if(diceMatchingMoves(moverColor).length>0) return;
      state.turn = moverColor==='w'?'b':'w';
    }
    movesLeftThisTurn = 3;
    rollDice();
    skipUnplayableDiceTurns();
  }

  function currentAllowedMoves(){
    const st = ChessEngine.gameStatus(state);
    if(st.over) return {over:true, result:st.result, moves:[]};
    let moves = st.moves;
    if(variant==='dice_chess'){
      // Strict: only moves matching a remaining die are ever legal, with
      // no fallback to unrestricted moves.
      moves = moves.filter(m=>(diceRemaining[m.piece[1]]||0)>0);
    }
    if(variant==='drawback_chess'){
      moves = applyDrawbackFallback(moves, state.drawbacks[state.turn], {state, color:state.turn, board:state.board, history:state.history});
    }
    return {over:false, moves, inCheck:st.inCheck};
  }

  function squareClick(r,c){
    if(pendingPromotion || aiThinking) return;
    const status = currentAllowedMoves();
    if(status.over) return;
    const isHumanTurn = mode==='ai' ? state.turn!==aiColor : (mode==='online' ? state.turn===myColor : true);
    if(!isHumanTurn){
      if(mode==='online' && onlineRole==='guest') requestOnlineSync();
      return;
    }

    if(spellMode==='teleport-select'){
      const p = state.board[r][c];
      if(p && p[0]===state.turn && p[1]!=='K'){ spellMode={mode:'teleport-target', fr:r, fc:c}; render(); }
      return;
    }
    if(spellMode && spellMode.mode==='teleport-target'){
      if(!state.board[r][c]){
        doTeleport(spellMode.fr, spellMode.fc, r, c);
      }
      spellMode=null; render();
      return;
    }
    if(spellMode==='shield-select'){
      const p = state.board[r][c];
      if(p && p[0]===state.turn){ doShield(r,c); }
      spellMode=null; render();
      return;
    }

    if(selected){
      const move = legalTargets.find(m=>m.tr===r && m.tc===c);
      if(move){
        if(move.promotion){ pendingPromotion = move; render(); return; }
        commitAndAdvance(move);
        return;
      }
    }
    const piece = state.board[r][c];
    if(selected && selected.r===r && selected.c===c){
      selected=null; legalTargets=[]; render(); return;
    }
    if(piece && piece[0]===state.turn){
      const allowedIds = new Set(status.moves.map(m=>`${m.fr},${m.fc},${m.tr},${m.tc},${m.isCastle||''}`));
      legalTargets = ChessEngine.legalMovesForPiece(state,r,c).filter(m=>allowedIds.has(`${m.fr},${m.fc},${m.tr},${m.tc},${m.isCastle||''}`));
      selected = legalTargets.length ? {r,c} : null;
      if(!legalTargets.length) selected=null;
    } else {
      selected=null; legalTargets=[];
    }
    render();
  }
  function doTeleport(fr,fc,tr,tc){
    if(mode==='online' && onlineRole==='guest'){ sendOnline({type:'requestTeleport', fr, fc, tr, tc}); return; }
    const color = state.turn;
    if(variant!=='spell_chess' || state.teleportUsed[color]) return;
    if(!Number.isInteger(fr)||!Number.isInteger(fc)||!Number.isInteger(tr)||!Number.isInteger(tc)) return;
    if(fr<0||fr>7||fc<0||fc>7||tr<0||tr>7||tc<0||tc>7 || (fr===tr&&fc===tc)) return;
    const piece = state.board[fr][fc];
    if(!piece || piece[0]!==color || piece[1]==='K' || state.board[tr][tc]) return;
    const clone = ChessEngine.cloneState(state);
    clone.board[fr][fc]=null; clone.board[tr][tc]=piece;
    if(ChessEngine.isInCheck(clone,color)){ return; }
    clone.teleportUsed[color]=true;
    clone.turn = color==='w'?'b':'w';
    clone.ep=null;
    state = clone;
    selected=null; legalTargets=[];
    afterMoveAdvance(color);
  }
  function doShield(r,c){
    if(mode==='online' && onlineRole==='guest'){ sendOnline({type:'requestShield', r, c}); return; }
    const color = state.turn;
    if(variant!=='spell_chess' || state.shieldUsed[color]) return;
    const piece=state.board[r]?.[c];
    if(!piece || piece[0]!==color) return;
    if(ChessEngine.isInCheck(state, color)) return; // can't skip a forced response to check
    state.shieldUsed[color]=true;
    state.shield[color]={r,c};
    state.turn = color==='w'?'b':'w';
    state.ep=null;
    selected=null; legalTargets=[];
    afterMoveAdvance(color);
  }
  // Note: the promotion field is deliberately normalized to a plain flag
  // here (not the specific letter). The engine's own legal-move list only
  // ever marks a promoting move with `promotion:true` (it doesn't choose a
  // piece); the letter is chosen afterwards by the player and merged in by
  // the caller. Including the literal value here would mean a request for
  // "promote to Q" could never match the engine's "true"-flagged legal
  // move, silently dropping every promotion (locally and over the network).
  function moveSignature(m){ return `${m.fr},${m.fc},${m.tr},${m.tc},${m.piece},${m.isCastle||''},${m.isEnPassant?'ep':''},${m.promotion?'=':''}`; }
  function findCurrentLegalMove(move){
    if(!move) return null;
    const allowed=currentAllowedMoves().moves;
    return allowed.find(m=>moveSignature(m)===moveSignature(move)) || null;
  }
  function pushUndoSnapshot(){
    if(!state) return;
    undoStack.push(ChessEngine.cloneState(state));
    if(undoStack.length>80) undoStack.shift();
    redoStack=[];
  }

  function commitAndAdvance(move, promo){
    if(mode==='online' && onlineRole==='guest'){
      const candidate = promo ? {...move,promotion:promo} : move;
      sendOnline({type:'requestMove', move:candidate});
      selected=null; legalTargets=[]; pendingPromotion=null;
      render();
      return;
    }
    const requested = promo ? {...move,promotion:promo} : move;
    const legal = findCurrentLegalMove(requested);
    if(!legal) return;
    // `requested.promotion` carries the actual chosen letter whether it got
    // there via the local `promo` argument (human/host picking a piece) or
    // was already embedded in an incoming network move (a guest's chosen
    // letter, relayed as-is by onHostMessage). Either way it must replace
    // the engine's generic `true` flag before the move is committed, or the
    // board ends up with a piece code like "wtrue" instead of "wQ".
    if(requested.promotion && legal.promotion) legal.promotion=requested.promotion;
    pushUndoSnapshot();
    const moverColor = legal.piece[0];
    ChessEngine.commitMove(state, legal);
    const defender = moverColor==='w'?'b':'w';
    if(state.shield[defender]) state.shield[defender]=null;
    selected=null; legalTargets=[]; pendingPromotion=null;
    if(variant==='dice_chess') afterDiceMove(moverColor, legal.piece[1]);
    afterMoveAdvance(moverColor);
  }

  function undoMove(){
    if(mode==='online' || aiThinking || !state || !undoStack.length) return;
    const snapshot=undoStack.pop();
    redoStack.push(ChessEngine.cloneState(state));
    state=snapshot; selected=null; legalTargets=[]; pendingPromotion=null; spellMode=null;
    if(mode==='ai' && state.turn===aiColor && undoStack.length) {
      // Undo the human move together with the AI reply when possible.
      const prior=undoStack.pop();
      redoStack.push(ChessEngine.cloneState(state));
      state=prior;
    }
    handoverPending=mode==='2p';
    render();
  }
  function redoMove(){
    if(mode==='online' || aiThinking || !redoStack.length) return;
    const next=redoStack.pop();
    if(!next) return;
    undoStack.push(ChessEngine.cloneState(state));
    state=next; selected=null; legalTargets=[]; pendingPromotion=null; spellMode=null;
    handoverPending=mode==='2p';
    render();
  }

  function afterMoveAdvance(moverColor){
    const status = ChessEngine.gameStatus(state);
    if(mode==='2p' && !status.over && moverColor && state.turn!==moverColor){
      handoverPending = true;
    }
    render();
    maybeTriggerAI();
    if(mode==='online' && onlineRole==='host') broadcastOnlineState();
  }
  function maybeTriggerAI(){
    if(mode!=='ai') return;
    const status = ChessEngine.gameStatus(state);
    if(status.over) return;
    if(state.turn!==aiColor) return;
    aiThinking=true;
    render();
    setTimeout(()=>{
      let move;
      const allowed = currentAllowedMoves().moves;
      if(allowed.length) move = ChessEngine.aiPickMove(state, aiDepth, allowed);
      if(move){
        ChessEngine.commitMove(state, move.promotion? {...move,promotion:'Q'}:move);
        const defender = move.piece[0]==='w'?'b':'w';
        if(state.shield[defender]) state.shield[defender]=null;
        if(variant==='dice_chess') afterDiceMove(move.piece[0], move.piece[1]);
      }
      aiThinking=false;
      render();
      const st2 = ChessEngine.gameStatus(state);
      if(!st2.over && state.turn===aiColor) maybeTriggerAI();
    }, 350);
  }
  function pickPromotion(letter){
    if(!pendingPromotion) return;
    commitAndAdvance(pendingPromotion, letter);
  }

  function renderMoveHistory(){
    const el = container.querySelector('.chess-history');
    if(!el) return;
    const rows=[];
    for(let i=0;i<state.history.length;i+=2){
      const white=state.history[i], black=state.history[i+1];
      rows.push(`<div class="history-row"><span class="history-num">${Math.floor(i/2)+1}.</span><span>${ChessEngine.moveToNotation(white)}</span><span>${black?ChessEngine.moveToNotation(black):'…'}</span></div>`);
    }
    el.innerHTML=rows.length ? rows.slice(-12).join('') : '<div class="history-empty">Moves will appear here.</div>';
    el.scrollTop=el.scrollHeight;
  }
  function renderCastlingStatus(status){
    const el=container.querySelector('.chess-castling');
    if(!el || variant==='fischer_random') return;
    const color=state.turn;
    const rights=ChessEngine.castlingRights(state);
    const legal=status.moves.filter(m=>m.isCastle).map(m=>m.isCastle==='K'?'O-O':'O-O-O');
    const rightsText=[rights[color+'K']?'Kingside':'',rights[color+'Q']?'Queenside':''].filter(Boolean).join(' + ') || 'None';
    el.innerHTML=`<span class="status-chip">Castling: <b>${rightsText}</b></span>${legal.length?`<span class="status-chip ready">Available now: <b>${legal.join(' · ')}</b></span>`:''}`;
  }

  function setupKeyboard(){
    if(container._chessKeys) return;
    container._chessKeys=true;
    container.addEventListener('keydown', e=>{
      if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName)) return;
      if(e.key.toLowerCase()==='f'){ orientation=orientation==='w'?'b':'w'; render(); }
      else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){ e.preventDefault(); undoMove(); }
      else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){ e.preventDefault(); redoMove(); }
      else if(e.key==='Escape'){ selected=null; legalTargets=[]; pendingPromotion=null; spellMode=null; render(); }
    });
  }

  function render(){
    if(!container) return;
    setupKeyboard();
    const handoverEl = container.querySelector('.chess-handover');
    const playInner = container.querySelector('.chess-play-inner');
    if(handoverPending){
      const nextLabel = state.turn==='w' ? 'White' : 'Black';
      handoverEl.style.display='flex';
      handoverEl.innerHTML = `
        <div style="text-align:center;">
          <div style="font-size:1.3rem;color:var(--yellow);margin-bottom:14px;">Pass the device to <b>${nextLabel}</b></div>
          <button class="btn primary" id="handover-ready">I'm ${nextLabel} — Show the board</button>
        </div>
      `;
      handoverEl.querySelector('#handover-ready').addEventListener('click', ()=>{ handoverPending=false; render(); });
      if(playInner) playInner.style.display='none';
      return;
    }
    handoverEl.style.display='none';
    if(playInner) playInner.style.display='block';
    const status = currentAllowedMoves();
    renderCastlingStatus(status);
    renderMoveHistory();
    const lastMove = state.history.length ? state.history[state.history.length-1] : null;
    const boardEl = container.querySelector('.chess-board');
    boardEl.innerHTML='';
    for(let vr=0;vr<8;vr++){
      for(let vc=0;vc<8;vc++){
        const r = orientation==='w' ? vr : 7-vr;
        const c = orientation==='w' ? vc : 7-vc;
        const sq = document.createElement('div');
        const light = (r+c)%2===0;
        sq.className = 'chess-sq ' + (light?'light':'dark');
        const p = state.board[r][c];
        if(p) sq.innerHTML = `<img src="${chessPieceImg(p)}" alt="${p}" draggable="false" style="width:80%;height:80%;object-fit:contain;pointer-events:none;">`;
        if(lastMove && ((lastMove.fr===r&&lastMove.fc===c)||(lastMove.tr===r&&lastMove.tc===c))) sq.classList.add('lastmove');
        if(selected && selected.r===r && selected.c===c) sq.classList.add('sel');
        if(legalTargets.some(m=>m.tr===r&&m.tc===c)) sq.classList.add('target');
        if(status.inCheck){
          const king=ChessEngine.findKing(state.board,state.turn);
          if(king && king.r===r && king.c===c) sq.classList.add('incheck');
        }
        sq.setAttribute('role','gridcell');
        sq.setAttribute('tabindex', '0');
        sq.setAttribute('aria-selected', selected && selected.r===r && selected.c===c ? 'true' : 'false');
        sq.setAttribute('aria-label', `${String.fromCharCode(97+c)}${8-r}${p?' '+p:''}`);
        if(vr===7) { const fileLabel=document.createElement('span'); fileLabel.className='coord file'; fileLabel.textContent=String.fromCharCode(97+c); sq.appendChild(fileLabel); }
        if(vc===0) { const rankLabel=document.createElement('span'); rankLabel.className='coord rank'; rankLabel.textContent=String(8-r); sq.appendChild(rankLabel); }
        if(state.shield.w && state.shield.w.r===r && state.shield.w.c===c) sq.classList.add('shielded');
        if(state.shield.b && state.shield.b.r===r && state.shield.b.c===c) sq.classList.add('shielded');
        sq.dataset.r=r; sq.dataset.c=c;
        sq.addEventListener('click', ()=>squareClick(r,c));
        sq.addEventListener('keydown', e=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); squareClick(r,c); } });
        boardEl.appendChild(sq);
      }
    }
    const msg = container.querySelector('.chess-msg');
    if(status.over){
      msg.textContent = status.result;
      // One shared achievement across chess + every variant (they all run
      // through this same render()). Only credit an actual decisive win
      // for the human on this client, not a draw/stalemate and not the AI
      // beating the human — result strings always read "White wins..." or
      // "Black wins..." (checkmate, antichess's last-piece/no-moves wins,
      // and dice/drawback chess's king-capture wins all say this).
      const winnerColor = status.result.includes('White wins') ? 'w' : (status.result.includes('Black wins') ? 'b' : null);
      if(winnerColor){
        const humanWon = mode==='ai' ? winnerColor!==aiColor : (mode==='online' ? winnerColor===myColor : true);
        if(humanWon) (typeof Achievements!=='undefined'&&Achievements.unlock('chess_checkmate'));
      }
    } else if(aiThinking){
      msg.textContent = 'AI is thinking...';
    } else {
      const turnLabel = state.turn==='w'?'White':'Black';
      let extra = status.inCheck ? ' — in check!' : '';
      if(variant==='dice_chess'){
        const remaining = Object.keys(diceRemaining).filter(t=>diceRemaining[t]>0).map(t=>`${typeName(t)}×${diceRemaining[t]}`).join(', ');
        extra += `  •  Rolled: ${diceValues.map(typeName).join(', ')}  •  Still available: ${remaining||'none'}`;
      }
      msg.textContent = `${turnLabel} to move${extra}  •  Move ${Math.floor(state.history.length/2)+1}`;
    }
    const drawbackEl = container.querySelector('.chess-drawbacks');
    if(drawbackEl && variant==='drawback_chess'){
      // Secrecy rule: a drawback is only ever visible to the player it
      // belongs to (revealed once it's their turn, since the handover
      // screen already ensures only they're looking at that point), or to
      // a human playing an AI opponent (whose own drawback is always
      // visible to them). Everything is revealed once the game ends.
      const humanColor = mode==='ai' ? (aiColor==='w'?'b':'w') : (mode==='online' ? myColor : null);
      function visibleTo(color){
        if(status.over) return true;
        if(mode==='ai' || mode==='online') return color===humanColor;
        return color===state.turn;
      }
      const wVisible = visibleTo('w'), bVisible = visibleTo('b');
      const wIsAI = mode==='ai' && aiColor==='w';
      const bIsAI = mode==='ai' && aiColor==='b';
      drawbackEl.innerHTML = `
        <div>♔ White${wIsAI?' (AI)':''}: <b>${wVisible ? state.drawbacks.w.name : '❓ Secret'}</b>${wVisible?' — '+state.drawbacks.w.desc:''}</div>
        <div>♚ Black${bIsAI?' (AI)':''}: <b>${bVisible ? state.drawbacks.b.name : '❓ Secret'}</b>${bVisible?' — '+state.drawbacks.b.desc:''}</div>
      `;
    }
    const capturedEl = container.querySelector('.chess-captured');
    if(capturedEl){
      const byWhite = state.history.filter(h=>h.color==='w'&&h.capture).map(h=>h.capturedPiece);
      const byBlack = state.history.filter(h=>h.color==='b'&&h.capture).map(h=>h.capturedPiece);
      const sumVal = arr => arr.reduce((s,p)=>s+(ChessEngine.PIECE_VALUE[p[1]]||0),0);
      const diff = Math.round((sumVal(byWhite)-sumVal(byBlack))/100);
      const iconRow = arr => arr.sort((a,b)=>(ChessEngine.PIECE_VALUE[b[1]]||0)-(ChessEngine.PIECE_VALUE[a[1]]||0))
        .map(p=>`<img src="${chessPieceImg(p)}" style="width:18px;height:18px;vertical-align:middle;">`).join('');
      capturedEl.innerHTML = `
        <div>${iconRow(byWhite)} ${diff>0?`<b style="color:var(--yellow);">+${diff}</b>`:''}</div>
        <div>${diff<0?`<b style="color:var(--yellow);">+${-diff}</b>`:''} ${iconRow(byBlack)}</div>
      `;
    }
    const restartBtn = container.querySelector('#chess-restart');
    if(restartBtn){
      restartBtn.textContent = mode==='online' ? 'Rematch' : 'New Game';
      restartBtn.disabled = mode==='online' && onlineRole==='guest';
    }
    const undoBtn=container.querySelector('#chess-undo'), redoBtn=container.querySelector('#chess-redo');
    if(undoBtn) undoBtn.disabled = mode==='online' || aiThinking || !undoStack.length;
    if(redoBtn) redoBtn.disabled = mode==='online' || aiThinking || !redoStack.length;
    const promoEl = container.querySelector('.chess-promo');
    if(pendingPromotion){
      promoEl.style.display='flex';
      promoEl.innerHTML = ['Q','R','B','N'].map(l=>`<button class="btn primary" data-l="${l}" style="display:flex;align-items:center;gap:6px;"><img src="${chessPieceImg(pendingPromotion.piece[0]+l)}" style="width:28px;height:28px;object-fit:contain;"> ${l}</button>`).join('');
      promoEl.querySelectorAll('button').forEach(b=>b.addEventListener('click', ()=>pickPromotion(b.dataset.l)));
    } else {
      promoEl.style.display='none'; promoEl.innerHTML='';
    }
    const spellBar = container.querySelector('.chess-spells');
    if(spellBar){
      const color = state.turn;
      const isHumanTurn = mode==='ai' ? color!==aiColor : (mode==='online' ? color===myColor : true);
      const inCheck = ChessEngine.isInCheck(state, color);
      spellBar.innerHTML = `
        <button class="btn" id="spell-teleport" ${(!isHumanTurn||state.teleportUsed[color])?'disabled':''}>🌀 Teleport (${state.teleportUsed[color]?'used':'ready'})</button>
        <button class="btn" id="spell-shield" ${(!isHumanTurn||state.shieldUsed[color]||inCheck)?'disabled':''} title="${inCheck?"Can't shield while in check":''}">🛡️ Shield (${state.shieldUsed[color]?'used':(inCheck?'not while in check':'ready')})</button>
      `;
      const tb = spellBar.querySelector('#spell-teleport');
      const sb = spellBar.querySelector('#spell-shield');
      if(tb) tb.addEventListener('click', ()=>{ spellMode='teleport-select'; selected=null; legalTargets=[]; render(); });
      if(sb) sb.addEventListener('click', ()=>{ spellMode='shield-select'; selected=null; legalTargets=[]; render(); });
    }
    if(status.over){
      const key = variant+'_record';
      const rec = Store.get(key, {w:0,b:0,draw:0});
      if(!status._recorded){
        status._recorded=true;
      }
    }
  }
  function init(c){
    container = c;
    container.innerHTML = `
      <div class="msg" id="chess-setup-msg">Choose how to play:</div>
      <div class="online-panel" id="chess-online-panel">
        <h3>Play Online <span class="online-badge">ONLINE</span></h3>
        <p>One player hosts a room (plays White) and the other joins from any device (plays Black).</p>
        <div class="online-row">
          <button class="btn primary" id="chess-online-host">Create Room</button>
          <input class="online-input" id="chess-room-input" maxlength="20" placeholder="Room code">
          <button class="btn" id="chess-online-join">Join Room</button>
        </div>
        <div class="online-status" id="chess-online-status"></div>
      </div>
      <div class="online-panel" id="chess-online-room" style="display:none">
        <h3>Online Room</h3>
        <p>Room code: <span class="room-code" id="chess-room-code">—</span></p><button class="btn" id="chess-copy-room" type="button">Copy code</button>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;align-items:center;margin-bottom:6px;">
        <select id="ai-difficulty" class="btn">
          <option value="2">Easy AI</option>
          <option value="3" selected>Normal AI</option>
          <option value="4">Hard AI</option>
        </select>
        <button class="btn primary" id="mode-ai-white">vs AI (play White)</button>
        <button class="btn primary" id="mode-ai-black">vs AI (play Black)</button>
        <button class="btn primary" id="mode-2p">2 Player</button>
      </div>
      <div id="chess-play-area" style="display:none;">
        <div class="chess-handover" style="display:none;min-height:220px;align-items:center;justify-content:center;"></div>
        <div class="chess-play-inner">
          <div class="msg chess-msg"></div>
          ${variant!=='fischer_random' ? '<div class="chess-castling" aria-live="polite"></div>' : ''}
          <div class="chess-captured" style="display:flex;justify-content:space-between;width:min(92vw,352px);margin:0 auto 6px;font-size:0.85rem;"></div>
          ${variant==='drawback_chess' ? '<div class="chess-drawbacks" style="font-size:0.8rem;color:var(--dim);text-align:center;margin-bottom:8px;max-width:420px;"></div>' : ''}
          ${variant==='spell_chess' ? '<div class="chess-spells" style="display:flex;gap:8px;justify-content:center;margin-bottom:8px;"></div>' : ''}
          <div class="chess-board" aria-label="Chess board" role="grid" style="display:grid;grid-template-columns:repeat(8,minmax(0,1fr));grid-template-rows:repeat(8,minmax(0,1fr));width:min(92vw,352px);aspect-ratio:1;border:2px solid #3a3a55;"></div>
          <div class="chess-promo" style="display:none;gap:8px;justify-content:center;margin-top:10px;"></div>
          <div class="chess-history-wrap"><div class="history-head"><div class="history-title">Move History</div><button class="history-copy" id="chess-copy-history" type="button">Copy</button></div><div class="chess-history" aria-label="Move history"></div></div>
          <div class="controls-hint">Click or focus a piece, then choose a highlighted square. Enter/Space also works. F flips the board; Esc clears selection.${variant==='fischer_random'?' Fischer Random uses the simplified no-castling rules.':' Castling: move the king two squares toward the rook.'}${variant==='antichess'?' Captures are mandatory, so castling is only available when no capture is forced.':''}${(variant==='dice_chess'||variant==='drawback_chess')?' King-capture rules — no check/checkmate; capture the king directly to win.':''}</div>
          <div class="chess-actions"><button class="btn" id="chess-undo" type="button">↶ Undo</button><button class="btn" id="chess-redo" type="button">↷ Redo</button><button class="btn" id="chess-flip" type="button">⇅ Flip Board</button><button class="btn" id="chess-restart" style="margin-top:8px;">New Game</button></div>
        </div>
      </div>
    `;
    const style = document.createElement('style');
    style.textContent = `.chess-sq{width:auto;height:auto;min-width:0;min-height:0;display:flex;align-items:center;justify-content:center;font-size:clamp(1.15rem,5vw,1.9rem);cursor:pointer;user-select:none;position:relative;}
      .chess-sq.light{background:#e8e4d8;} .chess-sq.dark{background:#7a8ca3;}
      .chess-sq.lastmove::before{content:'';position:absolute;inset:0;background:rgba(255,215,0,0.28);pointer-events:none;}
      .chess-sq.sel{outline:3px solid #ffd700;outline-offset:-3px;}
      .chess-sq.target{box-shadow:inset 0 0 0 4px rgba(80,255,80,0.7);}
      .chess-sq.target::after{content:'';width:24%;height:24%;border-radius:50%;background:rgba(30,40,50,.42);position:absolute;pointer-events:none;}
      .chess-sq.incheck{box-shadow:inset 0 0 0 4px rgba(255,70,70,.9), inset 0 0 18px rgba(255,70,70,.45);}
      .coord{position:absolute;font-size:.52rem;font-weight:700;line-height:1;color:rgba(20,25,35,.55);pointer-events:none;text-transform:lowercase;}
      .coord.file{right:3px;bottom:2px;} .coord.rank{left:3px;top:2px;}
      .chess-sq.shielded{box-shadow:inset 0 0 0 4px rgba(80,200,255,0.8);}
      .chess-castling{display:flex;justify-content:center;gap:6px;flex-wrap:wrap;margin:0 auto 8px;min-height:24px;}
      .status-chip{font-size:.68rem;color:var(--dim);background:var(--panel2);border:1px solid var(--border);border-radius:999px;padding:4px 8px;}
      .status-chip b{color:var(--text);}
      .status-chip.ready{border-color:rgba(80,255,80,.45);color:#b9ffc0;}
      .chess-actions{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin-top:8px;} .chess-actions .btn{margin:0;}
      .history-head{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border);} .history-head .history-title{border:0;flex:1;} .history-copy{margin-right:7px;border:1px solid var(--border);background:transparent;color:var(--dim);border-radius:6px;padding:3px 7px;font-size:.65rem;cursor:pointer;} .history-copy:hover{color:var(--cyan);border-color:var(--cyan);}
      .chess-history-wrap{width:min(92vw,352px);margin-top:10px;border:1px solid var(--border);border-radius:10px;background:rgba(0,0,0,.12);overflow:hidden;}
      .history-title{padding:7px 10px;border-bottom:1px solid var(--border);font-size:.72rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--dim);}
      .chess-history{max-height:150px;overflow:auto;padding:5px 7px;font-size:.76rem;}
      .history-row{display:grid;grid-template-columns:34px 1fr 1fr;gap:5px;padding:4px 5px;border-radius:5px;}
      .history-row:nth-child(odd){background:rgba(255,255,255,.025);}
      .history-num{color:var(--dim);}
      .history-empty{padding:10px;color:var(--dim);text-align:center;}
      @media(max-width:430px){.chess-history{max-height:120px;} .chess-sq img{width:76%!important;height:76%!important;}}`;
    container.appendChild(style);
    function selectedDepth(){ return parseInt(container.querySelector('#ai-difficulty').value, 10) || 3; }
    function start(m, ai){
      newGame({mode:m, aiColor: ai, aiDepth: selectedDepth()});
      hideSetup();
    }
    container.querySelector('#mode-ai-white').addEventListener('click', ()=> start('ai','b'));
    container.querySelector('#mode-ai-black').addEventListener('click', ()=> start('ai','w'));
    container.querySelector('#mode-2p').addEventListener('click', ()=> start('2p',null));
    container.querySelector('#chess-online-host').addEventListener('click', onlineHost);
    container.querySelector('#chess-online-join').addEventListener('click', onlineJoin);
    container.querySelector('#chess-copy-room').addEventListener('click', async ()=>{
      const code=container.querySelector('#chess-room-code').textContent.trim();
      if(!code || code==='—') return;
      try{ await navigator.clipboard.writeText(code); onlineStatus('Room code copied.'); }
      catch(_){ onlineStatus('Copy is unavailable — select the room code and copy it manually.'); }
    });
    container.querySelector('#chess-undo').addEventListener('click', undoMove);
    container.querySelector('#chess-redo').addEventListener('click', redoMove);
    container.querySelector('#chess-flip').addEventListener('click', ()=>{ orientation=orientation==='w'?'b':'w'; render(); });
    container.querySelector('#chess-copy-history').addEventListener('click', async ()=>{
      const text=Array.from({length:Math.ceil(state.history.length/2)},(_,i)=>{const w=state.history[i*2],b=state.history[i*2+1]; return `${i+1}. ${ChessEngine.moveToNotation(w)}${b?' '+ChessEngine.moveToNotation(b):''}`;}).join('\n');
      try{ await navigator.clipboard.writeText(text || 'No moves yet.'); onlineStatus('Move history copied.'); } catch(_){ onlineStatus('Copy is unavailable in this browser.'); }
    });
    function hideSetup(){
      container.querySelector('#chess-setup-msg').style.display='none';
      container.querySelectorAll('#ai-difficulty,#mode-ai-white,#mode-ai-black,#mode-2p').forEach(b=>b.style.display='none');
      const onlinePanel = container.querySelector('#chess-online-panel');
      if(onlinePanel) onlinePanel.style.display='none';
      container.querySelector('#chess-play-area').style.display='block';
    }
    container.querySelector('#chess-restart').addEventListener('click', ()=>{
      if(mode==='online'){
        if(onlineRole==='host') newGame({mode:'online'}); // rematch, keep the room open
        return;
      }
      if(onlineRole){ ArcadeOnline.close(); onlineRole=null; myColor=null; }
      container.querySelector('#chess-setup-msg').style.display='block';
      container.querySelectorAll('#mode-ai-white,#mode-ai-black,#mode-2p').forEach(b=>b.style.display='inline-block');
      container.querySelector('#ai-difficulty').style.display='inline-block';
      const onlinePanel = container.querySelector('#chess-online-panel');
      if(onlinePanel) onlinePanel.style.display='block';
      container.querySelector('#chess-online-room').style.display='none';
      container.querySelector('#chess-play-area').style.display='none';
    });
  }
  function destroy(){ if(onlineRole){ ArcadeOnline.close(); onlineRole=null; myColor=null; } }
  return {init, destroy};
}

registerGame('chess','Standard Chess','♟️', true, createChessVariant('chess','Standard Chess'), null, true);
registerGame('fischer_random','Fischer Random','🎲', true, createChessVariant('fischer_random','Fischer Random'), null, true);
registerGame('antichess','Antichess','🔻', true, createChessVariant('antichess','Antichess'), null, true);
registerGame('dice_chess','Dice Chess','🎯', true, createChessVariant('dice_chess','Dice Chess'), null, true);
registerGame('spell_chess','Spell Chess','✨', true, createChessVariant('spell_chess','Spell Chess'), null, true);
registerGame('drawback_chess','Drawback Chess','🎭', true, createChessVariant('drawback_chess','Drawback Chess'), null, true);
