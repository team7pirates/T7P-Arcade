// Screen switching. Each screen is a function that returns an element.
// Screens are addressed by the part of the address after "#/" so the phone's
// back button works: #/ is the menu, #/settings, #/about, later #/grids …

const screens = new Map();
let fallback = 'menu';
let started = false;

export function registerScreen(name, render) { screens.set(name, render); }

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
  const el = await screens.get(name)();
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
export function refresh() { if (started) show(); }
