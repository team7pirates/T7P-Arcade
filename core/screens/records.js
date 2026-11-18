// My Records: personal bests from every mode that has been played.

import { h, sheet } from '../ui.js';
import { records } from '../records.js';
import { formatTime } from '../mode-kit.js';
import { store } from '../store.js';

const GAUNTLET_TIERS = [[8, 'CIPHER GOD'], [6, 'PHANTOM'], [4, 'SHADOW AGENT'], [2, 'OPERATIVE'], [0, 'RECRUIT']];
const gauntletTier = (n) => GAUNTLET_TIERS.find(([min]) => n >= min)[1];

// v0.23.0: Forbidden Fusion records per save file.
async function fusionFiles() {
  const out = [];
  for (let n = 1; n <= 5; n++) {
    const d = await store.get(`fusion:slot${n}`, null);
    if (!d) continue;
    const hof = d.hof || [];
    out.push({
      n, name: d.build?.name || 'Fighter',
      best: Math.max(0, d.best || 0, ...hof.map((e) => e.floor || 0)),
      hardBest: Math.max(0, ...hof.filter((e) => e.hard).map((e) => e.floor || 0)),
      bounty: Math.max(d.bestBounty || 0, ...hof.map((e) => e.bounty || 0)),
      lifetime: d.lifetimeBounty || 0,
      climbs: d.climbs ?? hof.length,
    });
  }
  return out;
}

