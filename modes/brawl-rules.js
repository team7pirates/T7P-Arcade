// Brawl rules: the snake draft, team chemistry, AFL Insider Drop events, the
// 8-team bracket, AI lineups and MVPs. Pure functions with no screen code, so
// the balance simulation in sim/ runs the same rules the game does.

import { ROLES, beats } from '../core/combat.js';

export const TEAMS = 8;
export const PICKS = 5;                     // one per role
export const ROUND_NAMES = ['QUARTERFINALS', 'SEMIFINALS', 'THE FINAL'];

export const RIVAL_NAMES = ['TEAM OBLIVION', 'SHADOW SYNDICATE', 'IRON VANGUARD', 'CRIMSON PACT', 'NULL COLLECTIVE',
  'VOID REGENCY', 'ASHEN LEGION', 'NEON DYNASTY', 'OBSIDIAN ORDER', 'STORM CARTEL', 'GHOST PROTOCOL',
  'RUIN COALITION', 'SOLAR APEX', 'FROSTBITE UNION', 'VENOM COURT', 'TITAN ACCORD', 'ECLIPSE PACT',
  'RIOT DIVISION', 'SABLE COMPANY', 'HALO BREAKERS', 'DREAD ARMADA', 'QUANTUM REAPERS', 'ONYX MANDATE'];

export function shuffle(a, rand = Math.random) {
  const x = a.slice();
  for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; }
  return x;
}

// ---------- AFL Insider Drop events ----------
// About half of all Brawls open with a league event.
export const EVENTS = {
  rivalry: { title: 'RIVALRY BRACKET', text: 'Everyone is gunning for you. Every team you face fights at +2 Power.', foes: 2 },
  favorable: { title: 'FAVORABLE DRAW', text: 'The bracket broke your way. Every team you face fights at −2 Power.', foes: -2 },
  stacked: { title: 'STACKED FIELD', text: 'The rival GMs did their homework. They draft without mistakes and get two lineup swaps instead of one.', swaps: 2, perfectDraft: true },
  underdog: { title: 'UNDERDOG RUN', text: 'You draft from the last spot, but your squad plays with a chip on its shoulder: +1 Power in every match.', lastSeat: true, you: 1 },
};
// Simulated title odds with good lineups (no event ≈ 36%): Rivalry ≈ 18%,
// Favorable ≈ 53%, Stacked ≈ 15%, Underdog ≈ 45%.
export function rollEvent(rand = Math.random) {
  if (rand() >= 0.5) return null;
  const keys = Object.keys(EVENTS);
  return keys[Math.floor(rand() * keys.length)];
}

// ---------- The draft ----------
// Snake order: seat order for round 1, reversed for round 2, and so on.
export function draftOrder(teams = TEAMS, rounds = PICKS) {
  const order = [];
  for (let r = 0; r < rounds; r++) {
    const seats = Array.from({ length: teams }, (_, i) => i);
    order.push(...(r % 2 ? seats.reverse() : seats));
  }
  return order;
}

export const neededRoles = (team) => ROLES.filter((r) => !team.some((c) => c.mainRole === r));

// Draft value: Power first, a little for Aura and Clutch.
export const draftValue = (c) => c.powerLevel + (c.aura + c.clutch) / 40;

