// The character card from the design system (CharacterCard): picture,
// Power Level and tier, name, series, roles and the three fan stats.
// Tier Target and Blind Tier List use it now; Brawl and Dynasty later.

import { h, avatar } from './ui.js';
import { characters } from './characters.js';
import { SECOND_PERKS } from './combat.js';

export const STAT_LABELS = { powerLevel: 'Power', aura: 'Aura', clutch: 'Clutch', chaos: 'Chaos' };

export function tierBadge(c, { hidden = false } = {}) {
  const tier = characters.tierFor(c.powerLevel);
  if (!tier || hidden) return h('span', { class: 'tier-badge tier-hidden', 'aria-label': 'Tier hidden' }, '?');
  return h('span', { class: `tier-badge tier-${tier.toLowerCase()}`, 'aria-label': `${tier} tier` }, tier);
}

export function roleChips(c) {
  const roles = [c.mainRole, c.secondRole].filter(Boolean);
  return h('span', { class: 'role-chips' }, roles.map((r, i) => h('span', { class: `chip role-${r.toLowerCase()}${i ? ' is-second' : ''}`, title: i ? `Second role: ${SECOND_PERKS[r]}` : null }, r)));
}

// opts.hideNumbers: Hard Mode (no Power Level, no stat numbers, no tier).
// opts.highlight: stat keys to highlight (the ones the current category uses).
// opts.stats: show the stat bars (default true).
export function characterCard(c, { hideNumbers = false, highlight = [], stats = true, size = 'md', selected = false } = {}) {
  return h('article', { class: `char-card card-${size}${selected ? ' is-selected' : ''}`, 'aria-label': c.name },
    h('div', { class: `char-pic fr-${c.franchise}` },
      avatar(c, characters, 'card'),
      h('span', { class: 'char-pl' },
        hideNumbers ? null : h('span', { class: 'char-pl-num' }, String(c.powerLevel ?? '–')),
        tierBadge(c, { hidden: hideNumbers }),
      ),
    ),
    h('h3', { class: 'char-name' }, c.name),
    h('p', { class: 'char-series' }, c.label ? `${c.series} · ${c.label}` : c.series),
    c.mainRole ? roleChips(c) : null,
    stats && !hideNumbers ? h('div', { class: 'char-stats' },
      ['powerLevel', 'aura', 'clutch', 'chaos'].map((k) => statBar(STAT_LABELS[k], c[k], highlight.includes(k))),
    ) : null,
  );
}

function statBar(label, value, active) {
  return h('div', { class: `stat-row${active ? ' is-active' : ''}` },
    h('span', { class: 'stat-label' }, label),
    h('span', { class: 'stat-bar', 'aria-hidden': 'true' }, h('i', { style: { width: `${Math.max(0, Math.min(100, value || 0))}%` } })),
    h('span', { class: 'stat-num' }, String(value ?? '–')),
  );
}
