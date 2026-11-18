// BLIND TIER LIST — Rank on instinct.
// Ten characters from one hidden category (a series or a shared trait) are
// dealt one at a time. Drop each into the S/A/B/C pyramid (1, 2, 3 and 4 slots)
// before you see the next. A row locks when it is full. Reveal the category
// whenever you like. At the end, see how your list compares with the
// characters' Power Levels, then share it.

import { h, fill, toast, avatar, closeSheet, confirmSheet } from '../core/ui.js';
import { store } from '../core/store.js';
import { sfx } from '../core/sfx.js';
import { profile } from '../core/profile.js';
import { records } from '../core/records.js';
import { characters } from '../core/characters.js';
import { categories } from '../core/grid.js';
import { modeHeader, howToPlay } from '../core/mode-kit.js';
import { go } from '../core/router.js';
import { shareText } from '../core/grid-board.js';

const TIERS = [
  { key: 'S', slots: 1 },
  { key: 'A', slots: 2 },
  { key: 'B', slots: 3 },
  { key: 'C', slots: 4 },
];
const NEED = TIERS.reduce((n, t) => n + t.slots, 0); // 10

const help = howToPlay('blind-tier-list', 'Blind Tier List', [
  'Ten characters come from one hidden category: a series or a shared trait.',
  'They arrive one at a time. Put each in S, A, B or C before you see the next.',
  'S holds 1, A holds 2, B holds 3 and C holds 4. A row locks when it is full.',
  'Tap "Reveal category" whenever you want to know what they have in common.',
  'At the end you see how your list compares with their Power Levels. Then share it.',
]);

let list = null;
// v0.23.0: the list in progress is saved until you start a new one.
const SAVE_KEY = 'save:blind-tier-list';
const packList = (l) => ({ catId: l.cat.id, queue: l.queue.map((c) => c.id), index: l.index, revealed: l.revealed, placed: Object.fromEntries(Object.entries(l.placed).map(([k, v]) => [k, v.map((c) => c.id)])) });
function unpackList(d) {
  const cat = categories().find((c) => c.id === d.catId);
  const queue = d.queue.map((id) => characters.get(id));
  if (!cat || queue.some((c) => !c)) return null;
  return { cat, queue, index: d.index, revealed: d.revealed, placed: Object.fromEntries(Object.entries(d.placed).map(([k, v]) => [k, v.map((id) => characters.get(id))])) };
}
const saveList = () => (list ? store.set(SAVE_KEY, packList(list)) : store.remove(SAVE_KEY));
let lastList = null;
let lastCategory = null;

function shuffle(a) {
  const x = a.slice();
  for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; }
  return x;
}

function newList() {
  const usable = categories().filter((cat) => [...cat.ids].filter((id) => characters.get(id)?.powerLevel).length >= NEED);
  // About half the time a series, otherwise a trait, so traits don't take over.
  const series = usable.filter((c) => c.kind === 'series' && c.id !== lastCategory);
  const traits = usable.filter((c) => c.kind !== 'series' && c.id !== lastCategory);
  const pickFrom = (series.length && (!traits.length || Math.random() < 0.5)) ? series : traits;
  const cat = pickFrom[Math.floor(Math.random() * pickFrom.length)];
  lastCategory = cat.id;
  const queue = shuffle([...cat.ids].map((id) => characters.get(id)).filter((c) => c && c.powerLevel)).slice(0, NEED);
  return { cat, queue, index: 0, placed: { S: [], A: [], B: [], C: [] }, revealed: false };
}

// Where the ratings would put each character: sort by Power Level and fill the pyramid.
function ratingTiers(queue) {
  const sorted = queue.slice().sort((a, b) => b.powerLevel - a.powerLevel || a.name.localeCompare(b.name));
  const out = new Map();
  let i = 0;
  for (const t of TIERS) for (let k = 0; k < t.slots; k++) out.set(sorted[i++].id, t.key);
  return out;
}