// AI pick: the best player for a role it still needs, with some noise so the
// rival GMs make human-looking choices. Scarce roles get a small push once
// they run thin. noise 0 = perfect drafting (Stacked Field).
export function aiPick(team, pool, rand = Math.random, noise = 6) {
  const need = neededRoles(team);
  const options = pool.filter((c) => need.includes(c.mainRole));
  if (!options.length) return null;
  const left = Object.fromEntries(need.map((r) => [r, options.filter((c) => c.mainRole === r).length]));
  let best = null;
  let bestScore = -Infinity;
  for (const c of options) {
    const scarcity = left[c.mainRole] < 12 ? (12 - left[c.mainRole]) * 0.4 : 0;
    const score = draftValue(c) + scarcity + (noise ? (rand() * 2 - 1) * noise : 0);
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best;
}

// ---------- Team chemistry ----------
// Squads that share a series or a franchise fight better together.
// The bonus is extra Power for every card in every match.
export function chemistry(team) {
  const by = (key) => {
    const n = {};
    team.forEach((c) => { if (c[key]) n[c[key]] = (n[c[key]] || 0) + 1; });
    const top = Object.keys(n).sort((a, b) => n[b] - n[a])[0];
    return top ? [top, n[top]] : [null, 0];
  };
  const [series, sN] = by('series');
  const [fr, fN] = by('franchise');
  const options = [];
  // Marvel and DC Comics are one "series" each, so they count as franchises, not series.
  const realSeries = series && !/comics$/i.test(series);
  if (realSeries && sN >= 5) options.push({ bonus: 4, label: `ALL-${series.toUpperCase()} SQUAD`, text: `All five from ${series}.` });
  else if (realSeries && sN >= 4) options.push({ bonus: 3, label: `${series.toUpperCase()} CORE`, text: `Four from ${series}.` });
  else if (realSeries && sN >= 3) options.push({ bonus: 2, label: `${series.toUpperCase()} PACT`, text: `Three from ${series}.` });
  if (fN >= 5 && fr) {
    const name = { marvel: 'MARVEL', dc: 'DC', anime: 'ANIME', other: 'WILDCARD' }[fr] || fr.toUpperCase();
    options.push({ bonus: fr === 'anime' ? 1 : 3, label: `ALL-${name}`, text: `A pure ${name} squad.` });
  }
  options.sort((a, b) => b.bonus - a.bonus);
  return options[0] || { bonus: 0, label: '', text: '' };
}

export const teamPower = (team) => Math.round(team.reduce((n, c) => n + c.powerLevel, 0) / team.length);
export const teamRating = (team) => teamPower(team) + chemistry(team).bonus;

// Cards as they fight in a match: chemistry and event bonuses added to Power.
export function fightCards(team, bonus) {
  return team.map((c) => (bonus ? { ...c, powerLevel: Math.max(1, Math.min(110, c.powerLevel + bonus)) } : c));
}

// ---------- The bracket ----------
// Seeds by team rating: 1v8, 4v5, 2v7, 3v6 so the top two seeds meet in the final.
export function seedBracket(teams) {
  const seeded = teams.map((t, seat) => ({ seat, rating: teamRating(t.roster) }))
    .sort((a, b) => b.rating - a.rating)
    .map((x, i) => ({ ...x, seed: i + 1 }));
  const s = (n) => seeded[n - 1].seat;
  return {
    seeds: Object.fromEntries(seeded.map((x) => [x.seat, x.seed])),
    rounds: [[[s(1), s(8)], [s(4), s(5)], [s(2), s(7)], [s(3), s(6)]].map(([a, b]) => ({ a, b, winner: null, score: null }))],
  };
}

export function nextRound(prev) {
  const out = [];
  for (let i = 0; i < prev.length; i += 2) out.push({ a: prev[i].winner, b: prev[i + 1].winner, winner: null, score: null });
  return out;
}

// ---------- Lineups ----------
// The AI sets its order: mostly strongest first, sometimes a Tank to lead,
// sometimes shuffled, so lineups aren't predictable.
export function aiLineup(team, rand = Math.random) {
  const byPower = team.slice().sort((a, b) => b.powerLevel - a.powerLevel);
  const roll = rand();
  if (roll < 0.5) return byPower;
  if (roll < 0.75) {
    const tank = byPower.find((c) => c.mainRole === 'Tank');
    return tank ? [tank, ...byPower.filter((c) => c !== tank)] : byPower;
  }
  return shuffle(team, rand);
}

// Role matchup between two cards facing each other in the same slot:
// 1 = yours beats theirs, -1 = theirs beats yours, 0 = even.
export function matchup(mine, theirs) {
  if (beats(mine.mainRole, theirs.mainRole)) return 1;
  if (beats(theirs.mainRole, mine.mainRole)) return -1;
  return 0;
}

// How well one lineup lines up against another, slot by slot: role edges
// plus a small Power edge, with the front of the lineup counting most.
export function lineupScore(mine, theirs) {
  let s = 0;
  mine.forEach((c, i) => {
    const t = theirs[i] || theirs[theirs.length - 1];
    s += (mine.length - i) * (matchup(c, t) * 10 + (c.powerLevel - t.powerLevel) * 0.3);
  });
  return s;
}

// The best order against a known lineup (tries all 120 orders). Used by the
// simulation; the game leaves this to the player.
export function counterLineup(mine, theirs) {
  const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));
  let best = mine;
  let bestScore = -Infinity;
  for (const p of perms(mine)) {
    const sc = lineupScore(p, theirs);
    if (sc > bestScore) { bestScore = sc; best = p; }
  }
  return best;
}

// The rival's answer: after seeing your lineup, the rival GM may swap two of
// its cards (the single swap that helps it most). Returns { lineup, swapped }
// where swapped is [i, j] or null if no swap helps.
// Simulated: a lineup that counters theirs wins about 87% with no answer and
// about 69% after the swap, so you have to think one step ahead.
export function rivalSwap(theirs, mine) {
  let best = theirs;
  let swapped = null;
  let bestScore = lineupScore(theirs, mine);
  for (let i = 0; i < theirs.length; i++) {
    for (let j = i + 1; j < theirs.length; j++) {
      const p = theirs.slice();
      [p[i], p[j]] = [p[j], p[i]];
      const sc = lineupScore(p, mine);
      if (sc > bestScore + 0.01) { bestScore = sc; best = p; swapped = [i, j]; }
    }
  }
  return { lineup: best, swapped };
}

// ---------- MVPs ----------
// Damage each card dealt in a match, from the combat event log.
// Returns { A: [dmg per card], B: [...] } in lineup order.
export function damageDealt(events, sizeA, sizeB) {
  const out = { A: Array(sizeA).fill(0), B: Array(sizeB).fill(0) };
  const active = { A: 0, B: 0 };
  for (const ev of events) {
    if (ev.t === 'round-start') { active.A = 0; active.B = 0; }
    else if (ev.t === 'enter') active[ev.side] = ev.idx;
    else if (ev.t === 'damage' && ev.kind === 'hit') {
      const by = ev.side === 'A' ? 'B' : 'A';
      out[by][active[by]] += ev.dmg;
    }
  }
  return out;
}

// Records by how far you got: 0 = out in the quarterfinals … 3 = champion.
export const FINISH = ['Quarterfinals', 'Semifinals', 'Runner-up', 'Champion'];