export async function openRecords() {
  const files = await fusionFiles();
  const g = records.get('grids');
  const ga = records.get('gauntlet');
  const tt = records.get('tier-target');
  const bl = records.get('blind-tier-list');
  const ff = records.get('forbidden-fusion');
  const br = records.get('brawl');
  const dy = records.get('dynasty');
  const levels = [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']];
  const played = files.length || levels.some(([k]) => g[k]) || ga.runs || tt.normal || tt.hard || bl.lists || ff.normal || ff.hard || br.runs || dy.seasons;
  const fmt = (n) => Math.round(n).toLocaleString();

  sheet({
    title: 'MY RECORDS',
    content: played
      ? h('div', { class: 'records' },
        h('section', { class: 'rec-block' },
          h('h3', { class: 'label-spaced set-title' }, 'DYNASTY'),
          dy.seasons
            ? h('table', { class: 'rec-table' },
              h('thead', {}, h('tr', {}, ['Seasons', 'Celestial Grails', 'Playoffs', 'Record', 'Best season'].map((t) => h('th', { scope: 'col' }, t)))),
              h('tbody', {}, h('tr', {},
                h('td', {}, String(dy.seasons)), h('td', {}, String(dy.titles || 0)), h('td', {}, String(dy.playoffs || 0)),
                h('td', {}, `${dy.wins || 0}–${dy.losses || 0}`), h('td', {}, `${dy.bestWins || 0} wins`))))
            : h('p', { class: 'caption muted' }, 'No Dynasty seasons yet.'),
        ),
        h('section', { class: 'rec-block' },
          h('h3', { class: 'label-spaced set-title' }, 'BRAWL'),
          br.runs
            ? h('table', { class: 'rec-table' },
              h('thead', {}, h('tr', {}, ['Brawls', 'Titles', 'Match record', 'Best finish'].map((t) => h('th', { scope: 'col' }, t)))),
              h('tbody', {}, h('tr', {},
                h('td', {}, String(br.runs)), h('td', {}, String(br.titles || 0)),
                h('td', {}, `${br.wins || 0}–${br.losses || 0}`),
                h('td', {}, ['Quarterfinals', 'Semifinals', 'Runner-up', 'Champion'][br.best || 0]))))
            : h('p', { class: 'caption muted' }, 'No Brawls yet.'),
        ),
        h('section', { class: 'rec-block' },
          h('h3', { class: 'label-spaced set-title' }, 'FORBIDDEN FUSION · BY SAVE FILE'),
          files.length
            ? h('table', { class: 'rec-table' },
              h('thead', {}, h('tr', {}, ['File', 'Best floor', 'Hard best', 'Best Bounty', 'Lifetime', 'Climbs'].map((t) => h('th', { scope: 'col' }, t)))),
              h('tbody', {}, files.map((f) => h('tr', {},
                h('th', { scope: 'row' }, `${f.n} · ${f.name}`),
                h('td', {}, f.best ? String(f.best) : '–'), h('td', {}, f.hardBest ? String(f.hardBest) : '–'),
                h('td', {}, f.bounty ? fmt(f.bounty) : '–'), h('td', {}, fmt(f.lifetime)), h('td', {}, String(f.climbs))))))
            : h('p', { class: 'caption muted' }, 'No save files yet.'),
          h('h3', { class: 'label-spaced set-title' }, 'FORBIDDEN FUSION · ALL FILES'),
          ff.normal || ff.hard
            ? h('table', { class: 'rec-table' },
              h('thead', {}, h('tr', {}, ['', 'Best floor', 'Best Bounty', 'Climbs'].map((t) => h('th', { scope: 'col' }, t)))),
              h('tbody', {}, [['normal', 'Normal'], ['hard', 'Hard']].map(([k, label]) => {
                const r = ff[k];
                return h('tr', {},
                  h('th', { scope: 'row' }, label),
                  h('td', {}, r ? String(r.bestFloor) : '–'),
                  h('td', {}, r ? fmt(r.bestBounty) : '–'),
                  h('td', {}, r ? String(r.runs) : '0'),
                );
              })))
            : h('p', { class: 'caption muted' }, 'No climbs yet.'),
          ff.lifetimeBounty ? h('p', { class: 'caption muted' }, `Lifetime Bounty ${fmt(ff.lifetimeBounty)}`) : null,
        ),
        h('section', { class: 'rec-block' },
          h('h3', { class: 'label-spaced set-title' }, 'GRIDS'),
          h('table', { class: 'rec-table' },
            h('thead', {}, h('tr', {}, ['', 'Best', 'Played', 'Streak', 'Best streak'].map((t) => h('th', { scope: 'col' }, t)))),
            h('tbody', {}, levels.map(([k, label]) => {
              const r = g[k];
              return h('tr', {},
                h('th', { scope: 'row' }, label),
                h('td', {}, r ? String(r.best) : '–'),
                h('td', {}, r ? String(r.played) : '0'),
                h('td', {}, r ? String(r.streak) : '–'),
                h('td', {}, r ? String(r.bestStreak) : '–'),
              );
            })),
          ),
          levels.some(([k]) => g[k] && g[k].fastestFlawlessMs !== undefined)
            ? h('p', { class: 'caption muted' }, 'Fastest flawless: ' + levels
              .filter(([k]) => g[k] && g[k].fastestFlawlessMs !== undefined)
              .map(([k, label]) => `${label} ${formatTime(g[k].fastestFlawlessMs, { up: true })}`).join(' · '))
            : null,
        ),
        h('section', { class: 'rec-block' },
          h('h3', { class: 'label-spaced set-title' }, 'GAUNTLET'),
          ga.runs
            ? h('div', { class: 'rec-row' },
              h('span', { class: 'stat gold' }, String(ga.bestGrids)),
              h('span', {},
                h('span', { class: 'heading' }, gauntletTier(ga.bestGrids)),
                h('span', { class: 'caption muted rec-sub' }, `Best run in grids cleared · ${ga.runs} run${ga.runs === 1 ? '' : 's'} · most correct ${ga.bestCorrect}`),
              ),
            )
            : h('p', { class: 'caption muted' }, 'No runs yet.'),
        ),
        h('section', { class: 'rec-block' },
          h('h3', { class: 'label-spaced set-title' }, 'TIER TARGET'),
          tt.normal || tt.hard
            ? h('table', { class: 'rec-table' },
              h('thead', {}, h('tr', {}, ['', 'Best score', 'Best streak', 'Games'].map((t) => h('th', { scope: 'col' }, t)))),
              h('tbody', {}, [['normal', 'Normal'], ['hard', 'Hard']].map(([k, label]) => {
                const r = tt[k];
                return h('tr', {}, h('th', { scope: 'row' }, label),
                  h('td', {}, r ? fmt(r.bestScore) : '–'), h('td', {}, r ? String(r.bestStreak) : '–'), h('td', {}, r ? String(r.games) : '0'));
              })))
            : h('p', { class: 'caption muted' }, 'No games yet.'),
        ),
        h('section', { class: 'rec-block' },
          h('h3', { class: 'label-spaced set-title' }, 'BLIND TIER LIST'),
          bl.lists
            ? h('div', { class: 'rec-row' },
              h('span', { class: 'stat gold' }, `${bl.bestAgree}/10`),
              h('span', {},
                h('span', { class: 'heading' }, 'Best match with the ratings'),
                h('span', { class: 'caption muted rec-sub' }, `${bl.lists} list${bl.lists === 1 ? '' : 's'} · average ${(bl.totalAgree / bl.lists).toFixed(1)}/10`),
              ))
            : h('p', { class: 'caption muted' }, 'No lists yet.'),
        ),
      )
      : h('p', { class: 'body-text' }, 'Play any mode and your best results will show up here.'),
  });
}
