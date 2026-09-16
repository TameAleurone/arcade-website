/* TWO PLAYER HUB (simple sub-menu pointing at hotseat games) */
(function(){
  function init(c){
    c.innerHTML = `
      <p class="msg">Two-player hotseat games:</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;">
        <a class="btn primary" href="tictactoe.html">Tic Tac Toe</a>
        <a class="btn primary" href="connect_four.html">Connect Four</a>
        <a class="btn primary" href="pong.html">Pong</a>
      </div>
    `;
  }
  function destroy(){}
  registerGame('two_player_hub','Two Player Games','👥', true, {init, destroy});
})();
