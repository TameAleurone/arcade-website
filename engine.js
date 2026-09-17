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
      history: [], halfmoveClock: 0, positionCounts: {}
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
      history: s.history ? s.history.slice() : [], halfmoveClock: s.halfmoveClock || 0, positionCounts: {...(s.positionCounts || {})}
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
          moves.push({fr:r,fc:c,tr,tc,piece,capture:true,capturedPiece:board[r][tc],isEnPassant:true});
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
    if(kingCapture) return pseudo; // these variants do not enforce check
    return pseudo.filter(m=>{
      const clone = cloneState(state);
      applyMoveRaw(clone, m);
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
    return `${boardKey}|${state.turn}|${rights}|${ep}`;
  }
  function seedPositionCounts(state){
    if(!state.positionCounts || Object.keys(state.positionCounts).length===0){
      state.positionCounts={[positionKey(state)]:1};
    }
    return state.positionCounts;
  }

  // mutates state in place, no legality checks (used internally + for committing a chosen legal move)
  function applyMoveRaw(state, move){
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
    state.ep = move.isDoubleStep ? {r:(move.fr+move.tr)/2, c:move.fc} : null;
    state.halfmoveClock = (piece[1]==='P' || move.capturedPiece) ? 0 : (state.halfmoveClock||0) + 1;
    if(!state.history) state.history = [];
    if(!state.positionCounts) state.positionCounts = {};
    state.history.push({
      color, piece, type:piece[1], fr:move.fr, fc:move.fc, tr:move.tr, tc:move.tc,
      capture: !!move.capturedPiece, capturedPiece: move.capturedPiece||null,
      isEnPassant: !!move.isEnPassant, isCastle: move.isCastle||null, promotion: move.promotion||null
    });
    state.turn = color==='w'?'b':'w';
    const key=positionKey(state);
    state.positionCounts[key]=(state.positionCounts[key]||0)+1;
  }
  function commitMove(state, move){
    applyMoveRaw(state, move);
  }
  function gameStatus(state){
    const color = state.turn;
    const pieceCount = state.board.flat().filter(p=>p && p[0]===color).length;
    if(state.variant==='antichess'){
      if(pieceCount===0) return {over:true, result:`${color==='w'?'White':'Black'} wins — no pieces left!`};
      const moves = allLegalMoves(state, color);
      if(moves.length===0) return {over:true, result:`${color==='w'?'White':'Black'} wins — no legal moves!`};
      return {over:false, moves};
    }
    if(state.variant==='dice_chess' || state.variant==='drawback_chess'){
      const oppo = color==='w'?'b':'w';
      const myKing = findKing(state.board, color);
      const oppoKing = findKing(state.board, oppo);
      if(!myKing) return {over:true, result:`${oppo==='w'?'White':'Black'} wins — King Captured!`};
      if(!oppoKing) return {over:true, result:`${color==='w'?'White':'Black'} wins — King Captured!`};
      const moves = allLegalMoves(state, color);
      return {over:false, moves};
    }
    const moves = allLegalMoves(state, color);
    if(moves.length===0){
      if(isInCheck(state,color)) return {over:true, result:`Checkmate — ${color==='w'?'Black':'White'} wins!`};
      return {over:true, result:'Stalemate — draw'};
    }
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
      const val = minimax(clone, depth-1, alpha, beta, !maximizing);
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
      const val = minimax(clone, Math.max(0, depth-1), -Infinity, Infinity, !maximizing);
      if((maximizing && val>bestVal) || (!maximizing && val<bestVal)){ bestVal=val; bestMoves=[mv]; }
      else if(val===bestVal) bestMoves.push(mv);
    }
    return bestMoves[Math.floor(Math.random()*bestMoves.length)] || moves[0];
  }
  return {
    UNICODE, PIECE_VALUE, newState, cloneState, allLegalMoves, legalMovesForPiece,
    commitMove, gameStatus, isInCheck, aiPickMove, isSquareAttacked, findKing, moveToNotation, castlingRights, positionKey
  };
})();
