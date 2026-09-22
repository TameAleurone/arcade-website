/* THREE-PLAYER CHESS (simplified hex-board variant) */
(function(){
  const RADIUS = 4, HEX_SIZE = 24;
  function inHex(q,r){ const s=-q-r; return Math.abs(q)<=RADIUS && Math.abs(r)<=RADIUS && Math.abs(s)<=RADIUS; }
  function key(q,r){ return q+','+r; }
  function rotate120(q,r){ return [-q-r, q]; }
  function rotate240(q,r){ return [r, -q-r]; }
  const ROOK_DIRS = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
  const BISHOP_DIRS = [[2,-1],[1,-2],[-1,-1],[-2,1],[-1,2],[1,1]];
  const KING_DIRS = ROOK_DIRS.concat(BISHOP_DIRS);
  const KNIGHT_DIRS = [[1,-3],[2,-3],[3,-2],[3,-1],[2,1],[1,2],[-1,3],[-2,3],[-3,2],[-3,1],[-2,-1],[-1,-2]];
  const FORWARD = {'0':[0,-1], '1':rotate120(0,-1), '2':rotate240(0,-1)};
  const TEAM_COLOR = {'0':'#ffd700','1':'#a9713f','2':'#50e0d0'};
  const TEAM_NAME = {'0':'Gold','1':'Bronze','2':'Teal'};
  const TEAM_FILTER = {'0':'', '1':'', '2':'hue-rotate(165deg) saturate(1.5) brightness(1.05)'};
  function teamPieceImg(piece){
    const team = piece[0], type = piece[1].toLowerCase();
    // Team 0 uses the light (gold) piece set, team 1 uses the dark (bronze) set,
    // team 2 reuses the light set with a hue-shifted CSS filter for a distinct third color.
    return (team==='1') ? `d_${type}.png` : `${type}.png`;
  }

  let container, canvas, ctx, allCells, cellPixel = {}, minX,minY,maxX,maxY;

  function computeCells(){
    allCells=[];
    for(let q=-RADIUS;q<=RADIUS;q++) for(let r=-RADIUS;r<=RADIUS;r++) if(inHex(q,r)) allCells.push([q,r]);
    minX=Infinity;minY=Infinity;maxX=-Infinity;maxY=-Infinity;
    allCells.forEach(([q,r])=>{
      const x = HEX_SIZE*Math.sqrt(3)*(q+r/2);
      const y = HEX_SIZE*1.5*r;
      cellPixel[key(q,r)] = {x,y};
      minX=Math.min(minX,x); maxX=Math.max(maxX,x);
      minY=Math.min(minY,y); maxY=Math.max(maxY,y);
    });
  }
  function pixelOf(q,r){ const p=cellPixel[key(q,r)]; return {x:p.x-minX+HEX_SIZE*2, y:p.y-minY+HEX_SIZE*2}; }

  function setupBoard(){
    const board = {};
    const backLocal=[]; for(let q=-4;q<=0;q++) backLocal.push([q,4]);
    const pawnLocal=[]; for(let q=-4;q<=1;q++) pawnLocal.push([q,3]);
    const backOrder = ['N','R','K','Q','N'];
    const rotFns = {'0':(q,r)=>[q,r], '1':rotate120, '2':rotate240};
    ['0','1','2'].forEach(p=>{
      backLocal.forEach(([q,r],i)=>{ const [rq,rr]=rotFns[p](q,r); board[key(rq,rr)] = p+backOrder[i]; });
      pawnLocal.forEach(([q,r])=>{ const [rq,rr]=rotFns[p](q,r); board[key(rq,rr)] = p+'P'; });
    });
    return board;
  }
  function pieceAt(board,q,r){ return board[key(q,r)] || null; }
  function slideMoves(board,q,r,color,dirs){
    const moves=[];
    for(const [dq,dr] of dirs){
      let nq=q+dq, nr=r+dr;
      while(inHex(nq,nr)){
        const target = pieceAt(board,nq,nr);
        if(!target) moves.push({tq:nq,tr:nr,capture:false});
        else { if(target[0]!==color) moves.push({tq:nq,tr:nr,capture:true,capturedPiece:target}); break; }
        nq+=dq; nr+=dr;
      }
    }
    return moves;
  }
  function stepMoves(board,q,r,color,dirs){
    const moves=[];
    for(const [dq,dr] of dirs){
      const nq=q+dq, nr=r+dr;
      if(!inHex(nq,nr)) continue;
      const target = pieceAt(board,nq,nr);
      if(!target) moves.push({tq:nq,tr:nr,capture:false});
      else if(target[0]!==color) moves.push({tq:nq,tr:nr,capture:true,capturedPiece:target});
    }
    return moves;
  }
  function hexDist(q,r){ return (Math.abs(q)+Math.abs(r)+Math.abs(q+r))/2; }
  function pieceMoves(board,q,r){
    const piece = pieceAt(board,q,r);
    if(!piece) return [];
    const color=piece[0], type=piece[1];
    let moves;
    if(type==='R') moves = slideMoves(board,q,r,color,ROOK_DIRS);
    else if(type==='B') moves = slideMoves(board,q,r,color,BISHOP_DIRS);
    else if(type==='Q') moves = slideMoves(board,q,r,color,ROOK_DIRS.concat(BISHOP_DIRS));
    else if(type==='K') moves = stepMoves(board,q,r,color,KING_DIRS);
    else if(type==='N') moves = stepMoves(board,q,r,color,KNIGHT_DIRS);
    else if(type==='P'){
      moves=[];
      const [fq,fr] = FORWARD[color];
      const nq=q+fq, nr=r+fr;
      if(inHex(nq,nr) && !pieceAt(board,nq,nr)) moves.push({tq:nq,tr:nr,capture:false});
      const idx = ROOK_DIRS.findIndex(([a,b])=>a===fq&&b===fr);
      [ROOK_DIRS[(idx+1)%6], ROOK_DIRS[(idx+5)%6]].forEach(([dq,dr])=>{
        const cq=q+dq, cr=r+dr;
        if(inHex(cq,cr)){
          const t = pieceAt(board,cq,cr);
          if(t && t[0]!==color) moves.push({tq:cq,tr:cr,capture:true,capturedPiece:t});
        }
      });
    } else moves=[];
    if(type==='P'){
      // Promote once one more forward step would leave the board — i.e.
      // this pawn is as far forward, in its own direction, as it can go.
      // (hex-distance-from-center alone doesn't work here: every color's
      // starting rows already sit on the outer ring, so that check used
      // to fire immediately on a pawn's very first move.)
      const [fq,fr] = FORWARD[color];
      moves.forEach(m=>{ if(!inHex(m.tq+fq, m.tr+fr)) m.promotion=true; });
    }
    return moves.map(m=>({fq:q,fr:r,piece,...m}));
  }
  function allPieceCells(board,color){
    return Object.keys(board).filter(k=>board[k][0]===color).map(k=>{ const [q,r]=k.split(',').map(Number); return {q,r}; });
  }
  function allLegalMoves(board,color){
    let moves=[];
    allPieceCells(board,color).forEach(({q,r})=> moves = moves.concat(pieceMoves(board,q,r)));
    return moves;
  }

  let state, lastMove=null, eliminationBanner=0, eliminationText='';
  function newGame(mode){
    state = {board: setupBoard(), active:['0','1','2'], turn:'0', mode, gameOver:false, winner:null};
    selected=null; legalTargets=[]; handoverPending=(mode==='hotseat'); lastMove=null; eliminationBanner=0;
    render();
    maybeAI();
  }
  function applyMove(mv){
    const board = state.board;
    const moverColor = mv.piece[0];
    delete board[key(mv.fq,mv.fr)];
    board[key(mv.tq,mv.tr)] = mv.promotion ? moverColor+(mv.promotion===true?'Q':mv.promotion) : mv.piece;
    lastMove = {fq:mv.fq, fr:mv.fr, tq:mv.tq, tr:mv.tr};
    if(mv.capture && mv.capturedPiece[1]==='K'){
      const eliminated = mv.capturedPiece[0];
      state.active = state.active.filter(p=>p!==eliminated);
      eliminationText = `${TEAM_NAME[eliminated]} has been eliminated!`;
      eliminationBanner = 2.6;
      setTimeout(()=>{ eliminationBanner=0; render(); }, 2600);
    }
    advanceTurn();
  }
  function advanceTurn(){
    if(state.active.length<=1){
      state.gameOver=true; state.winner=state.active[0]||null;
      const humanWon = state.winner!==null && (state.mode==='hotseat' || state.winner==='0');
      if(humanWon) (typeof Achievements!=='undefined'&&Achievements.unlock('three_player_chess_win'));
      return;
    }
    let idx = ['0','1','2'].indexOf(state.turn);
    for(let i=0;i<3;i++){
      idx = (idx+1)%3;
      const cand = String(idx);
      if(state.active.includes(cand) && allLegalMoves(state.board,cand).length>0){
        state.turn = cand;
        return;
      }
    }
    // Every remaining player is completely stuck — exceptionally rare,
    // but don't leave the game silently frozen with no result.
    state.gameOver = true; state.winner = null;
  }
  const AI_PIECE_VAL = {P:100,N:320,B:330,R:500,Q:900,K:20000};
  function squareAttackedBy(board, q, r, color){
    return allLegalMoves(board, color).some(m => m.tq===q && m.tr===r && m.capture);
  }
  function maybeAI(){
    if(state.gameOver) return;
    if(state.mode!=='ai') return;
    if(state.turn==='0') return; // human seat
    setTimeout(()=>{
      if(state.gameOver) return;
      const moves = allLegalMoves(state.board, state.turn);
      if(!moves.length){ advanceTurn(); render(); maybeAI(); return; }
      const others = ['0','1','2'].filter(c=>c!==state.turn && state.active.includes(c));
      let bestScore=-Infinity, bestMoves=[];
      for(const mv of moves){
        let score = 0;
        if(mv.capture){
          score += AI_PIECE_VAL[mv.capturedPiece[1]] || 0;
          if(mv.capturedPiece[1]==='K') score += 1000000; // winning capture — always take it
        }
        const boardCopy = Object.assign({}, state.board);
        delete boardCopy[key(mv.fq,mv.fr)];
        boardCopy[key(mv.tq,mv.tr)] = mv.promotion ? mv.piece[0]+'Q' : mv.piece;
        const hanging = others.some(oc => squareAttackedBy(boardCopy, mv.tq, mv.tr, oc));
        if(hanging) score -= (AI_PIECE_VAL[mv.piece[1]]||0)*0.75;
        score += Math.random()*10;
        if(score>bestScore){ bestScore=score; bestMoves=[mv]; }
        else if(score===bestScore) bestMoves.push(mv);
      }
      const mv = bestMoves[Math.floor(Math.random()*bestMoves.length)];
      applyMove(mv);
      render();
      if(!state.gameOver) maybeAI();
    }, 400);
  }

  let selected=null, legalTargets=[], handoverPending=false, pendingPromotion=null;
  function cellClick(q,r){
    if(state.gameOver || pendingPromotion) return;
    if(state.mode==='ai' && state.turn!=='0') return;
    const piece = pieceAt(state.board,q,r);
    if(selected){
      const mv = legalTargets.find(m=>m.tq===q && m.tr===r);
      if(mv){
        if(mv.promotion){ pendingPromotion = mv; selected=null; legalTargets=[]; render(); return; }
        finishMove(mv);
        return;
      }
    }
    if(piece && piece[0]===state.turn){
      legalTargets = pieceMoves(state.board,q,r);
      selected = legalTargets.length ? {q,r} : null;
    } else { selected=null; legalTargets=[]; }
    render();
  }
  function finishMove(mv){
    applyMove(mv); selected=null; legalTargets=[]; pendingPromotion=null;
    if(state.mode==='hotseat' && !state.gameOver) handoverPending=true;
    render();
    if(state.mode==='ai') maybeAI();
  }
  function pickPromotion(letter){
    if(!pendingPromotion) return;
    finishMove({...pendingPromotion, promotion:letter});
  }
  function hexPoints(cx,cy,s){
    const pts=[];
    for(let i=0;i<6;i++){ const ang=Math.PI/180*(60*i-30); pts.push(`${cx+s*Math.cos(ang)},${cy+s*Math.sin(ang)}`); }
    return pts.join(' ');
  }
  function render(){
    if(!container) return;
    const handoverEl = container.querySelector('.hex-handover');
    const playInner = container.querySelector('.hex-play-inner');
    if(handoverPending){
      handoverEl.style.display='flex';
      handoverEl.innerHTML = `
        <div style="text-align:center;">
          <div style="font-size:1.3rem;color:${TEAM_COLOR[state.turn]};margin-bottom:14px;">Pass the device to <b>${TEAM_NAME[state.turn]}</b></div>
          <button class="btn primary" id="hex-handover-ready">I'm ${TEAM_NAME[state.turn]} — Show the board</button>
        </div>
      `;
      handoverEl.querySelector('#hex-handover-ready').addEventListener('click', ()=>{ handoverPending=false; render(); });
      if(playInner) playInner.style.display='none';
      return;
    }
    handoverEl.style.display='none';
    if(playInner) playInner.style.display='block';
    const svgW = (maxX-minX)+HEX_SIZE*4, svgH=(maxY-minY)+HEX_SIZE*4;
    let svg = `<svg width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">`;
    allCells.forEach(([q,r])=>{
      const {x,y} = pixelOf(q,r);
      const isSel = selected && selected.q===q && selected.r===r;
      const isTarget = legalTargets.some(m=>m.tq===q&&m.tr===r);
      const isLastMove = lastMove && ((lastMove.fq===q&&lastMove.fr===r) || (lastMove.tq===q&&lastMove.tr===r));
      let fill = ((q-r)%3+3)%3===0 ? '#2a2a3f' : (((q-r)%3+3)%3===1 ? '#242438' : '#1e1e30');
      if(isLastMove && !isSel && !isTarget) fill = '#2f3a2a';
      let stroke = '#3a3a55', strokeW=1;
      if(isLastMove){ stroke='#8a9a50'; strokeW=2; }
      if(isSel){ stroke='#ffd700'; strokeW=3; }
      else if(isTarget){ stroke='#50ff50'; strokeW=3; }
      svg += `<polygon points="${hexPoints(x,y,HEX_SIZE-1)}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}" data-q="${q}" data-r="${r}" class="hexcell" style="cursor:pointer;"/>`;
      const piece = pieceAt(state.board,q,r);
      if(piece){
        svg += `<image href="${teamPieceImg(piece)}" x="${x-16}" y="${y-16}" width="32" height="32" style="pointer-events:none;filter:${TEAM_FILTER[piece[0]]};"/>`;
      }
    });
    svg += `</svg>`;
    container.querySelector('.hex-board-wrap').innerHTML = svg;
    container.querySelectorAll('.hexcell').forEach(el=>{
      el.addEventListener('click', ()=> cellClick(+el.dataset.q, +el.dataset.r));
    });
    const msg = container.querySelector('.hex-msg');
    if(state.gameOver){
      msg.innerHTML = state.winner!==null
        ? `<span style="color:${TEAM_COLOR[state.winner]};font-weight:700;">${TEAM_NAME[state.winner]} wins!</span>`
        : "It's a draw!";
    } else if(eliminationBanner>0){
      msg.innerHTML = `<span style="color:#ff5050;font-weight:700;">${eliminationText}</span>`;
    } else {
      const label = TEAM_NAME[state.turn] + (state.mode==='ai' && state.turn!=='0' ? ' (AI)' : '');
      msg.innerHTML = `<span style="color:${TEAM_COLOR[state.turn]};font-weight:600;">${label}</span> to move`;
    }
    const legend = container.querySelector('.hex-legend');
    legend.innerHTML = ['0','1','2'].map(p=>{
      const alive = state.active.includes(p);
      return `<span style="color:${TEAM_COLOR[p]};opacity:${alive?1:0.35};"><img src="${teamPieceImg(p+'K')}" style="width:16px;height:16px;vertical-align:middle;filter:${TEAM_FILTER[p]};"> ${TEAM_NAME[p]}${alive?'':' (eliminated)'}</span>`;
    }).join('  &bull;  ');
    const promoEl = container.querySelector('.hex-promo');
    if(pendingPromotion){
      promoEl.style.display='flex';
      promoEl.innerHTML = ['Q','R','B','N'].map(l=>`<button class="btn primary" data-l="${l}" style="display:flex;align-items:center;gap:6px;"><img src="${teamPieceImg(state.turn+l)}" style="width:26px;height:26px;object-fit:contain;filter:${TEAM_FILTER[state.turn]};"> ${l}</button>`).join('');
      promoEl.querySelectorAll('button').forEach(b=>b.addEventListener('click', ()=>pickPromotion(b.dataset.l)));
    } else {
      promoEl.style.display='none'; promoEl.innerHTML='';
    }
  }
  function init(c){
    container=c; computeCells();
    container.innerHTML = `
      <div class="msg" id="hex-setup-msg">Choose a mode:</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-bottom:10px;">
        <button class="btn primary" id="hex-mode-hotseat">3-Player Hotseat</button>
        <button class="btn primary" id="hex-mode-ai">Play as Gold vs 2 AI</button>
      </div>
      <div id="hex-play-area" style="display:none;">
        <div class="hex-handover" style="display:none;min-height:220px;align-items:center;justify-content:center;"></div>
        <div class="hex-play-inner">
          <div class="msg hex-msg"></div>
          <div class="hex-legend" style="text-align:center;font-size:0.85rem;margin-bottom:8px;"></div>
          <div class="hex-board-wrap"></div>
          <div class="hex-promo" style="display:none;gap:8px;justify-content:center;margin-top:10px;"></div>
          <div class="controls-hint">Click a piece, then a highlighted cell to move. Capture a king to eliminate that player. Pawns promote (your choice) on the far outer ring.</div>
          <button class="btn" id="hex-restart" style="margin-top:8px;">New Game</button>
        </div>
      </div>
    `;
    function start(mode){
      newGame(mode);
      container.querySelector('#hex-setup-msg').style.display='none';
      container.querySelectorAll('#hex-mode-hotseat,#hex-mode-ai').forEach(b=>b.style.display='none');
      container.querySelector('#hex-play-area').style.display='block';
    }
    container.querySelector('#hex-mode-hotseat').addEventListener('click', ()=>start('hotseat'));
    container.querySelector('#hex-mode-ai').addEventListener('click', ()=>start('ai'));
    container.querySelector('#hex-restart').addEventListener('click', ()=>{
      container.querySelector('#hex-setup-msg').style.display='block';
      container.querySelectorAll('#hex-mode-hotseat,#hex-mode-ai').forEach(b=>b.style.display='inline-block');
      container.querySelector('#hex-play-area').style.display='none';
    });
  }
  function destroy(){}
  registerGame('three_player_chess','Three-Player Chess','🔷', true, {init, destroy}, null, true);
})();
