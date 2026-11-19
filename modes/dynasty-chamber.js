// DYNASTY: the Time Chamber (v0.33.0). No screen code.
//
// Bench cards don't get the playing-time growth starters get. The Time
// Chamber is how you grow them in season:
//   - Put cards in (1 slot at level 1, 2 at level 2, 3 at level 3). They stay
//     in week to week until you take them out.
//   - A card in the Chamber can't play: it's out of your lineup that week.
//   - Each week inside: growth (1 growth = 1 skill point). Young cards
//     (seasons 1-2) grow 25% faster. A veteran mentor (season 4+, same role,
//     at least as strong, not in the Chamber) adds more.
//   - It's hard work: +12 fatigue a week and a 5% chance of a 1-2 week injury
//     (an injured card leaves the Chamber).
//   - A card can only bank so many points from the Chamber per season
//     (3 / 4 / 5 by level), so it can't max out a roster on its own.
//   - Upgrades cost cap space this season (dead money): level 2 costs 2,
//     level 3 costs 3.5 more. The level stays with your team.
//   - You always keep at least 5 cards able to play.
// Skill points bank like normal growth, but Chamber points also push the
// card's max up so they can always turn into Power.

import * as R from './dynasty-rules.js';

export const LEVELS = [null,
  { slots: 1, growth: 0.40, cap: 3, cost: 0 },
  { slots: 2, growth: 0.50, cap: 4, cost: 2 },
  { slots: 3, growth: 0.60, cap: 5, cost: 3.5 }];
export const YOUNG = 1.25;
export const MENTOR = 0.2;
export const FATIGUE = 12;
export const INJURY = 0.05;

const r1 = (n) => Math.round(n * 10) / 10;
const myTeam = (L) => L.teams[L.user.team];
export const level = (L) => myTeam(L).chamberLvl || 1;
export const info = (L) => LEVELS[level(L)];
export const isIn = (L, p) => !!p.chamber && p.chamber.team === p.team && L.user && p.team === L.user.team;
export const inside = (L) => myTeam(L).roster.map((pid) => L.players[pid]).filter((p) => isIn(L, p));
export const gained = (L, p) => (p.chamberGain?.season === L.season ? p.chamberGain.n : 0);
export const isOpen = (L) => !!L.user && L.phase === 'season';

export function mentorOf(L, p) {
  return myTeam(L).roster.map((pid) => L.players[pid])
    .filter((q) => q.pid !== p.pid && q.role === p.role && q.career >= 4 && q.power >= p.power && !isIn(L, q))
    .sort((a, b) => b.power - a.power)[0] || null;
}
// Expected growth for one week (in skill points).
export function weekly(L, p) {
  let g = info(L).growth;
  if (p.career <= 2) g *= YOUNG;
  if (mentorOf(L, p)) g += MENTOR;
  return Math.round(g * 100) / 100;
}

export function canEnter(L, pid) {
  const p = L.players[pid];
  if (!isOpen(L)) return { ok: false, why: 'The Chamber is open during the regular season.' };
  if (!p || p.team !== L.user.team) return { ok: false, why: 'Not on your roster.' };
  if (isIn(L, p)) return { ok: false, why: 'Already inside.' };
  if (p.injury > 0) return { ok: false, why: 'Injured cards can\'t train.' };
  if (inside(L).length >= info(L).slots) return { ok: false, why: `The Chamber holds ${info(L).slots} at level ${level(L)}. Upgrade it or take someone out.` };
  if (gained(L, p) >= info(L).cap) return { ok: false, why: `He's banked the ${info(L).cap}-point Chamber limit this season.` };
  const able = myTeam(L).roster.map((x) => L.players[x]).filter((q) => R.available(q) && q.pid !== pid).length;
  if (able < R.STARTERS) return { ok: false, why: `You need ${R.STARTERS} cards able to play.` };
  return { ok: true };
}
export function enter(L, pid) {
  const c = canEnter(L, pid); if (!c.ok) return c;
  const p = L.players[pid];
  p.chamber = { team: p.team, since: L.week };
  if (L.pending && !L.pending.locked) L.pending = null; // rebuild the lineup without him
  return { ok: true };
}
export function leave(L, pid) {
  const p = L.players[pid]; if (!p) return;
  delete p.chamber;
  if (L.pending && !L.pending.locked) L.pending = null;
}

export function nextUpgrade(L) {
  const lv = level(L); if (lv >= 3) return null;
  return { level: lv + 1, ...LEVELS[lv + 1] };
}
export function upgrade(L) {
  const nx = nextUpgrade(L); const t = myTeam(L);
  if (!nx) return { ok: false, why: 'The Chamber is already max level.' };
  if (!isOpen(L)) return { ok: false, why: 'Upgrade it during the season.' };
  if (R.payroll(L, t) + nx.cost > R.capOf(t) + 0.05) return { ok: false, why: `You need ${nx.cost} in cap space (you have ${r1(Math.max(0, R.capOf(t) - R.payroll(L, t)))}).` };
  t.dead = r1((t.dead || 0) + nx.cost);
  t.chamberLvl = nx.level;
  return { ok: true, level: nx.level };
}

// After each week's games (R.hooks.chamber). Returns what happened.
export function train(L, rand = Math.random) {
  if (!L.user || L.phase !== 'season') return [];
  const out = [];
  // Anyone who left the team (trade, release) leaves the Chamber.
  for (const p of Object.values(L.players)) if (p.chamber && p.chamber.team !== p.team) delete p.chamber;
  for (const p of inside(L)) {
    const lim = info(L).cap;
    if (gained(L, p) >= lim) { delete p.chamber; out.push({ pid: p.pid, maxed: true }); continue; }
    let g = weekly(L, p) * (0.8 + rand() * 0.4);
    const usableBefore = R.usablePoints(p);
    p.growth = (p.growth || 0) + g;
    let pts = 0;
    while (p.growth >= 1 && gained(L, p) + pts < lim) { p.sp = Math.min(60, (p.sp || 0) + 1); p.growth -= 1; pts += 1; }
    if (p.growth >= 1) p.growth = 0.99;
    if (pts) {
      p.chamberGain = { season: L.season, n: gained(L, p) + pts };
      // Training past your limits: Chamber points also raise the card's max,
      // so they can always turn into Power.
      p.potential = Math.max(p.potential || 0, Math.min(99, p.power + usableBefore + pts));
      if (!R.manualPoints(L, p)) R.spendPoints(p);
    }
    p.fatigue = Math.min(100, (p.fatigue || 0) + FATIGUE);
    let hurt = 0;
    if (rand() < INJURY) {
      hurt = 1 + (rand() < 0.4 ? 1 : 0); p.injury = Math.max(p.injury, hurt); delete p.chamber;
      L.news.unshift({ week: L.week, kind: 'INJURY', team: p.team, title: `${p.name} hurt in the Time Chamber`, text: `Pushed too hard. Out ${hurt} week${hurt > 1 ? 's' : ''}.` });
    }
    out.push({ pid: p.pid, pts, hurt });
  }
  L.chamberLast = { season: L.season, week: L.week, out };
  return out;
}
// The off-season empties the Chamber.
export function empty(L) { for (const p of Object.values(L.players)) delete p.chamber; }

R.hooks.chamber = (L, rand) => train(L, rand);
