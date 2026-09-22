/* STATS & ACHIEVEMENTS */
(function(){
  function row(label, value){
    return `<div style="display:flex;justify-content:space-between;width:min(92vw,340px);padding:6px 0;border-bottom:1px solid var(--border);">
      <span>${label}</span><span style="color:var(--yellow);">${value}</span></div>`;
  }
  function achievementCard(a){
    const style = a.unlocked
      ? 'border:1px solid var(--yellow,#facc15);background:rgba(250,204,21,0.08);'
      : 'border:1px solid var(--border);background:var(--panel2);opacity:0.55;';
    return `<div style="${style}border-radius:10px;padding:10px 12px;display:flex;gap:10px;align-items:flex-start;">
      <span style="font-size:1.4rem;line-height:1.2;">${a.unlocked ? a.icon : '🔒'}</span>
      <span>
        <div style="font-weight:700;font-size:0.88rem;color:${a.unlocked?'var(--yellow,#facc15)':'inherit'};">${a.title}</div>
        <div style="font-size:0.78rem;color:var(--dim);">${a.desc}</div>
      </span>
    </div>`;
  }
  function achievementsSection(){
    if(typeof Achievements==='undefined') return '';
    const all = Achievements.list();
    const {unlocked,total} = Achievements.progress();
    // Group by game so related achievements sit together, in the same
    // order the games were defined in — no separate sort key needed since
    // DEFS is already authored grouped by game.
    const byGame = [];
    const seen = new Set();
    all.forEach(a=>{ if(!seen.has(a.game)){ seen.add(a.game); byGame.push(a.game); } });
    const cards = byGame.map(g=>{
      const items = all.filter(a=>a.game===g);
      return `<div style="margin-bottom:14px;">
        <div style="grid-column:1/-1;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px;">
          ${items.map(achievementCard).join('')}
        </div>
      </div>`;
    }).join('');
    return `
      <div style="margin-top:28px;width:min(92vw,760px);">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;">
          <h3 style="margin:0;">🏆 Achievements</h3>
          <span style="color:var(--dim);font-size:0.85rem;">${unlocked} / ${total} unlocked</span>
        </div>
        ${cards}
      </div>
    `;
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
      ${achievementsSection()}
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
