// Settings: sound, fight scenes, display and saves.

import { h, icon, toast, confirmSheet, sheet } from '../ui.js';
import { settings, DEFAULT_SETTINGS } from '../settings.js';
import { store } from '../store.js';
import { profile } from '../profile.js';
import { records } from '../records.js';
import { back, refresh } from '../router.js';
import { APP_VERSION } from '../version.js';
import { music } from '../music.js';

export function renderSettings() {
  const s = settings.value;

  return h('section', { class: 'screen page' },
    pageHeader('SETTINGS'),

    group('Sound',
      slider('Music volume', 'musicVolume', s.musicVolume),
      slider('Sound effects volume', 'sfxVolume', s.sfxVolume),
      h('button', { class: 'btn btn-secondary', onClick: () => { music.next(); toast('Next song.'); } }, 'Next song'),
      h('p', { class: 'caption muted setting-note' }, 'Music starts on your first tap. Set Music volume to 0 to turn it off. Sound effects are coming soon.'),
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
          ? 'Your saves are kept on this device. To move them to another phone or PC without the internet: tap Send or back up saves, send the file with AirDrop, Nearby Share, Bluetooth or a USB cable, then open Settings on the other device and tap Restore. You can send everything or just one save.'
          : 'This browser is blocking storage (private window?), so nothing is saved after you close the tab.'),
      h('div', { class: 'btn-col' },
        h('button', { class: 'btn btn-secondary', onClick: backupSheet }, icon('download', 18), 'Send or back up saves'),
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

// ---------- Moving saves between devices (v0.19.0) ----------
// Keys are grouped into saves you can pick one by one: each Dynasty slot (with
// its photos), each Forbidden Fusion file (with its climb), and "everything
// else" (codename, settings, records, other modes).
async function saveGroups() {
  const all = await store.all();
  const groups = []; const used = new Set();
  const add = (id, label, detail, keys) => { const ks = keys.filter((k) => k in all); if (!ks.length) return; ks.forEach((k) => used.add(k)); groups.push({ id, label, detail, keys: ks }); };
  for (let n = 1; n <= 3; n++) {
    const L = all[`dynasty:slot${n}`];
    const t = L?.user ? L.teams?.[L.user.team] : null;
    add(`dy${n}`, `Dynasty slot ${n}`, t ? `${t.name} · ${L.user.coach} · season ${L.season}` : 'Saved league', [`dynasty:slot${n}`, `dynasty:photos:slot${n}`]);
  }
  for (let n = 1; n <= 5; n++) {
    const d = all[`fusion:slot${n}`];
    add(`ff${n}`, `Forbidden Fusion file ${n}`, d ? `${d.build?.name || 'Fighter'} · ${Math.round(d.lifetimeBounty || 0).toLocaleString()} Bounty` : 'Saved fighter', [`fusion:slot${n}`, `fusion:run:slot${n}`]);
  }
  const rest = Object.keys(all).filter((k) => !used.has(k));
  if (rest.length) groups.push({ id: 'rest', label: 'Everything else', detail: 'Codename, icon, settings, records and the other modes', keys: rest });
  return { all, groups };
}

async function backupSheet() {
  const { all, groups } = await saveGroups();
  const picked = new Set(groups.map((g) => g.id));
  const canShare = (() => { try { return !!navigator.canShare && navigator.canShare({ files: [new File(['{}'], 'x.json', { type: 'application/json' })] }); } catch { return false; } })();
  const go = async (how) => {
    const chosen = groups.filter((g) => picked.has(g.id));
    if (!chosen.length) { toast('Pick at least one save.'); return; }
    const data = {}; chosen.forEach((g) => g.keys.forEach((k) => { data[k] = all[k]; }));
    const partial = chosen.length < groups.length;
    const file = { app: 't7p-arcade', appVersion: APP_VERSION, exportedAt: new Date().toISOString(), partial, saves: chosen.map((g) => g.label), data };
    const name = `t7p-arcade-${partial ? 'saves' : 'backup'}-${new Date().toISOString().slice(0, 10)}.json`;
    const text = JSON.stringify(file);
    if (how === 'share') {
      try {
        await navigator.share({ files: [new File([text], name, { type: 'application/json' })], title: 'T7P Arcade saves' });
        s.close(); return;
      } catch (e) { if (e && e.name === 'AbortError') return; toast('Sharing didn\'t work. Saving the file instead.'); }
    }
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = h('a', { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    s.close();
    toast('Saved to your downloads. Move the file to the other device and tap Restore there.');
  };
  const list = h('ul', { class: 'save-pick' }, groups.map((g) => h('li', {}, h('label', { class: 'save-pick-row' },
    h('input', { type: 'checkbox', checked: true, onChange: (e) => { if (e.target.checked) picked.add(g.id); else picked.delete(g.id); } }),
    h('span', { class: 'save-pick-text' }, h('span', { class: 'heading' }, g.label), h('span', { class: 'caption muted' }, g.detail))))));
  const s = sheet({
    title: 'SEND OR BACK UP SAVES',
    content: h('div', { class: 'save-pick-wrap' },
      h('p', { class: 'body-text' }, 'Pick what goes in the file. No internet needed: send it straight to your other device, or save it and move it with a cable.'),
      groups.length ? list : h('p', { class: 'body-text muted' }, 'Nothing is saved on this device yet.'),
      h('div', { class: 'btn-col' },
        canShare ? h('button', { class: 'btn btn-primary', onClick: () => go('share') }, 'Send to another device') : null,
        h('button', { class: canShare ? 'btn btn-secondary' : 'btn btn-primary', onClick: () => go('download') }, icon('download', 18), 'Save the file')),
      h('p', { class: 'caption muted' }, canShare ? 'Send opens your share menu: AirDrop on iPhone, Nearby Share or Quick Share on Android, or Bluetooth.' : 'On a PC: copy the file to a USB stick or your phone with a cable. On a phone, Send uses AirDrop or Nearby Share.')),
  });
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
    const mode = await restoreChoice(parsed, when);
    if (!mode) return;
    if (mode === 'replace') await store.replaceAll(parsed.data);
    else for (const [k, v] of Object.entries(parsed.data)) await store.set(k, v);
    await Promise.all([settings.load(), profile.load(), records.load()]);
    refresh();
    toast(mode === 'replace' ? 'Backup restored.' : 'Saves added to this device.');
  });
  return h('span', {}, input,
    h('button', { class: 'btn btn-secondary', onClick: () => input.click() }, 'Restore from backup'));
}

// Add the saves in the file (keep the rest of this device), or replace everything.
async function restoreChoice(parsed, when) {
  const here = await store.all();
  const clash = Object.keys(parsed.data).filter((k) => /^(dynasty:slot|fusion:slot)/.test(k) && k in here);
  const names = (parsed.saves && parsed.saves.length) ? parsed.saves.join(', ') : 'everything in the backup';
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; s.close(); resolve(v); };
    const s = sheet({
      title: 'RESTORE SAVES',
      onClose: () => { if (!done) { done = true; resolve(null); } },
      content: h('div', { class: 'save-pick-wrap' },
        h('p', { class: 'body-text' }, `File from ${when}: ${names}.`),
        clash.length ? h('p', { class: 'body-text loss' }, `This device already has ${clash.length === 1 ? 'a save' : 'saves'} in the same slot. Adding will overwrite ${clash.length === 1 ? 'it' : 'them'}.`) : null,
        h('div', { class: 'btn-col' },
          h('button', { class: 'btn btn-primary', onClick: () => finish('merge') }, 'Add to this device'),
          h('p', { class: 'caption muted' }, 'Keeps everything else on this device.'),
          h('button', { class: 'btn btn-danger', onClick: () => finish('replace') }, 'Replace everything'),
          h('p', { class: 'caption muted' }, 'Deletes what is on this device first. Use this to copy one device onto another exactly.'))),
    });
  });
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
