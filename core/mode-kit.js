// Pieces every mode screen shares: the header bar, the first-time
// "how to play" sheet, and a clock that pauses when the app is hidden.

import { h, icon, sheet } from './ui.js';
import { store } from './store.js';
import { back } from './router.js';

export function modeHeader({ title, sub, onHelp, onBack = back }) {
  return h('header', { class: 'topbar mode-top' },
    h('button', { class: 'icon-btn', 'aria-label': 'Back to menu', onClick: onBack }, icon('back', 22)),
    h('div', { class: 'mode-top-title' },
      h('h1', { class: 'title' }, title),
      sub ? h('p', { class: 'label-spaced' }, sub) : null,
    ),
    onHelp
      ? h('button', { class: 'icon-btn', 'aria-label': 'How to play', onClick: onHelp }, icon('info', 22))
      : h('span', { class: 'icon-btn-spacer' }),
  );
}

// Show "how to play" the first time a mode is opened; returns the opener so a
// help button can show it again.
export function howToPlay(modeId, title, rules) {
  const open = (onClose) => sheet({
    title: `HOW TO PLAY · ${title.toUpperCase()}`,
    onClose,
    content: h('div', { class: 'rules' },
      h('ul', { class: 'rules-list' }, rules.map((r) => h('li', {}, r))),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn btn-primary', 'data-close': '' }, 'Got it')),
    ),
  });
  const show = (onClose) => {
    const s = open(onClose);
    s.body.querySelector('[data-close]').addEventListener('click', () => s.close());
    return s;
  };
  const showFirstTime = async (onClose) => {
    const key = `seen:${modeId}`;
    if (await store.get(key, false)) return false;
    await store.set(key, true);
    show(onClose);
    return true;
  };
  return { show, showFirstTime };
}

// A clock that only runs while the game is on screen.
// Counts up (elapsed) or down (with a starting amount). Times are in ms.
export function createClock({ startMs = 0, countDown = false, onTick, onZero }) {
  let value = startMs;
  let running = false;
  let ended = false;
  let last = 0;
  let timer = null;
  let hiddenPaused = false;

  const advance = () => {
    const now = performance.now();
    value += (countDown ? -1 : 1) * (now - last);
    last = now;
  };
  const halt = () => {
    running = false;
    clearInterval(timer);
    timer = null;
  };
  const hitZero = () => {
    value = 0;
    halt();
    if (onTick) onTick(value);
    if (!ended) { ended = true; if (onZero) onZero(); }
  };
  const tick = () => {
    advance();
    if (countDown && value <= 0) { hitZero(); return; }
    if (onTick) onTick(value);
  };

  function start() {
    if (running || ended) return;
    running = true;
    last = performance.now();
    timer = setInterval(tick, 200);
    if (onTick) onTick(value);
  }
  function stop() {
    if (!running) return;
    advance();
    if (countDown && value < 0) value = 0;
    halt();
  }
  const onVisibility = () => {
    if (document.visibilityState === 'hidden' && running) { hiddenPaused = true; stop(); }
    else if (document.visibilityState === 'visible' && hiddenPaused) { hiddenPaused = false; start(); }
  };
  document.addEventListener('visibilitychange', onVisibility);

  return {
    start,
    stop,
    get running() { return running; },
    get ms() { if (running) advance(); return Math.max(0, value); },
    add(ms) {
      if (ended) return;
      if (running) advance();
      value = Math.max(0, value + ms);
      if (countDown && value <= 0) { hitZero(); return; }
      if (onTick) onTick(value);
    },
    destroy() { stop(); document.removeEventListener('visibilitychange', onVisibility); },
  };
}

// Count-downs round up (so 0:00 means time is really up); count-ups round down.
export function formatTime(ms, { up = false } = {}) {
  const total = Math.max(0, up ? Math.floor(ms / 1000) : Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
