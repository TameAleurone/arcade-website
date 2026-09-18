/* TOUCH CONTROLS — on-screen buttons that dispatch real KeyboardEvents.
   Every game already listens for document keydown/keyup with e.key values,
   so simulating those events lets touch devices reuse all existing game
   logic with zero changes to the games themselves. */
(function(){
  function isTouchDevice(){
    return ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;
  }

  function fireKey(type, key){
    document.dispatchEvent(new KeyboardEvent(type, {key, bubbles:true, cancelable:true}));
  }

  // A single button that holds a key down while pressed (for movement)
  // and releases it on lift/cancel — mirrors real keyboard behavior.
  function bindHold(el, key){
    let active=false;
    const press=(e)=>{ e.preventDefault(); if(active) return; active=true; el.classList.add('touch-active'); fireKey('keydown', key); };
    const release=(e)=>{ if(e) e.preventDefault(); if(!active) return; active=false; el.classList.remove('touch-active'); fireKey('keyup', key); };
    el.addEventListener('touchstart', press, {passive:false});
    el.addEventListener('touchend', release, {passive:false});
    el.addEventListener('touchcancel', release, {passive:false});
    // Also support mouse for hybrid/dev testing.
    el.addEventListener('mousedown', press);
    el.addEventListener('mouseup', release);
    el.addEventListener('mouseleave', release);
  }

  // A single button that fires one keydown+keyup per tap (for discrete
  // actions like rotate, drop, restart).
  function bindTap(el, key){
    const fire=(e)=>{
      e.preventDefault();
      el.classList.add('touch-active');
      fireKey('keydown', key);
      fireKey('keyup', key);
      setTimeout(()=>el.classList.remove('touch-active'), 120);
    };
    el.addEventListener('touchstart', fire, {passive:false});
    el.addEventListener('click', fire);
  }

  function makeBtn(label, extraClass){
    const b=document.createElement('button');
    b.type='button';
    b.className='touch-btn'+(extraClass?' '+extraClass:'');
    b.innerHTML=label;
    b.addEventListener('contextmenu', e=>e.preventDefault());
    return b;
  }

  /* Controls are appended to document.body (see dpad/buttons below) so that
     position:fixed positions them against the true viewport — #game-container
     sits inside #game-fs-target, which has a CSS zoom applied to make the
     game view read bigger, and that zoom cascades into descendants (even
     fixed-position ones) in a way that throws off fixed offsets and
     vw-based sizing. Body has no such ancestor, so plain px/vw values here
     behave normally. Track the live nodes so a game that re-runs dpad()/
     buttons() (pong does, when switching modes) replaces them instead of
     stacking duplicates on top of each other. */
  let activeDpad=null, activeButtons=null;

  /* dpad: {up,down,left,right} -> key names. Any can be omitted. */
  function dpad(container, keys){
    if(!isTouchDevice()) return null;
    if(activeDpad){ activeDpad.remove(); activeDpad=null; }
    container.classList.add('touch-controls-active');
    const wrap=document.createElement('div');
    wrap.className='touch-controls touch-dpad-wrap';
    const pad=document.createElement('div');
    pad.className='touch-dpad';
    const slots=['ul','up','ur','left','mid','right','dl','down','dr'];
    slots.forEach(slot=>{
      let btn;
      if(slot==='up'&&keys.up){ btn=makeBtn('▲'); bindHold(btn,keys.up); }
      else if(slot==='down'&&keys.down){ btn=makeBtn('▼'); bindHold(btn,keys.down); }
      else if(slot==='left'&&keys.left){ btn=makeBtn('◀'); bindHold(btn,keys.left); }
      else if(slot==='right'&&keys.right){ btn=makeBtn('▶'); bindHold(btn,keys.right); }
      else { btn=document.createElement('div'); }
      btn.classList.add('touch-dpad-'+slot);
      pad.appendChild(btn);
    });
    wrap.appendChild(pad);
    document.body.appendChild(wrap);
    activeDpad=wrap;
    return wrap;
  }

  /* buttons: [{label,key,hold?:bool,className?}] rendered in a row. */
  function buttons(container, defs, extraClass){
    if(!isTouchDevice()) return null;
    if(activeButtons){ activeButtons.remove(); activeButtons=null; }
    container.classList.add('touch-controls-active');
    const wrap=document.createElement('div');
    wrap.className='touch-controls touch-btn-row'+(extraClass?' '+extraClass:'');
    defs.forEach(d=>{
      const btn=makeBtn(d.label, d.className);
      if(d.hold) bindHold(btn, d.key); else bindTap(btn, d.key);
      wrap.appendChild(btn);
    });
    document.body.appendChild(wrap);
    activeButtons=wrap;
    return wrap;
  }

  /* swipe: calls onSwipe('up'|'down'|'left'|'right') on the given element. */
  function swipe(el, onSwipe, opts){
    opts = opts || {};
    const threshold = opts.threshold || 24;
    let sx=0, sy=0, tracking=false;
    el.addEventListener('touchstart', e=>{
      if(e.touches.length!==1) return;
      sx=e.touches[0].clientX; sy=e.touches[0].clientY; tracking=true;
    }, {passive:true});
    el.addEventListener('touchmove', e=>{
      if(!tracking) return;
      if(opts.preventScroll) e.preventDefault();
    }, {passive:!opts.preventScroll});
    el.addEventListener('touchend', e=>{
      if(!tracking) return;
      tracking=false;
      const t=e.changedTouches[0];
      const dx=t.clientX-sx, dy=t.clientY-sy;
      if(Math.max(Math.abs(dx),Math.abs(dy))<threshold) return;
      if(Math.abs(dx)>Math.abs(dy)) onSwipe(dx>0?'right':'left');
      else onSwipe(dy>0?'down':'up');
    }, {passive:true});
  }

  window.TouchControls = {isTouchDevice, dpad, buttons, swipe, fireKey};
})();
