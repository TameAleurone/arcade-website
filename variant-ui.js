/* GENERIC CHESS VARIANT UI (used by all chess games) */

/* Shared helper: maps an engine piece code (e.g. 'wP','bK') to an asset image path. */
function chessPieceImg(piece){
  if(!piece) return '';
  const color = piece[0], type = piece[1].toLowerCase();
  return color==='w' ? `${type}.png` : `d_${type}.png`;
}

function createChessVariant(variant, displayName){
  let container, state, selected, legalTargets, mode, aiColor, aiDepth, pendingPromotion, diceValues, diceRemaining, movesLeftThisTurn, spellMode, aiThinking, handoverPending, onlineRole, myColor;

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
        onConnect:()=>{ onlineStatus('Opponent connected! You are White.'); showOnlinePlay(); newGame({mode:'online'}); },
        onMessage:onHostMessage,
        onClose:()=>{ onlineStatus('Opponent disconnected.'); }
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
      await ArcadeOnline.join(code, {
        onConnect:()=>{ onlineStatus('Connected! You are Black. Waiting for the host to start…'); showOnlinePlay(); },
        onMessage:onGuestMessage,
        onClose:()=>{ onlineStatus('Host disconnected.'); }
      });
    }catch(e){
      onlineRole=null; onlineStatus(e && e.message ? e.message : 'Could not join that room. Check the code.'); console.error(e);
    }
  }
  function onHostMessage(m){
    if(!m || state.turn!=='b') return; // only accept requests when it's actually the guest's turn
    if(m.type==='requestMove') commitAndAdvance(m.move);
    else if(m.type==='requestTeleport') doTeleport(m.fr, m.fc, m.tr, m.tc);
    else if(m.type==='requestShield') doShield(m.r, m.c);
  }
  function onGuestMessage(m){
    if(!m) return;
    if(m.type==='state') applyFullSync(m.payload);
  }

  function newGame(opts){
    state = ChessEngine.newState(variant, variant!=='antichess' && variant!=='fischer_random' && variant!=='dice_chess' && variant!=='drawback_chess');
    selected=null; legalTargets=[]; pendingPromotion=null; spellMode=null; aiThinking=false;
    mode = opts.mode; aiColor = opts.aiColor||'b'; aiDepth = opts.aiDepth||2;
    handoverPending = (mode==='2p'); // confirm who's starting before White's very first move too
    if(variant==='dice_chess'){ movesLeftThisTurn=3; rollDice(); skipUnplayableDiceTurns(); }
    if(variant==='drawback_chess'){ state.drawbacks = {w:assignDrawback(), b:assignDrawback()}; }
    render();
    maybeTriggerAI();
    if(mode==='online' && onlineRole==='host') sendOnline({type:'state', payload: fullSyncPayload()});
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
    for(let guard=0; guard<8; guard++){
      const status = ChessEngine.gameStatus(state);
      if(status.over) return;
      if(diceMatchingMoves(state.turn).length>0) return;
      state.turn = state.turn==='w'?'b':'w';
      movesLeftThisTurn = 3;
      rollDice();
    }
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
    if(!isHumanTurn) return;

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
    const clone = ChessEngine.cloneState(state);
    const piece = clone.board[fr][fc];
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
    if(ChessEngine.isInCheck(state, color)) return; // can't skip a forced response to check
    state.shieldUsed[color]=true;
    state.shield[color]={r,c};
    state.turn = color==='w'?'b':'w';
    state.ep=null;
    selected=null; legalTargets=[];
    afterMoveAdvance(color);
  }
  function commitAndAdvance(move, promo){
    if(mode==='online' && onlineRole==='guest'){ sendOnline({type:'requestMove', move: promo ? {...move, promotion:promo} : move}); return; }
    if(promo) move = {...move, promotion:promo};
    const moverColor = move.piece[0];
    ChessEngine.commitMove(state, move);
    const defender = moverColor==='w'?'b':'w';
    if(state.shield[defender]) state.shield[defender]=null;
    selected=null; legalTargets=[]; pendingPromotion=null;
    if(variant==='dice_chess') afterDiceMove(moverColor, move.piece[1]);
    afterMoveAdvance(moverColor);
  }
  function afterMoveAdvance(moverColor){
    const status = ChessEngine.gameStatus(state);
    if(mode==='2p' && !status.over && moverColor && state.turn!==moverColor){
      handoverPending = true;
    }
    render();
    maybeTriggerAI();
    if(mode==='online' && onlineRole==='host') sendOnline({type:'state', payload: fullSyncPayload()});
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
      if(variant==='chess' || variant==='fischer_random'){
        move = ChessEngine.aiPickMove(state, aiDepth);
      } else {
        const allowed = currentAllowedMoves().moves;
        if(allowed.length){
          const captures = allowed.filter(m=>m.capture);
          const pool = captures.length ? captures : allowed;
          move = pool[Math.floor(Math.random()*pool.length)];
          if(move && move.promotion) move = {...move, promotion:'Q'};
        }
      }
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

  function render(){
    if(!container) return;
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
    const lastMove = state.history.length ? state.history[state.history.length-1] : null;
    const boardEl = container.querySelector('.chess-board');
    boardEl.innerHTML='';
    for(let r=0;r<8;r++){
      for(let c=0;c<8;c++){
        const sq = document.createElement('div');
        const light = (r+c)%2===0;
        sq.className = 'chess-sq ' + (light?'light':'dark');
        const p = state.board[r][c];
        if(p) sq.innerHTML = `<img src="${chessPieceImg(p)}" alt="${p}" draggable="false" style="width:80%;height:80%;object-fit:contain;pointer-events:none;">`;
        if(lastMove && ((lastMove.fr===r&&lastMove.fc===c)||(lastMove.tr===r&&lastMove.tc===c))) sq.classList.add('lastmove');
        if(selected && selected.r===r && selected.c===c) sq.classList.add('sel');
        if(legalTargets.some(m=>m.tr===r&&m.tc===c)) sq.classList.add('target');
        if(state.shield.w && state.shield.w.r===r && state.shield.w.c===c) sq.classList.add('shielded');
        if(state.shield.b && state.shield.b.r===r && state.shield.b.c===c) sq.classList.add('shielded');
        sq.dataset.r=r; sq.dataset.c=c;
        sq.addEventListener('click', ()=>squareClick(r,c));
        boardEl.appendChild(sq);
      }
    }
    const msg = container.querySelector('.chess-msg');
    if(status.over){
      msg.textContent = status.result;
    } else if(aiThinking){
      msg.textContent = 'AI is thinking...';
    } else {
      const turnLabel = state.turn==='w'?'White':'Black';
      let extra = status.inCheck ? ' — in check!' : '';
      if(variant==='dice_chess'){
        const remaining = Object.keys(diceRemaining).filter(t=>diceRemaining[t]>0).map(t=>`${typeName(t)}×${diceRemaining[t]}`).join(', ');
        extra += `  •  Rolled: ${diceValues.map(typeName).join(', ')}  •  Still available: ${remaining||'none'}`;
      }
      msg.textContent = `${turnLabel} to move${extra}`;
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
        <p>Room code: <span class="room-code" id="chess-room-code">—</span></p>
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
          <div class="chess-captured" style="display:flex;justify-content:space-between;width:352px;margin:0 auto 6px;font-size:0.85rem;"></div>
          ${variant==='drawback_chess' ? '<div class="chess-drawbacks" style="font-size:0.8rem;color:var(--dim);text-align:center;margin-bottom:8px;max-width:420px;"></div>' : ''}
          ${variant==='spell_chess' ? '<div class="chess-spells" style="display:flex;gap:8px;justify-content:center;margin-bottom:8px;"></div>' : ''}
          <div class="chess-board" style="display:grid;grid-template-columns:repeat(8,44px);grid-template-rows:repeat(8,44px);border:2px solid #3a3a55;"></div>
          <div class="chess-promo" style="display:none;gap:8px;justify-content:center;margin-top:10px;"></div>
          <div class="controls-hint">Click a piece, then click a highlighted square to move.${variant==='fischer_random'?' Castling is disabled in this simplified version.':''}${(variant==='dice_chess'||variant==='drawback_chess')?' King-capture rules — no check/checkmate, capture the king directly to win.':''}</div>
          <button class="btn" id="chess-restart" style="margin-top:8px;">New Game</button>
        </div>
      </div>
    `;
    const style = document.createElement('style');
    style.textContent = `.chess-sq{width:44px;height:44px;display:flex;align-items:center;justify-content:center;font-size:1.9rem;cursor:pointer;user-select:none;position:relative;}
      .chess-sq.light{background:#e8e4d8;} .chess-sq.dark{background:#7a8ca3;}
      .chess-sq.lastmove::before{content:'';position:absolute;inset:0;background:rgba(255,215,0,0.28);pointer-events:none;}
      .chess-sq.sel{outline:3px solid #ffd700;outline-offset:-3px;}
      .chess-sq.target{box-shadow:inset 0 0 0 4px rgba(80,255,80,0.7);}
      .chess-sq.shielded{box-shadow:inset 0 0 0 4px rgba(80,200,255,0.8);}`;
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
