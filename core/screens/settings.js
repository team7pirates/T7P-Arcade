// Settings: sound, fight scenes, display and saves.

import { h, icon, toast, confirmSheet } from '../ui.js';
import { settings, DEFAULT_SETTINGS } from '../settings.js';
import { store } from '../store.js';
import { profile } from '../profile.js';
import { records } from '../records.js';
import { back, refresh } from '../router.js';
import { APP_VERSION } from '../version.js';

export function renderSettings() {
  const s = settings.value;

  return h('section', { class: 'screen page' },
    pageHeader('SETTINGS'),

    group('Sound',
      slider('Music volume', 'musicVolume', s.musicVolume),
      slider('Sound effects volume', 'sfxVolume', s.sfxVolume),
      h('p', { class: 'caption muted setting-note' }, 'Music and sound effects arrive with the first modes.'),
    ),

    group('Fight scenes',
      toggle('Skip fight scenes', 'Go straight to the result after each fight.', 'skipFightScenes', s.skipFightScenes),
    ),

    group('Display',
      choice('Reduce motion', 'Fewer animations and no falling petals.', 'reducedMotion', s.reducedMotion, [
        [null, 'Phone setting'], [true, 'On'], [false, 'Off'],
      ]),
      toggle('Colorblind tier colors', 'Tier badges use colors that differ in brightness, not just hue.', 'colorblindTiers', s.colorblindTiers),
      h('div', { class: 'tier-preview', 'aria-hidden': 'true' },
        ['S', 'A', 'B', 'C'].map((t) => h('span', { class: `tier-badge tier-${t.toLowerCase()}` }, t)),
      ),
    ),

    group('Saves',
      h('p', { class: 'body-text setting-note' },
        store.persistent
          ? 'Your saves are kept on this device. Back them up to move them to another phone or keep them safe.'
          : 'This browser is blocking storage (private window?), so nothing is saved after you close the tab.'),
      h('div', { class: 'btn-col' },
        h('button', { class: 'btn btn-secondary', onClick: backup }, icon('download', 18), 'Back up saves'),
        restoreButton(),
        h('button', { class: 'btn btn-danger', onClick: eraseAll }, 'Erase everything'),
      ),
    ),

    group('Reset',
      h('button', { class: 'btn btn-secondary', onClick: resetSettings }, 'Reset settings to default'),
    ),
  );
}

export function pageHeader(title) {
  return h('header', { class: 'topbar page-top' },
    h('button', { class: 'icon-btn', 'aria-label': 'Back', onClick: back }, icon('back', 22)),
    h('h1', { class: 'title' }, title),
    h('span', { class: 'icon-btn-spacer' }),
  );
}

function group(title, ...children) {
  return h('section', { class: 'set-group panel' }, h('h2', { class: 'label-spaced set-title' }, title.toUpperCase()), children);
}

function toggle(label, hint, key, value) {
  const id = `set-${key}`;
  const input = h('input', { type: 'checkbox', id, class: 'switch-input', role: 'switch', checked: !!value });
  input.addEventListener('change', () => settings.update({ [key]: input.checked }));
  return h('div', { class: 'set-row' },
    h('label', { for: id, class: 'set-text' }, h('span', { class: 'heading' }, label), h('span', { class: 'caption muted' }, hint)),
    h('span', { class: 'switch' }, input, h('span', { class: 'switch-track', 'aria-hidden': 'true' })),
  );
}

function slider(label, key, value) {
  const id = `set-${key}`;
  const out = h('output', { for: id, class: 'set-value' }, String(value));
  const input = h('input', { type: 'range', id, min: 0, max: 100, step: 5, value, class: 'range' });
  input.addEventListener('input', () => { out.textContent = input.value; });
  input.addEventListener('change', () => settings.update({ [key]: Number(input.value) }));
  return h('div', { class: 'set-row set-row-stack' },
    h('div', { class: 'set-line' }, h('label', { for: id, class: 'heading' }, label), out),
    input,
  );
}

function choice(label, hint, key, value, options) {
  const name = `set-${key}`;
  return h('fieldset', { class: 'set-row set-row-stack' },
    h('legend', { class: 'set-text' }, h('span', { class: 'heading' }, label), h('span', { class: 'caption muted' }, hint)),
    h('div', { class: 'segmented' }, options.map(([v, text], i) => {
      const id = `${name}-${i}`;
      const input = h('input', { type: 'radio', name, id, checked: v === value });
      input.addEventListener('change', () => settings.update({ [key]: v }));
      return h('span', {}, input, h('label', { for: id }, text));
    })),
  );
}

async function backup() {
  const data = await store.all();
  const file = {
    app: 't7p-arcade',
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: `t7p-arcade-backup-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Backup saved to your downloads.');
}

function restoreButton() {
  const input = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      toast('That file is not a T7P Arcade backup.');
      return;
    }
    if (!parsed || parsed.app !== 't7p-arcade' || typeof parsed.data !== 'object') {
      toast('That file is not a T7P Arcade backup.');
      return;
    }
    const when = parsed.exportedAt ? new Date(parsed.exportedAt).toLocaleDateString() : 'an unknown date';
    const ok = await confirmSheet({
      title: 'RESTORE BACKUP?',
      message: `This replaces everything saved on this device with the backup from ${when}.`,
      confirmLabel: 'Restore',
      danger: true,
    });
    if (!ok) return;
    await store.replaceAll(parsed.data);
    await Promise.all([settings.load(), profile.load(), records.load()]);
    refresh();
    toast('Backup restored.');
  });
  return h('span', {}, input,
    h('button', { class: 'btn btn-secondary', onClick: () => input.click() }, 'Restore from backup'));
}

async function eraseAll() {
  const ok = await confirmSheet({
    title: 'ERASE EVERYTHING?',
    message: 'This deletes your codename, icon, settings, records and every save on this device. It cannot be undone. Back up first if you might want them.',
    confirmLabel: 'Erase',
    danger: true,
  });
  if (!ok) return;
  await store.replaceAll({});
  await Promise.all([settings.load(), profile.load(), records.load()]);
  refresh();
  toast('Everything was erased.');
}

async function resetSettings() {
  await settings.update({ ...DEFAULT_SETTINGS });
  refresh();
  toast('Settings reset.');
}
