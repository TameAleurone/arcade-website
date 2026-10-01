const Achievements = (function(){
  const DEFS = [
    // Snake
    {id:'snake_score_10', game:'snake', title:'First Bite', desc:'Score 10 in Snake.', icon:'🐍'},
    {id:'snake_score_30', game:'snake', title:'Serpent Supreme', desc:'Score 30 in Snake.', icon:'🐍'},
    // Tetris
    {id:'tetris_lines_10', game:'tetris', title:'Line Clearer', desc:'Clear 10 lines in Tetris.', icon:'🧩'},
    {id:'tetris_lines_40', game:'tetris', title:'Tetris Machine', desc:'Clear 40 lines in a single Tetris game.', icon:'🧩'},
    // Breakout
    {id:'breakout_score_500', game:'breakout', title:'Breaking In', desc:'Score 500 in Breakout.', icon:'🧱'},
    {id:'breakout_score_2000', game:'breakout', title:'Wall Breaker', desc:'Score 2000 in Breakout.', icon:'🧱'},
    // 2048
    {id:'g2048_won', game:'2048', title:'2048!', desc:'Reach the 2048 tile.', icon:'🔢'},
    {id:'g2048_score_10000', game:'2048', title:'Way Past 2048', desc:'Score 10,000 in 2048.', icon:'🔢'},
    // Memory Match
    {id:'memory_sharp', game:'memory', title:'Sharp Memory', desc:'Finish Easy (4x4) in 12 moves or fewer.', icon:'🧠'},
    {id:'memory_win_any', game:'memory', title:'Match Made', desc:'Finish a game of Memory Match.', icon:'🧠'},
    // Minesweeper
    {id:'ms_win_easy', game:'minesweeper', title:'Cleared', desc:'Win a game of Minesweeper on Easy.', icon:'💣'},
    {id:'ms_win_hard', game:'minesweeper', title:'Bomb Squad', desc:'Win a game of Minesweeper on Hard.', icon:'💣'},
    // Meteor Dodger
    {id:'dodger_score_100', game:'dodger', title:'Close Call', desc:'Score 100 in Meteor Dodger.', icon:'☄️'},
    {id:'dodger_score_300', game:'dodger', title:'Untouchable', desc:'Score 300 in Meteor Dodger.', icon:'☄️'},
    // Dino
    {id:'dino_score_200', game:'dino', title:'Desert Sprinter', desc:'Score 200 in the Dino Game.', icon:'🦖'},
    {id:'dino_score_1000', game:'dino', title:'Marathon Dino', desc:'Score 1000 in the Dino Game.', icon:'🦖'},
    // Flappy Bird
    {id:'flyer_score_10', game:'flyer', title:'Getting Airborne', desc:'Pass 10 pipes in Flappy Bird.', icon:'🐦'},
    {id:'flyer_score_25', game:'flyer', title:'Sky Master', desc:'Pass 25 pipes in Flappy Bird.', icon:'🐦'},
    // Wheel of Fortune
    {id:'wheel_jackpot', game:'wheel', title:'Jackpot!', desc:'Hit the jackpot on the Wheel of Fortune.', icon:'🎡'},
    // Idle Power Generator (clicker)
    {id:'clicker_novice_harvester', game:'clicker', title:'Novice Harvester', desc:'Generate 1,000 lifetime Wh.', icon:'⚡'},
    {id:'clicker_energy_adept', game:'clicker', title:'Energy Adept', desc:'Generate 10,000 lifetime Wh.', icon:'⚡'},
    {id:'clicker_power_broker', game:'clicker', title:'Power Broker', desc:'Generate 100,000 lifetime Wh.', icon:'⚡'},
    {id:'clicker_energy_tycoon', game:'clicker', title:'Energy Tycoon', desc:'Generate 1,000,000 lifetime Wh.', icon:'⚡'},
    // Idle Miner
    {id:'idle_miner_10000', game:'idle_miner', title:'First Vein', desc:'Mine 10,000 lifetime gold.', icon:'⛏️'},
    {id:'idle_miner_1000000', game:'idle_miner', title:'Gold Baron', desc:'Mine 1,000,000 lifetime gold.', icon:'⛏️'},
    // Mario
    {id:'mario_score_500', game:'mario', title:'Coin Collector', desc:'Score 500 in Mario.', icon:'🍄'},
    {id:'mario_level_clear', game:'mario', title:'Level Clear', desc:'Reach the flag in Mario.', icon:'🍄'},
    // Dwarves: Glory
    {id:'dwarves_wave_5', game:'dwarves', title:'Wave Survivor', desc:'Reach wave 5 in Dwarves: Glory.', icon:'🛡️'},
    {id:'dwarves_wave_10', game:'dwarves', title:'Dwarven Hero', desc:'Reach wave 10 in Dwarves: Glory.', icon:'🛡️'},
    // Pong
    {id:'pong_win', game:'pong', title:'Paddle Champion', desc:'Win a match of Pong.', icon:'🏓'},
    // Reaction Test
    {id:'reflex_220', game:'reflex', title:'Quick Reflexes', desc:'React in under 220ms.', icon:'⚡'},
    {id:'reflex_180', game:'reflex', title:'Lightning Reflexes', desc:'React in under 180ms.', icon:'⚡'},
    // Connect Four
    {id:'connect_four_win', game:'connect_four', title:'Four in a Row', desc:'Win a game of Connect Four.', icon:'🔴'},
    // Tic Tac Toe
    {id:'tictactoe_win', game:'tictactoe', title:'Tic-Tac Champion', desc:'Win a game of Tic Tac Toe.', icon:'⭕'},
    // Chess & every variant that shares the same engine (fischer_random,
    // antichess, dice_chess, spell_chess, drawback_chess all share this id
    // via variant-ui.js — one checkmate in any of them unlocks it).
    {id:'chess_checkmate', game:'chess', title:'Checkmate!', desc:'Win a game of Chess (or any variant) by checkmate.', icon:'♟️'},
    // The four newest chess variants each also unlock chess_checkmate above
    // (a win is a win), plus their own variant-specific achievement.
    {id:'atomic_win', game:'atomic_chess', title:'Chain Reaction', desc:'Win a game of Atomic Chess by exploding the enemy king.', icon:'💥'},
    {id:'king_of_the_hill_win', game:'king_of_the_hill', title:'King of the Hill', desc:'Win a game of King of the Hill by marching your king to the center.', icon:'⛰️'},
    {id:'combo_win', game:'combo_chess', title:'Combo Breaker', desc:'Win a game of Combo Chess.', icon:'🔗'},
    {id:'tempo_win', game:'tempo_chess', title:'Extra Tempo', desc:'Win a game of Tempo Chess.', icon:'⏱️'},
    {id:'three_player_chess_win', game:'three_player_chess', title:'Triple Threat', desc:'Win a game of Three Player Chess.', icon:'♟️'},
    {id:'three_player_chess_beat_2ai', game:'three_player_chess', title:'Outnumbered', desc:'Win a game of Three Player Chess against two AI opponents.', icon:'♟️'},
    // Capstone — win at least once in every chess variant the arcade offers.
    {id:'chess_connoisseur', game:'chess', title:'Chess Connoisseur', desc:'Win at least one game in every chess variant.', icon:'👑'},
    // Pong
    {id:'pong_beat_hard_ai', game:'pong', title:'Rally Master', desc:'Beat the Hard AI in Pong.', icon:'🏓'},
    {id:'pong_shutout', game:'pong', title:'Shutout', desc:'Win a Pong match without the AI scoring a point.', icon:'🏓'},
    // Connect Four
    {id:'connect_four_beat_hard_ai', game:'connect_four', title:'Outsmarted', desc:'Beat the Hard AI in Connect Four.', icon:'🔴'},
    // Tic Tac Toe
    {id:'tictactoe_draw_hard_ai', game:'tictactoe', title:'Draw with the Unbeatable', desc:'Draw a game against the Hard AI in Tic Tac Toe (it never loses).', icon:'⭕'},
    // Wheel of Fortune
    {id:'wheel_streak_10', game:'wheel', title:'Hot Streak', desc:'Reach a 10-spin streak without going bankrupt.', icon:'🎡'},
  ];
  // Every chess variant that counts toward the Chess Connoisseur capstone
  // above. Each variant's own code calls markChessVariantWon(variant) on a
  // human win; this checks whether every one of them has been checked off
  // yet, across any number of separate games/sessions.
  const ALL_CHESS_VARIANTS = ['chess','fischer_random','antichess','dice_chess','spell_chess','drawback_chess','atomic_chess','king_of_the_hill','combo_chess','tempo_chess','three_player_chess'];
  function markChessVariantWon(variant){
    if(!ALL_CHESS_VARIANTS.includes(variant)) return;
    const won = new Set(Store.get('chess_variants_won', []));
    won.add(variant);
    Store.set('chess_variants_won', [...won]);
    if(ALL_CHESS_VARIANTS.every(v=>won.has(v))) unlock('chess_connoisseur');
  }
  const byId = Object.fromEntries(DEFS.map(d=>[d.id,d]));

  function unlockedSet(){ return new Set(Store.get('achievements_unlocked', [])); }
  function saveUnlockedSet(set){ Store.set('achievements_unlocked', [...set]); }

  function unlock(id){
    const def = byId[id];
    if(!def) return false; // unknown id — fail quietly rather than break the calling game
    const set = unlockedSet();
    if(set.has(id)) return false; // already unlocked, nothing to do
    set.add(id);
    saveUnlockedSet(set);
    toast(def);
    return true;
  }
  function isUnlocked(id){ return unlockedSet().has(id); }
  function list(){
    const unlocked = unlockedSet();
    return DEFS.map(d=>({...d, unlocked:unlocked.has(d.id)}));
  }
  function progress(){
    const unlocked = unlockedSet();
    let count=0;
    for(const d of DEFS) if(unlocked.has(d.id)) count++;
    return {unlocked:count, total:DEFS.length};
  }

  // Small toast queue so unlocking several achievements at once (e.g. a
  // score threshold and a win condition on the same frame) doesn't clobber
  // one notification with another — they show one after another instead.
  let toastQueue=[], toastShowing=false;
  function toast(def){
    toastQueue.push(def);
    if(!toastShowing) showNextToast();
  }
  function showNextToast(){
    const def = toastQueue.shift();
    if(!def){ toastShowing=false; return; }
    toastShowing=true;
    let el = document.getElementById('achievement-toast');
    if(!el){
      el = document.createElement('div');
      el.id='achievement-toast';
      el.style.cssText='position:fixed;left:50%;bottom:24px;transform:translateX(-50%) translateY(20px);opacity:0;background:#12182b;border:1px solid var(--border,#2a3352);border-radius:12px;padding:12px 18px;display:flex;gap:10px;align-items:center;z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,0.45);transition:opacity .25s ease,transform .25s ease;max-width:min(90vw,360px);pointer-events:none;';
      document.body.appendChild(el);
    }
    el.innerHTML = `<span style="font-size:1.6rem;line-height:1;">${def.icon||'🏆'}</span><span><div style="font-weight:700;color:var(--yellow,#facc15);font-size:0.78rem;letter-spacing:.02em;">ACHIEVEMENT UNLOCKED</div><div style="color:#e5e9f5;font-size:0.95rem;">${def.title}</div></span>`;
    requestAnimationFrame(()=>{ el.style.opacity='1'; el.style.transform='translateX(-50%) translateY(0)'; });
    setTimeout(()=>{
      el.style.opacity='0'; el.style.transform='translateX(-50%) translateY(20px)';
      setTimeout(showNextToast, 300);
    }, 3200);
  }

  return {unlock, isUnlocked, list, progress, DEFS, markChessVariantWon};
})();
