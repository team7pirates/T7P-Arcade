// Main menu (v0.24.0): fills the screen. Your icon and a Continue card on
// top, three big flagship cards with art (v0.37.0: Forbidden Fusion, Dynasty,
// My Career), a QUICK PLAY row for the one-sitting modes (Brawl first), and a
// small icon bar for the extras.

import { h, icon, avatar, sheet } from '../ui.js';
import { MODES } from '../modes.js';
import { profile } from '../profile.js';
import { characters } from '../characters.js';
import { install } from '../install.js';
import { go } from '../router.js';
import { openIconPicker } from './icon-picker.js';
import { openGetTheApp } from './get-app.js';
import { openRecords } from './records.js';
import { store } from '../store.js';
import { shouldNudge, snooze, never, status as feedbackStatus, playtestDay, NUDGE } from '../feedback.js';

export function renderMenu() {
  const flagships = MODES.filter((m) => m.flagship);
  const others = MODES.filter((m) => !m.flagship);

  const cont = h('div', { class: 'menu-continue-slot' });
  fillContinue(cont);
  const art = {};
  flagships.forEach((m) => { art[m.id] = h('span', { class: 'mode-art', 'aria-hidden': 'true' }); });
  const brawlArt = h('span', { class: 'mode-art', 'aria-hidden': 'true' });
  art.brawl = brawlArt;
  fillArt(art);
  const nudge = h('div', { class: 'menu-nudge-slot' });
  fillNudge(nudge);
  const dayChip = h('span', { class: 'menu-playtest' });
  feedbackStatus().then((st) => { const d = st.welcomed ? playtestDay(st) : st.submitted ? null : 1; if (d) dayChip.textContent = `PLAYTEST · DAY ${d} OF ${NUDGE.weekDays}`; });
  const extra = (label, ic, onClick) => h('button', { class: 'menu-iconbtn', onClick }, h('span', { class: 'menu-iconbtn-ic', 'aria-hidden': 'true' }, ic), h('span', {}, label));

  return h('section', { class: 'menu screen' },
    h('header', { class: 'topbar' },
      h('span', { class: 'topbar-brand' }, 'T7P // ARCADE'),
      h('span', { class: 'label-spaced topbar-mid' }, 'SELECT MODE'),
      h('button', { class: 'icon-btn', 'aria-label': 'Settings', onClick: () => go('settings') }, icon('gear', 22)),
    ),

    h('div', { class: 'menu-top' }, renderIconCard(), cont),
    nudge,

    h('nav', { class: 'mode-grid', 'aria-label': 'Game modes' },
      h('div', { class: 'mode-flagships' }, flagships.map((m) => modeTile(m, art[m.id]))),
      h('div', { class: 'mode-quick' },
        h('h2', { class: 'mode-quick-h label-spaced' }, 'QUICK PLAY', h('span', { class: 'caption muted' }, ' · one sitting, no saves to babysit')),
        h('div', { class: 'mode-pair' }, others.map((m) => modeTile(m, m.id === 'brawl' ? brawlArt : null)))),
    ),

    h('div', { class: 'menu-iconbar', role: 'toolbar', 'aria-label': 'More' },
      extra('Records', '🏆', openRecords),
      extra('Fight Lab', '⚔️', () => go('fight-lab')),
      extra('Changelog', '📜', () => go('changelog')),
      extra('Ratings', '❓', openRatingInfo),
      extra('About', 'ⓘ', () => go('about')),
      extra('Feedback', '📝', () => go('feedback')),
      install.installed ? null : extra('Get the app', '⬇️', openGetTheApp),
    ),

    h('footer', { class: 'statusbar' },
      h('span', {}, `OPERATIVE: ${profile.displayName}`),
      dayChip,
      h('span', {}, `${characters.count} CHARACTERS`),
    ),
  );
}

