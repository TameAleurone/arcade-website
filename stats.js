/* STATS & ACHIEVEMENTS */
(function(){
  function row(label, value){
    return `<div style="display:flex;justify-content:space-between;width:340px;padding:6px 0;border-bottom:1px solid var(--border);">
      <span>${label}</span><span style="color:var(--yellow);">${value}</span></div>`;
  }
  function init(c){
    const snake = Store.get('snake_high',0);
    const bo = Store.get('breakout_high',0);
    const g2048 = Store.get('2048_best_4',0);
    const reflex = Store.get('reflex_best',null);
    const memory = Store.get('memory_best_Easy (4x4)',null);
    const msEasy = Store.get('ms_best_easy',null);
    const msMed = Store.get('ms_best_medium',null);
    const msHard = Store.get('ms_best_hard',null);
    const dodger = Store.get('dodger_high',0);
    const dino = Store.get('dino_high',0);
    const flyer = Store.get('flyer_high',0);
    const wheel = Store.get('wheel_high',0);
    const tetris = Store.get('tetris_high',0);
    const clickerLifetime = Store.get('clicker_lifetime',0);
    const minerLifetime = Store.get('idle_miner_high',0);
    const marioBest = Store.get('mario_high',0);
    const dwarvesBest = Store.get('dwarves_high',0);
    c.innerHTML = `
      <div>
        ${row('Snake — high score', snake)}
        ${row('Breakout — high score', bo)}
        ${row('2048 — best score (4x4)', g2048)}
        ${row('Memory Match — best moves (Easy 4x4)', memory===null?'—':memory)}
        ${row('Reaction Test — best time', reflex===null?'—':reflex+'ms')}
        ${row('Minesweeper — best time (easy)', msEasy===null?'—':msEasy+'s')}
        ${row('Minesweeper — best time (medium)', msMed===null?'—':msMed+'s')}
        ${row('Minesweeper — best time (hard)', msHard===null?'—':msHard+'s')}
        ${row('Meteor Dodger — high score', dodger)}
        ${row('Dino Game — high score', dino)}
        ${row('Flappy Bird — high score', flyer)}
        ${row('Wheel of Fortune — best score', wheel)}
        ${row('Tetris — high score', Math.floor(tetris))}
        ${row('Idle Power Generator — lifetime energy', Math.floor(clickerLifetime).toLocaleString())}
        ${row('Idle Miner — lifetime gold', minerLifetime.toLocaleString())}
        ${row('Mario — high score', marioBest)}
        ${row('Dwarves: Glory — best wave', dwarvesBest)}
      </div>
      <button class="btn" id="stats-reset" style="margin-top:16px;">Reset All Stats</button>
    `;
    document.getElementById('stats-reset').addEventListener('click', ()=>{
      if(confirm('Reset all saved high scores? This cannot be undone.')){
        Object.keys(localStorage).filter(k=>k.startsWith('arcade_')).forEach(k=>localStorage.removeItem(k));
        init(c);
      }
    });
  }
  function destroy(){}
  registerGame('stats_hub','Stats & Achievements','📊', true, {init, destroy});
})();
