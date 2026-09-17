/* Lightweight regression tests for the shared 8x8 chess engine. Run: npm test */
const fs = require('fs');
const vm = require('vm');
const ctx = { console, Math };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + '/engine.js', 'utf8') + '\nthis.EngineUnderTest = ChessEngine;', ctx);
const E = ctx.EngineUnderTest;

function empty(variant) {
  const s = E.newState(variant);
  s.board = Array.from({ length: 8 }, () => Array(8).fill(null));
  return s;
}
function castlePosition(variant) {
  const s = empty(variant);
  s.board[7][4] = 'wK';
  s.board[7][0] = 'wR';
  s.board[7][7] = 'wR';
  s.board[0][4] = 'bK';
  s.turn = 'w';
  return s;
}
function assert(ok, message) {
  if (!ok) throw new Error('FAIL: ' + message);
  console.log('PASS:', message);
}

for (const variant of ['chess', 'spell_chess', 'antichess', 'dice_chess', 'drawback_chess']) {
  const s = castlePosition(variant);
  const moves = E.legalMovesForPiece(s, 7, 4);
  assert(moves.some(m => m.isCastle === 'K'), variant + ' allows kingside castling');
  assert(moves.some(m => m.isCastle === 'Q'), variant + ' allows queenside castling');
}

{
  const s = castlePosition('fischer_random');
  assert(!E.legalMovesForPiece(s, 7, 4).some(m => m.isCastle), 'Fischer Random keeps castling disabled');
}

{
  const s = castlePosition('chess');
  s.board[5][6] = 'bR'; // attacks g1, so O-O is illegal; d1/c1 remain safe.
  const castles = E.legalMovesForPiece(s, 7, 4).filter(m => m.isCastle).map(m => m.isCastle);
  assert(!castles.includes('K') && castles.includes('Q'), 'standard castling respects attacked transit/destination squares');
}

{
  const s = castlePosition('chess');
  const move = E.legalMovesForPiece(s, 7, 4).find(m => m.isCastle === 'K');
  E.commitMove(s, move);
  assert(s.board[7][6] === 'wK' && s.board[7][5] === 'wR', 'O-O moves king and rook correctly');
  assert(!s.castling.wK && !s.castling.wQ, 'castling rights disappear after king castles');
}

{
  const s = castlePosition('chess');
  s.board[7][7] = null;
  assert(!E.legalMovesForPiece(s, 7, 4).some(m => m.isCastle === 'K'), 'castling requires the rook to be present');
}

{
  const s = castlePosition('antichess');
  s.board[6][4] = 'bP';
  const moves = E.allLegalMoves(s, 'w');
  assert(moves.length === 1 && moves[0].capture, 'antichess still forces captures over castling');
}

console.log('All chess engine tests passed.');

{
  const s = E.newState('chess');
  function play(fr,fc,tr,tc){
    const m=E.allLegalMoves(s,s.turn).find(x=>x.fr===fr&&x.fc===fc&&x.tr===tr&&x.tc===tc);
    assert(!!m, `move ${fr},${fc}->${tr},${tc} is legal`);
    E.commitMove(s,m);
  }
  // Repeat the initial position three times using a knight shuffle.
  for(let cycle=0;cycle<2;cycle++){
    play(7,6,5,5); play(0,6,2,5); play(5,5,7,6); play(2,5,0,6);
  }
  assert(E.gameStatus(s).over && /Threefold repetition/.test(E.gameStatus(s).result), 'threefold repetition is detected');
}

{
  const s = E.newState('chess');
  s.board = Array.from({length:8},()=>Array(8).fill(null));
  s.board[7][4]='wK'; s.board[0][4]='bK'; s.board[7][6]='wN'; s.turn='w';
  s.halfmoveClock=99;
  const m=E.allLegalMoves(s,'w').find(x=>x.fr===7&&x.fc===6&&x.tr===6&&x.tc===4);
  assert(!!m, 'quiet move exists for fifty-move test');
  E.commitMove(s,m);
  assert(E.gameStatus(s).over && /50-move rule/.test(E.gameStatus(s).result), '50-move rule is detected');
}

{
  const s = castlePosition('chess');
  E.commitMove(s, E.allLegalMoves(s,'w').find(m=>m.fr===7&&m.fc===7&&m.tr===6&&m.tc===7));
  assert(!s.castling.wK && s.castling.wQ, 'moving the h-rook removes only kingside rights');
}
