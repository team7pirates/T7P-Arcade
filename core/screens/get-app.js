// "Get the app": add T7P Arcade to the home screen (PWA install).

import { h, sheet, closeSheet } from '../ui.js';
import { install } from '../install.js';
import { refresh } from '../router.js';

export async function openGetTheApp() {
  if (install.canPrompt) {
    const ok = await install.prompt();
    if (ok) refresh();
    return;
  }
  const steps = install.isIos
    ? ['Open this page in Safari.', 'Tap the Share button (the square with an arrow).', 'Tap "Add to Home Screen", then "Add".']
    : ['Open your browser menu (the three dots).', 'Tap "Install app" or "Add to Home screen".', 'Confirm, and the T7P Arcade icon appears with your apps.'];

  sheet({
    title: 'GET THE APP',
    content: h('div', {},
      h('p', { class: 'body-text' }, 'T7P Arcade installs straight from your browser. No app store, and it works without internet once installed.'),
      h('ol', { class: 'steps-list' }, steps.map((t) => h('li', {}, t))),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn btn-primary', onClick: closeSheet }, 'Got it'),
      ),
    ),
  });
}
