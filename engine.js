/* CHESS ENGINE (shared by all chess variants) */
const ChessEngine = (function(){
  const PIECE_VALUE = {P:100,N:320,B:330,R:500,Q:900,K:20000};
  const ANTI_PIECE_VALUE = {P:100,N:320,B:330,R:500,Q:900,K:20000};
  const UNICODE = {
    wP:'♙',wN:'♘',wB:'♗',wR:'♖',wQ:'♕',wK:'♔',
    bP:'♟',bN:'♞',bB:'♝',bR:'♜',bQ:'♛',bK:'♚'
  };
  // Piece-square tables (standard-ish values, in centipawns) used to give
  // the minimax AI a sense of good squares, not just raw material.
  // Indexed [ownHomeRank ... farRank][file] so they read the same for
  // either color; pstValue() below maps a board row to the right index.
  const PAWN_PST = [
    [ 0,  0,  0,  0,  0,  0,  0,  0],
    [ 5, 10, 10,-20,-20, 10, 10,  5],
    [ 5, -5,-10,  0,  0,-10, -5,  5],
    [ 0,  0,  0, 20, 20,  0,  0,  0],
    [ 5,  5, 10, 25, 25, 10,  5,  5],
    [10, 10, 20, 30, 30, 20, 10, 10],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [ 0,  0,  0,  0,  0,  0,  0,  0],
  ];
  const KNIGHT_PST = [
    [-50,-40,-30,-30,-30,-30,-40,-50],
    [-40,-20,  0,  0,  0,  0,-20,-40],
    [-30,  0, 10, 15, 15, 10,  0,-30],
    [-30,  5, 15, 20, 20, 15,  5,-30],
    [-30,  0, 15, 20, 20, 15,  0,-30],
    [-30,  5, 10, 15, 15, 10,  5,-30],
    [-40,-20,  0,  5,  5,  0,-20,-40],
    [-50,-40,-30,-30,-30,-30,-40,-50],
  ];
  const BISHOP_PST = [
    [-20,-10,-10,-10,-10,-10,-10,-20],
    [-10,  0,  0,  0,  0,  0,  0,-10],
    [-10,  0,  5, 10, 10,  5,  0,-10],
    [-10,  5,  5, 10, 10,  5,  5,-10],
    [-10,  0, 10, 10, 10, 10,  0,-10],
    [-10, 10, 10, 10, 10, 10, 10,-10],
    [-10,  5,  0,  0,  0,  0,  5,-10],
    [-20,-10,-10,-10,-10,-10,-10,-20],
  ];
  const KING_PST = [
    [ 20, 30, 10,  0,  0, 10, 30, 20],
    [ 20, 20,  0,  0,  0,  0, 20, 20],
    [-10,-20,-20,-20,-20,-20,-20,-10],
    [-20,-30,-30,-40,-40,-30,-30,-20],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
  ];
  function pstValue(type, r, c, color){
    if(type==='N') return KNIGHT_PST[r][c];
    if(type==='B') return BISHOP_PST[r][c];
    if(type==='P') return PAWN_PST[color==='w' ? 7-r : r][c];
    if(type==='K') return KING_PST[color==='w' ? 7-r : r][c];
    return 0;
  }
  function initialBoard(){
    const b = Array.from({length:8},()=>Array(8).fill(null));
    const back = ['R','N','B','Q','K','B','N','R'];
    for(let c=0;c<8;c++){
      b[0][c]='b'+back[c]; b[1][c]='bP';
      b[6][c]='wP'; b[7][c]='w'+back[c];
    }
    return b;
  }
  function fischerBackRank(){
    const squares = Array(8).fill(null);
    const dark=[0,2,4,6], light=[1,3,5,7];
    squares[dark[Math.floor(Math.random()*4)]]='B';
    let li = light[Math.floor(Math.random()*4)];
    while(squares[li]) li = light[Math.floor(Math.random()*4)];
    squares[li]='B';
    let empties = [...Array(8).keys()].filter(i=>!squares[i]);
    const qi = empties[Math.floor(Math.random()*empties.length)];
    squares[qi]='Q'; empties = empties.filter(i=>i!==qi);
    for(let k=0;k<2;k++){
      const ni = empties[Math.floor(Math.random()*empties.length)];
      squares[ni]='N'; empties = empties.filter(i=>i!==ni);
    }
    empties.sort((a,b)=>a-b);
    squares[empties[0]]='R'; squares[empties[1]]='K'; squares[empties[2]]='R';
    return squares;
  }
  function fischerBoard(){
    const back = fischerBackRank();
    const b = Array.from({length:8},()=>Array(8).fill(null));
    for(let c=0;c<8;c++){
      b[0][c]='b'+back[c]; b[1][c]='bP';
      b[6][c]='wP'; b[7][c]='w'+back[c];
    }
    return b;
  }
  function cloneBoard(b){ return b.map(row=>row.slice()); }
  function newState(variant, allowCastle){
    const board = variant==='fischer_random' ? fischerBoard() : initialBoard();
    if(allowCastle === undefined) allowCastle = variant !== 'fischer_random';
    const state={
      board, turn:'w', variant,
      castling: allowCastle ? {wK:true,wQ:true,bK:true,bQ:true} : {wK:false,wQ:false,bK:false,bQ:false},
      ep:null,
      teleportUsed:{w:false,b:false}, shieldUsed:{w:false,b:false}, shield:{w:null,b:null},
      history: [], halfmoveClock: 0, positionCounts: {},
      mustContinueFrom: null, moveCounts: {w:0,b:0}, inBonusMove: false
    };
    state.positionCounts[positionKey(state)]=1;
    return state;
  }
  function cloneState(s){
    return {
      board: cloneBoard(s.board), turn:s.turn, variant:s.variant,
      castling: {...s.castling}, ep: s.ep ? {...s.ep} : null,
      teleportUsed: {...s.teleportUsed}, shieldUsed: {...s.shieldUsed},
      shield: {w: s.shield.w?{...s.shield.w}:null, b: s.shield.b?{...s.shield.b}:null},
      history: s.history ? s.history.slice() : [], halfmoveClock: s.halfmoveClock || 0, positionCounts: {...(s.positionCounts || {})},
      mustContinueFrom: s.mustContinueFrom ? {...s.mustContinueFrom} : null,
      moveCounts: {...(s.moveCounts || {w:0,b:0})}, inBonusMove: !!s.inBonusMove
    };
  }
  function inBounds(r,c){ return r>=0&&r<8&&c>=0&&c<8; }
  function isSquareAttacked(board, r, c, byColor){
    for(let rr=0; rr<8; rr++) for(let cc=0; cc<8; cc++){
      const p = board[rr][cc];
      if(!p || p[0]!==byColor) continue;
      const type = p[1];
      if(type==='P'){
        const dir = byColor==='w' ? -1 : 1;
        if(rr+dir===r && (cc-1===c || cc+1===c)) return true;
      } else if(type==='N'){
        const offs=[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
        if(offs.some(([dr,dc])=>rr+dr===r && cc+dc===c)) return true;
      } else if(type==='K'){
        if(Math.abs(rr-r)<=1 && Math.abs(cc-c)<=1 && !(rr===r&&cc===c)) return true;
      } else {
        const dirs = type==='B' ? [[-1,-1],[-1,1],[1,-1],[1,1]]
                    : type==='R' ? [[-1,0],[1,0],[0,-1],[0,1]]
                    : [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]];
        for(const [dr,dc] of dirs){
          let tr=rr+dr, tc=cc+dc;
          while(inBounds(tr,tc)){
            if(tr===r && tc===c) return true;
            if(board[tr][tc]) break;
            tr+=dr; tc+=dc;
          }
        }
      }
    }
    return false;
  }
  function findKing(board, color){
    for(let r=0;r<8;r++) for(let c=0;c<8;c++) if(board[r][c]===color+'K') return {r,c};
    return null;
  }
  function isInCheck(state, color){
    const k = findKing(state.board, color);
    if(!k) return false;
    return isSquareAttacked(state.board, k.r, k.c, color==='w'?'b':'w');
  }
  function pseudoMovesForPiece(state, r, c){
    const board = state.board, piece = board[r][c];
    if(!piece) return [];
    const color = piece[0], type = piece[1];
    const moves = [];
    function add(tr,tc,opts){
      if(!inBounds(tr,tc)) return;
      const target = board[tr][tc];
      if(target && target[0]===color) return;
      moves.push({fr:r,fc:c,tr,tc,piece,capture: !!target, capturedPiece: target||null, ...(opts||{})});
    }
    if(type==='P'){
      const dir = color==='w' ? -1 : 1;
      const startRow = color==='w' ? 6 : 1;
      const promRow = color==='w' ? 0 : 7;
      if(inBounds(r+dir,c) && !board[r+dir][c]){
        add(r+dir,c, r+dir===promRow ? {promotion:true} : {});
        if(r===startRow && !board[r+2*dir][c]) add(r+2*dir,c,{isDoubleStep:true});
      }
      [-1,1].forEach(dc=>{
        const tr=r+dir, tc=c+dc;
        if(!inBounds(tr,tc)) return;
        const target = board[tr][tc];
        if(target && target[0]!==color) add(tr,tc, tr===promRow ? {promotion:true} : {});
        else if(!target && state.ep && state.ep.r===tr && state.ep.c===tc){
          // The captured pawn must actually be there and belong to the
          // opponent. In standard chess this is always true by construction
          // (ep is only ever live for the opponent's very next move), but
          // Tempo Chess's bonus-move mechanic lets the same side move twice
          // in a row — without this check, a pawn could "en passant" its
          // own just-moved neighbor's now-empty square.
          const besidePawn = board[r][tc];
          if(besidePawn && besidePawn[0]!==color && besidePawn[1]==='P'){
            moves.push({fr:r,fc:c,tr,tc,piece,capture:true,capturedPiece:besidePawn,isEnPassant:true});
          }
        }
      });
    } else if(type==='N'){
      [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr,dc])=>add(r+dr,c+dc));
    } else if(type==='K'){
      for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++) if(dr||dc) add(r+dr,c+dc);
    } else {
      const dirs = type==='B' ? [[-1,-1],[-1,1],[1,-1],[1,1]]
                  : type==='R' ? [[-1,0],[1,0],[0,-1],[0,1]]
                  : [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]];
      for(const [dr,dc] of dirs){
        let tr=r+dr, tc=c+dc;
        while(inBounds(tr,tc)){
          const target = board[tr][tc];
          if(!target){ add(tr,tc); }
          else { if(target[0]!==color) add(tr,tc); break; }
          tr+=dr; tc+=dc;
        }
      }
    }
    return moves;
  }
  function addCastlingMoves(state, r, c, moves){
    const color = state.board[r][c][0];
    if(color==='w' && r!==7 || color==='b' && r!==0) return;
    if(isInCheck(state,color)) return;
    const oppo = color==='w'?'b':'w';
    const rights = state.castling;
    if(rights[color+'K'] && !state.board[r][5] && !state.board[r][6] &&
       state.board[r][7]===color+'R' &&
       !isSquareAttacked(state.board,r,5,oppo) && !isSquareAttacked(state.board,r,6,oppo)){
      moves.push({fr:r,fc:c,tr:r,tc:6,piece:color+'K',capture:false,capturedPiece:null,isCastle:'K'});
    }
    if(rights[color+'Q'] && !state.board[r][1] && !state.board[r][2] && !state.board[r][3] &&
       state.board[r][0]===color+'R' &&
       !isSquareAttacked(state.board,r,2,oppo) && !isSquareAttacked(state.board,r,3,oppo)){
      moves.push({fr:r,fc:c,tr:r,tc:2,piece:color+'K',capture:false,capturedPiece:null,isCastle:'Q'});
    }
  }
  function legalMovesForPiece(state, r, c){
    const piece = state.board[r][c];
    if(!piece) return [];
    const color = piece[0];
    let pseudo = pseudoMovesForPiece(state, r, c);
    const kingCapture = state.variant==='antichess' || state.variant==='dice_chess' || state.variant==='drawback_chess';
    // Chess960/Fischer Random deliberately keeps its own simplified rules and
    // does not offer castling. Every other chess variant supports castling.
    if(piece[1]==='K' && state.variant!=='fischer_random') addCastlingMoves(state, r, c, pseudo);
    // Combo Chess: mid-chain, only the piece that just captured may move again.
    if(state.variant==='combo_chess' && state.mustContinueFrom){
      if(r!==state.mustContinueFrom.r || c!==state.mustContinueFrom.c) return [];
      pseudo = pseudo.filter(m=>m.capture);
    }
    if(kingCapture) return pseudo; // these variants do not enforce check
    if(state.variant==='atomic_chess'){
      // No check requirement, but a move that would blow up (or leave
      // exploded) your own king is illegal — self-destruction is banned.
      return pseudo.filter(m=>{
        const clone = cloneState(state);
        applyMoveRaw(clone, m, true);
        return !!findKing(clone.board, color);
      });
    }
    return pseudo.filter(m=>{
      const clone = cloneState(state);
      applyMoveRaw(clone, m, true);
      return !isInCheck(clone, color);
    });
  }
  function allLegalMoves(state, color){
    let moves = [];
    for(let r=0;r<8;r++) for(let c=0;c<8;c++){
      const p = state.board[r][c];
      if(p && p[0]===color) moves = moves.concat(legalMovesForPiece(state,r,c));
    }
    if(state.variant==='antichess'){
      const captures = moves.filter(m=>m.capture);
      if(captures.length) moves = captures;
    }
    if(state.variant!=='antichess' && state.shield && state.shield[color==='w'?'b':'w']){
      const sh = state.shield[color==='w'?'b':'w'];
      moves = moves.filter(m=>!(m.tr===sh.r && m.tc===sh.c));
    }
    return moves;
  }
  function positionKey(state){
    const boardKey=state.board.map(row=>row.map(p=>p||'--').join('')).join('/');
    const rights=['wK','wQ','bK','bQ'].filter(k=>state.castling[k]).join('')||'-';
    const ep=state.ep ? `${state.ep.r},${state.ep.c}` : '-';
    // Distinguish otherwise-identical positions that are mid-chain (Combo
    // Chess) or mid-bonus-move (Tempo Chess) from ones that aren't —
    // without this, a repeated board could look like a repeated *position*
    // even though whose move (and what they still owe) differs.
    let extra = '';
    if(state.variant==='combo_chess' && state.mustContinueFrom) extra += `|chain${state.mustContinueFrom.r}${state.mustContinueFrom.c}`;
    if(state.variant==='tempo_chess') extra += `|t${state.inBonusMove?1:0}${(state.moveCounts&&state.moveCounts[state.turn]||0)%4}`;
    return `${boardKey}|${state.turn}|${rights}|${ep}${extra}`;
  }
  function seedPositionCounts(state){
    if(!state.positionCounts || Object.keys(state.positionCounts).length===0){
      state.positionCounts={[positionKey(state)]:1};
    }
    return state.positionCounts;
  }

  // mutates state in place, no legality checks (used internally + for committing a chosen legal move).
  // skipExtraTurn suppresses the combo_chess/tempo_chess extra-turn side
  // effects below — used when a caller is only probing legality (does this
  // move leave my king in check / blow up my own king?), not actually
  // playing the position forward.
  function applyMoveRaw(state, move, skipExtraTurn){
    const board = state.board;
    const piece = move.piece, color = piece[0];
    board[move.fr][move.fc] = null;
    if(move.isEnPassant) board[move.fr][move.tc] = null;
    board[move.tr][move.tc] = move.promotion ? color+move.promotion : piece;
    if(move.isCastle==='K'){ board[move.fr][5]=color+'R'; board[move.fr][7]=null; }
    if(move.isCastle==='Q'){ board[move.fr][3]=color+'R'; board[move.fr][0]=null; }
    if(piece[1]==='K'){ state.castling[color+'K']=false; state.castling[color+'Q']=false; }
    if(piece[1]==='R'){
      if(move.fr===(color==='w'?7:0) && move.fc===0) state.castling[color+'Q']=false;
      if(move.fr===(color==='w'?7:0) && move.fc===7) state.castling[color+'K']=false;
    }
    if(move.capturedPiece && move.capturedPiece[1]==='R'){
      const oppo = color==='w'?'b':'w';
      if(move.tr===(oppo==='w'?7:0) && move.tc===0) state.castling[oppo+'Q']=false;
      if(move.tr===(oppo==='w'?7:0) && move.tc===7) state.castling[oppo+'K']=false;
    }
    // Atomic Chess: any capture (including en passant) explodes a 3x3 blast
    // around the captured square — the capturing piece included, pawns
    // caught in the blast spared, per the real Atomic Chess rules.
    if(state.variant==='atomic_chess' && (move.capture || move.isEnPassant)){
      board[move.tr][move.tc] = null;
      for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++){
        const rr=move.tr+dr, cc=move.tc+dc;
        if(!inBounds(rr,cc)) continue;
        const p = board[rr][cc];
        if(p && p[1]!=='P') board[rr][cc]=null;
      }
    }
    state.ep = move.isDoubleStep ? {r:(move.fr+move.tr)/2, c:move.fc} : null;
    state.halfmoveClock = (piece[1]==='P' || move.capturedPiece) ? 0 : (state.halfmoveClock||0) + 1;
    if(!state.history) state.history = [];
    if(!state.positionCounts) state.positionCounts = {};
    state.history.push({
      color, piece, type:piece[1], fr:move.fr, fc:move.fc, tr:move.tr, tc:move.tc,
      capture: !!move.capturedPiece, capturedPiece: move.capturedPiece||null,
      isEnPassant: !!move.isEnPassant, isCastle: move.isCastle||null, promotion: move.promotion||null
    });
    let turnChanges = true;
    if(!skipExtraTurn){
      // Combo Chess: a piece that just captured and can immediately
      // capture again must continue the chain with that same piece.
      if(state.variant==='combo_chess'){
        const stillThere = board[move.tr][move.tc];
        if(move.capturedPiece && stillThere && stillThere[0]===color){
          // Exclude a pseudo-capture of the enemy king: in a check-enforced
          // variant like combo_chess the king itself is never legitimately
          // captured (checkmate ends the game first), so it can't be a real
          // chain continuation — only non-king captures count.
          const further = pseudoMovesForPiece(state, move.tr, move.tc).filter(m=>m.capture && m.capturedPiece && m.capturedPiece[1]!=='K');
          if(further.length){ state.mustContinueFrom = {r:move.tr,c:move.tc}; turnChanges = false; }
          else state.mustContinueFrom = null;
        } else {
          state.mustContinueFrom = null;
        }
      }
      // Tempo Chess: every 4th move earns an immediate bonus move (the
      // bonus move itself doesn't count toward the next bonus).
      if(state.variant==='tempo_chess'){
        if(state.inBonusMove){
          state.inBonusMove = false;
        } else {
          state.moveCounts[color] = (state.moveCounts[color]||0) + 1;
          if(state.moveCounts[color] % 4 === 0){ state.inBonusMove = true; turnChanges = false; }
        }
      }
    }
    if(turnChanges) state.turn = color==='w'?'b':'w';
    const key=positionKey(state);
    state.positionCounts[key]=(state.positionCounts[key]||0)+1;
  }
  function commitMove(state, move){
    applyMoveRaw(state, move);
  }
  // FIDE "dead position" insufficient-material draw: no pawns/rooks/queens
  // left, and what remains can't force checkmate against any defense —
  // K v K, K+one minor v K, or K+B v K+B where both bishops sit on the
  // same square color (so neither side can ever deliver mate).
  function insufficientMaterial(state){
    const board = state.board;
    const minors = [];
    for(let r=0;r<8;r++) for(let c=0;c<8;c++){
      const p = board[r][c];
      if(!p) continue;
      if(p[1]==='P' || p[1]==='Q' || p[1]==='R') return false;
      if(p[1]==='N' || p[1]==='B') minors.push({color:p[0], type:p[1], r, c});
    }
    if(minors.length===0) return true;
    if(minors.length===1) return true;
    if(minors.length===2){
      const [a,b] = minors;
      if(a.type==='B' && b.type==='B' && a.color!==b.color){
        const aLight = (a.r+a.c)%2===0, bLight = (b.r+b.c)%2===0;
        if(aLight===bLight) return true;
      }
    }
    return false;
  }
  function gameStatus(state){
    const color = state.turn;
    const pieceCount = state.board.flat().filter(p=>p && p[0]===color).length;
    if(state.variant==='antichess'){
      if(pieceCount===0) return {over:true, result:`${color==='w'?'White':'Black'} wins — no pieces left!`};
      const moves = allLegalMoves(state, color);
      if(moves.length===0) return {over:true, result:`${color==='w'?'White':'Black'} wins — no legal moves!`};
      // state.positionCounts/halfmoveClock are already maintained by
      // applyMoveRaw() for every variant, unconditionally — this and the
      // dice/drawback branch below just never checked them, so a repeated
      // or shuffling-pieces-forever antichess/dice/drawback game had no way
      // to ever end in a draw, only by someone actually running out of
      // pieces or legal moves.
      seedPositionCounts(state);
      if((state.positionCounts[positionKey(state)]||0)>=3) return {over:true, result:'Threefold repetition — draw'};
      if((state.halfmoveClock||0)>=100) return {over:true, result:'50-move rule — draw'};
      return {over:false, moves};
    }
    if(state.variant==='dice_chess' || state.variant==='drawback_chess'){
      const oppo = color==='w'?'b':'w';
      const myKing = findKing(state.board, color);
      const oppoKing = findKing(state.board, oppo);
      if(!myKing) return {over:true, result:`${oppo==='w'?'White':'Black'} wins — King Captured!`};
      if(!oppoKing) return {over:true, result:`${color==='w'?'White':'Black'} wins — King Captured!`};
      const moves = allLegalMoves(state, color);
      // No check/checkmate in these variants, but a player can still end up
      // with zero legal moves in a very constrained endgame — treat that
      // the same way antichess does above rather than leaving the game
      // stuck with no result.
      if(moves.length===0) return {over:true, result:`${oppo==='w'?'White':'Black'} wins — ${color==='w'?'White':'Black'} has no legal moves!`};
      seedPositionCounts(state);
      if((state.positionCounts[positionKey(state)]||0)>=3) return {over:true, result:'Threefold repetition — draw'};
      if((state.halfmoveClock||0)>=100) return {over:true, result:'50-move rule — draw'};
      return {over:false, moves};
    }
    if(state.variant==='atomic_chess'){
      const oppo = color==='w'?'b':'w';
      const myKing = findKing(state.board, color);
      const oppoKing = findKing(state.board, oppo);
      // Blowing up either king (your own included, from a reckless capture)
      // ends the game immediately — no check requirement beforehand.
      if(!myKing) return {over:true, result:`${oppo==='w'?'White':'Black'} wins — King Exploded!`};
      if(!oppoKing) return {over:true, result:`${color==='w'?'White':'Black'} wins — King Exploded!`};
      const moves = allLegalMoves(state, color);
      // legalMovesForPiece already filters out self-destructing moves for
      // atomic_chess without requiring check, so zero legal moves here is
      // always a stalemate (a draw), matching real Atomic Chess rules.
      if(moves.length===0) return {over:true, result:'Stalemate — draw'};
      if(insufficientMaterial(state)) return {over:true, result:'Insufficient material — draw'};
      seedPositionCounts(state);
      if((state.positionCounts[positionKey(state)]||0)>=3) return {over:true, result:'Threefold repetition — draw'};
      if((state.halfmoveClock||0)>=100) return {over:true, result:'50-move rule — draw'};
      return {over:false, moves};
    }
    if(state.variant==='king_of_the_hill'){
      const centerSquares = [[3,3],[3,4],[4,3],[4,4]];
      for(const [r,c] of centerSquares){
        const p = state.board[r][c];
        if(p && p[1]==='K') return {over:true, result:`${p[0]==='w'?'White':'Black'} wins — King of the Hill!`};
      }
      // otherwise falls through to the standard rules below
    }
    const moves = allLegalMoves(state, color);
    if(moves.length===0){
      if(isInCheck(state,color)) return {over:true, result:`Checkmate — ${color==='w'?'Black':'White'} wins!`};
      return {over:true, result:'Stalemate — draw'};
    }
    if(insufficientMaterial(state)) return {over:true, result:'Insufficient material — draw'};
    seedPositionCounts(state);
    if((state.positionCounts[positionKey(state)]||0)>=3) return {over:true, result:'Threefold repetition — draw'};
    if((state.halfmoveClock||0)>=100) return {over:true, result:'50-move rule — draw'};
    return {over:false, moves, inCheck:isInCheck(state,color)};
  }
  function evaluate(state){
    let score=0;
    for(let r=0;r<8;r++) for(let c=0;c<8;c++){
      const p = state.board[r][c];
      if(!p) continue;
      const v = state.variant==='antichess' ? ANTI_PIECE_VALUE[p[1]] : PIECE_VALUE[p[1]] + pstValue(p[1], r, c, p[0]);
      if(state.variant==='antichess') score += p[0]==='w' ? -v : v;
      else score += p[0]==='w' ? v : -v;
    }
    if(state.variant==='antichess'){
      // In Antichess, having fewer of your own pieces is the objective.
      // A small mobility term rewards positions that create forced captures.
      const whiteMoves = allLegalMoves(state,'w').length;
      const blackMoves = allLegalMoves(state,'b').length;
      score += (blackMoves-whiteMoves)*3;
    }
    return score;
  }
  function orderMoves(moves){
    // Rough move-ordering heuristic (captures of valuable pieces first,
    // by cheapest attacker) so alpha-beta pruning cuts far more branches.
    return moves.slice().sort((a,b)=>{
      const av = a.capture ? PIECE_VALUE[a.capturedPiece[1]] - PIECE_VALUE[a.piece[1]]/100 : -1;
      const bv = b.capture ? PIECE_VALUE[b.capturedPiece[1]] - PIECE_VALUE[b.piece[1]]/100 : -1;
      return bv-av;
    });
  }
  function minimax(state, depth, alpha, beta, maximizing){
    const st = gameStatus(state);
    if(depth===0 || st.over){
      if(st.over){
        const whiteWon = st.result && (st.result.startsWith('White wins') || st.result.includes('White wins'));
        if(st.result && (st.result.startsWith('Checkmate') || st.result.includes('wins'))){
          const winScore = whiteWon ? 99999 : -99999;
          return winScore + (whiteWon === maximizing ? depth : -depth);
        }
        return 0;
      }
      return evaluate(state);
    }
    const moves = orderMoves(st.moves);
    let best = maximizing ? -Infinity : Infinity;
    for(const m of moves){
      const mv = m.promotion ? {...m, promotion:'Q'} : m;
      const clone = cloneState(state);
      applyMoveRaw(clone, mv);
      // In extra-turn variants (combo/tempo chess) the same side can move
      // again, so "maximizing" for the recursive call must follow whose
      // turn it actually is in the resulting position, not just flip.
      const val = minimax(clone, depth-1, alpha, beta, clone.turn==='w');
      if(maximizing){ best=Math.max(best,val); alpha=Math.max(alpha,val); }
      else { best=Math.min(best,val); beta=Math.min(beta,val); }
      if(beta<=alpha) break;
    }
    return best;
  }
  function moveToNotation(move){
    if(!move) return '';
    if(move.isCastle==='K') return 'O-O';
    if(move.isCastle==='Q') return 'O-O-O';
    const files='abcdefgh';
    const from=files[move.fc]+(8-move.fr);
    const to=files[move.tc]+(8-move.tr);
    const piece=move.piece[1];
    const capture=move.capture?'x':'-';
    const promo=move.promotion?'='+move.promotion:'';
    return (piece==='P'?'':piece)+from+capture+to+promo;
  }
  function castlingRights(state){
    return {wK:!!state.castling.wK,wQ:!!state.castling.wQ,bK:!!state.castling.bK,bQ:!!state.castling.bQ};
  }

  function aiPickMove(state, depth, candidateMoves){
    const st = gameStatus(state);
    if(st.over) return null;
    const moves = candidateMoves && candidateMoves.length ? candidateMoves : st.moves;
    const color = state.turn;
    const maximizing = color==='w';
    let bestVal = maximizing ? -Infinity : Infinity;
    let bestMoves = [];
    for(const m of moves){
      const mv = m.promotion ? {...m, promotion:'Q'} : m;
      const clone = cloneState(state);
      applyMoveRaw(clone, mv);
      const val = minimax(clone, Math.max(0, depth-1), -Infinity, Infinity, clone.turn==='w');
      if((maximizing && val>bestVal) || (!maximizing && val<bestVal)){ bestVal=val; bestMoves=[mv]; }
      else if(val===bestVal) bestMoves.push(mv);
    }
    return bestMoves[Math.floor(Math.random()*bestMoves.length)] || moves[0];
  }
  return {
    UNICODE, PIECE_VALUE, newState, cloneState, allLegalMoves, legalMovesForPiece,
    commitMove, gameStatus, isInCheck, aiPickMove, isSquareAttacked, findKing, moveToNotation, castlingRights, positionKey,
    insufficientMaterial
  };
})();
