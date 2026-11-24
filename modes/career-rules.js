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
export const TRUST_MOVE = { 'A+': 4, A: 3, B: 1, C: 0, D: -3, F: -5 };
export const trustOf = (L) => L.career.trust ?? 50;
// Your chance to start this week (1 if you're already in the coach's five).
// v0.39.0: a top-7 pick starts every game of his rookie season: the team
// took him that high to play him now.
export const TOP_PICK = 7;
export const topPickRookie = (L) => { const p = me(L); return p.career === 1 && p.draftPick != null && p.draftPick <= TOP_PICK && p.draftSeason === L.season - 1; };
export function startChance(L) {
  const t = myTeam(L); const p = me(L);
  if (!t || !R.available(p)) return 0;
  if (topPickRookie(L)) return 1;
  const five = R.aiStarters(L, t);
  if (five.some((x) => x.pid === p.pid)) return 1;
  const weakest = Math.min(...five.map((x) => R.effPower(L, x)));
  return clamp(0.5 + (R.effPower(L, p) - weakest) / 30 + (trustOf(L) - 50) / 100 + promiseBoost(L), 0.42, 0.95);
}
// ---------- Your standing with the coach (v0.39.0) ----------
export const TRUST_TIERS = [[85, 'Franchise cornerstone'], [70, 'Go-to fighter'], [50, 'Trusted'], [30, 'Unproven'], [0, 'In the doghouse']];
export const trustLabel = (L) => TRUST_TIERS.find(([n]) => trustOf(L) >= n)[1];
// Your role on the team right now.
export function standing(L) {
  const t = myTeam(L); const p = me(L);
  if (!t) return 'Prospect';
  if (topPickRookie(L)) return 'Day-one starter';
  const role = roleOn(L, t);
  if (role === 'Starter' && trustOf(L) >= 85) return 'Franchise player';
  if (role === 'Starter') return 'Starter';
  return role === 'Rotation' || startChance(L) >= 0.6 ? 'Rotation' : 'Bench';
}
// Coach promises from a talk last 3 game weeks.
const active = (L, x) => x && x.season === L.season && R.gameWeek(L) < x.until;
export const promiseBoost = (L) => (active(L, L.career.promise) ? 0.15 : 0);
export const leadsOff = (L) => active(L, L.career.lead);
export const focusStat = (L) => (active(L, L.career.focus) ? L.career.focus.stat : null);

