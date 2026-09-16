/* TETRIS */
(function(){
  let container, canvas, ctx, cell=24, cols=10, rows=18;
  let grid, cur, bag, queue, holdType, holdUsed, score, best, lines, level, over, paused;
  let dropTimer, dropInterval, lockTimer, isLocking, animId, lastTs, keys={};
  let comboCount, comboFlashTimer, comboFlashText;
  const SHAPES = {
    I: {blocks:[[0,1],[1,1],[2,1],[3,1]], color:'#50ffea'},
    O: {blocks:[[1,0],[2,0],[1,1],[2,1]], color:'#ffff50'},
    T: {blocks:[[1,0],[0,1],[1,1],[2,1]], color:'#a050ff'},
    S: {blocks:[[1,0],[2,0],[0,1],[1,1]], color:'#50ff50'},
    Z: {blocks:[[0,0],[1,0],[1,1],[2,1]], color:'#ff5050'},
    J: {blocks:[[0,0],[0,1],[1,1],[2,1]], color:'#50c8ff'},
    L: {blocks:[[2,0],[0,1],[1,1],[2,1]], color:'#ff9f50'},
  };
  const LINE_SCORES = {0:0,1:100,2:300,3:500,4:800};
  const LINES_PER_LEVEL = 10;
  const COMBO_BONUS_PER_STEP = 50;
  const LOCK_DELAY = 500;
  const WALL_KICK_OFFSETS = [0,-1,1,-2,2];

  function emptyGrid(){ return Array.from({length:rows},()=>Array(cols).fill(null)); }
  function newBag(){
    const b = Object.keys(SHAPES).slice();
    for(let i=b.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [b[i],b[j]]=[b[j],b[i]]; }
    return b;
  }
  function refillQueue(){
    while(queue.length<4){
      if(bag.length===0) bag = newBag();
      queue.push(bag.pop());
    }
  }
  function makePiece(key){
    const shape = SHAPES[key];
    return {blocks: shape.blocks.map(([x,y])=>({x:x+3,y})), color: shape.color, key};
  }
  function spawnFromQueue(){
    refillQueue();
    const key = queue.shift();
    refillQueue();
    return makePiece(key);
  }
  function collides(blocks){
    return blocks.some(b => b.x<0||b.x>=cols||b.y>=rows || (b.y>=0 && grid[b.y][b.x]));
  }
  function rotateBlocks(piece){
    if(piece.key==='O') return piece.blocks;
    const cx = piece.blocks.reduce((s,b)=>s+b.x,0)/piece.blocks.length;
    const cy = piece.blocks.reduce((s,b)=>s+b.y,0)/piece.blocks.length;
    return piece.blocks.map(b=>{
      const x = b.x-cx, y=b.y-cy;
      return {x: Math.round(cx - y), y: Math.round(cy + x)};
    });
  }
  function tryMove(dx,dy){
    const moved = cur.blocks.map(b=>({x:b.x+dx,y:b.y+dy}));
    if(collides(moved)) return false;
    cur.blocks = moved;
    resetLockIfGrounded();
    return true;
  }
  function tryRotate(){
    const rotated = rotateBlocks(cur);
    for(const dx of WALL_KICK_OFFSETS){
      const shifted = rotated.map(b=>({x:b.x+dx,y:b.y}));
      if(!collides(shifted)){ cur.blocks = shifted; resetLockIfGrounded(); return; }
    }
  }
  function isGrounded(){
    return cur.blocks.some(b=>collides([{x:b.x,y:b.y+1}]));
  }
  function resetLockIfGrounded(){
    if(isGrounded()){ if(!isLocking){ isLocking=true; lockTimer=0; } }
    else { isLocking=false; lockTimer=0; }
  }
  function lockPiece(){
    cur.blocks.forEach(b=>{ if(b.y>=0) grid[b.y][b.x] = cur.color; });
    let cleared=0;
    for(let r=rows-1;r>=0;r--){
      if(grid[r].every(c=>c)){
        grid.splice(r,1);
        grid.unshift(Array(cols).fill(null));
        cleared++; r++;
      }
    }
    if(cleared>0){
      lines += cleared;
      score += LINE_SCORES[cleared] * level;
      comboCount++;
      if(comboCount>0){
        const bonus = comboCount*COMBO_BONUS_PER_STEP*level;
        score += bonus;
        comboFlashText = `COMBO x${comboCount}! +${bonus}`;
        comboFlashTimer = 1200;
      }
      const newLevel = 1 + Math.floor(lines/LINES_PER_LEVEL);
      if(newLevel>level){ level=newLevel; }
      dropInterval = Math.max(100, 700 - (level-1)*55);
    } else {
      comboCount = -1;
    }
    holdUsed=false;
    isLocking=false; lockTimer=0;
    cur = spawnFromQueue();
    if(collides(cur.blocks)){
      over = true;
      if(score>best){ best=score; Store.set('tetris_high', Math.round(best)); }
    }
  }
  function hardDrop(){
    let dist=0;
    while(tryMove(0,1)) dist++;
    score += dist*2;
    lockPiece();
  }
  function holdPiece(){
    if(holdUsed || over) return;
    holdUsed = true;
    if(holdType===null){
      holdType = cur.key;
      cur = spawnFromQueue();
    } else {
      const tmp = holdType;
      holdType = cur.key;
      cur = makePiece(tmp);
    }
    isLocking=false; lockTimer=0;
    if(collides(cur.blocks)) over=true;
  }
  function drawMiniPiece(ctx2, key, x, y, s){
    const shape = SHAPES[key];
    const xs = shape.blocks.map(b=>b[0]), ys = shape.blocks.map(b=>b[1]);
    const minX=Math.min(...xs), minY=Math.min(...ys);
    ctx2.fillStyle = shape.color;
    shape.blocks.forEach(([bx,by])=>{
      ctx2.fillRect(x+(bx-minX)*s, y+(by-minY)*s, s-2, s-2);
    });
  }
  function drawCell(x,y,color){
    ctx.fillStyle=color;
    ctx.fillRect(x*cell+1,y*cell+1,cell-2,cell-2);
  }
  function draw(){
    ctx.fillStyle='#111'; ctx.fillRect(0,0,cols*cell,rows*cell);
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++) if(grid[r][c]) drawCell(c,r,grid[r][c]);
    // ghost piece
    if(!over){
      const ghost = {...cur, blocks: cur.blocks.map(b=>({...b}))};
      let dy=0;
      while(!collides(ghost.blocks.map(b=>({x:b.x,y:b.y+dy+1})))) dy++;
      ctx.globalAlpha=0.25;
      ghost.blocks.forEach(b=>{ if(b.y+dy>=0) drawCell(b.x,b.y+dy,cur.color); });
      ctx.globalAlpha=1;
    }
    cur.blocks.forEach(b=>{ if(b.y>=0) drawCell(b.x,b.y,cur.color); });

    document.getElementById('tetris-score').innerHTML = `Score: <b>${Math.round(score)}</b>`;
    document.getElementById('tetris-lines').innerHTML = `Lines: <b>${lines}</b>`;
    document.getElementById('tetris-level').innerHTML = `Level: <b>${level}</b>`;
    document.getElementById('tetris-best').innerHTML = `Best: <b>${Math.round(best)}</b>`;

    const holdCanvas = document.getElementById('tetris-hold');
    const hctx = holdCanvas.getContext('2d');
    hctx.clearRect(0,0,holdCanvas.width,holdCanvas.height);
    hctx.fillStyle='#1a1a2e'; hctx.fillRect(0,0,holdCanvas.width,holdCanvas.height);
    if(holdType) drawMiniPiece(hctx, holdType, 8, 8, 16);

    const nextCanvas = document.getElementById('tetris-next');
    const nctx = nextCanvas.getContext('2d');
    nctx.clearRect(0,0,nextCanvas.width,nextCanvas.height);
    nctx.fillStyle='#1a1a2e'; nctx.fillRect(0,0,nextCanvas.width,nextCanvas.height);
    queue.slice(0,3).forEach((k,i)=> drawMiniPiece(nctx, k, 8, 8+i*44, 14));

    if(comboFlashTimer>0){
      ctx.fillStyle='#ffd700'; ctx.font='bold 14px sans-serif'; ctx.textAlign='center';
      ctx.fillText(comboFlashText, cols*cell/2, 20);
    }
    if(over){
      ctx.fillStyle='rgba(0,0,0,0.65)'; ctx.fillRect(0,0,cols*cell,rows*cell);
      ctx.fillStyle='#ffff50'; ctx.font='bold 18px sans-serif'; ctx.textAlign='center';
      ctx.fillText('Game Over', cols*cell/2, rows*cell/2);
      ctx.font='12px sans-serif';
      ctx.fillText('Click Restart to play again', cols*cell/2, rows*cell/2+22);
    } else if(paused){
      ctx.fillStyle='rgba(0,0,0,0.65)'; ctx.fillRect(0,0,cols*cell,rows*cell);
      ctx.fillStyle='#50c8ff'; ctx.font='bold 18px sans-serif'; ctx.textAlign='center';
      ctx.fillText('Paused', cols*cell/2, rows*cell/2);
    }
  }
  function loop(ts){
    if(lastTs==null) lastTs=ts;
    let dt = ts-lastTs; lastTs=ts;
    if(!Number.isFinite(dt) || dt<0) dt=0;
    dt = Math.min(dt, 100); // clamp huge gaps (e.g. tab backgrounded)
    if(!over && !paused){
      if(comboFlashTimer>0) comboFlashTimer = Math.max(0,comboFlashTimer-dt);
      const softDrop = keys['ArrowDown'];
      const interval = softDrop ? Math.max(30, dropInterval/18) : dropInterval;
      dropTimer += dt;
      if(dropTimer>interval){
        dropTimer=0;
        if(!tryMove(0,1)){
          if(!isLocking){ isLocking=true; lockTimer=0; }
        } else if(softDrop) score += 1;
      }
      if(isLocking){
        lockTimer += dt;
        if(lockTimer>=LOCK_DELAY) lockPiece();
      }
    }
    draw();
    animId = requestAnimationFrame(loop);
  }
  function keydown(e){
    if(over) return;
    if(e.key==='p' || e.key==='P'){ paused=!paused; e.preventDefault(); return; }
    if(paused) return;
    if(e.key==='ArrowLeft'){ tryMove(-1,0); e.preventDefault(); }
    else if(e.key==='ArrowRight'){ tryMove(1,0); e.preventDefault(); }
    else if(e.key==='ArrowDown'){ keys['ArrowDown']=true; e.preventDefault(); }
    else if(e.key==='ArrowUp'){ tryRotate(); e.preventDefault(); }
    else if(e.key===' '){ hardDrop(); e.preventDefault(); }
    else if(e.key==='c' || e.key==='C' || e.key==='Shift'){ holdPiece(); e.preventDefault(); }
  }
  function keyup(e){ if(e.key==='ArrowDown') keys['ArrowDown']=false; }
  function newGame(){
    grid = emptyGrid(); bag=[]; queue=[]; holdType=null; holdUsed=false;
    score=0; lines=0; level=1; over=false; paused=false;
    dropTimer=0; dropInterval=700; lockTimer=0; isLocking=false; lastTs=null;
    comboCount=-1; comboFlashTimer=0; comboFlashText='';
    refillQueue();
    cur = spawnFromQueue();
  }
  function init(c){
    container=c; best = Store.get('tetris_high',0);
    container.innerHTML = `
      <div class="hud"><div id="tetris-score">Score: <b>0</b></div><div id="tetris-lines">Lines: <b>0</b></div><div id="tetris-level">Level: <b>1</b></div><div id="tetris-best">Best: <b>0</b></div></div>
      <div style="display:flex;gap:14px;align-items:flex-start;justify-content:center;">
        <div style="text-align:center;">
          <div style="color:var(--dim);font-size:0.75rem;margin-bottom:4px;">HOLD (C)</div>
          <canvas id="tetris-hold" width="60" height="60" style="background:#1a1a2e;border-radius:6px;"></canvas>
        </div>
        <canvas id="tetris-canvas" width="${cols*cell}" height="${rows*cell}"></canvas>
        <div style="text-align:center;">
          <div style="color:var(--dim);font-size:0.75rem;margin-bottom:4px;">NEXT</div>
          <canvas id="tetris-next" width="60" height="140" style="background:#1a1a2e;border-radius:6px;"></canvas>
        </div>
      </div>
      <div class="controls-hint">Left/Right move &bull; Up rotate &bull; Down soft drop &bull; Space hard drop &bull; C hold &bull; P pause</div>
      <button class="btn" id="tetris-restart">Restart</button>
    `;
    canvas=document.getElementById('tetris-canvas'); ctx=canvas.getContext('2d');
    document.getElementById('tetris-restart').addEventListener('click', newGame);
    document.addEventListener('keydown', keydown);
    document.addEventListener('keyup', keyup);
    newGame();
    animId = requestAnimationFrame(loop);
  }
  function destroy(){ cancelAnimationFrame(animId); document.removeEventListener('keydown', keydown); document.removeEventListener('keyup', keyup); }
  registerGame('tetris','Tetris','🧩', true, {init, destroy}, ()=>`Best: ${Store.get('tetris_high',0)}`);
})();
