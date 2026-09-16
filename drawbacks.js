/* DRAWBACK CHESS — a large pool of secret-handicap move filters, ported from
   the python drawbacks.py. Filters receive (moves, ctx) where ctx exposes
   the state, the color the drawback applies to, the board, and a move
   history array plus helper functions. Loss-condition-only drawbacks (a
   separate mechanic in the source — "lose if X becomes true", independent
   of move filtering) and a handful of drawbacks needing full per-piece
   identity tracking or a live chess engine are not included here. */

const DrawbackHelpers = (function(){
  function dist(fr,fc,tr,tc){ return Math.max(Math.abs(tr-fr), Math.abs(tc-fc)); }
  function isLight(r,c){ return (r+c)%2===0; }
  function kingNeighbors(r,c){
    const out=[];
    for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++){
      if(!dr&&!dc) continue;
      const nr=r+dr, nc=c+dc;
      if(nr>=0&&nr<8&&nc>=0&&nc<8) out.push({r:nr,c:nc});
    }
    return out;
  }
  function pieceCount(board,color){
    let n=0; for(let r=0;r<8;r++)for(let c=0;c<8;c++) if(board[r][c]&&board[r][c][0]===color) n++;
    return n;
  }
  function findPieces(board,type,color){
    const out=[];
    for(let r=0;r<8;r++)for(let c=0;c<8;c++){ const p=board[r][c]; if(p&&p[0]===color&&p[1]===type) out.push({r,c}); }
    return out;
  }
  function ownHalfRows(color){ return color==='w' ? [4,5,6,7] : [0,1,2,3]; }
  function requireIfPossible(moves, predicate){
    const matching = moves.filter(predicate);
    return matching.length ? matching : moves;
  }
  function lastMoveByColor(history,color){
    for(let i=history.length-1;i>=0;i--) if(history[i].color===color) return history[i];
    return null;
  }
  function lastMoveOverall(history){ return history.length ? history[history.length-1] : null; }
  function myMoveNumber(history,color){ return history.filter(h=>h.color===color).length + 1; }
  function myCompletedMoves(history,color){ return history.filter(h=>h.color===color).length; }
  function capturedTypesBy(history,color){ return new Set(history.filter(h=>h.color===color&&h.capture).map(h=>h.capturedPiece[1])); }
  function capturerPieceTypes(history,color){ return new Set(history.filter(h=>h.color===color&&h.capture).map(h=>h.type)); }
  function myCaptureSquares(history,color){ return new Set(history.filter(h=>h.color===color&&h.capture).map(h=>h.tr+','+h.tc)); }
  function opponentCaptureSquares(history,color){ return myCaptureSquares(history, color==='w'?'b':'w'); }
  function kingHasMoved(history,color){ return history.some(h=>h.color===color&&h.type==='K'); }
  function hasPromoted(history,color){ return history.some(h=>h.color===color&&h.promotion); }
  function recentByColor(history,color,n){ return history.filter(h=>h.color===color).slice(-n); }
  function typesTouched(entries){ return new Set(entries.map(e=>e.type)); }
  function isAttackedBy(state,r,c,byColor){ return ChessEngine.isSquareAttacked(state.board,r,c,byColor); }
  function afterMove(state, move){
    const clone = ChessEngine.cloneState(state);
    ChessEngine.commitMove(clone, move.promotion ? {...move, promotion:'Q'} : move);
    return clone;
  }
  function positionKey(state){
    return state.board.map(row=>row.map(p=>p||'.').join('')).join('/') + '|' + state.turn + '|' +
           JSON.stringify(state.castling) + '|' + (state.ep?state.ep.r+','+state.ep.c:'-');
  }
  function seededRandom(seed){
    let s = seed % 2147483647; if(s<=0) s += 2147483646;
    return function(){ s = (s*16807) % 2147483647; return (s-1)/2147483646; };
  }
  function perPlyChoice(history, options, salt){
    const rnd = seededRandom((history.length+1)*97 + salt);
    return options[Math.floor(rnd()*options.length)];
  }
  function perPlySample(history, population, k, salt){
    const rnd = seededRandom((history.length+1)*97 + salt);
    const pool = population.slice();
    const out = [];
    for(let i=0;i<k && pool.length;i++){ const idx=Math.floor(rnd()*pool.length); out.push(pool.splice(idx,1)[0]); }
    return out;
  }
  const PIECE_VAL = {P:1,N:3,B:3,R:5,Q:9,K:0};
  return {
    dist, isLight, kingNeighbors, pieceCount, findPieces, ownHalfRows, requireIfPossible,
    lastMoveByColor, lastMoveOverall, myMoveNumber, myCompletedMoves, capturedTypesBy,
    capturerPieceTypes, myCaptureSquares, opponentCaptureSquares, kingHasMoved, hasPromoted,
    recentByColor, typesTouched, isAttackedBy, afterMove, positionKey, perPlyChoice, perPlySample,
    PIECE_VAL
  };
})();

