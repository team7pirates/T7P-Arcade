// About: who made it, the fan-project disclaimer, credits and privacy.

import { h } from '../ui.js';
import { characters } from '../characters.js';
import { APP_VERSION } from '../version.js';
import { pageHeader } from './settings.js';

export function renderAbout() {
  return h('section', { class: 'screen page about' },
    pageHeader('ABOUT'),

    h('div', { class: 'about-hero' },
      h('img', { src: 'icons/badge.webp', alt: 'TEAM7PIRATES', class: 'about-badge', width: 220, height: 220 }),
      h('h2', { class: 'display-lg' }, 'T7P ARCADE'),
      h('p', { class: 'label-spaced' }, `VERSION ${APP_VERSION} · ROSTER ${characters.version ?? '-'} · ${characters.count} CHARACTERS`),
    ),

    block('Fan project',
      'T7P Arcade is a free fan game made by TEAM7PIRATES. It is not affiliated with, endorsed by or sponsored by any of the companies that own the characters in it. All characters belong to their creators and publishers.',
      'Character portraits are original artwork inspired by each character. No official art, logos or symbols are used.',
    ),

    block('Privacy',
      'There are no accounts and no tracking. Everything you do, including your codename, icon, settings and saves, stays on this device.',
      'The game only goes online to download updates to itself.',
    ),

    block('Credits',
      'Made by TEAM7PIRATES.',
      'Fonts: Poppins (Indian Type Foundry) and Inter (Rasmus Andersson), both under the SIL Open Font License.',
    ),
  );
}

function block(title, ...paras) {
  return h('section', { class: 'panel about-block' },
    h('h3', { class: 'label-spaced set-title' }, title.toUpperCase()),
    paras.map((p) => h('p', { class: 'body-text' }, p)),
  );
}
