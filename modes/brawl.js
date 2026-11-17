// BRAWL — Draft · Bracket · Champion.
// Snake-draft a five-card squad (one of each role) against seven rival GMs,
// then fight through an 8-team knockout bracket. Before each match you see
// the rival's lineup and set your order to counter it with the role wheel,
// but the rival GM sees yours too and can swap two of its cards. Squads from
// the same series or franchise get a chemistry bonus, and about half of all
// Brawls open with a Woj Bomb league event.
//
// Rules and numbers live in brawl-rules.js (shared with the balance sim).

import { h, fill, toast, avatar, icon, sheet, closeSheet, confirmSheet } from '../core/ui.js';
import { profile } from '../core/profile.js';
import { records } from '../core/records.js';
import { store } from '../core/store.js';
import { characters } from '../core/characters.js';
import { characterCard, roleChips, tierBadge } from '../core/card.js';
import { modeHeader, howToPlay } from '../core/mode-kit.js';
import { shareText } from '../core/grid-board.js';
import { ROLES, SPECIALS, runMatch } from '../core/combat.js';
import { playMatch } from '../core/battle-view.js';
import {
  TEAMS, PICKS, ROUND_NAMES, RIVAL_NAMES, EVENTS, FINISH, shuffle, rollEvent, draftOrder, neededRoles,
  aiPick, chemistry, teamPower, teamRating, fightCards, seedBracket, nextRound, aiLineup, matchup,
  rivalSwap, damageDealt,
} from './brawl-rules.js';

const SAVE_KEY = 'save:brawl';
const NAME_MAX = 20;
const fmt = (n) => Math.round(n).toLocaleString();

const help = howToPlay('brawl', 'Brawl', [
  'Snake-draft five characters against seven rival GMs: one Striker, one Tank, one Speedster, one Mystic and one Tactician.',
  'Chemistry: three or more from the same series, or five from the same franchise, fight with extra Power.',
  'About half of all Brawls open with a Woj Bomb event that tilts the bracket for or against you.',
  'Then an 8-team knockout bracket: quarterfinals, semifinals, the final. Every match is your full squad, best of 3 rounds.',
  'Before each match you see the rival\'s lineup and set your order. Cards fight in order and the next one tags in after a knockout, so line up roles that beat theirs.',
  'Careful: the rival GM sees your lineup too and can swap two of its cards. Think one step ahead.',
  'Win the final to be crowned champion. Your MVPs and career record are saved.',
]);

let game = null;     // the Brawl in progress (saved), or null
let lastGame = null; // the Brawl that just ended

const ch = (id) => characters.get(id);
const rosterOf = (team) => team.roster.map(ch).filter(Boolean);
const pool = () => characters.list.filter((c) => !c.retired && c.powerLevel);

function newGame(teamName) {
  const event = rollEvent();
  const ev = event ? EVENTS[event] : {};
  const userSeat = ev.lastSeat ? TEAMS - 1 : Math.floor(Math.random() * TEAMS);
  const rivals = shuffle(RIVAL_NAMES).slice(0, TEAMS - 1);
  const teams = Array.from({ length: TEAMS }, (_, seat) => ({
    name: seat === userSeat ? teamName : rivals.pop(),
    roster: [],
    user: seat === userSeat,
  }));
  return {
    phase: event ? 'event' : 'draft',
    event, userSeat, teams,
    order: draftOrder(), pick: 0, recent: [],
    bracket: null, round: 0, lineup: null, damage: {}, mvps: [], record: { w: 0, l: 0 },
  };
}

// Extra Power for a side in a match: chemistry, plus event effects.
function bonusFor(g, seat, vsSeat) {
  const ev = g.event ? EVENTS[g.event] : {};
  let b = chemistry(rosterOf(g.teams[seat])).bonus;
  if (seat === g.userSeat && ev.you) b += ev.you;
  if (vsSeat === g.userSeat && ev.foes) b += ev.foes;
  return b;
}

// Run the draft forward until it's the player's pick (or the draft ends).
function advanceDraft(g) {
  const ev = g.event ? EVENTS[g.event] : {};
  const taken = new Set(g.teams.flatMap((t) => t.roster));
  while (g.pick < g.order.length && g.order[g.pick] !== g.userSeat) {
    const seat = g.order[g.pick];
    const team = rosterOf(g.teams[seat]);
    const c = aiPick(team, pool().filter((x) => !taken.has(x.id)), Math.random, ev.perfectDraft ? 0 : 6);
    g.teams[seat].roster.push(c.id);
    taken.add(c.id);
    g.recent.unshift({ seat, id: c.id, pick: g.pick + 1 });
    g.pick += 1;
  }
  g.recent = g.recent.slice(0, 14);
  if (g.pick >= g.order.length) startBracket(g);
}

