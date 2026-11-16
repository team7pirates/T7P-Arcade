// "LOADING T7P ARCADE": the startup screen. Step 01 loads the roster for real;
// steps 02–08 get each mode ready. When a mode ships, its step loads that
// mode's file here. The screen runs about 12 seconds so every step can be
// seen; a tap skips the rest.

// How long each step stays on screen (ms). 1.8s + 7 × 1.3s + 1.2s ≈ 12s.
const FIRST_STEP_MS = 1800;
const STEP_MS = 1300;
const END_HOLD_MS = 1200;

import { h, icon, avatar } from '../ui.js';
import { characters } from '../characters.js';
import { MODES, modeById } from '../modes.js';
import { profile } from '../profile.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runLoading(app, { onRetry } = {}) {
  const steps = [
    { label: 'Characters', line: () => `LOADING ${characters.count || ''} CHARACTERS`.replace('  ', ' '), task: () => characters.load() },
    ...MODES.map((m) => ({ label: m.name, line: () => m.loadingLine, task: () => (m.load ? m.load() : null) })),
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
  const subText = h('span', {}, 'PREPARING YOUR ARCADE');

  const screen = h('section', { class: 'loading', 'aria-label': 'Loading T7P Arcade' },
    h('header', { class: 'ld-head panel' },
      h('h1', { class: 'display-xl ld-title' }, 'LOADING ', h('span', { class: 'gold' }, 'T7P ARCADE')),
      h('p', { class: 'label-spaced ld-sub', 'aria-live': 'polite' }, h('span', { class: 'gold' }, '>>> '), subText),
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
    if (i === 0) showPlayerIcon(screen, p.iconId);
    subText.textContent = steps[i].line();
    const minTime = skipping ? 0 : (i === 0 ? FIRST_STEP_MS : STEP_MS);
    const left = minTime - (performance.now() - started);
    if (left > 0) await wait(left);

    card.className = 'ld-step is-done';
    card.querySelector('.ld-status').replaceChildren(icon('check', 14), 'COMPLETE');
    segs[i].classList.add('on');
    bar.setAttribute('aria-valuenow', i + 1);

    if (i === 0) {
      skipHint.hidden = false;
      screen.addEventListener('pointerdown', skip, { once: true });
      document.addEventListener('keydown', skip, { once: true });
    }
  }
  document.removeEventListener('keydown', skip);
  subText.textContent = 'READY. DEPLOYING';
  skipHint.hidden = true;
  if (!skipping) await wait(END_HOLD_MS);
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

// Once the player has picked an icon, the banner shows it instead of the logo.
function showPlayerIcon(screen, iconId) {
  const c = iconId != null ? characters.get(iconId) : null;
  const logo = screen.querySelector('.ld-logo');
  if (!c || !logo) return;
  const pic = avatar(c, characters, 'lg');
  pic.classList.add('ld-logo', 'ld-avatar');
  pic.setAttribute('aria-hidden', 'false');
  pic.setAttribute('role', 'img');
  pic.setAttribute('aria-label', `Your icon: ${c.name}`);
  logo.replaceWith(pic);
}
