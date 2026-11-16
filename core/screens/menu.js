// Main menu: Pick Your Icon, the seven mode tiles, and the extras.

import { h, icon, avatar, sheet } from '../ui.js';
import { MODES } from '../modes.js';
import { profile } from '../profile.js';
import { characters } from '../characters.js';
import { install } from '../install.js';
import { go } from '../router.js';
import { openIconPicker } from './icon-picker.js';
import { openGetTheApp } from './get-app.js';
import { openRecords } from './records.js';

export function renderMenu() {
  const flagships = MODES.filter((m) => m.flagship);
  const others = MODES.filter((m) => !m.flagship);

  return h('section', { class: 'menu screen' },
    h('header', { class: 'topbar' },
      h('span', { class: 'topbar-brand' }, 'T7P // ARCADE'),
      h('span', { class: 'label-spaced topbar-mid' }, 'SELECT MODE'),
      h('button', { class: 'icon-btn', 'aria-label': 'Settings', onClick: () => go('settings') }, icon('gear', 22)),
    ),

    renderIconCard(),

    h('nav', { class: 'mode-grid', 'aria-label': 'Game modes' },
      flagships.map(modeTile),
      h('div', { class: 'mode-pair' }, others.map(modeTile)),
    ),

    h('div', { class: 'menu-extras' },
      install.installed ? null
        : h('button', { class: 'btn btn-secondary', onClick: openGetTheApp }, icon('download', 18), 'Get the app'),
      h('button', { class: 'btn btn-secondary', onClick: openRecords }, 'My records'),
      h('button', { class: 'btn btn-secondary', onClick: () => go('about') }, icon('info', 18), 'About'),
    ),
    h('button', { class: 'link-btn', onClick: openRatingInfo }, 'How are characters rated?'),

    h('footer', { class: 'statusbar' },
      h('span', {}, `OPERATIVE: ${profile.displayName}`),
      h('span', {}, `${characters.count} CHARACTERS`),
    ),
  );
}

function renderIconCard() {
  const c = characters.get(profile.value.iconId);
  const name = profile.value.codename;
  return h('button', { class: `icon-card${c ? '' : ' is-empty'}`, onClick: openIconPicker, 'aria-label': c ? `Change icon. Current icon: ${c.name}` : 'Pick your icon' },
    c ? avatar(c, characters, 'lg') : h('span', { class: 'avatar avatar-lg avatar-empty', 'aria-hidden': 'true' }, icon('plus', 32)),
    h('span', { class: 'icon-card-text' },
      h('span', { class: 'label-spaced' }, name ? 'OPERATIVE' : 'NEW OPERATIVE'),
      h('span', { class: 'icon-card-name' }, name || 'PICK YOUR ICON'),
      h('span', { class: 'icon-card-hint' },
        c ? `${c.name.toUpperCase()} · ` : '', icon('edit', 14), c ? ' change' : ' choose a hero or villain'),
    ),
  );
}

function modeTile(m) {
  return h('button', {
    class: `mode-tile${m.flagship ? ' is-flagship' : ''}`,
    onClick: () => (m.ready ? go(m.id) : openModePreview(m)),
  },
    h('span', { class: 'mode-tile-inner' },
      m.flagship ? h('span', { class: 'mode-tag' }, 'FLAGSHIP') : null,
      h('span', { class: 'mode-name' }, m.name),
      h('span', { class: 'mode-sub' }, m.sub),
      m.ready ? null : h('span', { class: 'mode-soon' }, `Coming in Wave ${m.wave}`),
    ),
  );
}

function openModePreview(m) {
  sheet({
    title: m.name.toUpperCase(),
    content: h('div', {},
      h('p', { class: 'label-spaced' }, m.sub.toUpperCase()),
      h('p', { class: 'body-text' }, m.blurb),
      h('p', { class: 'body-text muted' }, `${m.name} is being rebuilt and arrives in Wave ${m.wave}.`),
    ),
  });
}

function openRatingInfo() {
  sheet({
    title: 'HOW CHARACTERS ARE RATED',
    content: h('div', { class: 'prose' },
      h('p', {}, 'Every character gets a Power Level from 1 to 100, two roles, and Aura, Clutch and Chaos ratings.'),
      h('p', {}, 'Power Level is based on what each character has actually done in their story (their feats). The strongest characters in every series also get a minimum rating, so every series has someone who can compete.'),
      h('p', {}, 'Aura, Clutch and Chaos are fan ratings: how iconic, how reliable under pressure and how unpredictable a character is.'),
      h('p', {}, 'These are fan opinions, made with AI help and checked by TEAM7PIRATES. They are not official, and you are free to disagree.'),
    ),
  });
}