function startBracket(g) {
  const b = seedBracket(g.teams.map((t) => ({ roster: rosterOf(t) })));
  g.bracket = b;
  g.round = 0;
  g.phase = 'bracket';
}

const userMatch = (g) => g.bracket.rounds[g.round].find((m) => m.a === g.userSeat || m.b === g.userSeat) || null;
const oppOf = (g, m) => (m.a === g.userSeat ? m.b : m.a);

function addDamage(g, lineupA, lineupB, events) {
  const d = damageDealt(events, lineupA.length, lineupB.length);
  lineupA.forEach((c, i) => { g.damage[c.id] = (g.damage[c.id] || 0) + d.A[i]; });
  lineupB.forEach((c, i) => { g.damage[c.id] = (g.damage[c.id] || 0) + d.B[i]; });
  return d;
}

// Play every other match in the current round instantly.
function simRound(g) {
  for (const m of g.bracket.rounds[g.round]) {
    if (m.winner != null) continue;
    const la = aiLineup(rosterOf(g.teams[m.a]));
    const lb = aiLineup(rosterOf(g.teams[m.b]));
    const res = runMatch(fightCards(la, bonusFor(g, m.a, m.b)), fightCards(lb, bonusFor(g, m.b, m.a)), { seed: Math.floor(Math.random() * 2 ** 31) });
    addDamage(g, la, lb, res.events);
    m.winner = res.winner === 'A' ? m.a : m.b;
    m.score = res.score;
  }
}

const save = () => (game ? store.set(SAVE_KEY, game) : store.remove(SAVE_KEY));

