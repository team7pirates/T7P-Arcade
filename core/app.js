// Platform core: starts the app. Loads saves and settings, shows the loading
// screen, then hands over to the router.

import { store } from './store.js';
import { settings } from './settings.js';
import { profile } from './profile.js';
import { records } from './records.js';
import { registerScreen, startRouter, refresh } from './router.js';
import { registerServiceWorker, install, markAppReady } from './install.js';
import { h } from './ui.js';
import { music } from './music.js';
import { sfx } from './sfx.js';
import { runLoading } from './screens/loading.js';
import { renderMenu } from './screens/menu.js';
import { renderSettings } from './screens/settings.js';
import { renderAbout } from './screens/about.js';
import { renderChangelog } from './screens/changelog.js';
import { renderFightLab } from './screens/fight-lab.js';
import { runCleanup } from './cleanup.js';
import { renderFeedback } from './screens/feedback.js';
import { playtime } from './playtime.js';
import { startOutbox, status as feedbackStatus, markWelcomed } from './feedback.js';
import { sheet } from './ui.js';

registerScreen('menu', renderMenu);
registerScreen('settings', renderSettings);
registerScreen('about', renderAbout);
registerScreen('changelog', renderChangelog);
registerScreen('fight-lab', renderFightLab, { live: true });
registerScreen('feedback', renderFeedback);

// v0.26.0: new players get one welcome that asks them to play for a week,
// then fill out the questionnaire.
async function welcomeOnce() {
  const s = await feedbackStatus();
  if (s.welcomed) return;
  await markWelcomed();
  const w = sheet({ title: 'WELCOME TO THE PLAYTEST', center: true, content: h('div', { class: 'fb-welcome' },
    h('p', { class: 'fb-done-big' }, '🎮'),
    h('p', { class: 'body-text' }, 'Thanks for testing T7P Arcade! Please play for a week: any modes, whenever you like.'),
    h('p', { class: 'body-text' }, 'After the week, a short questionnaire (about 5 minutes) shows up on the main menu. Your honest answers decide what gets fixed and added next.'),
    h('p', { class: 'caption muted' }, 'Want to answer early? It\'s in Settings and on the main menu any time.'),
    h('button', { class: 'btn btn-primary btn-wide', onClick: () => w.close() }, 'Let\'s play')) });
}

function drawPetals() {
  const box = document.querySelector('.petals');
  if (!box || box.childElementCount) return;
  for (let i = 0; i < 14; i++) {
    box.append(h('i', {
      style: {
        left: `${(i * 7.3 + (i % 3) * 11) % 100}%`,
        animationDelay: `${-(i * 1.9) % 14}s`,
        animationDuration: `${11 + (i % 5) * 2.2}s`,
        transform: `scale(${0.6 + (i % 4) * 0.15})`,
      },
    }));
  }
}

async function boot() {
  const app = document.getElementById('app');
  await store.init();
  await Promise.all([settings.load(), profile.load(), records.load()]);
  drawPetals();
  music.init();
  sfx.init();
  try {
    await runLoading(app, { onRetry: boot });
  } catch {
    return; // the loading screen is showing the error and a Try again button
  }
  playtime.start();
  await startRouter('menu');
  startOutbox();
  setTimeout(() => { welcomeOnce().catch(() => {}); }, 900);
  install.onChange(refresh);
  markAppReady();
  // Every 2 days: trim old clutter from the saves and say what happened.
  setTimeout(() => { runCleanup().catch(() => {}); }, 2500);
}

registerServiceWorker();
boot();
