// Changelog: every release from whats-new.json, newest first.

import { h } from '../ui.js';
import { APP_VERSION } from '../version.js';
import { pageHeader } from './settings.js';
import { loadReleases, releaseItems } from '../whats-new.js';

export async function renderChangelog() {
  const releases = await loadReleases();
  return h('section', { class: 'screen page changelog' },
    pageHeader('CHANGELOG'),
    h('p', { class: 'label-spaced changelog-now' }, `YOU HAVE VERSION ${APP_VERSION}`),
    releases.length
      ? releases.map((r) => h('section', { class: `panel release-card${r.version === APP_VERSION ? ' is-current' : ''}` },
        h('div', { class: 'release-meta' },
          h('span', { class: 'label-spaced gold' }, `VERSION ${r.version}`),
          r.date ? h('span', { class: 'caption muted' }, formatDate(r.date)) : null,
        ),
        h('h2', { class: 'heading release-title' }, r.title || ''),
        releaseItems(r),
      ))
      : h('p', { class: 'body-text muted' }, 'The changelog will show up the next time you are online.'),
  );
}

function formatDate(iso) {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
