// My Career (v0.38.0): the rules. You are one card in an Anime Fighting
// League (Dynasty's league engine), not the coach. The league runs with no
// coach at all (L.user stays null); your card carries p.me = true and the save
// keeps L.career for everything about you.
//
// Phase 1: create a fighter (or bring one in from Forbidden Fusion with scaled
// ratings), go through draft night, then play the season week by week. If the
// coach starts you, you pick an approach and watch your team's fight. The rest
// of the league sims. Playoffs, awards and an automatic off-season follow.

import * as R from './dynasty-rules.js';
import * as O from './dynasty-off.js';

export const SLOTS = 3;
export const slotKey = (n) => `career:slot${n}`;

// ---------- Your starting card ----------
// A brand-new fighter picks a background.
export const BACKGROUNDS = {
  bluechip: { label: 'Blue-chip', line: 'Ready now. Starts strong, tops out earlier.', power: 72, potential: 84, dev: 0, aura: 55, clutch: 55, chaos: 45 },
  balanced: { label: 'Balanced', line: 'A bit of both. Solid now, room to grow.', power: 68, potential: 88, dev: 0, aura: 52, clutch: 52, chaos: 50 },
  raw: { label: 'Raw talent', line: 'Starts low, grows fast (Star development). High ceiling.', power: 64, potential: 92, dev: 1, aura: 48, clutch: 46, chaos: 60 },
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const half = (x) => Math.round(50 + ((x ?? 50) - 50) * 0.5);

// Bringing a Forbidden Fusion fighter in: they start as a rookie, not as
// whatever they reached in the Tower. A 99 comes in around 74 with a high
// ceiling; a fighter with a deep Tower record gets a better draft read.
export function scaleImport(build, bestFloor = 0) {
  const pl = build?.powerLevel ?? 60;
  const power = Math.round(clamp(62 + (pl - 60) * 0.3, 62, 74));
  const potential = Math.round(clamp(power + 12 + (pl >= 90 ? 5 : pl >= 80 ? 3 : 0), 80, 94));
  const dev = pl >= 95 ? 1 : 0;
  return {
    power, potential, dev,
    aura: clamp(half(build?.aura), 35, 70), clutch: clamp(half(build?.clutch), 35, 70), chaos: clamp(half(build?.chaos), 30, 75),
    stock: Math.min(6, Math.floor((bestFloor || 0) / 10) * 2),
  };
}

// ---------- A new career ----------
// me: { name, faceId, series, franchise, role, second, background? | import: { build, bestFloor } }
export function newCareer(chars, me, seed = Date.now()) {
  const L = R.newLeague(chars, seed);
  R.simulateFullSeason(L);                 // last season, for history
  O.buildDraftClass(L);
  const base = me.import ? scaleImport(me.import.build, me.import.bestFloor) : { ...BACKGROUNDS[me.background || 'balanced'], stock: 0 };
  const c = chars.find((x) => x.id === me.faceId) || null;
  const p = {
    pid: L.nextPid++, cid: me.faceId ?? null, name: me.name, series: c?.series || 'Original', franchise: c?.franchise || 'Original', portrait: !!c?.portrait,
    role: me.role, second: me.second || null, power: base.power, potential: base.potential,
    aura: base.aura, clutch: base.clutch, chaos: base.chaos,
    dev: base.dev, iron: false, career: 0, careerLen: 10,
    lowKey: false, hype: 55, fatigue: 0, injury: 0, mileage: 0, team: null, contract: null, growth: 0,
    stats: { gp: 0, dmg: 0, ko: 0, sp: 0, w: 0, l: 0 }, lastStats: null,
    prospect: true, stars: clamp(Math.round((base.potential - 62) / 7), 1, 5), scout: 2, gen: false, bust: false, gem: base.dev >= 1,
    // How the AI GMs see you: your ceiling, your Tower record, some noise.
    aiEye: base.potential + (base.power - 68) * 0.5 + base.stock + Math.round((Math.random() - 0.5) * 6),
    me: true,
  };
  L.players[p.pid] = p;
  L.draftClass.push(p.pid);
  L.career = {
    pid: p.pid, imported: !!me.import, background: me.import ? 'import' : (me.background || 'balanced'),
    games: [], trained: null, approach: 'balanced', season0: L.season, log: [], trust: 50,
  };
  // The off-season before your rookie year, up to draft night.
  O.startOffseason(L);
  while (L.off.step !== 'draft') O.nextStep(L);
  return L;
}

export const me = (L) => L.players[L.career.pid];
export const myTeam = (L) => (me(L).team != null ? L.teams[me(L).team] : null);

// ---------- Draft night ----------
// One pick at a time, so the screen can show the board moving. Returns the
// pick made ({ n, team, pid }) or null when the draft is done.
export function draftOne(L) {
  const o = L.off;
  if (o.pick >= o.order.length) return null;
  const n = o.pick;
  const before = o.picks.length;
  // O.simDraft(L, true) stops for the user's team; with no user it picks once
  // per loop, so make exactly one pick by hand through the same AI.
  const full = o.order;
  o.order = full.slice(0, n + 1);
  try { O.simDraft(L, false); } finally { o.order = full; }
  return o.picks.length > before ? o.picks[o.picks.length - 1] : (o.pick > n ? { n: n + 1, team: o.order[n], pid: null } : null);
}
export const drafted = (L) => me(L).team != null;
// Run the rest of the off-season and start your rookie season.
export function finishPreseason(L) {
  const p = me(L);
  if (p.team == null) {
    // Undrafted: the team with the most cap room signs you.
    while (L.off.step === 'draft' && L.off.pick < L.off.order.length) draftOne(L);
  }
  while (L.off.step !== 'fa') O.nextStep(L);
  if (p.team == null) {
    const t = L.teams.slice().sort((a, b) => O.capRoom(L, b) - O.capRoom(L, a))[0];
    p.prospect = false; p.career = 1; p.undrafted = true; p.team = t.i; t.roster.push(p.pid);
    p.contract = { total: 2, years: 2, left: 2 };
  }
  runFreeAgency(L);
  startSeason(L);
}
function runFreeAgency(L) {
  if (L.off.step !== 'fa') return;
  while (!L.off.fa.done) O.resolveRound(L);
  O.nextStep(L); // fa → ready (AI teams fill and trim)
  // Every team must have 10; AI cleanup handles it. If yours is over, the
  // lowest-power card that isn't you is cut.
  const t = myTeam(L);
  while (t && t.roster.length > R.ROSTER_SIZE) {
    const cut = t.roster.map((pid) => L.players[pid]).filter((x) => !x.me).sort((a, b) => a.power - b.power)[0];
    O.release(L, cut.pid);
  }
}
function startSeason(L) {
  R.resetForSeason(L);
  if (R.hooks.preseason) { try { R.hooks.preseason(L); } catch { /* media is optional */ } }
  L.career.trained = null;
  L.career.log.unshift({ season: L.season, week: 0, text: `Season ${L.season} begins with ${myTeam(L).name}.` });
}

// ---------- The week ----------
export function myGame(L) {
  const t = myTeam(L); if (!t) return null;
  if (L.phase === 'season') return L.schedule[L.week - 1]?.find((g) => !g.result && (g.home === t.i || g.away === t.i)) || null;
  if (L.phase === 'playoffs') return R.playoffGameForUser(L, t.i);
  return null;
}
// Coach trust (0–100, starts at 50) decides how often you get the start when
// you aren't one of the five best. Good grades and wins earn it.
export const TRUST_MOVE = { 'A+': 8, A: 5, B: 2, C: 0, D: -2, F: -4 };
export const trustOf = (L) => L.career.trust ?? 50;
// Your chance to start this week (1 if you're already in the coach's five).
export function startChance(L) {
  const t = myTeam(L); const p = me(L);
  if (!t || !R.available(p)) return 0;
  const five = R.aiStarters(L, t);
  if (five.some((x) => x.pid === p.pid)) return 1;
  const weakest = Math.min(...five.map((x) => R.effPower(L, x)));
  return clamp(0.5 + (R.effPower(L, p) - weakest) / 30 + (trustOf(L) - 50) / 100, 0.35, 0.95);
}
// Decide once per week (kept in L.career.startWeek so a reload doesn't reroll).
export function startsThisWeek(L) {
  const k = trainKey(L);
  if (L.career.startWeek?.k !== k) L.career.startWeek = { k, yes: R.nextRand(L) < startChance(L) };
  return L.career.startWeek.yes && R.available(me(L));
}
export const isStarter = (L) => startsThisWeek(L);

// Your approach for the fight (only matters if you start).
export const APPROACHES = {
  hard: { label: 'Go hard', line: '+3 Power for this fight. You come out more worn down.', power: 3, fatigue: 8 },
  balanced: { label: 'Play your game', line: 'No bonus, no cost.', power: 0 },
  smart: { label: 'Stay smart', line: '+12 Clutch for this fight.', clutch: 12 },
  show: { label: 'Showtime', line: '+12 Aura for this fight, and extra Hype if you win.', aura: 12, hype: 3 },
};

// The two lineups for your team's game. The coach (AI) sets both.
export function lineupsFor(L, g) {
  const rand = () => R.nextRand(L);
  const out = { home: R.aiOrder(L, L.teams[g.home], rand), away: R.aiOrder(L, L.teams[g.away], rand) };
  const p = me(L); const side = g.home === p.team ? 'home' : 'away';
  const mine = out[side];
  if (startsThisWeek(L) && !mine.includes(p.pid)) {
    // You take the spot of the same-role starter, or the weakest one.
    const cards = mine.map((pid) => L.players[pid]);
    const same = cards.filter((x) => x.role === p.role).sort((a, b) => R.effPower(L, a) - R.effPower(L, b))[0];
    const out1 = same || cards.slice().sort((a, b) => R.effPower(L, a) - R.effPower(L, b))[0];
    mine[mine.indexOf(out1.pid)] = p.pid;
  } else if (!startsThisWeek(L) && mine.includes(p.pid)) {
    // Coach sat you this week: the best bench card plays.
    const bench = myTeam(L).roster.map((pid) => L.players[pid]).filter((x) => !mine.includes(x.pid) && R.available(x)).sort((a, b) => R.effPower(L, b) - R.effPower(L, a))[0];
    if (bench) mine[mine.indexOf(p.pid)] = bench.pid;
  }
  return out;
}
// Fight cards for the battle view, with your approach applied to your card.
export function cardsFor(L, g, lineups, approach) {
  const big = !!R.isRivalry(g.home, g.away, L) || L.phase === 'playoffs';
  const a = APPROACHES[approach] || APPROACHES.balanced;
  const card = (pid) => {
    const c = R.fightCard(L, L.players[pid], { big });
    if (pid === L.career.pid) {
      if (a.power) c.powerLevel = Math.min(99, c.powerLevel + a.power);
      if (a.clutch) c.clutch = Math.min(100, (c.clutch || 50) + a.clutch);
      if (a.aura) c.aura = Math.min(100, (c.aura || 50) + a.aura);
      c.isMe = true;
    }
    return c;
  };
  return { home: lineups.home.map(card), away: lineups.away.map(card) };
}

// After your team's game: record it, sim the rest, end the week.
// res is the battle-view result from the home side's point of view (or null
// to sim it here).
export function finishGame(L, g, lineups, approach, res = null) {
  const p = me(L); const t = myTeam(L);
  const played = lineups.home.includes(p.pid) || lineups.away.includes(p.pid);
  if (res) R.playGame(L, g, lineups, { result: res, events: res.events });
  else R.playGame(L, g, lineups);
  const won = g.result.winner === t.i;
  const a = APPROACHES[approach] || APPROACHES.balanced;
  if (played) {
    if (a.fatigue) p.fatigue = Math.min(100, p.fatigue + a.fatigue);
    if (a.hype && won) p.hype = Math.min(100, p.hype + a.hype);
  }
  const gr = played ? grade(L, g, p.pid) : null;
  if (played) L.career.trust = clamp(trustOf(L) + TRUST_MOVE[gr] + (won ? 1 : 0), 0, 100);
  const line = g.result.lines[p.pid] || null;
  const opp = g.home === t.i ? g.away : g.home;
  const entry = { season: L.season, week: L.phase === 'playoffs' ? null : L.week, round: L.phase === 'playoffs' ? R.roundLabel(L.playoffs, g) : null, opp, won, score: won ? [Math.max(...g.result.score), Math.min(...g.result.score)] : [Math.min(...g.result.score), Math.max(...g.result.score)], played, approach: played ? approach : null, line, grade: gr, trust: trustOf(L), mvp: g.result.mvp === p.pid };
  L.career.games.unshift(entry);
  L.career.games = L.career.games.slice(0, 60);
  if (L.phase === 'season') {
    R.simWeek(L, false);
    R.endWeek(L);
    L.career.trained = null;
  } else {
    R.simPlayoffs(L, true, t.i);
  }
  return entry;
}
// A letter grade for your night: your damage against your teammates', plus KOs.
export function grade(L, g, pid) {
  const lines = g.result.lines;
  const side = g.result.home.includes(pid) ? g.result.home : g.result.away;
  const dmg = side.map((x) => lines[x]?.[0] || 0);
  const avg = dmg.reduce((a, b) => a + b, 0) / Math.max(1, dmg.length);
  const mine = lines[pid] || [0, 0, 0];
  // Graded against what a card of your Power should do: a rookie isn't failed
  // for doing less than the team's stars.
  const pw = (x) => R.effPower(L, L.players[x]);
  const avgPw = side.reduce((n, x) => n + pw(x), 0) / Math.max(1, side.length);
  const handicap = Math.min(1.6, Math.max(1, (avgPw / Math.max(1, pw(pid))) ** 2));
  const score = (avg ? (mine[0] / avg) * handicap : 1) + mine[1] * 0.35 + (g.result.mvp === pid ? 0.4 : 0);
  return score >= 1.7 ? 'A+' : score >= 1.35 ? 'A' : score >= 1.1 ? 'B' : score >= 0.85 ? 'C' : score >= 0.6 ? 'D' : 'F';
}
// Not in the lineup (or hurt): the week sims.
export function simMyWeek(L) {
  const g = myGame(L);
  if (!g) return null;
  return finishGame(L, g, lineupsFor(L, g), 'balanced', null);
}

// ---------- Training: once a week, you pick ----------
export const TRAIN = {
  power: { label: 'Power', line: 'Every second Power session: +1 skill point (+1 Power if you are under your max).' },
  aura: { label: 'Aura', line: '+1 Aura.' },
  clutch: { label: 'Clutch', line: '+1 Clutch.' },
};
export const trainKey = (L) => `${L.season}:${R.gameWeek(L)}`;
export const canTrain = (L) => (L.phase === 'season' || L.phase === 'playoffs') && L.career.trained !== trainKey(L) && me(L).injury <= 0;
export function train(L, stat) {
  if (!canTrain(L)) return null;
  const p = me(L);
  let text;
  if (stat === 'power') {
    L.career.powerReps = (L.career.powerReps || 0) + 1;
    if (L.career.powerReps % 2 === 0) { p.sp = (p.sp || 0) + 1; const n = R.spendPoints(p); text = n ? '+1 Power' : '+1 skill point (you are at your max)'; }
    else text = 'Halfway to your next Power point';
  } else { p[stat] = Math.min(100, (p[stat] || 50) + 1); text = `+1 ${TRAIN[stat].label}`; }
  L.career.trained = trainKey(L);
  return text;
}

// ---------- Season's end ----------
export const myAlive = (L) => R.userAlive(L, myTeam(L)?.i);
// Finish the playoffs (if you're out), close the season, run the off-season
// for every team (you re-sign automatically in phase 1) and start the next.
export function closeSeason(L) {
  const t = myTeam(L);
  if (L.phase === 'playoffs' && L.playoffs.champion == null) R.simPlayoffs(L, false);
  const row = R.endSeason(L);
  const p = me(L);
  const sum = { season: row.season, team: t.i, w: t.w, l: t.l, stats: { ...p.stats }, power: p.power, champion: row.champion === t.i, gpt: row.prodigy === p.pid, roy: row.roy === p.pid, breakout: (row.breakouts || []).includes(p.pid) };
  L.career.seasons = [sum, ...(L.career.seasons || [])];
  return sum;
}
export function nextSeason(L) {
  O.startOffseason(L);
  const p = me(L);
  // Phase 1: your team keeps you. If your deal is up, you re-sign for what you ask.
  while (L.off.step !== 'draft') {
    if (L.off.step === 'resign' && p.contract && p.contract.left <= 0) {
      const per = Math.min(R.maxDeal(), Math.max(1.2, O.asking(p))); p.contract = { total: Math.round(per * 3 * 10) / 10, years: 3, left: 3 };
    }
    O.nextStep(L);
  }
  O.simDraft(L, false);
  O.nextStep(L); // draft → fa
  runFreeAgency(L);
  startSeason(L);
}