// ---------- Talks with the coach: one every 3 weeks ----------
export const TALK_EVERY = 3;
export const canTalk = (L) => (L.phase === 'season' || L.phase === 'playoffs') && !!myTeam(L) && (!L.career.talk || L.career.talk.season !== L.season || R.gameWeek(L) - L.career.talk.week >= TALK_EVERY);
export const nextTalkWeek = (L) => (L.career.talk && L.career.talk.season === L.season ? L.career.talk.week + TALK_EVERY : R.gameWeek(L));
const recentGrades = (L, n = 3) => L.career.games.filter((g) => g.played && g.season === L.season).slice(0, n).map((g) => g.grade);
const goodRun = (L) => { const gs = recentGrades(L); return gs.length >= 2 && gs.filter((g) => g === 'A+' || g === 'A' || g === 'B').length >= 2; };
export const TALKS = {
  starts: { label: 'Ask for more starts', line: 'Works if he trusts you or you\'ve been playing well. If not, it costs trust.' },
  lead: { label: 'Ask to lead off', line: 'Fight first in the lineup for 3 weeks. He needs to trust you (60+).' },
  work: { label: 'Ask what to work on', line: 'He names a stat. Training it counts double for 3 weeks.' },
  allin: { label: 'Tell him you\'re all in', line: 'No ask. A small trust bump.' },
};
const say = (L, k, rand) => { const xs = COACH_LINES[k]; return xs[Math.floor(rand() * xs.length)]; };
const COACH_LINES = {
  startsYes: ['You\'ve earned it. You\'ll see more of the floor.', 'Keep this up and I can\'t keep you on the bench.', 'Alright. I\'m giving you more chances. Don\'t waste them.'],
  startsNo: ['Earn it in practice first.', 'Minutes aren\'t handed out. Show me.', 'Not yet. Your grades tell me you\'re not ready.'],
  startsAlready: ['You already start every week. Just keep winning.', 'You\'re one of my five. Nothing to ask for.'],
  leadYes: ['You want the first fight? It\'s yours. Set the tone.', 'Lead us off. Make them feel it early.'],
  leadNo: ['First fight goes to someone I trust. That isn\'t you yet.', 'Win me some games and we\'ll talk about leading off.'],
  work: { power: ['Your Power. You get pushed around in there.', 'Get stronger. Power wins exchanges.'], aura: ['Aura. Your specials come too late.', 'Presence. Work on your Aura.'], clutch: ['Clutch. You fade when it matters.', 'Finish fights. Work on your Clutch.'] },
  allin: ['That\'s what I like to hear.', 'Good. The team needs that.', 'Then show me every week.'],
};
export function talk(L, kind, rand = Math.random) {
  if (!canTalk(L)) return null;
  const p = me(L); const coach = myTeam(L).coachName;
  const until = R.gameWeek(L) + TALK_EVERY;
  let ok = true; let line; let effect = '';
  if (kind === 'starts') {
    if (startChance(L) >= 1) { line = say(L, 'startsAlready', rand); effect = 'You already start every week.'; }
    else if (trustOf(L) >= 55 || goodRun(L)) { L.career.promise = { season: L.season, until }; line = say(L, 'startsYes', rand); effect = 'Start chance +15% for 3 weeks.'; }
    else { ok = false; L.career.trust = clamp(trustOf(L) - 4, 0, 100); line = say(L, 'startsNo', rand); effect = 'Trust −4.'; }
  } else if (kind === 'lead') {
    if (trustOf(L) >= 60) { L.career.lead = { season: L.season, until }; line = say(L, 'leadYes', rand); effect = 'You fight first for 3 weeks (when you start).'; }
    else { ok = false; L.career.trust = clamp(trustOf(L) - 2, 0, 100); line = say(L, 'leadNo', rand); effect = 'Trust −2.'; }
  } else if (kind === 'work') {
    const gap = { power: (R.maxOf(p) - p.power) / 2, aura: (70 - p.aura) / 4, clutch: (70 - p.clutch) / 4 };
    const stat = Object.entries(gap).sort((a, b) => b[1] - a[1])[0][0];
    L.career.focus = { season: L.season, until, stat };
    L.career.trust = clamp(trustOf(L) + 1, 0, 100);
    const xs = COACH_LINES.work[stat]; line = xs[Math.floor(rand() * xs.length)]; effect = `Training ${TRAIN[stat].label} counts double for 3 weeks. Trust +1.`;
  } else {
    L.career.trust = clamp(trustOf(L) + 3, 0, 100); line = say(L, 'allin', rand); effect = 'Trust +3.';
  }
  L.career.talk = { season: L.season, week: R.gameWeek(L), kind, ok, line, effect, coach };
  return L.career.talk;
}
// What the coach says after your fight (great or bad nights only).
export function coachReact(L, entry, rand = Math.random) {
  if (!entry.played) return null;
  const pick = (xs) => xs[Math.floor(rand() * xs.length)];
  if (entry.grade === 'A+') return pick(['That\'s the one. That\'s why you\'re here.', 'Big night. Keep that up.', 'Film room is going to love that.']);
  if (entry.grade === 'F') return pick(['That wasn\'t you out there. Fix it.', 'We need more than that.', 'Shake it off. Next week matters more.']);
  if (entry.mvp) return pick(['Game MVP. Good work.', 'You carried us tonight.']);
  return null;
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
  // You asked to lead off and he said yes: you fight first.
  if (leadsOff(L) && mine.includes(p.pid)) { mine.splice(mine.indexOf(p.pid), 1); mine.unshift(p.pid); }
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
      // v0.41.0: snap streak bonus from your phone.
      if (L.career.boost?.k === trainKey(L) && L.career.boost.aura) c.aura = Math.min(100, (c.aura || 50) + L.career.boost.aura);
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
  // Trust slowly settles back toward 60: you have to keep earning it.
  L.career.trust = Math.round(trustOf(L) + (60 - trustOf(L)) * 0.06);
  const line = g.result.lines[p.pid] || null;
  const opp = g.home === t.i ? g.away : g.home;
  const entry = { season: L.season, week: L.phase === 'playoffs' ? null : L.week, round: L.phase === 'playoffs' ? R.roundLabel(L.playoffs, g) : null, opp, won, score: won ? [Math.max(...g.result.score), Math.min(...g.result.score)] : [Math.min(...g.result.score), Math.max(...g.result.score)], played, approach: played ? approach : null, line, grade: gr, trust: trustOf(L), mvp: g.result.mvp === p.pid };
  L.career.games.unshift(entry);
  L.career.games = L.career.games.slice(0, 60);
  if (L.phase === 'season') {
    R.simWeek(L, false);
    entry.potw = playerOfWeek(L);
    R.endWeek(L);
    L.career.trained = null;
  } else {
    R.simPlayoffs(L, true, t.i);
  }
  return entry;
}
// v0.39.0: Player of the Week, league-wide: the best line of the week
// (damage, knockouts, specials, and a bonus for winning).
export function playerOfWeek(L) {
  const games = L.schedule[L.week - 1] || [];
  let best = null;
  for (const g of games) {
    if (!g.result?.lines) continue;
    for (const [pid, ln] of Object.entries(g.result.lines)) {
      const won = (g.result.winner === g.home ? g.result.home : g.result.away).includes(Number(pid));
      const v = ln[0] / 1000 + ln[1] * 3 + ln[2] * 1.5 + (won ? 4 : 0);
      if (!best || v > best.v) best = { pid: Number(pid), v };
    }
  }
  if (!best) return null;
  const q = L.players[best.pid];
  const out = { pid: q.pid, name: q.name, team: q.team, week: L.week, me: !!q.me };
  L.career.lastPotw = out;
  if (q.me) { L.career.potw = (L.career.potw || 0) + 1; L.career.potwSeason = (L.career.potwSeason || 0) + 1; addTrophy(L, `Player of the Week (Week ${L.week})`, 'potw'); }
  return out;
}
export function addTrophy(L, name, kind) {
  if (!L.career.trophies) L.career.trophies = [];
  L.career.trophies.unshift({ season: L.season, name, kind });
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
  return score >= 2.3 ? 'A+' : score >= 1.75 ? 'A' : score >= 1.3 ? 'B' : score >= 0.9 ? 'C' : score >= 0.6 ? 'D' : 'F';
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
  const twice = focusStat(L) === stat;
  if (stat === 'power') {
    L.career.powerReps = (L.career.powerReps || 0) + (twice ? 2 : 1);
    if (L.career.powerReps % 2 === 0) { p.sp = (p.sp || 0) + 1; const n = R.spendPoints(p); text = n ? '+1 Power' : '+1 skill point (you are at your max)'; }
    else text = 'Halfway to your next Power point';
    if (twice) text += ' (coach\'s focus: double)';
  } else { const n = twice ? 2 : 1; p[stat] = Math.min(100, (p[stat] || 50) + n); text = `+${n} ${TRAIN[stat].label}${twice ? ' (coach\'s focus: double)' : ''}`; }
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
  const sum = { season: row.season, career: p.career, team: t.i, w: t.w, l: t.l, stats: { ...p.stats }, power: p.power, champion: row.champion === t.i, gpt: row.prodigy === p.pid, roy: row.roy === p.pid, breakout: (row.breakouts || []).includes(p.pid),
    role: row.roleAwards?.[p.role] === p.pid ? R.AWARDS[p.role] : null, allAfl: (row.allAfl || []).includes(p.pid), awakening: row.awakening === p.pid, phoenix: row.phoenix === p.pid,
    potw: L.career.potwSeason || 0, trust: trustOf(L), standing: (() => { const share = p.stats.gp / Math.max(1, t.w + t.l); return share >= 0.85 ? (trustOf(L) >= 85 ? 'Franchise player' : 'Starter') : share >= 0.35 ? 'Rotation' : 'Bench'; })() };
  L.career.potwSeason = 0;
  if (sum.champion) addTrophy(L, 'The Celestial Grail (champion)', 'title');
  if (sum.gpt) addTrophy(L, R.AWARDS.prodigy, 'gpt');
  if (sum.roy) addTrophy(L, 'Rookie of the Year', 'roy');
  if (sum.role) addTrophy(L, `${sum.role} (best ${p.role})`, 'role');
  if (sum.allAfl) addTrophy(L, 'All-AFL First Team', 'allafl');
  if (sum.awakening) addTrophy(L, R.AWARDS.awakening, 'awakening');
  if (sum.phoenix) addTrophy(L, R.AWARDS.phoenix, 'phoenix');
  if (sum.breakout) addTrophy(L, 'Breakout jump', 'breakout');
  L.career.seasons = [sum, ...(L.career.seasons || [])];
  return sum;
}
// Career totals across every finished season (plus this one so far).
export function careerTotals(L) {
  const all = [...(L.career.seasons || []).map((x) => x.stats), (L.phase !== 'offseason' && !L.career.over) ? me(L).stats : null].filter(Boolean);
  const t = { gp: 0, dmg: 0, ko: 0, sp: 0, w: 0, l: 0 };
  for (const s of all) for (const k of Object.keys(t)) t[k] += s[k] || 0;
  return t;
}
// ---------- The off-season (v0.40.0: your contract is yours to decide) ----------
// L.career.off: null, or { stage: 'resign', offer } or { stage: 'fa', offers }.
const r1 = (x) => Math.round(x * 10) / 10;
export const contractLine = (p) => (p.contract ? `${R.capHit(p)} a season · ${p.contract.left} season${p.contract.left === 1 ? '' : 's'} left` : 'No contract');
// Where you'd stand on a team: Starter if you'd be in their five, else Rotation or Bench.
export function roleOn(L, t, p = me(L)) {
  // Ask the coach's own lineup logic, with you on that roster.
  const roster = t.roster.includes(p.pid) ? t.roster : [...t.roster, p.pid];
  const five = R.aiStarters(L, { ...t, roster });
  if (five.some((x) => x.pid === p.pid)) return 'Starter';
  const weakest = Math.min(...five.map((x) => R.effPower(L, x)));
  return R.effPower(L, p) >= weakest - 6 ? 'Rotation' : 'Bench';
}
// Start the off-season and stop at re-signing if your deal is up.
export function beginOffseason(L) {
  O.startOffseason(L);
  const p = me(L);
  while (L.off.step !== 'resign' && L.off.step !== 'draft') O.nextStep(L);
  if (L.off.step === 'resign' && p.contract && p.contract.left <= 0) {
    L.career.off = { stage: 'resign', offer: teamOffer(L) };
    return 'resign';
  }
  finishOffseason(L);
  return null;
}
// Your team's offer: your ask, scaled by how much the coach trusts you and
// how much room they have.
export function teamOffer(L) {
  const p = me(L); const t = myTeam(L);
  const ask = O.asking(p);
  const per = r1(Math.min(R.maxDeal(), Math.max(1.2, ask * (0.82 + trustOf(L) / 400))));
  const room = O.capCheck(L, t, per, [p.pid]).ok;
  return { team: t.i, per: room ? per : r1(Math.max(1.2, Math.min(per, O.capRoom(L, t) + R.capHit(p)))), years: Math.min(4, O.wantYears(p)), ask: r1(ask), role: roleOn(L, t) };
}
export function acceptResign(L) {
  const p = me(L); const o = L.career.off.offer;
  p.contract = { total: r1(o.per * o.years), years: o.years, left: o.years };
  L.career.log.unshift({ season: L.season, text: `Re-signed with ${myTeam(L).name}: ${o.per} a season for ${o.years}.` });
  L.career.off = null;
  finishOffseason(L);
}
// Test free agency: your team lets you go, the draft happens, then offers come in.
export function testMarket(L) {
  const p = me(L); const from = p.team;
  const old = L.career.off.offer;
  O.letGo(L, p.pid);
  while (L.off.step !== 'fa') O.nextStep(L);
  L.career.off = { stage: 'fa', offers: marketOffers(L, from, old) };
}
export function marketOffers(L, from, old) {
  const p = me(L); const rand = () => R.nextRand(L);
  const ask = O.asking(p);
  const out = [];
  for (const t of L.teams) {
    const need = !t.roster.some((pid) => L.players[pid].role === p.role) ? 6 : 0;
    const fit = (t.stage === 'contender' ? (p.power - 80) * 0.4 : t.stage === 'rebuild' ? (p.potential - p.power) * 0.4 + (p.career <= 3 ? 3 : 0) : 0) + need;
    const per = r1(Math.min(R.maxDeal(), Math.max(1.2, ask * (0.8 + rand() * 0.35 + fit / 60))));
    if (!O.capCheck(L, t, per).ok && O.capRoom(L, t) < 1.2) continue;
    const pay = r1(Math.max(1.2, Math.min(per, O.capRoom(L, t))));
    out.push({ team: t.i, per: pay, years: 1 + Math.floor(rand() * 4), role: roleOn(L, t), stage: t.stage, score: pay + fit + rand() * 4, former: t.i === from });
  }
  out.sort((a, b) => b.score - a.score);
  const list = out.filter((x) => !x.former).slice(0, 4);
  // Your old team stays in it, at their earlier offer if they still can.
  if (from != null && old) {
    const t = L.teams[from];
    if (O.capRoom(L, t) >= Math.min(old.per, 1.2)) list.push({ team: from, per: r1(Math.min(old.per, Math.max(1.2, O.capRoom(L, t)))), years: old.years, role: roleOn(L, t), stage: t.stage, former: true });
  }
  if (!list.length) {
    const t = L.teams.slice().sort((a, b) => O.capRoom(L, b) - O.capRoom(L, a))[0];
    list.push({ team: t.i, per: 1.2, years: 1, role: roleOn(L, t), stage: t.stage, former: t.i === from });
  }
  return list;
}
export function signWith(L, k) {
  const p = me(L); const o = L.career.off.offers[k]; const t = L.teams[o.team];
  p.team = t.i; t.roster.push(p.pid);
  p.contract = { total: r1(o.per * o.years), years: o.years, left: o.years };
  if (o.team !== p.formerTeam) { L.career.trust = 50; L.career.talk = null; L.career.promise = null; L.career.lead = null; L.career.focus = null; }
  L.career.log.unshift({ season: L.season, text: `Signed with ${t.name}: ${o.per} a season for ${o.years}.` });
  L.career.moves = [...(L.career.moves || []), { season: L.season, kind: 'signed', team: t.i, per: o.per, years: o.years }];
  L.career.off = null;
  runFreeAgency(L);
  startSeason(L);
}
// Everything after re-signing, for every team.
export function finishOffseason(L) {
  while (L.off.step !== 'draft') O.nextStep(L);
  O.simDraft(L, false);
  O.nextStep(L); // draft → fa
  runFreeAgency(L);
  startSeason(L);
}
export function nextSeason(L) { if (!beginOffseason(L)) return null; return L.career.off.stage; }

