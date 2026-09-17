/* CHESS HUB (sub-menu) */
(function(){
  const variants = [
    {id:'chess', title:'Standard Chess', desc:'Classic chess with castling, promotion, en passant, AI, 2-player and online play.', ready:true},
    {id:'fischer_random', title:'Fischer Random', desc:'Chess960-style shuffled starting positions with the project’s simplified no-castling rules.', ready:true},
    {id:'antichess', title:'Antichess', desc:'Captures are forced. Get rid of every piece or run out of legal moves to win; castling is available when no capture is forced.', ready:true},
    {id:'dice_chess', title:'Dice Chess', desc:'Three piece-type dice per turn. Make matching moves, with castling available when the King die permits it.', ready:true},
    {id:'spell_chess', title:'Spell Chess', desc:'Standard chess plus one Teleport and one Shield charge per side — including normal castling.', ready:true},
    {id:'drawback_chess', title:'Drawback Chess', desc:'Secret random handicaps layered over King Capture rules, with castling added to the move set.', ready:true},
    {id:'three_player_chess', title:'Three-Player Chess', desc:'A hex board, three armies, any mix of human/AI.', ready:true},
  ];
  function init(c){
    c.innerHTML = `
      <div class="chess-hub-intro"><p class="msg">Pick a chess variant</p><p class="chess-hub-note">Castling is enabled across the 8×8 variants except Fischer Random / Chess960.</p></div>
      <div id="chess-hub-grid" class="chess-hub-grid"></div>
    `;
    const grid = c.querySelector('#chess-hub-grid');
    variants.forEach(v=>{
      const tile = document.createElement(v.ready ? 'a' : 'div');
      tile.className = 'tile' + (v.ready?'':' soon');
      if(v.ready) tile.href = v.id + '.html';
      tile.innerHTML = `<span class="badge">${v.ready?'PLAY':'SOON'}</span><span class="name">${v.title}</span><div class="best" style="color:var(--dim);margin-top:6px;">${v.desc}</div><div style="margin-top:10px;font-size:.68rem;color:var(--cyan);">${v.id==='fischer_random'?'CHESS960':'CHESS VARIANT'} <span style="float:right;">→</span></div>`;
      grid.appendChild(tile);
    });
  }
  function destroy(){}
  registerGame('chess_hub','Chess Games','♟️', true, {init, destroy});
})();
