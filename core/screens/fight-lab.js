// FIGHT LAB: pick any characters, watch them fight, or simulate 1,000 fights
// to see the odds. Uses the same Combat core as every mode.

import { h, fill, icon, avatar, sheet, closeSheet } from '../ui.js';
import { characters } from '../characters.js';
import { runMatch, BEATS, SPECIALS, ROLES } from '../combat.js';
import { playMatch } from '../battle-view.js';
import { pageHeader } from './settings.js';
import { tierBadge, roleChips } from '../card.js';

let size = 1;
let teams = { A: [], B: [] };

const rated = () => characters.list.filter((c) => !c.retired && c.powerLevel);
const pickRandom = (n, avoid = []) => {
  const pool = rated().filter((c) => !avoid.includes(c.id));
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
};

export function renderFightLab() {
  const root = h('section', { class: 'screen page fight-lab' });
  root._cleanup = () => closeSheet();
  if (!teams.A.length) { teams.A = pickRandom(size); teams.B = pickRandom(size, teams.A.map((c) => c.id)); }

  function drawSetup() {
    const sizeBtns = [1, 3, 5].map((n) => {
      const id = `fl-size-${n}`;
      const input = h('input', { type: 'radio', name: 'fl-size', id, checked: size === n });
      input.addEventListener('change', () => { size = n; resize(); drawSetup(); });
      return h('span', {}, input, h('label', { for: id }, n === 1 ? '1 v 1' : `${n} v ${n}`));
    });
    const odds = h('p', { class: 'caption muted fl-odds', 'aria-live': 'polite' });

    fill(root,
      pageHeader('FIGHT LAB'),
      h('p', { class: 'body-text muted' }, 'Pick any characters and watch them fight, or simulate 1,000 fights to see the odds. Best of 3 rounds.'),
      h('div', { class: 'segmented' }, sizeBtns),
      teamPanel('A', 'YOUR SIDE'),
      teamPanel('B', 'THEIR SIDE'),
      h('div', { class: 'btn-col' },
        h('button', { class: 'btn btn-primary', onClick: fight }, 'Fight'),
        h('button', { class: 'btn btn-secondary', onClick: () => simulate(odds) }, 'Simulate 1,000 fights'),
      ),
      odds,
      wheelPanel(),
    );
  }

  function resize() {
    for (const s of ['A', 'B']) {
      if (teams[s].length > size) teams[s] = teams[s].slice(0, size);
      while (teams[s].length < size) teams[s].push(...pickRandom(1, [...teams.A, ...teams.B].map((c) => c.id)));
    }
  }

  function teamPanel(side, title) {
    return h('section', { class: 'panel fl-team' },
      h('div', { class: 'fl-team-head' },
        h('h2', { class: 'label-spaced set-title' }, title),
        h('button', { class: 'link-btn fl-random', onClick: () => { teams[side] = pickRandom(size, teams[side === 'A' ? 'B' : 'A'].map((c) => c.id)); drawSetup(); } }, 'Random'),
      ),
      h('ol', { class: 'fl-list' }, teams[side].map((c, i) => h('li', {},
        h('button', { class: 'pick-row', onClick: () => choose(side, i) },
          avatar(c, characters, 'sm'),
          h('span', { class: 'pick-text' },
            h('span', { class: 'pick-name' }, c.name),
            h('span', { class: 'fl-meta' }, tierBadge(c), h('span', { class: 'caption muted' }, `Power ${c.powerLevel}`), roleChips(c)),
          ),
          icon('edit', 16),
        )))),
    );
  }

  function choose(side, i) {
    const input = h('input', { class: 'input', type: 'search', placeholder: 'Search a character', autocomplete: 'off', 'aria-label': 'Search characters' });
    const list = h('ul', { class: 'pick-list' });
    const draw = () => list.replaceChildren(...characters.search(input.value, 40).filter((c) => c.powerLevel).map((c) => h('li', {},
      h('button', { class: 'pick-row', onClick: () => { teams[side][i] = c; closeSheet(); drawSetup(); } },
        avatar(c, characters, 'sm'),
        h('span', { class: 'pick-text' }, h('span', { class: 'pick-name' }, c.name), h('span', { class: 'pick-series' }, `${c.series} · Power ${c.powerLevel} · ${c.mainRole}`)),
      ))));
    input.addEventListener('input', draw);
    sheet({ title: 'PICK A FIGHTER', wide: true, content: h('div', {}, h('div', { class: 'search-wrap' }, icon('search', 18), input), list) });
    draw();
  }

  function simulate(out) {
    let wins = 0;
    const n = 1000;
    const seed = Date.now();
    for (let i = 0; i < n; i++) if (runMatch(teams.A, teams.B, { seed: seed + i * 7919 }).winner === 'A') wins += 1;
    const pct = Math.round((wins / n) * 1000) / 10;
    out.textContent = `Your side wins ${pct}% of 1,000 fights.`;
  }

  function fight() {
    const stage = h('div', { class: 'fl-stage' });
    const again = h('div', { class: 'btn-row fl-after', hidden: true },
      h('button', { class: 'btn btn-secondary', onClick: drawSetup }, 'Change fighters'),
      h('button', { class: 'btn btn-primary', onClick: fight }, 'Rematch'),
    );
    fill(root, pageHeader('FIGHT LAB'), stage, again);
    playMatch(stage, { teamA: teams.A, teamB: teams.B, onDone: () => { again.hidden = false; } });
  }

  function wheelPanel() {
    return h('section', { class: 'panel fl-wheel' },
      h('h2', { class: 'label-spaced set-title' }, 'ROLE WHEEL'),
      h('p', { class: 'caption muted' }, 'Main role beating the other card\'s main role: +10% damage. Second role beating it: +5%. A full special meter fires the role\'s special move.'),
      h('table', { class: 'rec-table fl-wheel-table' },
        h('thead', {}, h('tr', {}, ['Role', 'Beats', 'Special'].map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', {}, ROLES.map((r) => h('tr', {},
          h('th', { scope: 'row' }, h('span', { class: `chip role-${r.toLowerCase()}` }, r)),
          h('td', {}, BEATS[r].join(', ')),
          h('td', {}, h('span', { class: 'heading fl-special' }, SPECIALS[r].name), h('span', { class: 'caption muted' }, SPECIALS[r].text)),
        )))),
    );
  }

  drawSetup();
  return root;
}