// v0.26.0: after the playtest week, a small card asks for the questionnaire.
async function fillNudge(slot) {
  if (!(await shouldNudge())) return;
  const card = h('div', { class: 'menu-nudge', role: 'region', 'aria-label': 'Playtest questionnaire' },
    h('span', { class: 'menu-nudge-ic', 'aria-hidden': 'true' }, '📝'),
    h('span', { class: 'menu-nudge-text' }, h('b', {}, 'Your playtest week is up. Got 5 minutes?'), h('span', { class: 'caption muted' }, 'A short questionnaire. Your answers decide what gets fixed next.')),
    h('span', { class: 'menu-nudge-btns' },
      h('button', { class: 'btn btn-primary btn-sm', onClick: () => go('feedback') }, 'Fill it out'),
      h('button', { class: 'btn btn-secondary btn-sm', onClick: async () => { await snooze(); card.remove(); } }, 'Not now'),
      h('button', { class: 'menu-nudge-never', onClick: async () => { await never(); card.remove(); } }, 'Don\'t ask again')));
  slot.replaceWith(card);
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

function modeTile(m, art = null) {
  return h('button', {
    class: `mode-tile${m.flagship ? ' is-flagship' : ''} mt-${m.id}`,
    onClick: () => (m.ready ? go(m.id) : openModePreview(m)),
  },
    art,
    h('span', { class: 'mode-tile-inner' },
      m.flagship ? h('span', { class: 'mode-tag' }, m.id === 'my-career' ? 'NEW' : 'FLAGSHIP') : null,
      h('span', { class: 'mode-name' }, m.name),
      h('span', { class: 'mode-sub' }, m.sub),
      m.flagship ? h('span', { class: 'mode-blurb' }, m.blurb) : null,
      m.ready ? null : h('span', { class: 'mode-soon' }, m.soon || `Coming in Wave ${m.wave}`),
    ),
  );
}

// ---------- Continue card ----------
async function continueInfo() {
  const p = profile.value; const mode = p.lastMode;
  if (!mode) return null;
  const m = MODES.find((x) => x.id === mode); if (!m) return null;
  try {
    if (mode === 'dynasty') {
      const n = p.dynastySlot || 1; const L = await store.get(`dynasty:slot${n}`, null);
      if (!L || !L.user) return { mode: m, line: 'Pick up your dynasty' };
      const t = L.teams[L.user.team];
      const when = L.phase === 'season' ? `Week ${L.week}` : L.phase === 'playoffs' ? 'The playoffs' : 'The off-season';
      return { mode: m, line: `${t.name} · Season ${L.season}, ${when}`, crest: `art/afl/crests/${t.crest}.webp` };
    }
    if (mode === 'forbidden-fusion') {
      const n = p.fusionSlot || 1; const d = await store.get(`fusion:slot${n}`, null); const r = await store.get(`fusion:run:slot${n}`, null);
      if (!d) return { mode: m, line: 'Forge your fighter' };
      return { mode: m, line: r ? `File ${n} · ${d.build?.name || 'Fighter'} · Floor ${r.floor + 1}` : `File ${n} · ${d.build?.name || 'Fighter'} · ready to climb`, face: d.build?.faceId };
    }
    if (mode === 'tier-target') { const g = await store.get('save:tier-target', null); return { mode: m, line: g ? `Round ${g.round} · ${Math.round(g.score).toLocaleString()} points` : 'Start a new game' }; }
    if (mode === 'blind-tier-list') { const g = await store.get('save:blind-tier-list', null); return { mode: m, line: g ? `${g.index} of 10 placed` : 'Start a new list' }; }
    if (mode === 'my-career') {
      const n = p.careerSlot || 1; const L = await store.get(`career:slot${n}`, null);
      const q = L ? L.players[L.career.pid] : null;
      if (!q) return { mode: m, line: 'Start your career' };
      return { mode: m, line: q.team != null ? `${q.name} · ${L.teams[q.team].name} · Season ${q.career}` : `${q.name} · Draft night`, face: q.cid };
    }
    if (mode === 'brawl') { const g = await store.get('save:brawl', null); return { mode: m, line: g ? 'Your bracket is waiting' : 'Draft a new squad' }; }
  } catch { /* fall through */ }
  return { mode: m, line: m.sub };
}
async function fillContinue(slot) {
  const info = await continueInfo();
  if (!info) { slot.replaceWith(h('div', { class: 'menu-continue is-empty' }, h('span', { class: 'label-spaced' }, 'WELCOME'), h('span', { class: 'heading' }, 'Pick a mode to start.'))); return; }
  const face = info.face != null ? characters.get(info.face) : null;
  slot.replaceWith(h('button', { class: 'menu-continue', onClick: () => go(info.mode.id) },
    info.crest ? h('img', { class: 'menu-continue-art', src: info.crest, alt: '' }) : face ? avatar(face, characters, 'lg') : null,
    h('span', { class: 'menu-continue-text' },
      h('span', { class: 'label-spaced gold' }, `CONTINUE · ${info.mode.name.toUpperCase()}`),
      h('span', { class: 'heading' }, info.line)),
    h('span', { class: 'menu-continue-go', 'aria-hidden': 'true' }, '▶')));
}

// ---------- Flagship art ----------
const bigNames = ['Goku', 'Naruto Uzumaki', 'Monkey D. Luffy', 'Ichigo Kurosaki', 'Superman', 'Spider-Man', 'Saitama', 'Vegeta', 'Sasuke Uchiha'];
async function fillArt(art) {
  const p = profile.value;
  const pic = (c) => { const url = c ? characters.portraitUrl(c) : null; return url ? h('img', { src: url, alt: '', loading: 'lazy', decoding: 'async' }) : null; };
  // Forbidden Fusion: your fighter's face (or your icon).
  try {
    const d = await store.get(`fusion:slot${p.fusionSlot || 1}`, null);
    const c = characters.get(d?.build?.faceId) || characters.get(p.iconId) || characters.list.find((x) => x.name === 'Vegeta');
    const img = pic(c); if (img) art['forbidden-fusion'].append(img);
  } catch { /* no art */ }
  // Dynasty: your team's crest over an arena (or a league crest).
  try {
    const L = await store.get(`dynasty:slot${p.dynastySlot || 1}`, null);
    const crest = L?.user ? L.teams[L.user.team].crest : 1001;
    art.dynasty.classList.add('is-dynasty');
    art.dynasty.append(h('img', { class: 'mode-art-bg', src: 'art/afl/arenas/2001.webp', alt: '' }), h('img', { class: 'mode-art-crest', src: `art/afl/crests/${crest}.webp`, alt: '' }));
  } catch { /* no art */ }
  // My Career: the walk-out tunnel.
  if (art['my-career']) { art['my-career'].classList.add('is-career'); art['my-career'].append(h('img', { src: 'art/lenz/tunnel.webp', alt: '' })); }
  // Brawl: three fighters in a row.
  const three = bigNames.map((n) => characters.list.find((x) => x.name === n)).filter(Boolean).sort(() => Math.random() - 0.5).slice(0, 3);
  art.brawl.classList.add('is-trio');
  three.forEach((c) => { const img = pic(c); if (img) art.brawl.append(img); });
}

function openModePreview(m) {
  sheet({
    title: m.name.toUpperCase(),
    content: h('div', {},
      h('p', { class: 'label-spaced' }, m.sub.toUpperCase()),
      h('p', { class: 'body-text' }, m.blurb),
      h('p', { class: 'body-text muted' }, m.soon ? `${m.name} is being built now. It's next up.` : `${m.name} is being rebuilt and arrives in Wave ${m.wave}.`),
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
