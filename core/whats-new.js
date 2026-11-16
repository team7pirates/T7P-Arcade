// "What's new": release notes from whats-new.json (newest first).
// When you publish an update, add a new entry at the top of that file with the
// same version number as core/version.js and sw.js.

import { h, sheet } from './ui.js';
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
