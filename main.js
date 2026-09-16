/* ============================================================
   SHARED STORAGE HELPERS
============================================================ */
const Store = {
  get(key, fallback){
    try{
      const v = localStorage.getItem('arcade_'+key);
      return v === null ? fallback : JSON.parse(v);
    }catch(e){ return fallback; }
  },
  set(key, val){
    try{ localStorage.setItem('arcade_'+key, JSON.stringify(val)); }catch(e){}
  }
};

/* ============================================================
   GAME REGISTRY
   Each entry: { id, name, icon, ready, best(): string, module: {init(container), destroy()} }
   Every game's own .js file calls registerGame() to add itself here.
============================================================ */
const Games = {};

function registerGame(id, name, icon, ready, module, best, hidden){
  Games[id] = {id, name, icon, ready, module: module || {init(){}, destroy(){}}, best, hidden: !!hidden};
}

/* ============================================================
   MENU RENDERING (multi-page site — tiles are real links, not
   JS-driven view swaps)
============================================================ */

/**
 * Renders a grid of tiles into `gridEl`, one per registered game that
 * passes `filter`. Ready games render as a real <a href> so browser
 * navigation (back/forward, open-in-new-tab, etc.) all work normally.
 * `hrefFor(game)` returns the URL for a given ready game.
 */
function renderLinkMenu(gridEl, hrefFor, filter){
  gridEl.innerHTML = '';
  Object.values(Games).forEach(g=>{
    if(g.hidden) return;
    if(filter && !filter(g)) return;
    const tile = document.createElement(g.ready ? 'a' : 'div');
    tile.className = 'tile' + (g.ready ? '' : ' soon');
    if(g.ready) tile.href = hrefFor(g);
    const bestText = g.ready && g.best ? g.best() : '';
    tile.innerHTML = `
      <span class="badge">${g.ready ? 'PLAY' : 'SOON'}</span>
      <span class="icon">${g.icon}</span>
      <span class="name">${g.name}</span>
      <div class="best">${bestText}</div>
    `;
    gridEl.appendChild(tile);
  });
}

/**
 * Called immediately on each game page to initialize the registered
 * game into #game-container.
 */
function bootGame(id){
  const g = Games[id];
  const container = document.getElementById('game-container');
  const titleEl = document.getElementById('game-title');
  if(!g){
    if(container) container.innerHTML = '<p class="msg">This game could not be loaded.</p>';
    return;
  }
  if(titleEl) titleEl.textContent = g.name;
  g.module.init(container);
  window.addEventListener('beforeunload', ()=>{ if(g.module.destroy) g.module.destroy(); });
}

/**
 * Every game page carries data-back-href on <body>. Pressing Escape at
 * any point navigates straight back to whichever hub this game belongs
 * to (the main hub, Chess Games, or Two Player Games) — same target as
 * the back button.
 */
function setupEscapeToHub(){
  const backHref = document.body.dataset.backHref;
  if(!backHref) return; // not a game page (e.g. index.html)
  document.addEventListener('keydown', (e)=>{
    if(e.key==='Escape') window.location.href = backHref;
  });
}
setupEscapeToHub();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // All pages live at the site root, so the service worker always
    // registers from the root and controls the whole arcade.
    navigator.serviceWorker.register('./sw.js', {scope: './'})
      .then((reg) => console.log('Service Worker registered successfully:', reg.scope))
      .catch((err) => console.error('Service Worker registration failed:', err));
  });
}