export async function render() {
  await profile.update({ lastMode: 'blind-tier-list' });
  const root = h('section', { class: 'screen mode blind-tier' });
  root._cleanup = () => { closeSheet(); lastList = null; };

  function catLabel(l) {
    const kind = { series: 'SERIES', tag: 'TRAIT', team: 'TEAM' }[l.cat.kind];
    return `${kind} · ${l.cat.label.toUpperCase()}`;
  }

  if (!list) { const d = await store.get(SAVE_KEY, null); if (d) { list = unpackList(d); if (list && list.index > 0) toast(`Welcome back: ${list.index} of ${NEED} placed.`); } }

  // ---------- Placing ----------
  function drawList() {
    if (!list) { list = newList(); saveList(); }
    const l = list;
    if (l.index >= NEED) { finish(); return; }
    const c = l.queue[l.index];

    fill(root,
      modeHeader({ title: 'Blind Tier List', sub: 'RANK ON INSTINCT', onHelp: () => help.show(), onBack: () => go('menu') }),
      h('button', {
        class: `btl-cat${l.revealed ? ' is-revealed' : ''}`,
        onClick: () => { if (!l.revealed) { l.revealed = true; sfx.play('flip'); saveList(); drawList(); } },
        'aria-label': l.revealed ? `Category: ${l.cat.label}` : 'Reveal category',
      },
        h('span', { class: 'label-spaced' }, 'CATEGORY'),
        h('span', { class: 'btl-cat-name' }, l.revealed ? catLabel(l) : '? TAP TO REVEAL ?'),
      ),
      h('div', { class: 'tt-saved' }, h('p', { class: 'label-spaced btl-progress' }, `CHARACTER ${l.index + 1} OF ${NEED}`),
        l.index > 0 ? h('button', { class: 'btn btn-secondary btn-sm', onClick: startNew }, 'Start a new list') : null),
      h('div', { class: 'btl-now' },
        avatar(c, characters, 'lg'),
        h('div', { class: 'btl-now-text' },
          h('h2', { class: 'title' }, c.name),
          h('p', { class: 'caption muted' }, l.revealed ? c.series : '???'),
        ),
      ),
      h('p', { class: 'caption muted btl-prompt' }, `Where does ${c.name} go?`),
      pyramid(l, { onPick: place }),
    );
  }

  function pyramid(l, { onPick, compare = null } = {}) {
    return h('div', { class: 'btl-pyramid' }, TIERS.map((t) => {
      const placed = l.placed[t.key];
      const full = placed.length >= t.slots;
      const row = h('div', { class: `btl-row tier-row-${t.key.toLowerCase()}` },
        h('span', { class: `tier-badge tier-${t.key.toLowerCase()} btl-row-label` }, t.key),
        h('div', { class: 'btl-slots' },
          Array.from({ length: t.slots }, (_, i) => {
            const ch = placed[i];
            if (!ch) return h('span', { class: 'btl-slot is-empty', 'aria-hidden': 'true' });
            const verdict = compare ? compare.get(ch.id) : null;
            return h('span', { class: `btl-slot is-filled${verdict ? (verdict === t.key ? ' is-match' : ' is-miss') : ''}` },
              avatar(ch, characters, 'sm'),
              h('span', { class: 'btl-slot-name' }, ch.name),
              compare ? h('span', { class: 'btl-slot-pl' }, `PL ${ch.powerLevel}`) : null,
            );
          }),
        ),
      );
      if (onPick) {
        return h('button', {
          class: `btl-row-btn${full ? ' is-full' : ''}`, disabled: full,
          'aria-label': full ? `${t.key} tier is full` : `Put in ${t.key} tier (${t.slots - placed.length} left)`,
          onClick: () => onPick(t.key),
        }, row);
      }
      return row;
    }));
  }

  function place(tier) {
    const l = list;
    const t = TIERS.find((x) => x.key === tier);
    if (l.placed[tier].length >= t.slots) return;
    l.placed[tier].push(l.queue[l.index]);
    l.index += 1;
    sfx.play('pick');
    saveList();
    drawList();
  }

  async function startNew() {
    const ok = await confirmSheet({ title: 'START A NEW LIST?', message: `This list (${list.index} of ${NEED} placed) won't count.`, confirmLabel: 'Start new' });
    if (!ok) return;
    list = newList(); await saveList(); drawList();
  }

  // ---------- Results ----------
  async function finish() {
    const l = list;
    list = null;
    await saveList();
    l.revealed = true;
    const rating = ratingTiers(l.queue);
    let agree = 0;
    for (const t of TIERS) for (const ch of l.placed[t.key]) if (rating.get(ch.id) === t.key) agree += 1;
    let newBest = false;
    await records.update('blind-tier-list', (r) => {
      r.lists = (r.lists || 0) + 1;
      r.totalAgree = (r.totalAgree || 0) + agree;
      if (r.bestAgree === undefined) r.bestAgree = agree;
      else if (agree > r.bestAgree) { newBest = true; r.bestAgree = agree; }
      return r;
    });
    lastList = { ...l, rating, agree, newBest };
    sfx.play(newBest ? 'fanfare' : agree >= 5 ? 'win' : 'gong');
    drawResult();
  }

  function drawResult() {
    const l = lastList;
    if (!l) { drawList(); return; }
    const verdict = l.agree >= 8 ? 'You think like the ratings.' : l.agree >= 5 ? 'You and the ratings mostly agree.' : 'You and the ratings see it differently.';
    const ratingBoard = { placed: { S: [], A: [], B: [], C: [] } };
    for (const ch of l.queue) ratingBoard.placed[l.rating.get(ch.id)].push(ch);
    for (const t of TIERS) ratingBoard.placed[t.key].sort((a, b) => b.powerLevel - a.powerLevel);

    const share = async () => {
      const lines = TIERS.map((t) => `${t.key}: ${l.placed[t.key].map((c) => c.name).join(', ')}`);
      const how = await shareText(`T7P Arcade · Blind Tier List\n${l.cat.label}\n${lines.join('\n')}\nAgreed with the ratings on ${l.agree}/10`);
      if (how === 'copied') toast('Tier list copied. Paste it anywhere.');
      else if (how === 'failed') toast('Sharing is not available here.');
    };

    fill(root,
      modeHeader({ title: 'Blind Tier List', sub: 'LIST COMPLETE', onHelp: () => help.show(), onBack: () => go('menu') }),
      h('div', { class: 'result-head' },
        h('p', { class: 'label-spaced' }, catLabel(l)),
        h('h2', { class: 'display-lg' }, h('span', { class: 'gold' }, `${l.agree}/10`)),
        h('p', { class: 'body-text' }, `${verdict} Gold borders match the Power Level order; the rest you ranked differently.`),
        l.newBest ? h('p', { class: 'new-best' }, 'NEW PERSONAL BEST') : null,
      ),
      h('h3', { class: 'label-spaced set-title' }, 'YOUR LIST'),
      pyramid(l, { compare: l.rating }),
      h('h3', { class: 'label-spaced set-title' }, 'BY POWER LEVEL'),
      pyramid(ratingBoard, {}),
      h('div', { class: 'result-actions' },
        h('button', { class: 'btn btn-primary', onClick: () => { lastList = null; list = newList(); saveList(); drawList(); } }, 'New list'),
        h('button', { class: 'btn btn-secondary', onClick: share }, 'Share'),
        h('button', { class: 'btn btn-secondary', onClick: () => go('menu') }, 'Menu'),
      ),
    );
  }

  if (lastList) drawResult();
  else drawList();
  help.showFirstTime();
  return root;
}

