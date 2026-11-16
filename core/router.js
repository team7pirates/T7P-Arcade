// Screen switching. Each screen is a function that returns an element.
// Screens are addressed by the part of the address after "#/" so the phone's
// back button works: #/ is the menu, #/settings, #/grids …
//
// A screen element can set el._cleanup = () => {…}; it runs when the player
// leaves (stop clocks, save progress). Game screens are registered with
// { live: true } so a background refresh never restarts a game.

const screens = new Map();
let fallback = 'menu';
let started = false;
let showing = null;

export function registerScreen(name, render, { live = false } = {}) {
  screens.set(name, { render, live });
}

export function go(name) {
  const target = `#/${name === fallback ? '' : name}`;
  if (location.hash === target || (!location.hash && name === fallback)) show();
  else location.hash = target;
}

export function back() {
  if (history.length > 1 && location.hash && location.hash !== '#/') history.back();
  else go(fallback);
}

export function current() {
  const name = location.hash.replace(/^#\/?/, '').split('?')[0];
  return screens.has(name) ? name : fallback;
}

async function show() {
  const app = document.getElementById('app');
  const name = current();
  const old = app.firstElementChild;
  if (old && typeof old._cleanup === 'function') {
    try { old._cleanup(); } catch (e) { console.error(e); }
  }
  showing = name;
  const el = await screens.get(name).render();
  if (showing !== name) return; // the player moved on while this was loading
  app.replaceChildren(el);
  app.dataset.screen = name;
  window.scrollTo(0, 0);
  app.focus({ preventScroll: true });
}

export function startRouter(defaultScreen = 'menu') {
  fallback = defaultScreen;
  if (!started) window.addEventListener('hashchange', show);
  started = true;
  return show();
}

// Re-draw the current screen (after a setting or profile change).
// Game screens keep their own state and are left alone.
export function refresh() {
  if (!started) return;
  const entry = screens.get(current());
  if (entry && entry.live) return;
  show();
}
