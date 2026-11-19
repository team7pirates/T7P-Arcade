// DYNASTY: the waiver wire (v0.31.0). No screen code.
//
// In season, through the Week 10 deadline:
//   - Release a card on its own. This season's cap hit stays as dead money and
//     the spot is open. Your roster can't go under 7 cards, and you need at
//     least 6 healthy after the cut.
//   - Sign a free agent into an open spot for the rest of the season (a
//     1-season deal). Depth cards (Power 78 and under) cost the minimum;
//     better leftovers cost 60% of their ask and need cap room.
//   - A card you release goes on waivers for a week. AI teams with a weaker
//     card at that spot may claim him (they cut their worst card for him).
//     You can't re-sign a card you cut this season.
//   - Safety net: if you ever have fewer than 5 healthy cards before a game
//     (checked after each week and when the Game Plan opens, playoffs too),
//     the league signs a depth card into an open spot at the minimum.
// Open spots get filled in free agency like always (you need 10 to start a
// season).

import * as R from './dynasty-rules.js';
import * as O from './dynasty-off.js';

export const DEADLINE = 10;
export const MIN_ROSTER = 7;
export const MIN_HEALTHY = R.STARTERS + 1;
export const CLAIM_CHANCE = 0.65;
export const CLAIM_EDGE = 3;

const news = (L, item) => { L.news.unshift({ week: L.week, ...item }); L.news = L.news.slice(0, 40); };
const roster = (L, t) => t.roster.map((pid) => L.players[pid]);
const healthy = (L, t) => roster(L, t).filter(R.available);

export const isOpen = (L) => !!L.user && L.phase === 'season' && L.week <= DEADLINE;
export const closedWhy = (L) => (L.phase !== 'season' ? 'Roster moves happen in free agency during the off-season.' : `The waiver deadline (after Week ${DEADLINE}) has passed. Your roster is set for the stretch run.`);
export const openSpots = (L) => R.ROSTER_SIZE - L.teams[L.user.team].roster.length;
export const priceOf = (p) => (p.power <= O.EMERGENCY_MAX_POWER ? O.MIN_SALARY : O.bargainPrice(p));
export const cutByYou = (L, p) => p.waiver?.season === L.season && p.waiver.from === L.user.team;

// Free agents you can sign right now.
export function pool(L) {
  return O.faPool(L).filter((p) => !cutByYou(L, p)).sort((a, b) => b.power - a.power);
}

export function canRelease(L, pid) {
  const t = L.teams[L.user.team]; const p = L.players[pid];
  if (!isOpen(L)) return { ok: false, why: closedWhy(L) };
  if (!p || p.team !== t.i) return { ok: false, why: 'Not on your roster.' };
  if (t.roster.length <= MIN_ROSTER) return { ok: false, why: `You need at least ${MIN_ROSTER} cards in season. Sign someone first.` };
  if (R.available(p) && healthy(L, t).length <= MIN_HEALTHY) return { ok: false, why: `You need at least ${MIN_HEALTHY} healthy cards. Cut an injured card or sign someone first.` };
  return { ok: true, dead: R.capHit(p) };
}

export function release(L, pid) {
  const c = canRelease(L, pid);
  if (!c.ok) return c;
  const p = L.players[pid]; const t = L.teams[L.user.team];
  O.release(L, pid);
  p.waiver = { from: t.i, season: L.season, week: L.week };
  news(L, { kind: 'WAIVED', team: t.i, title: `${t.name} release ${p.name}`, text: `${c.dead} in dead money. He's on waivers this week.` });
  return { ok: true, dead: c.dead };
}

export function canSign(L, pid) {
  const t = L.teams[L.user.team]; const p = L.players[pid];
  if (!isOpen(L)) return { ok: false, why: closedWhy(L) };
  if (!p || p.team != null || p.retired || p.prospect) return { ok: false, why: 'He isn\'t a free agent.' };
  if (cutByYou(L, p)) return { ok: false, why: 'You cut him this season.' };
  if (openSpots(L) <= 0) return { ok: false, why: 'No open spot. Release someone first.' };
  if (O.seriesCount(L, t, p.series) >= R.MAX_PER_SERIES) return { ok: false, why: `You'd have more than ${R.MAX_PER_SERIES} from ${p.series}.` };
  const per = priceOf(p);
  if (per > O.MIN_SALARY) { const cap = O.capCheck(L, t, per); if (!cap.ok) return cap; }
  return { ok: true, per };
}

export function sign(L, pid) {
  const c = canSign(L, pid);
  if (!c.ok) return c;
  const p = L.players[pid]; const t = L.teams[L.user.team];
  O.signMinimum(L, t.i, pid, c.per);
  news(L, { kind: 'SIGNED', team: t.i, title: `${t.name} sign ${p.name}`, text: `${c.per} for the rest of the season, off the waiver wire.` });
  return { ok: true, per: c.per };
}

// ---------- Each week (after the games) ----------
// AI teams claim cards you put on waivers, then waivers clear.
export function weekly(L, rand = Math.random) {
  if (!L.user) return [];
  const claims = [];
  for (const p of Object.values(L.players)) {
    if (!p.waiver || p.waiver.season !== L.season || p.team != null || p.waiver.done) continue;
    p.waiver.done = true;
    if (rand() > CLAIM_CHANCE) continue;
    const fits = L.teams.filter((t) => t.i !== L.user.team && t.i !== p.waiver.from).map((t) => {
      const same = roster(L, t).filter((q) => q.role === p.role);
      const worst = (same.length ? same : roster(L, t)).sort((a, b) => a.power - b.power)[0];
      return { t, worst };
    }).filter(({ t, worst }) => worst && p.power - worst.power >= CLAIM_EDGE
      && O.seriesCount(L, t, p.series, [worst.pid]) < R.MAX_PER_SERIES
      && O.capCheck(L, t, priceOf(p), [worst.pid]).ok)
      // Worst record gets first claim, like real waivers.
      .sort((a, b) => (a.t.w || 0) - (b.t.w || 0));
    const pickT = fits[0];
    if (!pickT) continue;
    O.release(L, pickT.worst.pid);
    O.signMinimum(L, pickT.t.i, p.pid, priceOf(p));
    news(L, { kind: 'WAIVED', team: pickT.t.i, title: `${pickT.t.name} claim ${p.name} off waivers`, text: `They cut ${pickT.worst.name} to make room.` });
    claims.push({ pid: p.pid, team: pickT.t.i });
  }
  return claims;
}

// Before a game: make sure you can field 5 healthy cards.
export function ensureFive(L) {
  if (!L.user || (L.phase !== 'season' && L.phase !== 'playoffs')) return [];
  const t = L.teams[L.user.team]; const out = [];
  while (healthy(L, t).length < R.STARTERS && t.roster.length < R.ROSTER_SIZE) {
    const p = pool(L).filter((q) => R.available(q) && q.power <= O.EMERGENCY_MAX_POWER && O.seriesCount(L, t, q.series) < R.MAX_PER_SERIES)[0];
    if (!p) break;
    O.signMinimum(L, t.i, p.pid, O.MIN_SALARY);
    news(L, { kind: 'SIGNED', team: t.i, title: `League signs ${p.name} for ${t.name}`, text: 'They didn\'t have 5 healthy cards. A minimum deal for the rest of the season.' });
    out.push(p.pid);
  }
  return out;
}

R.hooks.waivers = (L, rand) => { weekly(L, rand); ensureFive(L); };
