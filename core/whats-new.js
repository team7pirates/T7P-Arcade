// "What's new": release notes from whats-new.json (newest first).
// When you publish an update, add a new entry at the top of that file with the
// same version number as core/version.js and sw.js.

import { h, fill, sheet } from './ui.js';
import { APP_VERSION } from './version.js';

// fresh: true asks the server for the newest notes (used when an update is
// waiting, so the pop-up describes the new version, not the one running now).
export async function loadReleases({ fresh = false } = {}) {
  try {
    const res = await fetch(`whats-new.json${fresh ? `?t=${Date.now()}` : ''}`, { cache: fresh ? 'no-store' : 'default' });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.releases) ? data.releases : [];
  } catch {
    return [];
  }
}

export function releaseItems(release) {
  return h('ul', { class: 'whats-new-list' }, (release.items || []).map((t) => h('li', {}, t)));
}

// The centered pop-up shown when an update has downloaded.
export async function showUpdatePopup({ onUpdate, onClose }) {
  const releases = await loadReleases({ fresh: true });
  const next = releases[0] && releases[0].version !== APP_VERSION ? releases[0] : null;

  let s;
  const later = h('button', { class: 'btn btn-secondary', onClick: () => s.close() }, 'Later');
  const now = h('button', { class: 'btn btn-primary', 'data-autofocus': '', onClick: () => { now.disabled = true; now.textContent = 'Updating…'; onUpdate(); } }, 'Update now');

  s = sheet({
    title: 'UPDATE READY',
    center: true,
    onClose,
    content: h('div', { class: 'update-pop' },
      h('img', { class: 'update-logo', src: 'icons/mascot.webp', alt: '', width: 96, height: 84 }),
      next
        ? [
          h('p', { class: 'label-spaced gold' }, `VERSION ${next.version}`),
          h('h3', { class: 'update-title' }, next.title || "What's new"),
          releaseItems(next),
        ]
        : h('p', { class: 'body-text' }, 'A new version of T7P Arcade is ready.'),
      h('p', { class: 'caption muted' }, 'Updating takes a second. Your saves stay as they are.'),
      h('div', { class: 'btn-row update-actions' }, later, now),
    ),
  });
  return s;
}

// v0.15.0: updates install on their own. A loud, can't-miss banner says the
// game is about to reload, counts down, and offers "Reload now" or "Finish
// first" (it then reloads the next time you're back on the main menu).
export async function showAutoUpdate({ seconds = 15, onReload, onWait }) {
  const releases = await loadReleases({ fresh: true }).catch(() => []);
  const next = releases[0] && releases[0].version !== APP_VERSION ? releases[0] : null;
  let left = seconds; let timer = null;
  const count = h('span', { class: 'au-count' }, String(left));
  const close = () => { clearInterval(timer); el.remove(); };
  const reload = () => { clearInterval(timer); fill(btns, h('p', { class: 'au-going' }, 'RELOADING…')); onReload(); };
  const btns = h('div', { class: 'au-btns' },
    h('button', { class: 'btn btn-primary au-now', onClick: reload }, 'Reload now'),
    h('button', { class: 'btn btn-secondary', onClick: () => { close(); onWait(); } }, 'Finish what I\'m doing first'));
  const el = h('div', { class: 'au', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'au-title', 'aria-describedby': 'au-msg' },
    h('div', { class: 'au-box' },
      h('p', { class: 'au-kicker' }, '⚠ UPDATE INSTALLED'),
      h('h2', { class: 'au-title', id: 'au-title' }, 'THE GAME WILL RELOAD'),
      h('p', { class: 'au-msg', id: 'au-msg' }, h('strong', {}, `T7P Arcade${next ? ` ${next.version}` : ''} downloaded in the background.`), ' The game reloads in ', count, ' seconds to finish updating. Your saves are safe.'),
      next ? h('div', { class: 'au-notes' }, h('p', { class: 'label-spaced gold' }, next.title || "WHAT'S NEW"), releaseItems(next)) : null,
      btns));
  document.body.append(el);
  el.querySelector('.au-now').focus();
  timer = setInterval(() => { left -= 1; count.textContent = String(Math.max(0, left)); if (left <= 0) reload(); }, 1000);
  return { close };
}
