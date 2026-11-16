// "LOADING T7P ARCADE": the startup screen. Step 01 loads the roster for real;
// steps 02–08 get each mode ready. When a mode ships, its step loads that
// mode's file here.

import { h, icon } from '../ui.js';
import { characters } from '../characters.js';
import { MODES, modeById } from '../modes.js';
import { profile } from '../profile.js';
import { settings } from '../settings.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runLoading(app, { onRetry } = {}) {
  const steps = [
    { label: 'Characters', task: () => characters.load() },
    ...MODES.map((m) => ({ label: m.name, task: () => (m.load ? m.load() : null) })),
  ];

  const segs = steps.map(() => h('span', { class: 'ld-seg' }));
  const cards = steps.map((s, i) => h('li', { class: 'ld-step is-pending' },
    h('span', { class: 'ld-num' }, String(i + 1).padStart(2, '0')),
    h('span', { class: 'ld-label' }, s.label),
    h('span', { class: 'ld-status' }, 'PENDING'),
  ));

  const p = profile.value;
  const last = modeById(p.lastMode);
  const skipHint = h('p', { class: 'ld-skip', hidden: true }, 'TAP TO SKIP');

  const screen = h('section', { class: 'loading', 'aria-label': 'Loading T7P Arcade' },
    h('header', { class: 'ld-head panel' },
      h('h1', { class: 'display-xl ld-title' }, 'LOADING ', h('span', { class: 'gold' }, 'T7P ARCADE')),
      h('p', { class: 'label-spaced ld-sub' }, h('span', { class: 'gold' }, '>>> '), 'PREPARING YOUR ARCADE'),
      h('div', { class: 'ld-segs', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': steps.length, 'aria-valuenow': 0 }, segs),
    ),
    h('ol', { class: 'ld-steps' }, cards),
    h('footer', { class: 'ld-banner panel' },
      h('img', { class: 'ld-logo', src: 'icons/mascot.webp', alt: 'TEAM7PIRATES logo', width: 120, height: 104 }),
      h('div', { class: 'ld-who' },
        h('div', { class: 'ld-who-small' }, p.codename ? 'OPERATIVE' : 'WELCOME,'),
        h('div', { class: 'ld-who-name' }, p.codename || 'NEW OPERATIVE'),
        h('div', { class: 'label-spaced' }, last ? `LAST PLAYED · ${last.name.toUpperCase()}` : 'FIRST DEPLOYMENT'),
      ),
      h('div', { class: 'ld-slash', 'aria-hidden': 'true' }, '///'),
    ),
    skipHint,
  );
  app.replaceChildren(screen);
  app.dataset.screen = 'loading';

  const fast = settings.reducedMotion();
  let skipping = false;
  const skip = () => { skipping = true; };

  const bar = screen.querySelector('.ld-segs');
  for (let i = 0; i < steps.length; i++) {
    const card = cards[i];
    card.className = 'ld-step is-now';
    card.querySelector('.ld-status').replaceChildren(h('span', { class: 'ld-spin', 'aria-hidden': 'true' }), 'IN PROGRESS');

    const started = performance.now();
    try {
      await steps[i].task();
    } catch (err) {
      showError(card, err, onRetry);
      throw err;
    }
    const minTime = fast || skipping ? 0 : (i === 0 ? 420 : 170);
    const left = minTime - (performance.now() - started);
    if (left > 0) await wait(left);

    card.className = 'ld-step is-done';
    card.querySelector('.ld-status').replaceChildren(icon('check', 14), 'COMPLETE');
    segs[i].classList.add('on');
    bar.setAttribute('aria-valuenow', i + 1);

    if (i === 0 && !fast) {
      skipHint.hidden = false;
      screen.addEventListener('pointerdown', skip, { once: true });
      document.addEventListener('keydown', skip, { once: true });
    }
  }
  document.removeEventListener('keydown', skip);
  if (!fast && !skipping) await wait(350);
}

function showError(card, err, retry) {
  card.className = 'ld-step is-error';
  card.querySelector('.ld-status').textContent = 'FAILED';
  const box = h('div', { class: 'ld-error panel', role: 'alert' },
    h('p', { class: 'heading' }, 'The roster could not load.'),
    h('p', { class: 'body-text' },
      navigator.onLine
        ? 'Something went wrong reading the game files. Try again.'
        : 'You are offline and the game has not been saved to this phone yet. Open it once with internet, then it works offline.'),
    retry ? h('button', { class: 'btn btn-primary', onClick: retry }, 'Try again') : null,
  );
  card.closest('.loading').append(box);
  console.error(err);
}