// ---------- Trade requests (v0.40.0) ----------
// Once a season, before the Week 8 deadline. Pick a team that wants you; the
// front office says yes more often when you're not starting or the coach
// doesn't trust you. A no costs trust.
export const canAskTrade = (L) => L.phase === 'season' && L.week <= R.TRADE_DEADLINE && L.career.tradeAsk !== L.season && !!myTeam(L);
export function tradeSuitors(L) {
  const p = me(L); const mine = myTeam(L);
  const out = [];
  for (const t of L.teams) {
    if (t.i === mine.i) continue;
    // Their card of about your value, with a cap hit that works for them.
    const back = t.roster.map((pid) => L.players[pid]).filter((x) => R.available(x) && Math.abs(x.power - p.power) <= 6 && x.series !== p.series)
      .sort((a, b) => Math.abs(a.power - p.power) - Math.abs(b.power - p.power))[0];
    if (!back) continue;
    const okThem = R.payroll(L, t) - R.capHit(back) + R.capHit(p) <= R.capOf(t) + 0.5;
    const okUs = R.payroll(L, mine) - R.capHit(p) + R.capHit(back) <= R.capOf(mine) + 0.5;
    if (!okThem || !okUs) continue;
    if (O.seriesCount(L, t, p.series, [back.pid]) >= R.MAX_PER_SERIES) continue;
    out.push({ team: t.i, back: back.pid, role: roleOn(L, t), stage: t.stage, w: t.w, l: t.l });
  }
  const rand = () => R.nextRand(L);
  return out.sort(() => rand() - 0.5).slice(0, 3);
}
export function tradeOdds(L) {
  const st = standing(L);
  return clamp(0.3 + (st === 'Bench' ? 0.35 : st === 'Rotation' ? 0.2 : 0) + (trustOf(L) < 50 ? 0.15 : 0) - (trustOf(L) >= 80 ? 0.15 : 0), 0.1, 0.9);
}
export function askTrade(L, suitor) {
  const p = me(L); const from = myTeam(L);
  L.career.tradeAsk = L.season;
  if (R.nextRand(L) < tradeOdds(L)) {
    O.doTrade(L, from.i, suitor.team, [p.pid], [suitor.back]);
    L.career.trust = 55; L.career.talk = null; L.career.promise = null; L.career.lead = null; L.career.focus = null; L.career.startWeek = null;
    L.career.moves = [...(L.career.moves || []), { season: L.season, kind: 'traded', from: from.i, team: suitor.team, week: L.week }];
    L.career.log.unshift({ season: L.season, text: `Traded from ${from.name} to ${L.teams[suitor.team].name}.` });
    return { ok: true, team: suitor.team, back: suitor.back };
  }
  L.career.trust = clamp(trustOf(L) - 8, 0, 100);
  return { ok: false };
}