const DRAWBACKS = (function(){
  const H = DrawbackHelpers;
  const list = [];
  function add(id, name, desc, filter, init){ list.push({id, name, desc, filter, init}); }

  add('lucky','Lucky','No drawback at all — you got lucky.', (moves)=>moves);

  // ---- simple move-attribute filters ----
  add('no_castling','No Castling','You may not castle.', (moves)=>moves.filter(m=>!m.isCastle));
  add('lame_duck','Lame Duck','Your king may not move at all.', (moves)=>moves.filter(m=>m.piece[1]!=='K'));
  add('no_shuffling','No Shuffling',"Your rooks can't move sideways (same rank).", (moves)=>moves.filter(m=>!(m.piece[1]==='R' && m.fr===m.tr)));
  add('entrenched','Entrenched',"Your rooks can't move more than 2 squares.", (moves)=>moves.filter(m=>!(m.piece[1]==='R' && H.dist(m.fr,m.fc,m.tr,m.tc)>2)));
  add('cess','Cess',"You can't move to the h-file.", (moves)=>moves.filter(m=>m.tc!==7));
  add('vegan','Vegan',"You may not capture knights.", (moves)=>moves.filter(m=>!(m.capturedPiece && m.capturedPiece[1]==='N')));
  add('conscientious_objectors','Conscientious Objectors',"You can't capture with pawns.", (moves)=>moves.filter(m=>!(m.piece[1]==='P' && m.capture)));
  add('true_gentleman','True Gentleman',"You may not capture the opponent's queen.", (moves)=>moves.filter(m=>!(m.capturedPiece && m.capturedPiece[1]==='Q')));
  add('left_for_dead','Left for Dead','You can only capture toward the a-file.', (moves)=>moves.filter(m=>!m.capture || m.tc<m.fc));
  add('checkers','Checkers','You must capture if able.', (moves)=>H.requireIfPossible(moves, m=>m.capture));
  add('forward_march','Forward March',"None of your pieces can move backward.", (moves,ctx)=>moves.filter(m=>{ const backward = ctx.color==='w' ? m.tr>m.fr : m.tr<m.fr; return !backward; }));
  add('stop_stalling','Stop Stalling',"None of your pieces can move sideways (same rank).", (moves)=>moves.filter(m=>m.fr!==m.tr));
  add('number_of_the_beast','Number of the Beast',"You can't move to the sixth rank.", (moves)=>moves.filter(m=>m.tr!==2));
  add('champing_at_the_bit','Champing at the Bit','Your pawns can only ever advance two squares at a time.', (moves)=>moves.filter(m=>!(m.piece[1]==='P' && !m.capture && !m.isDoubleStep)));
  add('shadow_queen','Shadow Queen','Your queen may only move to dark squares.', (moves)=>moves.filter(m=>!(m.piece[1]==='Q' && H.isLight(m.tr,m.tc))));
  add('horse_tranquilizer','Horse Tranquilizer',"Your knights can't capture.", (moves)=>moves.filter(m=>!(m.piece[1]==='N' && m.capture)));
  add('trophy_wife','Trophy Wife',"Your queen can't capture.", (moves)=>moves.filter(m=>!(m.piece[1]==='Q' && m.capture)));
  add('elephants_fear_mice','Elephants Fear Mice',"Your non-pawn pieces can't capture pawns.", (moves)=>moves.filter(m=>!(m.piece[1]!=='P' && m.capturedPiece && m.capturedPiece[1]==='P')));
  add('outflanked','Outflanked',"Except for capturing the king, you can't capture on the rim.", (moves)=>moves.filter(m=>!(m.capture && m.capturedPiece[1]!=='K' && (m.tr===0||m.tr===7||m.tc===0||m.tc===7))));
  add('far_sighted','Far Sighted',"Your pieces can't capture anything adjacent to them.", (moves)=>moves.filter(m=>!(m.capture && H.dist(m.fr,m.fc,m.tr,m.tc)<=1)));
  add('whites_of_their_eyes','Whites of Their Eyes','You can only capture at a distance of 2 squares or less.', (moves)=>moves.filter(m=>!m.capture || H.dist(m.fr,m.fc,m.tr,m.tc)<=2));
  add('punching_down','Punching Down',"Your pieces can't capture anything worth more than themselves (the king is always fair game).", (moves)=>moves.filter(m=> !m.capture || m.capturedPiece[1]==='K' || H.PIECE_VAL[m.capturedPiece[1]]<=H.PIECE_VAL[m.piece[1]]));
  add('professional_courtesy','Professional Courtesy',"Your pieces can't capture enemy pieces of their own type.", (moves)=>moves.filter(m=>!(m.capture && m.capturedPiece[1]===m.piece[1])));
  add('leaps_and_bounds','Leaps and Bounds',"You can't move a piece to a square adjacent to where it started.", (moves)=>moves.filter(m=>H.dist(m.fr,m.fc,m.tr,m.tc)>1));
  add('inside_the_lines','Inside the Lines',"You can't move onto the rim, unless you started there too.", (moves)=>moves.filter(m=>{
    const startRim = m.fr===0||m.fr===7||m.fc===0||m.fc===7;
    const endRim = m.tr===0||m.tr===7||m.tc===0||m.tc===7;
    return !endRim || startRim;
  }));
  add('messy_divorce','Messy Divorce',"Your pieces can't cross between the queenside and kingside.", (moves)=>moves.filter(m=>{
    const side=(c)=>c<=3?'q':'k'; return side(m.fc)===side(m.tc);
  }));
  add('control_center','Control Center','Non-capturing moves must land in the four central files.', (moves)=>moves.filter(m=> m.capture || (m.tc>=2 && m.tc<=5)));
  add('same_shade','Same Shade','A move must land on a square the same color (light/dark) as it started from.', (moves)=>H.requireIfPossible(moves, m=>H.isLight(m.fr,m.fc)===H.isLight(m.tr,m.tc)));
  add('iron_curtain','Iron Curtain',"Non-capturing moves can't land on the d or e file.", (moves)=>H.requireIfPossible(moves, m=> m.capture || (m.tc!==3 && m.tc!==4)));
  add('homebody','Homebody','Captures may only land on your own side of the board.', (moves,ctx)=>moves.filter(m=> !m.capture || H.ownHalfRows(ctx.color).includes(m.tr)));
  add('en_passant_or_bust','En Passant or Bust','You must capture en passant if you can.', (moves)=>H.requireIfPossible(moves, m=>m.isEnPassant));
  add('crossing_the_rubicon','Crossing the Rubicon',"Once you leave your own half, you can't come back.", (moves,ctx)=>{
    const home = new Set(H.ownHalfRows(ctx.color));
    return moves.filter(m=> home.has(m.fr) || !home.has(m.tr));
  });
  add('drag_movement','Drag Movement','Your queen may only move one square at a time.', (moves)=>moves.filter(m=>!(m.piece[1]==='Q' && H.dist(m.fr,m.fc,m.tr,m.tc)!==1)));

  // ---- history-based (last move / captures-so-far) ----
  add('no_return','No Return',"A piece can't immediately retrace its own previous move.", (moves,ctx)=>{
    const last = H.lastMoveByColor(ctx.history, ctx.color);
    if(!last) return moves;
    return moves.filter(m=>!(m.fr===last.tr && m.fc===last.tc && m.tr===last.fr && m.tc===last.fc));
  });
  add('same_file_fate','Same File Fate','If your last move changed files, your next must too, and vice versa.', (moves,ctx)=>{
    const last = H.lastMoveByColor(ctx.history, ctx.color);
    if(!last) return moves;
    const changed = last.fc!==last.tc;
    return H.requireIfPossible(moves, m=>(m.fc!==m.tc)===changed);
  });
  add('rank_parity','Rank Parity','Your destination rank must alternate between odd and even.', (moves,ctx)=>{
    const last = H.lastMoveByColor(ctx.history, ctx.color);
    if(!last) return moves;
    const lastOdd = last.tr%2===1;
    return H.requireIfPossible(moves, m=>(m.tr%2===1)!==lastOdd);
  });
  add('quiet_landing','Quiet Landing','After you capture, your next move must be a non-capture if one is available.', (moves,ctx)=>{
    const last = H.lastMoveByColor(ctx.history, ctx.color);
    if(!last || !last.capture) return moves;
    return H.requireIfPossible(moves, m=>!m.capture);
  });
  add('no_same_destination','No Same Destination',"You can't use the same destination square on consecutive own turns.", (moves,ctx)=>{
    const last = H.lastMoveByColor(ctx.history, ctx.color);
    if(!last) return moves;
    return H.requireIfPossible(moves, m=>!(m.tr===last.tr && m.tc===last.tc));
  });
  add('rook_or_knight','Rook or Knight','Every third own move, you must move a rook or knight if possible.', (moves,ctx)=>{
    if(H.myMoveNumber(ctx.history,ctx.color)%3!==0) return moves;
    return H.requireIfPossible(moves, m=>m.piece[1]==='R'||m.piece[1]==='N');
  });
  add('pawn_or_queen','Pawn or Queen','On alternating own moves, you must move a pawn, then a queen.', (moves,ctx)=>{
    const wanted = H.myMoveNumber(ctx.history,ctx.color)%2===1 ? 'P' : 'Q';
    return H.requireIfPossible(moves, m=>m.piece[1]===wanted);
  });
  add('center_or_edge','Center or Edge','Alternate between landing in the central four files and the outer four files.', (moves,ctx)=>{
    const last = H.lastMoveByColor(ctx.history, ctx.color);
    if(!last) return moves;
    const lastCenter = last.tc>=2 && last.tc<=5;
    return H.requireIfPossible(moves, m=>((m.tc>=2&&m.tc<=5)!==lastCenter));
  });
  add('capture_or_retreat','Capture or Retreat','After a capture, you must capture again or retreat that piece.', (moves,ctx)=>{
    const last = H.lastMoveByColor(ctx.history, ctx.color);
    if(!last || !last.capture) return moves;
    const captures = moves.filter(m=>m.capture);
    const retreat = moves.filter(m=>m.fr===last.tr && m.fc===last.tc);
    const forced = captures.concat(retreat.filter(m=>!captures.includes(m)));
    return forced.length ? forced : moves;
  });
  add('rook_and_bishop','Rook and Bishop','Every fourth own move, you must move a rook or bishop if possible.', (moves,ctx)=>{
    if(H.myMoveNumber(ctx.history,ctx.color)%4!==0) return moves;
    return H.requireIfPossible(moves, m=>m.piece[1]==='R'||m.piece[1]==='B');
  });
  add('religious_dispute','Religious Dispute',"If your opponent's last move was with a bishop, you must move a bishop too.", (moves,ctx)=>{
    const last = H.lastMoveOverall(ctx.history);
    if(!last || last.type!=='B') return moves;
    return H.requireIfPossible(moves, m=>m.piece[1]==='B');
  });
  add('flatterer','Flatterer','You must move a pawn right after your opponent does, and a non-pawn right after they do.', (moves,ctx)=>{
    const last = H.lastMoveOverall(ctx.history);
    if(!last) return moves;
    const wantPawn = last.type==='P';
    return H.requireIfPossible(moves, m=>(m.piece[1]==='P')===wantPawn);
  });
  add('hipster','Hipster',"You can't move the same piece type your opponent just moved.", (moves,ctx)=>{
    const last = H.lastMoveOverall(ctx.history);
    if(!last) return moves;
    return H.requireIfPossible(moves, m=>m.piece[1]!==last.type);
  });
  add('quit_horsing_around','Quit Horsing Around',"You can't move a knight right after you moved one.", (moves,ctx)=>{
    const last = H.lastMoveByColor(ctx.history, ctx.color);
    if(!last || last.type!=='N') return moves;
    return moves.filter(m=>m.piece[1]!=='N');
  });
  add('simon_says','Simon Says',"You must move to the same color square your opponent just moved to.", (moves,ctx)=>{
    const last = H.lastMoveOverall(ctx.history);
    if(!last) return moves;
    const wantLight = H.isLight(last.tr,last.tc);
    return H.requireIfPossible(moves, m=>H.isLight(m.tr,m.tc)===wantLight);
  });
  add('hopscotch','Hopscotch','You must alternate moving to light and dark squares.', (moves,ctx)=>{
    const last = H.lastMoveByColor(ctx.history, ctx.color);
    if(!last) return moves;
    const lastLight = H.isLight(last.tr,last.tc);
    return H.requireIfPossible(moves, m=>H.isLight(m.tr,m.tc)!==lastLight);
  });
  add('spice_of_life','Spice of Life',"You can't move the same piece type twice in a row.", (moves,ctx)=>{
    const last = H.lastMoveByColor(ctx.history, ctx.color);
    if(!last) return moves;
    return H.requireIfPossible(moves, m=>m.piece[1]!==last.type);
  });
  add('alternator','Alternator','You must alternate pawn moves and non-pawn moves.', (moves,ctx)=>{
    const last = H.lastMoveByColor(ctx.history, ctx.color);
    if(!last) return moves;
    const wantPawn = last.type!=='P';
    return H.requireIfPossible(moves, m=>(m.piece[1]==='P')===wantPawn);
  });
  add('fixation','Fixation',"You can't switch to a different pawn (or different non-pawn) until you switch categories.", (moves,ctx)=>{
    const last = H.lastMoveByColor(ctx.history, ctx.color);
    if(!last) return moves;
    const lockedIsPawn = last.type==='P';
    return H.requireIfPossible(moves, m=>{
      const isPawn = m.piece[1]==='P';
      if(isPawn!==lockedIsPawn) return true;
      return m.fr===last.tr && m.fc===last.tc;
    });
  });
  add('bipartisanship','Bipartisanship',"You can't move left twice in a row, or right twice in a row.", (moves,ctx)=>{
    const last = H.lastMoveByColor(ctx.history, ctx.color);
    if(!last) return moves;
    const delta = last.tc-last.fc;
    if(delta===0) return moves;
    const lastDir = delta>0?1:-1;
    return moves.filter(m=>{ const d=m.tc-m.fc; if(d===0) return true; return (d>0?1:-1)!==lastDir; });
  });
  add('left_to_right','Left to Right','Each move must land further right than your last, until the h-file.', (moves,ctx)=>{
    const last = H.lastMoveByColor(ctx.history, ctx.color);
    if(!last || last.tc===7) return moves;
    return H.requireIfPossible(moves, m=>m.tc>last.tc);
  });
  add('haunted','Haunted',"You can't move to a square you've captured on before.", (moves,ctx)=>{
    const squares = H.myCaptureSquares(ctx.history, ctx.color);
    return moves.filter(m=>!squares.has(m.tr+','+m.tc));
  });
  add('superstitious','Superstitious',"You can't move to a square your opponent has captured on.", (moves,ctx)=>{
    const squares = H.opponentCaptureSquares(ctx.history, ctx.color);
    return moves.filter(m=>!squares.has(m.tr+','+m.tc));
  });
  add('relay_race','Relay Race','You must move a piece adjacent to where your last move landed, if you can.', (moves,ctx)=>{
    const last = H.lastMoveByColor(ctx.history, ctx.color);
    if(!last) return moves;
    return H.requireIfPossible(moves, m=>H.dist(m.fr,m.fc,last.tr,last.tc)===1);
  });
  add('boxing_with_shadow','Boxing with Shadow',"If you can move to the square your opponent's piece just left, you must.", (moves,ctx)=>{
    const last = H.lastMoveOverall(ctx.history);
    if(!last) return moves;
    return H.requireIfPossible(moves, m=>m.tr===last.fr && m.tc===last.fc);
  });
  add('guerilla_tactics','Guerilla Tactics','After a capture, you must retreat that piece back where it came from if you can.', (moves,ctx)=>{
    const last = H.lastMoveByColor(ctx.history, ctx.color);
    if(!last || !last.capture) return moves;
    const back = moves.find(m=>m.fr===last.tr && m.fc===last.tc && m.tr===last.fr && m.tc===last.fc);
    return back ? [back] : moves;
  });
  add('torpedos','Torpedos','If a pawn you moved last turn can move again, it must.', (moves,ctx)=>{
    const last = H.lastMoveByColor(ctx.history, ctx.color);
    if(!last || last.type!=='P') return moves;
    return H.requireIfPossible(moves, m=>m.fr===last.tr && m.fc===last.tc);
  });
  add('going_the_distance','Going the Distance','Each move must be at least as long as the previous move overall.', (moves,ctx)=>{
    const last = H.lastMoveOverall(ctx.history);
    if(!last) return moves;
    const threshold = H.dist(last.fr,last.fc,last.tr,last.tc);
    return H.requireIfPossible(moves, m=>H.dist(m.fr,m.fc,m.tr,m.tc)>=threshold);
  });
  add('hedonic_treadmill','Hedonic Treadmill','Each move must move a piece worth at least as much as the last-moved piece.', (moves,ctx)=>{
    const last = H.lastMoveOverall(ctx.history);
    if(!last) return moves;
    const threshold = H.PIECE_VAL[last.type];
    return H.requireIfPossible(moves, m=>H.PIECE_VAL[m.piece[1]]>=threshold);
  });
  add('velociraptor','Velociraptor','You can only capture a piece type your opponent has moved in their last three moves.', (moves,ctx)=>{
    const oppo = ctx.color==='w'?'b':'w';
    const recent = H.typesTouched(H.recentByColor(ctx.history, oppo, 3));
    return moves.filter(m=> !m.capture || recent.has(m.capturedPiece[1]));
  });
  add('leveling_up','Leveling Up','You must capture in ascending order of value: pawn, knight, bishop, rook, queen, king.', (moves,ctx)=>{
    const order=['P','N','B','R','Q','K'];
    const already = H.capturedTypesBy(ctx.history, ctx.color);
    return moves.filter(m=>{
      if(!m.capture) return true;
      const idx = order.indexOf(m.capturedPiece[1]);
      return idx===0 || already.has(order[idx-1]);
    });
  });
  add('monkey_see','Monkey See','You can only capture with piece types your opponent has already captured with.', (moves,ctx)=>{
    const oppo = ctx.color==='w'?'b':'w';
    const oppoTypes = H.capturerPieceTypes(ctx.history, oppo);
    return moves.filter(m=>!m.capture || oppoTypes.has(m.piece[1]));
  });
  add('queen_bee','Queen Bee','Once you capture with your queen, you can no longer move her.', (moves,ctx)=>{
    if(!H.capturerPieceTypes(ctx.history, ctx.color).has('Q')) return moves;
    return moves.filter(m=>m.piece[1]!=='Q');
  });
  add('out_of_breath','Out of Breath','You can only move your king once, for the whole game.', (moves,ctx)=>{
    if(!H.kingHasMoved(ctx.history, ctx.color)) return moves;
    return moves.filter(m=>m.piece[1]!=='K');
  });
  add('stir_crazy','Stir Crazy',"After 4 own moves in a row without moving your king, you must move it.", (moves,ctx)=>{
    const mine = ctx.history.filter(h=>h.color===ctx.color);
    let streak=0;
    for(let i=mine.length-1;i>=0;i--){ if(mine[i].type==='K') break; streak++; }
    if(streak<4) return moves;
    return H.requireIfPossible(moves, m=>m.piece[1]==='K');
  });
  add('bloodthirsty','Bloodthirsty','After 2 non-capturing own moves in a row, you must capture if you can.', (moves,ctx)=>{
    const mine = H.recentByColor(ctx.history, ctx.color, 2);
    if(mine.length<2 || mine.some(m=>m.capture)) return moves;
    return H.requireIfPossible(moves, m=>m.capture);
  });
  add('centralized_command','Centralized Command',"If your king hasn't moved in your last 3 moves, you can't capture.", (moves,ctx)=>{
    const recent = H.recentByColor(ctx.history, ctx.color, 3);
    if(H.typesTouched(recent).has('K')) return moves;
    return moves.filter(m=>!m.capture);
  });
  add('cowering_in_fear','Cowering in Fear',"You can only move pieces worth at least as much as the most valuable piece your opponent has captured of yours.", (moves,ctx)=>{
    const oppo = ctx.color==='w'?'b':'w';
    const oppoCaptured = H.capturedTypesBy(ctx.history, oppo);
    if(!oppoCaptured.size) return moves;
    const threshold = Math.max(...[...oppoCaptured].map(t=>H.PIECE_VAL[t]));
    return moves.filter(m=>H.PIECE_VAL[m.piece[1]]>=threshold);
  });
  add('remorseful','Remorseful',"You can't capture two turns in a row.", (moves,ctx)=>{
    const mine = H.recentByColor(ctx.history, ctx.color, 1);
    if(!mine.length || !mine[0].capture) return moves;
    return moves.filter(m=>!m.capture);
  });
  add('turn_the_other_cheek','Turn the Other Cheek',"You can't recapture on the square your opponent just captured on.", (moves,ctx)=>{
    const last = H.lastMoveOverall(ctx.history);
    if(!last || !last.capture) return moves;
    return moves.filter(m=>!(m.capture && m.tr===last.tr && m.tc===last.tc));
  });
  add('barbarian_rage','Barbarian Rage','If you captured on your last move, you must capture again if able.', (moves,ctx)=>{
    const mine = H.recentByColor(ctx.history, ctx.color, 1);
    if(!mine.length || !mine[0].capture) return moves;
    return H.requireIfPossible(moves, m=>m.capture);
  });
  add('evil_twin','Evil Twin','If you can capture a piece with one of the same type, you must.', (moves)=>H.requireIfPossible(moves, m=>m.capture && m.capturedPiece[1]===m.piece[1]));
  add('diplomatic_immunity','Diplomatic Immunity',"You can't capture a piece that just moved, unless that move was itself a capture.", (moves,ctx)=>{
    const last = H.lastMoveOverall(ctx.history);
    if(!last || last.capture) return moves;
    return moves.filter(m=>!(m.capture && m.tr===last.tr && m.tc===last.tc));
  });
  add('royal_jubilee','Royal Jubilee','After capturing a non-pawn piece, your next move must be your king or queen.', (moves,ctx)=>{
    const last = H.lastMoveByColor(ctx.history, ctx.color);
    if(!last || !last.capture || last.capturedPiece[1]==='P') return moves;
    return H.requireIfPossible(moves, m=>m.piece[1]==='K'||m.piece[1]==='Q');
  });
  add('escort_mission','Escort Mission','If your king can capture, it must.', (moves)=>H.requireIfPossible(moves, m=>m.piece[1]==='K'&&m.capture));
  add('clock_watcher','Clock Watcher','Every 5th own move, you must move a piece still on its starting square.', (moves,ctx)=>{
    if(H.myMoveNumber(ctx.history,ctx.color)%5!==0) return moves;
    const back = ctx.color==='w'?7:0, pawnRow = ctx.color==='w'?6:1;
    return H.requireIfPossible(moves, m=> m.fr===back || m.fr===pawnRow);
  });
  add('stubborn','Stubborn','You must move the same piece type you moved last turn, if one can.', (moves,ctx)=>{
    const last = H.lastMoveByColor(ctx.history, ctx.color);
    if(!last) return moves;
    return H.requireIfPossible(moves, m=>m.piece[1]===last.type);
  });
  add('truant','Truant',"You can't move the same piece twice in a row.", (moves,ctx)=>{
    const last = H.lastMoveByColor(ctx.history, ctx.color);
    if(!last) return moves;
    return H.requireIfPossible(moves, m=>!(m.fr===last.tr && m.fc===last.tc));
  });
  add('ladies_first','Ladies First',"You can't move your king unless your last move was with your queen.", (moves,ctx)=>{
    const kingMoves = moves.some(m=>m.piece[1]==='K');
    if(!kingMoves) return moves;
    const last = H.lastMoveByColor(ctx.history, ctx.color);
    if(last && last.type==='Q') return moves;
    return moves.filter(m=>m.piece[1]!=='K');
  });
  add('scorched_earth','Scorched Earth',"You can't move to a square you've already departed from this game.", (moves,ctx)=>{
    const departed = new Set(ctx.history.filter(h=>h.color===ctx.color).map(h=>h.fr+','+h.fc));
    return moves.filter(m=>!departed.has(m.tr+','+m.tc));
  });
  add('rising_water','Rising Water','Every 10 plies the water rises a rank — you cannot move into or out of it.', (moves,ctx)=>{
    const level = Math.floor(ctx.history.length/10);
    if(level<=0) return moves;
    const safeRank = (r)=> ctx.color==='w' ? 7-r : r;
    return moves.filter(m=>safeRank(m.fr)>=level && safeRank(m.tr)>=level);
  });
  add('windup_toys','Windup Toys','After 24 plies, your knights and bishops may no longer move.', (moves,ctx)=>{
    if(ctx.history.length<24) return moves;
    return moves.filter(m=>m.piece[1]!=='N' && m.piece[1]!=='B');
  });
  add('oddball','Oddball',"On even move numbers, you can't capture.", (moves,ctx)=>{
    const moveNum = Math.floor(ctx.history.length/2)+1;
    if(moveNum%2===1) return moves;
    return moves.filter(m=>!m.capture);
  });
  add('even_keeled','Even Keeled',"On odd move numbers, you can't capture.", (moves,ctx)=>{
    const moveNum = Math.floor(ctx.history.length/2)+1;
    if(moveNum%2===0) return moves;
    return moves.filter(m=>!m.capture);
  });
  add('prima_donna','Prima Donna',"You can't have more than one pawn on the same file.", (moves,ctx)=>{
    return moves.filter(m=>{
      if(m.piece[1]!=='P' || m.fc===m.tc) return true;
      for(let r=0;r<8;r++){ const p=ctx.state.board[r][m.tc]; if(p===ctx.color+'P' && !(r===m.fr && m.tc===m.fc)) return false; }
      return true;
    });
  });
  add('fair_trade','Fair Trade',"You can't capture unless the material you've lost is worth at least as much as what you've captured.", (moves,ctx)=>{
    const oppo = ctx.color==='w'?'b':'w';
    const paid = [...H.capturedTypesBy(ctx.history, oppo)].reduce((s,t)=>s+H.PIECE_VAL[t],0);
    const earned = [...H.capturedTypesBy(ctx.history, ctx.color)].reduce((s,t)=>s+H.PIECE_VAL[t],0);
    if(paid>=earned) return moves;
    return moves.filter(m=>!m.capture);
  });
  add('kamikaze','Kamikaze','You can only capture onto a square where the opponent could immediately recapture.', (moves,ctx)=>{
    return moves.filter(m=>{
      if(!m.capture) return true;
      const after = H.afterMove(ctx.state, m);
      const oppo = ctx.color==='w'?'b':'w';
      return H.isAttackedBy(after, m.tr, m.tc, oppo);
    });
  });
  add('pawn_storm','Pawn Storm',"Non-pawn pieces stay home until you've moved 4 distinct pawns.", (moves,ctx)=>{
    const startRow = ctx.color==='w'?6:1;
    const movedPawns = new Set(ctx.history.filter(h=>h.color===ctx.color && h.fr===startRow).map(h=>h.fc));
    if(movedPawns.size>=4) return moves;
    return H.requireIfPossible(moves, m=>m.piece[1]==='P');
  });
  add('restless_knights','Restless Knights','Your knights may only move if the move captures or gives check.', (moves,ctx)=>{
    return H.requireIfPossible(moves.filter(m=>m.piece[1]!=='N' || true), m=>{
      if(m.piece[1]!=='N') return true;
      if(m.capture) return true;
      const after = H.afterMove(ctx.state, m);
      return ChessEngine.isInCheck(after, ctx.color==='w'?'b':'w');
    });
  });
  add('prized_fighter','Prized Fighter',"When several of your pieces could capture the same target, you must use the most valuable one.", (moves)=>{
    const byTarget = {};
    moves.forEach(m=>{ if(m.capture){ const k=m.tr+','+m.tc; (byTarget[k]=byTarget[k]||[]).push(m); } });
    const banned = new Set();
    Object.values(byTarget).forEach(group=>{
      if(group.length<2) return;
      const best = Math.max(...group.map(m=>DrawbackHelpers.PIECE_VAL[m.piece[1]]));
      group.forEach(m=>{ if(DrawbackHelpers.PIECE_VAL[m.piece[1]]<best) banned.add(m); });
    });
    return moves.filter(m=>!banned.has(m));
  });
  add('baby_steps','Baby Steps','For your first 8 moves, every piece but a pawn can only move one square.', (moves,ctx)=>{
    if(H.myMoveNumber(ctx.history,ctx.color)>8) return moves;
    return moves.filter(m=>m.piece[1]==='P' || H.dist(m.fr,m.fc,m.tr,m.tc)<=1);
  });
  add('late_bloomer','Late Bloomer',"You can't promote a pawn until you've made 20 moves.", (moves,ctx)=>{
    if(H.myCompletedMoves(ctx.history,ctx.color)>=20) return moves;
    return moves.filter(m=>!m.promotion);
  });

  // ---- board-position-based (no history needed) ----
  add('tunnel_vision','Tunnel Vision',"Only a piece sharing your king's file or rank may move.", (moves,ctx)=>{
    const k = ChessEngine.findKing(ctx.state.board, ctx.color);
    if(!k) return moves;
    return H.requireIfPossible(moves, m=> m.piece[1]==='K' || m.fr===k.r || m.fc===k.c);
  });
  add('short_leash','Short Leash',"Non-king pieces can't move more than 3 squares from your king's current square.", (moves,ctx)=>{
    const k = ChessEngine.findKing(ctx.state.board, ctx.color);
    if(!k) return moves;
    return H.requireIfPossible(moves, m=> m.piece[1]==='K' || H.dist(k.r,k.c,m.tr,m.tc)<=3);
  });
  add('snipers','Snipers','Bishops can only capture from a distance of 4 or more squares.', (moves)=>moves.filter(m=>!(m.piece[1]==='B' && m.capture && H.dist(m.fr,m.fc,m.tr,m.tc)<4)));
  add('bishop_fan_club','Bishop Fan Club','You must promote to bishops, and your king/queen may only move diagonally.', (moves)=>moves.filter(m=>{
    if(m.promotion) return m.promotion==='B';
    if(m.piece[1]==='K'||m.piece[1]==='Q'){ return Math.abs(m.tr-m.fr)===Math.abs(m.tc-m.fc) && m.tr!==m.fr; }
    return true;
  }));
  add('rook_fan_club','Rook Fan Club','You must promote to rooks, and your king/queen may not move diagonally.', (moves)=>moves.filter(m=>{
    if(m.promotion) return m.promotion==='R';
    if(m.piece[1]==='K'||m.piece[1]==='Q'){ return !(Math.abs(m.tr-m.fr)===Math.abs(m.tc-m.fc) && m.tr!==m.fr); }
    return true;
  }));
  add('true_love','True Love',"Your king can only move next to your queen, and your queen only next to your king.", (moves,ctx)=>{
    const k = ChessEngine.findKing(ctx.state.board, ctx.color);
    const queens = H.findPieces(ctx.state.board,'Q',ctx.color);
    return moves.filter(m=>{
      if(m.piece[1]==='K'){ if(!queens.length) return false; return queens.some(q=>H.dist(m.tr,m.tc,q.r,q.c)===1); }
      if(m.piece[1]==='Q'){ if(!k) return true; return H.dist(m.tr,m.tc,k.r,k.c)===1; }
      return true;
    });
  });
  add('unrequited_love','Unrequited Love',"Your king must move toward your queen, and your queen away from the king.", (moves,ctx)=>{
    const k = ChessEngine.findKing(ctx.state.board, ctx.color);
    const queens = H.findPieces(ctx.state.board,'Q',ctx.color);
    return moves.filter(m=>{
      if(m.piece[1]==='K'){
        if(!queens.length) return false;
        const before = Math.min(...queens.map(q=>H.dist(m.fr,m.fc,q.r,q.c)));
        const after = Math.min(...queens.map(q=>H.dist(m.tr,m.tc,q.r,q.c)));
        return after<=before;
      }
      if(m.piece[1]==='Q'){
        if(!k) return true;
        const before = H.dist(m.fr,m.fc,k.r,k.c), after = H.dist(m.tr,m.tc,k.r,k.c);
        return after>=before;
      }
      return true;
    });
  });
  add('bridge_over_troubled_water','Bridge Over Troubled Water',"There's a river across the middle two ranks — cross only via the center two files.", (moves)=>moves.filter(m=>{
    if(m.tr===3||m.tr===4) return false;
    if(m.piece[1]==='N'||m.piece[1]==='K'||m.piece[1]==='P') return true;
    const dr=Math.sign(m.tr-m.fr), dc=Math.sign(m.tc-m.fc);
    let r=m.fr+dr,c=m.fc+dc;
    while(r!==m.tr||c!==m.tc){ if((r===3||r===4) && c!==3 && c!==4) return false; r+=dr; c+=dc; }
    return true;
  }));
  add('royal_berth','Royal Berth',"You can't move a piece adjacent to your own king.", (moves,ctx)=>{
    const k = ChessEngine.findKing(ctx.state.board, ctx.color);
    if(!k) return moves;
    return moves.filter(m=> m.piece[1]==='K' || H.dist(m.tr,m.tc,k.r,k.c)!==1);
  });
  add('separation_of_church_and_state','Separation of Church and State',"Bishops and kings (either side) can't move adjacent to each other.", (moves,ctx)=>{
    return moves.filter(m=>{
      if(m.piece[1]==='B'){
        for(const col of ['w','b']){ const k=ChessEngine.findKing(ctx.state.board,col); if(k && H.dist(m.tr,m.tc,k.r,k.c)===1) return false; }
        return true;
      }
      if(m.piece[1]==='K'){
        for(const col of ['w','b']){ const bishops=H.findPieces(ctx.state.board,'B',col); if(bishops.some(b=>H.dist(m.tr,m.tc,b.r,b.c)===1)) return false; }
        return true;
      }
      return true;
    });
  });
  add('medusa','Medusa',"You can't move a piece currently attacked by an enemy queen.", (moves,ctx)=>{
    const oppo = ctx.color==='w'?'b':'w';
    const queens = H.findPieces(ctx.state.board,'Q',oppo);
    return moves.filter(m=>!queens.some(q=>{
      // is the queen attacking the from-square right now? approximate via engine attack check
      return ChessEngine.isSquareAttacked(ctx.state.board, m.fr, m.fc, oppo) &&
             (q.r===m.fr || q.c===m.fc || Math.abs(q.r-m.fr)===Math.abs(q.c-m.fc));
    }));
  });
  add('thunderdome','Thunderdome',"The middle 16 squares are Thunderdome — once inside, you can't leave unless you're the only one of yours still there.", (moves,ctx)=>{
    const inZone=(r,c)=>r>=2&&r<=5&&c>=2&&c<=5;
    return moves.filter(m=>{
      if(!inZone(m.fr,m.fc) || inZone(m.tr,m.tc)) return true;
      let mine=0;
      for(let r=2;r<=5;r++)for(let c=2;c<=5;c++){ const p=ctx.state.board[r][c]; if(p&&p[0]===ctx.color) mine++; }
      return mine<=1;
    });
  });
  add('social_distancing','Social Distancing',"Non-capturing moves can't land next to an enemy piece.", (moves,ctx)=>{
    const oppo = ctx.color==='w'?'b':'w';
    return moves.filter(m=>{
      if(m.capture) return true;
      return !H.kingNeighbors(m.tr,m.tc).some(({r,c})=>{ const p=ctx.state.board[r][c]; return p && p[0]===oppo; });
    });
  });
  add('sibling_rivalry','Sibling Rivalry',"You can't move next to an enemy piece of the same type as the one moving.", (moves,ctx)=>{
    const oppo = ctx.color==='w'?'b':'w';
    return moves.filter(m=>!H.kingNeighbors(m.tr,m.tc).some(({r,c})=>{ const p=ctx.state.board[r][c]; return p && p[0]===oppo && p[1]===m.piece[1]; }));
  });
  add('pack_mentality','Pack Mentality',"Your pieces must move next to another one of your pieces.", (moves,ctx)=>H.requireIfPossible(moves, m=>H.kingNeighbors(m.tr,m.tc).some(({r,c})=>{ const p=ctx.state.board[r][c]; return p && p[0]===ctx.color && !(r===m.fr&&c===m.fc); })));
  add('cheerleaders','Cheerleaders',"Only pawns, or pieces standing next to one of your pawns, may capture.", (moves,ctx)=>moves.filter(m=>{
    if(!m.capture || m.piece[1]==='P') return true;
    const pawns = H.findPieces(ctx.state.board,'P',ctx.color);
    return pawns.some(p=>H.dist(m.fr,m.fc,p.r,p.c)===1);
  }));
  add('scouting_ahead','Scouting Ahead',"Non-pawns can't move further forward than your most advanced pawn.", (moves,ctx)=>{
    const pawns = H.findPieces(ctx.state.board,'P',ctx.color);
    if(!pawns.length) return moves;
    const frontier = ctx.color==='w' ? Math.min(...pawns.map(p=>p.r)) : Math.max(...pawns.map(p=>p.r));
    return moves.filter(m=> m.piece[1]==='P' || (ctx.color==='w' ? m.tr>=frontier : m.tr<=frontier));
  });
  add('leading_the_charge','Leading the Charge',"Non-knights can't move further forward than your most advanced knight.", (moves,ctx)=>{
    const knights = H.findPieces(ctx.state.board,'N',ctx.color);
    if(!knights.length) return moves;
    const frontier = ctx.color==='w' ? Math.min(...knights.map(k=>k.r)) : Math.max(...knights.map(k=>k.r));
    return moves.filter(m=> m.piece[1]==='N' || (ctx.color==='w' ? m.tr>=frontier : m.tr<=frontier));
  });
  add('torchlight','Torchlight',"Non-pawns may only move to or from a square adjacent to one of your pawns.", (moves,ctx)=>{
    const pawns = H.findPieces(ctx.state.board,'P',ctx.color);
    const adjacent=(r,c)=>pawns.some(p=>H.dist(r,c,p.r,p.c)===1);
    return moves.filter(m=> m.piece[1]==='P' || adjacent(m.fr,m.fc) || adjacent(m.tr,m.tc));
  });
  add('noble_steed','Noble Steed',"Non-knights may only move next to one of your knights.", (moves,ctx)=>{
    const knights = H.findPieces(ctx.state.board,'N',ctx.color);
    return moves.filter(m=> m.piece[1]==='N' || knights.some(k=>H.dist(m.fr,m.fc,k.r,k.c)===1));
  });
  add('spread_out','Spread Out',"No two of your non-pawn pieces may stand adjacent, and you may not castle.", (moves,ctx)=>moves.filter(m=>{
    if(m.isCastle) return false;
    if(m.piece[1]==='P') return true;
    return !H.kingNeighbors(m.tr,m.tc).some(({r,c})=>{ const p=ctx.state.board[r][c]; return p && p[0]===ctx.color && p[1]!=='P' && !(r===m.fr&&c===m.fc); });
  }));
  add('deer_in_the_headlights','Deer in the Headlights',"You can't move a piece that's currently under attack.", (moves,ctx)=>{
    const oppo = ctx.color==='w'?'b':'w';
    return moves.filter(m=>!H.isAttackedBy(ctx.state,m.fr,m.fc,oppo));
  });
  add('jumpy','Jumpy',"If a piece of yours is under attack, you must move it if you can.", (moves,ctx)=>{
    const oppo = ctx.color==='w'?'b':'w';
    return H.requireIfPossible(moves, m=>H.isAttackedBy(ctx.state,m.fr,m.fc,oppo));
  });
  add('stand_your_ground','Stand Your Ground',"Your pieces can only capture if they're currently under attack.", (moves,ctx)=>{
    const oppo = ctx.color==='w'?'b':'w';
    return moves.filter(m=>!m.capture || H.isAttackedBy(ctx.state,m.fr,m.fc,oppo));
  });
  add('cowardly','Cowardly',"A piece under attack may only retreat toward your own back rank.", (moves,ctx)=>{
    const oppo = ctx.color==='w'?'b':'w';
    return moves.filter(m=>{
      if(!H.isAttackedBy(ctx.state,m.fr,m.fc,oppo)) return true;
      return ctx.color==='w' ? m.tr>m.fr : m.tr<m.fr;
    });
  });
  add('protected_pawns','Protected Pawns',"Your pawns can only move to squares defended by another of your pieces.", (moves,ctx)=>moves.filter(m=>{
    if(m.piece[1]!=='P') return true;
    const after = H.afterMove(ctx.state, m);
    return H.isAttackedBy(after, m.tr, m.tc, ctx.color);
  }));
  add('friendly_fire','Friendly Fire',"You can only move to squares defended by another of your pieces.", (moves,ctx)=>moves.filter(m=>{
    const after = H.afterMove(ctx.state, m);
    return H.isAttackedBy(after, m.tr, m.tc, ctx.color);
  }));
  add('death_wish','Death Wish',"If you can move your king into check, you must (unless already in check).", (moves,ctx)=>{
    if(ChessEngine.isInCheck(ctx.state, ctx.color)) return moves;
    return H.requireIfPossible(moves, m=>{
      if(m.piece[1]!=='K') return false;
      const after = H.afterMove(ctx.state, m);
      const oppo = ctx.color==='w'?'b':'w';
      return H.isAttackedBy(after, m.tr, m.tc, oppo);
    });
  });
  add('respectful','Respectful',"You can't give check.", (moves,ctx)=>{
    const oppo = ctx.color==='w'?'b':'w';
    return moves.filter(m=>{
      const after = H.afterMove(ctx.state, m);
      return !ChessEngine.isInCheck(after, oppo);
    });
  });
  add('prince_charming','Prince Charming',"If your queen is under attack, you must move a knight if you can.", (moves,ctx)=>{
    const oppo = ctx.color==='w'?'b':'w';
    const queens = H.findPieces(ctx.state.board,'Q',ctx.color);
    if(!queens.some(q=>H.isAttackedBy(ctx.state,q.r,q.c,oppo))) return moves;
    return H.requireIfPossible(moves, m=>m.piece[1]==='N');
  });
  add('peons_first','Peons First',"You can't move a piece standing directly behind one of your own pawns.", (moves,ctx)=>{
    const behind = new Set();
    H.findPieces(ctx.state.board,'P',ctx.color).forEach(p=>{
      const br = ctx.color==='w' ? p.r+1 : p.r-1;
      if(br>=0&&br<8) behind.add(br+','+p.c);
    });
    return moves.filter(m=>!behind.has(m.fr+','+m.fc));
  });
  add('eye_of_sauron','Eye of Sauron',"Your rooks control how far forward your other pieces may go.", (moves,ctx)=>{
    const rooks = H.findPieces(ctx.state.board,'R',ctx.color);
    if(!rooks.length) return moves;
    const reachRanks = new Set(rooks.map(r=>r.r));
    rooks.forEach(rk=>{
      [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dr,dc])=>{
        let r=rk.r+dr,c=rk.c+dc;
        while(r>=0&&r<8&&c>=0&&c<8){ reachRanks.add(r); if(ctx.state.board[r][c]) break; r+=dr;c+=dc; }
      });
    });
    const limit = ctx.color==='w' ? Math.min(...reachRanks) : Math.max(...reachRanks);
    return moves.filter(m=> m.piece[1]==='P' || (ctx.color==='w' ? m.tr>=limit : m.tr<=limit));
  });
  add('separation_anxiety','Separation Anxiety',"A pawn next to your king can only move to stay next to your king.", (moves,ctx)=>{
    const k = ChessEngine.findKing(ctx.state.board, ctx.color);
    if(!k) return moves;
    return moves.filter(m=>{
      if(m.piece[1]!=='P' || H.dist(m.fr,m.fc,k.r,k.c)!==1) return true;
      return H.dist(m.tr,m.tc,k.r,k.c)===1;
    });
  });
  add('exclusivity_clause','Exclusivity Clause',"Two of your pieces can't be capable of landing on the same square this turn.", (moves)=>{
    const counts={};
    moves.forEach(m=>{ const k=m.tr+','+m.tc; counts[k]=(counts[k]||0)+1; });
    return moves.filter(m=>counts[m.tr+','+m.tc]<=1);
  });
  add('covering_fire','Covering Fire',"You can only capture a piece if you could capture it two different ways.", (moves)=>{
    const counts={};
    moves.forEach(m=>{ if(m.capture){ const k=m.tr+','+m.tc; counts[k]=(counts[k]||0)+1; } });
    return moves.filter(m=>!m.capture || counts[m.tr+','+m.tc]>=2);
  });
  add('indecisive','Indecisive',"A piece with more than one capture available can't capture at all.", (moves)=>{
    const counts={};
    moves.forEach(m=>{ if(m.capture){ const k=m.fr+','+m.fc; counts[k]=(counts[k]||0)+1; } });
    return moves.filter(m=>!m.capture || counts[m.fr+','+m.fc]<=1);
  });
  add('the_scent_of_blood','The Scent of Blood',"A piece that can capture can't make a quiet move instead.", (moves)=>{
    const capturers = new Set(moves.filter(m=>m.capture).map(m=>m.fr+','+m.fc));
    return moves.filter(m=>m.capture || !capturers.has(m.fr+','+m.fc));
  });

  // ---- per-ply pseudo-random (deterministic within a ply) ----
  add('obsession','Obsession','Every turn, a random square is chosen — if you can move there, you must.', (moves,ctx)=>{
    const target = H.perPlyChoice(ctx.history, [...Array(64).keys()], 6);
    const tr=Math.floor(target/8), tc=target%8;
    return H.requireIfPossible(moves, m=>m.tr===tr&&m.tc===tc);
  });
  add('gambler','Gambler','Every turn, a random piece type is forbidden from moving.', (moves,ctx)=>{
    const forbidden = H.perPlyChoice(ctx.history, ['P','N','B','R','Q','K'], 1);
    return moves.filter(m=>m.piece[1]!==forbidden);
  });
  add('unlucky','Unlucky','Every turn, 32 random squares become forbidden destinations.', (moves,ctx)=>{
    const all=[...Array(64).keys()];
    const banned = new Set(H.perPlySample(ctx.history, all, 32, 2));
    return moves.filter(m=>!banned.has(m.tr*8+m.tc));
  });
  add('colorblind','Colorblind','Every turn, either all light or all dark squares become forbidden.', (moves,ctx)=>{
    const bannedLight = H.perPlyChoice(ctx.history,[true,false],3);
    return H.requireIfPossible(moves, m=>H.isLight(m.tr,m.tc)!==bannedLight);
  });
  add('winds_of_fate','Winds of Fate',"Every turn, you're randomly unable to move either left or right.", (moves,ctx)=>{
    const bannedDir = H.perPlyChoice(ctx.history,[-1,1],5);
    return H.requireIfPossible(moves, m=>{ const d=m.tc-m.fc; if(d===0) return true; return (d>0?1:-1)!==bannedDir; });
  });
  add('coin_flip','Coin Flip','Heads: only pawns may move. Tails: only non-pawns.', (moves,ctx)=>{
    const heads = H.perPlyChoice(ctx.history,[true,false],7);
    return H.requireIfPossible(moves, m=> heads ? m.piece[1]==='P' : m.piece[1]!=='P');
  });
  add('dice_roll','Dice Roll','A fresh 1-6 roll every turn caps how far any piece may travel.', (moves,ctx)=>{
    const roll = H.perPlyChoice(ctx.history,[1,2,3,4,5,6],8);
    return H.requireIfPossible(moves, m=>H.dist(m.fr,m.fc,m.tr,m.tc)<=roll);
  });
  add('roulette','Roulette','The wheel bans one file, fresh each turn.', (moves,ctx)=>{
    const bannedFile = H.perPlyChoice(ctx.history,[0,1,2,3,4,5,6,7],11);
    return H.requireIfPossible(moves, m=>m.tc!==bannedFile);
  });
  add('surprise_package','Surprise Package',"A random die decides what your pawns promote to.", (moves,ctx)=>{
    const chosen = H.perPlyChoice(ctx.history,['Q','R','B','N'],10);
    return moves.filter(m=>!m.promotion || m.promotion===chosen);
  });

  return list;
})();

function assignDrawback(){
  const def = DRAWBACKS[Math.floor(Math.random()*DRAWBACKS.length)];
  const instance = {id:def.id, name:def.name, desc:def.desc, filter:def.filter};
  if(def.init) instance.params = def.init();
  return instance;
}
function applyDrawbackFallback(moves, drawback, ctx){
  if(!drawback || !drawback.filter) return moves;
  const filtered = drawback.filter(moves, ctx);
  return (filtered && filtered.length) ? filtered : moves;
}
