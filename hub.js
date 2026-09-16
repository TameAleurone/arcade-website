/* CHESS HUB (sub-menu) */
(function(){
  const variants = [
    {id:'chess', title:'Standard Chess', desc:'Classic rules, vs AI or 2-player, with a lightweight built-in AI.', ready:true},
    {id:'fischer_random', title:'Fischer Random', desc:'Standard rules with a shuffled back rank (Chess960-style). Castling disabled for simplicity.', ready:true},
    {id:'antichess', title:'Antichess', desc:'Captures are forced — lose all your pieces (or run out of moves) to win.', ready:true},
    {id:'dice_chess', title:'Dice Chess', desc:'Three dice are rolled together each turn — take up to 3 moves with matching pieces. King-capture rules, no check/checkmate.', ready:true},
    {id:'spell_chess', title:'Spell Chess', desc:'One Teleport and one Shield charge per side, usable once per game.', ready:true},
    {id:'drawback_chess', title:'Drawback Chess', desc:'Every side is secretly assigned a random handicap. King-capture rules — no check/checkmate.', ready:true},
    {id:'three_player_chess', title:'Three-Player Chess', desc:'A hex board, three armies, any mix of human/AI.', ready:true},
  ];
  function init(c){
    c.innerHTML = `
      <p class="msg">Pick a chess variant:</p>
      <div id="chess-hub-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;width:100%;max-width:760px;"></div>
    `;
    const grid = c.querySelector('#chess-hub-grid');
    variants.forEach(v=>{
      const tile = document.createElement(v.ready ? 'a' : 'div');
      tile.className = 'tile' + (v.ready?'':' soon');
      if(v.ready) tile.href = v.id + '.html';
      tile.innerHTML = `<span class="badge">${v.ready?'PLAY':'SOON'}</span><span class="name">${v.title}</span><div class="best" style="color:var(--dim);margin-top:6px;">${v.desc}</div>`;
      grid.appendChild(tile);
    });
  }
  function destroy(){}
  registerGame('chess_hub','Chess Games','♟️', true, {init, destroy});
})();