export async function render() {
  await profile.update({ lastMode: 'brawl' });
  if (!game) game = await store.get(SAVE_KEY, null);
  const root = h('section', { class: 'screen mode brawl' });
  let fightView = null;
  root._cleanup = () => { closeSheet(); if (fightView) fightView.stop(); };
  const header = (sub, onBack) => modeHeader({ title: 'Brawl', sub, onHelp: () => help.show(), onBack });

  function draw() {
    if (!game) { lastGame ? drawOver() : drawStart(); return; }
    ({
      event: drawEvent, draft: drawDraft, bracket: drawBracket, lineup: drawLineup, swap: drawSwap,
      fight: drawLineup, results: drawResults,
    }[game.phase] || drawBracket)();
  }

  // ---------- Start ----------
  function drawStart() {
    const rec = records.get('brawl');
    const defaultName = profile.value.codename ? `TEAM ${profile.value.codename}`.slice(0, NAME_MAX) : 'YOUR SQUAD';
    const nameInput = h('input', { class: 'input', id: 'br-name', maxlength: String(NAME_MAX), autocomplete: 'off', spellcheck: 'false', value: defaultName });
    const start = async () => {
      const name = nameInput.value.trim().replace(/\s+/g, ' ').toUpperCase().slice(0, NAME_MAX) || 'YOUR SQUAD';
      game = newGame(name);
      if (game.phase === 'draft') advanceDraft(game);
      await save();
      draw();
    };
    fill(root,
      header('DRAFT · BRACKET · CHAMPION'),
      h('div', { class: 'br-start panel' },
        h('p', { class: 'label-spaced gold' }, 'BRAWL OF THE ELITE 8'),
        h('p', { class: 'body-text' }, 'Draft five characters, one of each role, against seven rival GMs. Then win three knockout matches to be crowned champion.'),
        h('ul', { class: 'rule-chips' }, ['8 TEAMS', '5 ROUNDS OF PICKS', 'ONE OF EACH ROLE', 'BEST OF 3 MATCHES'].map((t) => h('li', {}, t))),
        h('label', { class: 'field-label', for: 'br-name' }, 'Team name'),
        nameInput,
        rec.runs
          ? h('p', { class: 'caption muted' }, `Career ${rec.wins}–${rec.losses} · ${rec.titles} title${rec.titles === 1 ? '' : 's'} · best finish ${FINISH[rec.best]}`)
          : null,
        h('button', { class: 'btn btn-primary btn-wide', onClick: start }, 'Enter the draft'),
      ),
    );
  }

  // ---------- Woj Bomb ----------
  function drawEvent() {
    const ev = EVENTS[game.event];
    fill(root,
      header('BREAKING NEWS', () => drawStart()),
      h('div', { class: 'br-event' },
        h('p', { class: 'label-spaced' }, 'WOJ BOMB'),
        h('h2', { class: 'display-lg gold' }, ev.title),
        h('p', { class: 'body-text' }, ev.text),
        h('button', {
          class: 'btn btn-primary btn-wide',
          onClick: async () => { game.phase = 'draft'; advanceDraft(game); await save(); draw(); },
        }, 'To the draft'),
      ),
    );
  }

  // ---------- The draft ----------
  let roleFilter = null;
  let searchText = '';
  function drawDraft() {
    const g = game;
    const me = g.teams[g.userSeat];
    const mine = rosterOf(me);
    const need = neededRoles(mine);
    if (!need.includes(roleFilter)) roleFilter = null;
    const taken = new Set(g.teams.flatMap((t) => t.roster));
    const round = Math.floor(g.pick / TEAMS) + 1;
    const chem = chemistry(mine);

    const search = h('input', {
      class: 'input', type: 'search', autocomplete: 'off', spellcheck: 'false',
      placeholder: 'Search the pool', 'aria-label': 'Search available characters', value: searchText,
    });
    const list = h('ul', { class: 'pick-list br-pool', 'aria-label': 'Available characters' });
    const drawList = () => {
      const q = search.value;
      searchText = q;
      const matches = (q ? characters.search(q, 400) : pool())
        .filter((c) => c.powerLevel && !taken.has(c.id) && need.includes(c.mainRole) && (!roleFilter || c.mainRole === roleFilter))
        .sort((a, b) => b.powerLevel - a.powerLevel || a.name.localeCompare(b.name))
        .slice(0, 60);
      list.replaceChildren(...matches.map((c) => h('li', {},
        h('button', { class: 'pick-row', onClick: () => confirmPick(c) },
          avatar(c, characters, 'sm'),
          h('span', { class: 'pick-text' },
            h('span', { class: 'pick-name' }, c.name),
            h('span', { class: 'pick-series' }, `${c.series} · ${c.mainRole}${c.secondRole ? ` / ${c.secondRole}` : ''}`),
          ),
          h('span', { class: 'br-pl' }, h('span', { class: 'br-pl-num' }, String(c.powerLevel)), tierBadge(c)),
        ))));
      if (!matches.length) list.append(h('li', { class: 'caption muted guess-hint' }, 'No one left who fits. Try another role or search.'));
    };
    search.addEventListener('input', drawList);

    fill(root,
      header(`DRAFT · ROUND ${round} OF ${PICKS}`, () => leave()),
      h('div', { class: 'br-draft' },
        h('div', { class: 'br-clock panel' },
          h('p', { class: 'label-spaced gold' }, 'YOU ARE ON THE CLOCK'),
          h('p', { class: 'caption muted' }, `Pick ${g.pick + 1} of ${g.order.length}. ${me.name} drafts from spot ${g.userSeat + 1}.`),
          h('div', { class: 'br-slots' }, ROLES.map((r) => {
            const c = mine.find((x) => x.mainRole === r);
            return h('div', { class: `br-slot${c ? ' is-filled' : ''}` },
              c ? avatar(c, characters, 'sm') : h('span', { class: `br-slot-empty role-${r.toLowerCase()}` }, r[0]),
              h('span', { class: `br-slot-role role-${r.toLowerCase()}` }, r),
              h('span', { class: 'br-slot-name' }, c ? c.name : 'Open'));
          })),
          chem.bonus ? h('p', { class: 'br-chem' }, `${chem.label} · +${chem.bonus} Power`) : null,
        ),
        snakeBoard(g),
        g.recent.length ? h('details', { class: 'br-recent' },
          h('summary', { class: 'label-spaced' }, 'RECENT PICKS'),
          h('ol', { class: 'br-recent-list' }, g.recent.map((p) => h('li', {},
            h('span', { class: 'muted' }, `#${p.pick} `), h('strong', {}, g.teams[p.seat].name), ` took ${ch(p.id)?.name}`))),
        ) : null,
        h('div', { class: 'br-filters', role: 'group', 'aria-label': 'Filter by role' },
          h('button', { class: `br-filter${!roleFilter ? ' is-on' : ''}`, onClick: () => { roleFilter = null; drawDraft(); } }, 'All open roles'),
          need.map((r) => h('button', { class: `br-filter role-${r.toLowerCase()}${roleFilter === r ? ' is-on' : ''}`, onClick: () => { roleFilter = r; drawDraft(); } }, r))),
        h('div', { class: 'search-wrap' }, icon('search', 18), search),
        list,
        h('div', { class: 'br-auto-row' },
          h('button', { class: 'btn btn-secondary br-auto', onClick: autoPick }, 'Auto-pick this spot'),
          h('button', { class: 'btn btn-secondary br-auto', onClick: autoDraftRest }, 'Auto-draft the rest')),
      ),
    );
    drawList();
  }

  function confirmPick(c) {
    const s = sheet({
      title: 'DRAFT THIS PLAYER?',
      content: h('div', { class: 'br-confirm' },
        characterCard(c, { size: 'md' }),
        h('p', { class: 'caption muted' }, `Special move: ${SPECIALS[c.mainRole].name}. ${SPECIALS[c.mainRole].text}`),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn btn-secondary', onClick: () => s.close() }, 'Keep looking'),
          h('button', { class: 'btn btn-primary', onClick: () => { s.close(); makePick(c); } }, `Draft ${c.name}`)),
      ),
    });
  }

  async function makePick(c) {
    const g = game;
    g.teams[g.userSeat].roster.push(c.id);
    g.recent.unshift({ seat: g.userSeat, id: c.id, pick: g.pick + 1 });
    g.pick += 1;
    searchText = '';
    advanceDraft(g);
    await save();
    if (g.phase === 'bracket') toast('The draft is done. Here is your bracket.');
    draw();
  }

  function autoPick() {
    const g = game;
    const taken = new Set(g.teams.flatMap((t) => t.roster));
    const c = aiPick(rosterOf(g.teams[g.userSeat]), pool().filter((x) => !taken.has(x.id)), Math.random, 0);
    if (c) confirmPick(c);
  }

  // The snake draft board: 8 teams across, 5 rounds down. The order flips
  // every round; your column is highlighted and the pick on the clock glows.
  function snakeBoard(g) {
    const cell = (r, seat) => {
      const id = g.teams[seat].roster[r];
      const pickNo = r * TEAMS + (r % 2 ? TEAMS - 1 - seat : seat) + 1;
      const now = !id && pickNo === g.pick + 1;
      const c = id != null ? ch(id) : null;
      return h('td', { class: `${seat === g.userSeat ? 'is-me' : ''}${now ? ' is-now' : ''}` },
        h('span', { class: 'br-sn-no' }, String(pickNo)),
        c ? h('span', { class: 'br-sn-pick' }, avatar(c, characters, 'sm'), h('span', { class: 'br-sn-name' }, c.name), h('span', { class: `br-sn-role role-${c.mainRole.toLowerCase()}` }, c.mainRole)) : h('span', { class: 'br-sn-empty' }, now ? 'ON THE CLOCK' : ''));
    };
    return h('details', { class: 'br-snake', open: true },
      h('summary', { class: 'label-spaced' }, 'SNAKE DRAFT BOARD'),
      h('div', { class: 'br-snake-wrap' }, h('table', { class: 'br-snake-table' },
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'RD'), ...g.teams.map((t, seat) => h('th', { scope: 'col', class: seat === g.userSeat ? 'is-me' : '' }, t.name)))),
        h('tbody', {}, Array.from({ length: PICKS }, (_, r) => h('tr', {}, h('th', { scope: 'row' }, `${r + 1} ${r % 2 ? '←' : '→'}`), ...g.teams.map((_, seat) => cell(r, seat))))))));
  }

  async function autoDraftRest() {
    const ok = await confirmSheet({ title: 'AUTO-DRAFT THE REST?', message: 'Your GM fills every open spot with the best card left for each role you still need.', confirmLabel: 'Auto-draft' });
    if (!ok) return;
    const g = game;
    while (g.phase === 'draft' && g.pick < g.order.length && g.order[g.pick] === g.userSeat) {
      const taken = new Set(g.teams.flatMap((t) => t.roster));
      const c = aiPick(rosterOf(g.teams[g.userSeat]), pool().filter((x) => !taken.has(x.id)), Math.random, 0);
      if (!c) break;
      g.teams[g.userSeat].roster.push(c.id);
      g.recent.unshift({ seat: g.userSeat, id: c.id, pick: g.pick + 1 });
      g.pick += 1;
      advanceDraft(g);
    }
    searchText = '';
    await save();
    if (g.phase === 'bracket') toast('The draft is done. Here is your bracket.');
    draw();
  }

  async function leave() {
    const ok = await confirmSheet({
      title: 'LEAVE THIS BRAWL?',
      message: 'Your Brawl is saved. You can pick it back up from the Brawl screen, or start over.',
      confirmLabel: 'Start over',
      danger: true,
    });
    if (ok) { game = null; await save(); drawStart(); } else draw();
  }

  // ---------- Bracket ----------
  function bracketView(g) {
    const team = (seat) => (seat == null ? null : g.teams[seat]);
    const line = (seat, m) => {
      const t = team(seat);
      if (!t) return h('span', { class: 'br-bk-team is-tbd' }, 'TBD');
      const won = m.winner === seat;
      const lost = m.winner != null && !won;
      return h('span', { class: `br-bk-team${t.user ? ' is-you' : ''}${won ? ' is-win' : ''}${lost ? ' is-out' : ''}` },
        h('span', { class: 'br-bk-seed' }, String(g.bracket.seeds[seat])),
        h('span', { class: 'br-bk-name' }, t.name),
        m.score && m.winner != null ? h('span', { class: 'br-bk-score' }, String(seat === m.a ? m.score[0] : m.score[1])) : null);
    };
    const rounds = [g.bracket.rounds[0], g.bracket.rounds[1] || [{}, {}], g.bracket.rounds[2] || [{}]];
    return h('div', { class: 'br-bracket' }, rounds.map((ms, r) => h('div', { class: 'br-bk-col' },
      h('p', { class: 'label-spaced' }, ROUND_NAMES[r]),
      ms.map((m) => h('div', { class: 'br-bk-match' }, line(m.a, m), line(m.b, m))))));
  }

  function drawBracket() {
    const g = game;
    const m = userMatch(g);
    const opp = m ? g.teams[oppOf(g, m)] : null;
    fill(root,
      header(ROUND_NAMES[g.round], () => leave()),
      h('div', { class: 'br-wrap' },
        bracketView(g),
        h('div', { class: 'br-teams' }, g.teams.map((t, seat) => h('button', { class: `br-team-chip${t.user ? ' is-you' : ''}`, onClick: () => showTeam(seat) },
          h('span', { class: 'br-bk-seed' }, String(g.bracket.seeds[seat])), t.name, h('span', { class: 'muted' }, ` · ${teamRating(rosterOf(t))}`)))),
        m && opp ? h('div', { class: 'result-actions' },
          h('button', { class: 'btn btn-primary', onClick: async () => { setupLineup(); await save(); draw(); } }, `Scout ${opp.name}`)) : null,
      ),
    );
  }

  function showTeam(seat) {
    const g = game;
    const t = g.teams[seat];
    const r = rosterOf(t);
    const chem = chemistry(r);
    sheet({
      title: t.name,
      wide: true,
      content: h('div', {},
        h('p', { class: 'caption muted' }, `Seed ${g.bracket.seeds[seat]} · average Power ${teamPower(r)}${chem.bonus ? ` · ${chem.label} +${chem.bonus}` : ''}`),
        h('div', { class: 'br-team-cards' }, r.map((c) => characterCard(c, { size: 'sm', stats: false }))),
      ),
    });
  }

  // ---------- Lineups ----------
  function setupLineup() {
    const g = game;
    const m = userMatch(g);
    const oppSeat = oppOf(g, m);
    g.lineup = {
      mine: rosterOf(g.teams[g.userSeat]).sort((a, b) => b.powerLevel - a.powerLevel).map((c) => c.id),
      theirs: aiLineup(rosterOf(g.teams[oppSeat])).map((c) => c.id),
      swapped: null, seed: Math.floor(Math.random() * 2 ** 31),
    };
    g.phase = 'lineup';
  }

  function matchupMark(mine, theirs) {
    const v = matchup(mine, theirs);
    return h('span', { class: `br-mu ${v > 0 ? 'is-good' : v < 0 ? 'is-bad' : ''}`, 'aria-label': v > 0 ? 'Your role beats theirs' : v < 0 ? 'Their role beats yours' : 'Even matchup' },
      v > 0 ? '▲ EDGE' : v < 0 ? '▼ WEAK' : '= EVEN');
  }

  function lineupRows(mineIds, theirIds, { edit = false, highlight = [] } = {}) {
    const mine = mineIds.map(ch);
    const theirs = theirIds.map(ch);
    const move = async (i, d) => {
      const j = i + d;
      if (j < 0 || j >= mine.length) return;
      [game.lineup.mine[i], game.lineup.mine[j]] = [game.lineup.mine[j], game.lineup.mine[i]];
      await save();
      drawLineup();
      root.querySelector(`[data-slot="${j}"] [data-move="${d}"]`)?.focus();
    };
    const cardLine = (c, side) => h('div', { class: `br-lu-card ${side}` },
      avatar(c, characters, 'sm'),
      h('span', { class: 'br-lu-text' },
        h('span', { class: 'br-lu-name' }, c.name),
        h('span', { class: `br-lu-role role-${c.mainRole.toLowerCase()}` }, `${c.mainRole} · ${c.powerLevel}`)));
    return h('ol', { class: 'br-lineup' }, mine.map((c, i) => h('li', { class: `br-lu-row${highlight.includes(i) ? ' is-swapped' : ''}`, 'data-slot': String(i) },
      h('span', { class: 'br-lu-num' }, String(i + 1)),
      cardLine(c, 'is-you'),
      edit ? h('span', { class: 'br-lu-move' },
        h('button', { class: 'icon-btn', 'aria-label': `Move ${c.name} up`, 'data-move': '-1', disabled: i === 0, onClick: () => move(i, -1) }, '▲'),
        h('button', { class: 'icon-btn', 'aria-label': `Move ${c.name} down`, 'data-move': '1', disabled: i === mine.length - 1, onClick: () => move(i, 1) }, '▼')) : null,
      matchupMark(c, theirs[i]),
      cardLine(theirs[i], 'is-foe'))));
  }

  function matchHeader(g) {
    const m = userMatch(g);
    const oppSeat = oppOf(g, m);
    const opp = g.teams[oppSeat];
    const myB = bonusFor(g, g.userSeat, oppSeat);
    const opB = bonusFor(g, oppSeat, g.userSeat);
    return h('div', { class: 'br-vs panel' },
      h('div', { class: 'br-vs-side' }, h('span', { class: 'heading' }, g.teams[g.userSeat].name), h('span', { class: 'caption muted' }, `Seed ${g.bracket.seeds[g.userSeat]}${myB ? ` · +${myB} Power` : ''}`)),
      h('span', { class: 'label-spaced' }, 'VS'),
      h('div', { class: 'br-vs-side is-foe' }, h('span', { class: 'heading' }, opp.name), h('span', { class: 'caption muted' }, `Seed ${g.bracket.seeds[oppSeat]}${opB ? ` · ${opB > 0 ? '+' : ''}${opB} Power` : ''}`)));
  }

  function drawLineup() {
    const g = game;
    if (g.phase === 'fight') g.phase = 'swap';
    if (g.phase === 'swap') { drawSwap(); return; }
    const L = g.lineup;
    fill(root,
      header(`${ROUND_NAMES[g.round]} · LINEUP`, () => drawBracket()),
      h('div', { class: 'br-wrap' },
        matchHeader(g),
        h('p', { class: 'caption muted' }, 'Cards fight in order, top to bottom. When one is knocked out, the next tags in. Line up roles that beat theirs. The rival will see your order and may swap two of its cards.'),
        h('div', { class: 'br-lu-head' }, h('span', { class: 'label-spaced' }, 'YOUR ORDER'), h('span', { class: 'label-spaced' }, 'THEIR ORDER')),
        lineupRows(L.mine, L.theirs, { edit: true }),
        h('div', { class: 'result-actions' },
          h('button', { class: 'btn btn-primary', onClick: lockIn }, 'Lock in lineup'),
          h('button', { class: 'btn btn-secondary', onClick: () => showTeam(oppOf(g, userMatch(g))) }, 'Their cards')),
      ),
    );
  }

  async function lockIn() {
    const g = game;
    const L = g.lineup;
    const event = g.event ? EVENTS[g.event] : {};
    let theirs = L.theirs.map(ch);
    const mine = L.mine.map(ch);
    let swaps = [];
    for (let k = 0; k < (event.swaps || 1); k++) {
      const r = rivalSwap(theirs, mine);
      if (!r.swapped) break;
      theirs = r.lineup;
      swaps.push(r.swapped);
    }
    L.theirs = theirs.map((c) => c.id);
    L.swapped = swaps;
    g.phase = 'swap';
    await save();
    drawSwap();
  }

  function drawSwap() {
    const g = game;
    const L = g.lineup;
    const opp = g.teams[oppOf(g, userMatch(g))];
    const swapped = (L.swapped || []).flat();
    const theirs = L.theirs.map(ch);
    fill(root,
      header(`${ROUND_NAMES[g.round]} · LOCKED IN`, () => drawBracket()),
      h('div', { class: 'br-wrap' },
        h('div', { class: 'br-swap-banner' },
          h('p', { class: 'label-spaced' }, opp.name),
          h('h2', { class: 'display-lg' }, L.swapped && L.swapped.length ? 'RIVAL SWAPS!' : 'RIVAL HOLDS'),
          h('p', { class: 'body-text' }, L.swapped && L.swapped.length
            ? L.swapped.map(([i, j]) => `${theirs[j].name} and ${theirs[i].name} trade spots (${i + 1} ↔ ${j + 1}).`).join(' ')
            : 'They keep their lineup. Your read held up.')),
        matchHeader(g),
        lineupRows(L.mine, L.theirs, { highlight: swapped }),
        h('div', { class: 'result-actions' }, h('button', { class: 'btn btn-primary', onClick: drawFight }, 'Fight')),
      ),
    );
  }

  // ---------- The match ----------
  function drawFight() {
    const g = game;
    const m = userMatch(g);
    const oppSeat = oppOf(g, m);
    const L = g.lineup;
    const mine = L.mine.map(ch);
    const theirs = L.theirs.map(ch);
    const stage = h('div', { class: 'ff-stage' });
    const after = h('div', { class: 'ff-after', hidden: true });
    fill(root, header(ROUND_NAMES[g.round], () => drawSwap()), stage, after);
    fightView = playMatch(stage, {
      teamA: fightCards(mine, bonusFor(g, g.userSeat, oppSeat)),
      teamB: fightCards(theirs, bonusFor(g, oppSeat, g.userSeat)),
      seed: L.seed,
      labels: { A: 'YOU', B: 'THEY' }, names: { B: g.teams[oppSeat].name },
      onDone: async (result) => {
        const d = addDamage(g, mine, theirs, result.events);
        const won = result.winner === 'A';
        m.winner = won ? g.userSeat : oppSeat;
        m.score = m.a === g.userSeat ? result.score : [result.score[1], result.score[0]];
        const all = [...mine.map((c, i) => ({ c, dmg: d.A[i] })), ...theirs.map((c, i) => ({ c, dmg: d.B[i] }))];
        const mvp = all.sort((a, b) => b.dmg - a.dmg)[0];
        g.mvps.push({ round: g.round, id: mvp.c.id, dmg: mvp.dmg, yours: mine.includes(mvp.c) });
        g.record[won ? 'w' : 'l'] += 1;
        simRound(g);
        g.phase = 'results';
        g.lineup = null;
        await save();
        after.hidden = false;
        fill(after, h('button', { class: 'btn btn-primary btn-wide', onClick: drawResults }, 'Continue'));
        after.querySelector('button').focus();
      },
    });
  }

  function drawResults() {
    const g = game;
    const m = g.bracket.rounds[g.round].find((x) => x.a === g.userSeat || x.b === g.userSeat);
    const won = m.winner === g.userSeat;
    const mvp = g.mvps[g.mvps.length - 1];
    const mvpC = mvp ? ch(mvp.id) : null;
    const last = g.round === 2;
    const next = async () => {
      if (!won || last) { await finish(won && last ? 3 : g.round); return; }
      g.bracket.rounds.push(nextRound(g.bracket.rounds[g.round]));
      g.round += 1;
      g.phase = 'bracket';
      await save();
      drawBracket();
    };
    fill(root,
      header(`${ROUND_NAMES[g.round]} · FINAL`, () => {}),
      h('div', { class: 'br-wrap' },
        h('div', { class: 'result-head' },
          h('p', { class: 'label-spaced' }, ROUND_NAMES[g.round]),
          h('h2', { class: `display-lg ${won ? 'gold' : ''}` }, won ? (last ? 'CHAMPIONS!' : 'YOU ADVANCE') : 'ELIMINATED'),
          h('p', { class: 'heading' }, `${m.score[m.a === g.userSeat ? 0 : 1]} – ${m.score[m.a === g.userSeat ? 1 : 0]}`)),
        mvpC ? h('div', { class: 'br-mvp panel' },
          avatar(mvpC, characters, 'md'),
          h('div', {}, h('p', { class: 'label-spaced gold' }, 'GAME MVP'), h('p', { class: 'heading' }, mvpC.name),
            h('p', { class: 'caption muted' }, `${fmt(mvp.dmg)} damage${mvp.yours ? '' : ' (for the other side)'}`))) : null,
        bracketView(g),
        h('div', { class: 'result-actions' }, h('button', { class: 'btn btn-primary', onClick: next },
          !won || last ? 'See how it ended' : (g.round === 0 ? 'On to the semifinals' : 'On to the final'))),
      ),
    );
  }

  // ---------- The end ----------
  async function finish(finishIdx) {
    const g = game;
    // Play out the rest of the bracket so there is a champion and a Tournament MVP.
    while (true) {
      simRound(g);
      if (g.round >= 2) break;
      g.bracket.rounds.push(nextRound(g.bracket.rounds[g.round]));
      g.round += 1;
    }
    const champSeat = g.bracket.rounds[2][0].winner;
    const champ = g.teams[champSeat];
    const tmvp = rosterOf(champ).map((c) => ({ c, dmg: g.damage[c.id] || 0 })).sort((a, b) => b.dmg - a.dmg)[0];
    let newBest = false;
    await records.update('brawl', (r) => {
      r.runs = (r.runs || 0) + 1;
      r.wins = (r.wins || 0) + g.record.w;
      r.losses = (r.losses || 0) + g.record.l;
      r.titles = (r.titles || 0) + (finishIdx === 3 ? 1 : 0);
      if (r.best === undefined || finishIdx > r.best) { newBest = r.best !== undefined; r.best = finishIdx; }
      return r;
    });
    lastGame = { ...g, finishIdx, champSeat, tmvp: { id: tmvp.c.id, dmg: tmvp.dmg }, newBest };
    game = null;
    await save();
    drawOver();
  }

  function drawOver() {
    const g = lastGame;
    if (!g) { drawStart(); return; }
    const me = g.teams[g.userSeat];
    const champ = g.teams[g.champSeat];
    const tm = ch(g.tmvp.id);
    const share = async () => {
      const how = await shareText(`T7P Arcade · Brawl\n${me.name}: ${FINISH[g.finishIdx]} (${g.record.w}–${g.record.l})\nSquad: ${rosterOf(me).map((c) => c.name).join(', ')}`);
      if (how === 'copied') toast('Result copied. Paste it anywhere.');
      else if (how === 'failed') toast('Sharing is not available here.');
    };
    fill(root,
      header('FINAL STANDINGS', () => { lastGame = null; drawStart(); }),
      h('div', { class: 'br-wrap' },
        h('div', { class: 'result-head' },
          h('p', { class: 'label-spaced' }, me.name),
          h('h2', { class: `display-lg ${g.finishIdx === 3 ? 'gold' : ''}` }, g.finishIdx === 3 ? 'CHAMPIONS' : FINISH[g.finishIdx].toUpperCase()),
          g.finishIdx < 3 ? h('p', { class: 'body-text' }, `${champ.name} won the title.`) : null,
          g.newBest ? h('p', { class: 'new-best' }, 'NEW BEST FINISH') : null),
        h('div', { class: 'result-stats' }, stat('Record', `${g.record.w}–${g.record.l}`), stat('Seed', g.bracket.seeds[g.userSeat]), stat('Power', teamRating(rosterOf(me)))),
        tm ? h('div', { class: 'br-mvp panel' },
          avatar(tm, characters, 'md'),
          h('div', {}, h('p', { class: 'label-spaced gold' }, 'TOURNAMENT MVP'), h('p', { class: 'heading' }, tm.name),
            h('p', { class: 'caption muted' }, `${champ.name} · ${fmt(g.tmvp.dmg)} damage`))) : null,
        bracketView(g),
        h('div', { class: 'result-actions' },
          h('button', { class: 'btn btn-primary', onClick: () => { lastGame = null; drawStart(); } }, 'Brawl again'),
          h('button', { class: 'btn btn-secondary', onClick: share }, 'Share')),
      ),
    );
  }

  function stat(label, value) {
    return h('div', { class: 'result-stat' }, h('span', { class: 'stat' }, String(value)), h('span', { class: 'label-spaced' }, label));
  }

  draw();
  help.showFirstTime();
  return root;
}
