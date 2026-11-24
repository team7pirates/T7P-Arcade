// DYNASTY release 2: the off-season, plus the in-season Front Office
// (trades up to the Week 8 deadline, emergency pickups, scouting).
// Pure rules, no DOM, so it runs in Node too (see /home/claude/sim).
//
// Off-season order (Khalil, 2026-11-16):
//   (fired? pick a new job) → retirements → awards night → re-sign →
//   development upgrades → the draft → free agency (3 rounds) → new season.

import * as R from './dynasty-rules.js';
import * as LG from './dynasty-legacy.js';

const { ROLES, CAP, ROSTER_SIZE, MAX_PER_SERIES, SCOUT_COST } = R;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r1 = (n) => Math.round(n * 10) / 10;
const randOf = (L) => () => R.nextRand(L);
const roster = (L, t) => t.roster.map((pid) => L.players[pid]);
export const seriesCount = (L, t, series, skip = []) => roster(L, t).filter((p) => p.series === series && !skip.includes(p.pid)).length;

export const DRAFT_SIZE = 72; // v0.36.0: was 48; 2 rounds × 32 teams = 64 picks
export const UPGRADES_PER_TEAM = 2;
// v0.19.0 (Khalil): salary follows the growth speed, 1x / 2x / 3x.
// Normal→Star doubles the cap hit; Star→Superstar is 1.5x more (3x the
// Normal price). The raise is capped at +6 a season per step, so a card on a
// big contract can't eat the whole cap.
export const UPGRADE_MULT = [2, 1.5];        // Normal→Star, Star→Superstar
export const UPGRADE_MAX_RAISE = 6;          // per season, per step
export const MIN_SALARY = 1;
export const FA_ROUNDS = 3;
export const FA_BAR = [66, 56, 42];          // interest a player needs to sign, by round
export const OFF_STEPS = ['retire', 'awards', 'resign', 'upgrade', 'draft', 'fa', 'ready'];
export const OFF_LABEL = { legacy: 'Legacy', fired: 'New job', retire: 'Retirements', awards: 'Awards night', resign: 'Re-sign', upgrade: 'Upgrades', draft: 'The draft', fa: 'Free agency', ready: 'New season' };

// Newcomer names: any culture, any world (Khalil's rule).
const NF = ['Kaito', 'Marcus', 'Aiko', 'Diego', 'Lena', 'Kwame', 'Yuna', 'Theo', 'Soren', 'Priya', 'Jalen', 'Mika', 'Rafael', 'Hana', 'Idris', 'Elio',
  'Noa', 'Kenji', 'Amara', 'Lucas', 'Sakura', 'Malik', 'Freya', 'Ren', 'Tariq', 'Ines', 'Haruto', 'Zion', 'Leila', 'Bastian', 'Chidi', 'Rio', 'Anya',
  'Mateo', 'Kiri', 'Omari', 'Sana', 'Viktor', 'Emi', 'Dante', 'Nia', 'Shun', 'Ezra', 'Yara', 'Arjun', 'Ingrid', 'Taro', 'Kai', 'Selene', 'Jun', 'Aaliyah'];
const NL = ['Asano', 'Brooks', 'Okoye', 'Fujimoto', 'Navarro', 'Lindgren', 'Mensah', 'Takahashi', 'Rivera', 'Kowalski', 'Hayashi', 'Duarte', 'Achebe',
  'Morimoto', 'Sinclair', 'Petrov', 'Kagami', 'Oyelaran', 'Castillo', 'Hoshi', 'Whitaker', 'Ibarra', 'Shimizu', 'Adeyemi', 'Kurosawa', 'Fontaine',
  'Mbatha', 'Yamada', 'Calloway', 'Ferreira', 'Takeuchi', 'Volkov', 'Nakashima', 'Obi', 'Lacroix', 'Tsukino', 'Haddad', 'Sorensen', 'Arakawa', 'Quarles'];

// ---------- The hard cap (v0.21.0) ----------
// Can team t add a deal paying `per` a season (after `drop` leave)? Rookie
// deals and minimum/bargain fills are allowed over the cap so a roster can
// always reach 10.
export function capCheck(L, t, per, drop = [], extra = 0) {
  const pay = R.payroll(L, t) - drop.reduce((n, pid) => n + R.capHit(L.players[pid]), 0) + extra;
  if (pay + per > R.capOf(t) + 0.05) return { ok: false, why: `That puts you over the ${R.capOf(t)} salary cap (room: ${r1(Math.max(0, R.capOf(t) - pay))}).` };
  if (R.isSupermax(per) && R.supermaxCount(L, t, drop) >= R.SUPERMAX_LIMIT) return { ok: false, why: `You already have ${R.SUPERMAX_LIMIT} supermax deals.` };
  return { ok: true };
}

// ---------- Small helpers ----------
export const asking = (p) => R.payFor(p.power, p.hype, p.lowKey);
export const capRoom = (L, t) => r1(R.capOf(t) - R.payroll(L, t));
export const openSpots = (L, t) => ROSTER_SIZE - t.roster.length;
// v0.36.0: with two draft picks your roster is often full by free agency, so
// you can sign up to 2 over and cut back to 10 before the season starts.
export const FA_OVER = 2;
export const faSpots = (L, t) => openSpots(L, t) + (L.user && t.i === L.user.team ? FA_OVER : 0);
export function wantYears(p) { return p.career <= 2 ? 4 : p.career <= 4 ? 3 : p.career <= 6 ? 2 : 1; }
const news = (L, item) => { L.news.unshift({ week: 0, off: true, ...item }); L.news = L.news.slice(0, 40); };

function setContract(p, perSeason, years) {
  p.contract = { total: r1(perSeason * years), years, left: years };
}

// ---------- Save migration ----------
export function migrate(L) {
  L.pantheon = L.pantheon || [];
  L.headshots = L.headshots || [];
  L.trades = L.trades || [];
  // v0.9.0 saves: careers were set so nobody could retire after season 1.
  if (!L.careersFixed) {
    const rand = randOf(L);
    for (const p of Object.values(L.players)) if (!p.prospect && !p.retired && p.careerLen) p.career = 1 + Math.floor(rand() * p.careerLen);
    L.careersFixed = true;
  }
  // v0.21.0: hard cap, so the old soft-cap penalties are gone.
  L.teams.forEach((t) => { t.dead = t.dead || 0; t.capPenalty = 0; t.overStreak = 0; t.forfeitPick = false; });
  R.setCapScale(L);
  if (L.user && L.user.scoutPts == null) L.user.scoutPts = L.phase === 'season' ? (L.week - 1) * R.SCOUT_WEEKLY : R.SCOUT_WEEKLY * R.WEEKS;
  if (!L.draftClass) buildDraftClass(L);
  return L;
}

// ---------- The draft class ----------
// Built at the start of each season, so you can scout all year. Every
// prospect wears the headshot of a card that retires at the end of this
// season (or an older retiree), under a brand-new name.
export function buildDraftClass(L) {
  const rand = randOf(L);
  const goingOut = Object.values(L.players).filter((p) => !p.retired && !p.prospect && p.careerLen && p.career >= p.careerLen);
  const faces = [];
  const seen = new Set();
  for (const p of goingOut) {
    if (!seen.has(p.cid)) { seen.add(p.cid); faces.push({ cid: p.cid, series: p.series, franchise: p.franchise, portrait: p.portrait, role: p.role, second: p.second }); }
  }
  // Shuffle with the league stream.
  for (let i = faces.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [faces[i], faces[j]] = [faces[j], faces[i]]; }
  const pool = (L.headshots || []).filter((f) => !seen.has(f.cid));
  while (faces.length < DRAFT_SIZE && pool.length) faces.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  // Thin year: borrow faces from veterans who are close to the end.
  const vets = Object.values(L.players).filter((p) => !p.retired && !p.prospect && !seen.has(p.cid) && p.careerLen && p.career >= p.careerLen - 1);
  while (faces.length < 64 && vets.length) { const v = vets.splice(Math.floor(rand() * vets.length), 1)[0]; seen.add(v.cid); faces.push({ cid: v.cid, series: v.series, franchise: v.franchise, portrait: v.portrait, role: v.role, second: v.second }); }
  const used = new Set(Object.values(L.players).map((p) => p.name));
  L.draftClass = faces.slice(0, DRAFT_SIZE).map((f) => {
    const p = makeProspect(L, f, rand, used);
    L.players[p.pid] = p;
    return p.pid;
  });
}

function prospectName(rand, used) {
  for (let k = 0; k < 300; k++) {
    const n = `${NF[Math.floor(rand() * NF.length)]} ${NL[Math.floor(rand() * NL.length)]}`;
    if (!used.has(n)) { used.add(n); return n; }
  }
  return `Prospect ${used.size}`;
}

function makeProspect(L, f, rand, used) {
  // v0.20.0 (Khalil): a deep scout shows 💎 (a gem: Star or Superstar, so
  // at least 2x growth), nothing (solid: could be any of the three), or a
  // broken 💎 (a bust: always Normal, 1x).
  const gen = rand() < 0.05;
  const bust = !gen && rand() < 0.12;
  const gem = gen || (!bust && rand() < 0.13);
  const dev = gen ? 2 : bust ? 0 : gem ? (rand() < 0.2 ? 2 : 1) : (() => { const x = rand(); return x < 0.8 ? 0 : x < 0.95 ? 1 : 2; })();
  const power = 60 + Math.floor(rand() * 17);
  const potential = gen ? 94 + Math.floor(rand() * 6) : bust ? power + Math.floor(rand() * 3) : Math.min(94, power + 6 + Math.floor(rand() * 15));
  const est = (potential - 62) / 7 + (rand() - 0.5) * 1.8;
  const iron = rand() < 0.05;
  return {
    pid: L.nextPid++, cid: f.cid, name: prospectName(rand, used), series: f.series, franchise: f.franchise, portrait: !!f.portrait,
    role: f.role, second: f.second || null, power, potential,
    aura: 40 + Math.floor(rand() * 20), clutch: 40 + Math.floor(rand() * 25), chaos: 30 + Math.floor(rand() * 40),
    dev, iron, career: 0, careerLen: iron ? 9 + Math.floor(rand() * 2) : 4 + Math.floor(rand() * 3),
    lowKey: rand() < 0.25, hype: 50, fatigue: 0, injury: 0, mileage: 0, team: null, contract: null, growth: 0,
    stats: { gp: 0, dmg: 0, ko: 0, sp: 0, w: 0, l: 0 }, lastStats: null,
    prospect: true, stars: clamp(Math.round(est), 1, 5), scout: 0, gen, bust, gem, aiEye: potential + Math.round((rand() - 0.5) * 8),
  };
}

// The deep-scout read. Older saves have no gem flag: Star+ counts as a gem.
export const isGem = (p) => !p.bust && (p.gem ?? (p.gen || p.dev >= 1));
export const scoutTag = (p) => (p.bust ? 'Broken diamond' : isGem(p) ? 'Diamond' : 'No read');
export const TAG_ICON = { Diamond: '💎', 'Broken diamond': '💔', 'No read': '—' };
export const TAG_HELP = { Diamond: 'A gem: Star or Superstar, at least 2x growth', 'Broken diamond': 'A bust: always Normal, 1x growth, tops out early', 'No read': 'Solid: could turn out Normal, Star or Superstar' };
// What the board shows you about a prospect.
export function prospectView(p) {
  if (p.bust && p.dev) p.dev = 0; // older saves: a bust is always Normal
  return {
    stars: p.stars, role: p.role, world: p.series,
    potential: p.scout >= 1 ? p.potential : null,
    tag: p.scout >= 2 ? scoutTag(p) : null,
  };
}

// Scouting: 6 points (3/4 of a week) reveals potential; a second report
// (the upgraded scout) reveals 💎 gem, nothing (solid) or 💔 bust.
export function scout(L, pid) {
  const p = L.players[pid]; const u = L.user;
  if (!p || !p.prospect || p.scout >= 2) return { ok: false, why: 'Nothing more to learn.' };
  if ((u.scoutPts || 0) < SCOUT_COST) return { ok: false, why: `Scouting costs ${SCOUT_COST} points. You get ${R.SCOUT_WEEKLY} a week.` };
  u.scoutPts -= SCOUT_COST; p.scout += 1;
  return { ok: true, level: p.scout };
}

// Worlds in the class, for the hex map.
export function classWorlds(L) {
  const m = new Map();
  for (const pid of L.draftClass || []) {
    const p = L.players[pid]; if (!p || !p.prospect) continue;
    const k = p.series; const w = m.get(k) || { world: k, franchise: p.franchise, n: 0, stars: 0 };
    w.n += 1; w.stars = Math.max(w.stars, p.stars); m.set(k, w);
  }
  return [...m.values()].sort((a, b) => b.n - a.n || a.world.localeCompare(b.world));
}

// ---------- 1. Start: age, contracts, cap check, retirements ----------
export function startOffseason(L) {
  for (const p of Object.values(L.players)) delete p.chamber; // v0.33.0: the Time Chamber empties
  migrate(L);
  L.phase = 'offseason';
  // A new league year: the cap (and every new contract) grows 5%.
  L.capScale = Math.round((L.capScale || 1) * R.CAP_GROWTH * 1000) / 1000;
  R.setCapScale(L);
  news(L, { kind: 'CAP', team: L.user?.team ?? 0, title: `The salary cap rises to ${R.capNow()}`, text: `Up 5% for the new league year. A supermax deal now tops out at ${R.maxDeal()} a season, and a team can carry ${R.SUPERMAX_LIMIT} of them.` });
  for (const t of L.teams) {
    t.overStreak = 0; t.forfeitPick = false; t.forfeitWhy = null; t.capPenalty = 0;
    t.dead = 0;                // last season's dead money is spent
    t.tagged = null;
    t.upgrades = 0;
  }
  prune(L);
  // Retirements: careers end on schedule; Iron Men last ~10 seasons.
  const retired = [];
  const inducted = [];
  for (const p of Object.values(L.players)) {
    if (p.retired || p.prospect) continue;
    if (p.career >= p.careerLen) {
      const t = p.team != null ? L.teams[p.team] : null;
      retired.push({ pid: p.pid, team: p.team, name: p.name, power: p.power, seasons: p.career, series: p.series, iron: p.iron });
      if (p.power >= 95) {
        L.pantheon.push({ pid: p.pid, cid: p.cid, name: p.name, series: p.series, power: p.power, seasons: p.career, team: p.team, season: L.season, portrait: p.portrait });
        inducted.push(p.pid);
      }
      if (t) t.roster = t.roster.filter((x) => x !== p.pid);
      p.retired = true; p.team = null; p.contract = null; p.retiredSeason = L.season;
      if (!L.draftClass.some((pid) => L.players[pid].cid === p.cid)) L.headshots.push({ cid: p.cid, series: p.series, franchise: p.franchise, portrait: p.portrait, role: p.role, second: p.second });
    }
  }
  L.headshots = L.headshots.slice(-160);
  // Everyone else gets a year older; contracts tick down.
  for (const p of Object.values(L.players)) {
    if (p.retired || p.prospect) continue;
    p.career += 1; p.mileage = (p.mileage || 0) + 8;
    if (p.contract) p.contract.left -= 1;
    if (p.team == null && p.contract) p.contract = null;
  }
  if (inducted.length) news(L, { kind: 'PANTHEON', team: L.players[inducted[0]].team ?? 0, title: `${inducted.map((pid) => L.players[pid].name).join(', ')} enter${inducted.length === 1 ? 's' : ''} the Generational Pantheon`, text: 'Retired at 95+ Power. The AFL will not see their like again.' });
  const big = retired.slice().sort((a, b) => b.power - a.power)[0];
  if (big) news(L, { kind: 'RETIRED', team: big.team ?? 0, title: `${big.name} retires after ${big.seasons} seasons`, text: `${retired.length} cards called it a career this off-season.` });
  const coaching = coachCarousel(L);
  const legacy = LG.checkEnd(L, retired);
  const steps = legacy ? ['retire', 'legacy', ...OFF_STEPS.slice(1)] : OFF_STEPS.slice();
  if (legacy) news(L, { kind: 'END OF AN ERA', team: L.players[L.lastLegends[0]]?.team ?? L.user.team, title: `${L.players[L.lastLegends[0]]?.name || 'The last legend'} retires. The legends are gone.`, text: 'The last of the original AFL characters has called it a career.' });
  L.off = { step: L.user?.security === 'Fired' ? 'fired' : 'retire', steps, legacy, retired, inducted, coaching, order: null, pick: 0, picks: [], fa: null };
  return L.off;
}

// Old retired cards nobody points at any more are dropped, so saves stay small.
function prune(L) {
  const keep = new Set();
  for (const row of L.history) {
    [row.prodigy, row.awakening, row.phoenix, ...Object.values(row.roleAwards || {})].forEach((pid) => pid != null && keep.add(pid));
  }
  for (const m of L.mags || []) {
    keep.add(m.cover?.pid); m.potm?.forEach((x) => keep.add(x.pid)); m.race?.forEach((x) => keep.add(x.pid)); if (m.spotlight) keep.add(m.spotlight.pid);
  }
  L.trades = (L.trades || []).slice(-30);
  for (const t of L.trades) [...t.aGot, ...t.bGot].forEach((pid) => keep.add(pid));
  Object.keys(L.user?.coached || {}).forEach((pid) => keep.add(Number(pid)));
  (L.lastLegends || []).forEach((pid) => keep.add(pid));
  for (const p of Object.values(L.players)) {
    if (p.retired && p.retiredSeason < L.season && !keep.has(p.pid)) delete L.players[p.pid];
  }
}

export function nextStep(L) {
  const o = L.off;
  if (o.step === 'fired') { o.step = 'retire'; return o.step; }
  const list = o.steps || OFF_STEPS;
  const i = list.indexOf(o.step);
  // Leaving a step settles it for every AI team.
  if (o.step === 'legacy' && !L.complete) LG.completeDynasty(L);
  if (o.step === 'resign') { releaseUnsigned(L, L.user.team); aiResign(L); }
  if (o.step === 'upgrade') aiUpgrades(L);
  if (o.step === 'draft') { finishDraft(L); }
  if (o.step === 'fa') { faCleanup(L); }
  o.step = list[Math.min(list.length - 1, i + 1)];
  if (o.step === 'draft' && !o.order) setDraftOrder(L);
  if (o.step === 'fa' && !o.fa) openFreeAgency(L);
  if (o.step === 'resign' && R.hooks.tamperWindow) R.hooks.tamperWindow(L);
  return o.step;
}

// ---------- AI coaches: hot seats, firings, retirements (v0.20.0) ----------
// Each AI coach has a career like a player: a set length, after which they
// retire. They're judged like you: rebuilds must improve, few-pieces teams
// must win 7 or make the playoffs, contenders must make the playoffs. Three
// misses and they're fired (two misses is a coin flip for a contender). A new
// coach is hired: sometimes a fired coach gets a second chance.
export function ensureCoach(L, t) {
  if (t.coach && t.coach.name === t.coachName) return t.coach;
  const r = () => R.nextRand(L);
  const len = 6 + Math.floor(r() * 12);
  t.coach = { name: t.coachName, career: Math.floor(r() * (len - 1)), len, tenure: 1 + Math.floor(r() * 4), miss: r() < 0.3 ? (r() < 0.35 ? 2 : 1) : 0, titles: 0, wins: 0, lastWins: t.w || 0, hired: L.season };
  return t.coach;
}
function newCoachName(L) {
  const used = new Set(L.teams.map((t) => t.coachName));
  for (let k = 0; k < 50; k++) {
    const n = `${NF[Math.floor(R.nextRand(L) * NF.length)]} ${NL[Math.floor(R.nextRand(L) * NL.length)]}`;
    if (!used.has(n) && !(L.coachPool || []).some((c) => c.name === n)) return n;
  }
  return `Coach ${L.season}-${Math.floor(R.nextRand(L) * 999)}`;
}
export function coachCarousel(L) {
  const changes = [];
  const seeds = L.playoffs?.seeds || [];
  L.coachPool = L.coachPool || [];
  for (const t of L.teams) {
    if (L.user && t.i === L.user.team) continue;
    const c = ensureCoach(L, t);
    const made = seeds.includes(t.i);
    const champ = L.playoffs?.champion === t.i;
    const met = t.stage === 'contender' ? made : t.stage === 'few' ? (t.w >= 7 || made) : (t.w > (c.lastWins ?? 0) || made);
    c.miss = met ? 0 : c.miss + 1;
    c.career += 1; c.tenure += 1; c.wins += t.w; if (champ) c.titles += 1;
    c.lastWins = t.w;
    let why = null;
    if (c.career >= c.len || (champ && c.career >= c.len - 3 && R.nextRand(L) < 0.35)) why = 'retired';
    else if (!champ && (c.miss >= 3 || (c.miss >= 2 && t.stage === 'contender' && R.nextRand(L) < 0.5))) why = 'fired';
    if (!why) continue;
    const old = { ...c };
    if (why === 'fired') L.coachPool.push({ name: c.name, career: c.career, len: c.len, titles: c.titles, wins: c.wins, from: t.i, season: L.season });
    // Hire: a second-chance coach 35% of the time, otherwise a new name.
    const pool = L.coachPool.filter((x) => x.from !== t.i && x.career < x.len - 1 && x.season < L.season + 1);
    let hire;
    if (pool.length && R.nextRand(L) < 0.35) {
      const pick = pool[Math.floor(R.nextRand(L) * pool.length)];
      L.coachPool = L.coachPool.filter((x) => x !== pick);
      hire = { name: pick.name, career: pick.career, len: pick.len, tenure: 0, miss: 0, titles: pick.titles, wins: pick.wins, lastWins: t.w, hired: L.season + 1, second: L.teams[pick.from].name };
    } else {
      const len = 6 + Math.floor(R.nextRand(L) * 12);
      hire = { name: newCoachName(L), career: 0, len, tenure: 0, miss: 0, titles: 0, wins: 0, lastWins: t.w, hired: L.season + 1 };
    }
    t.coachName = hire.name; t.coach = hire;
    const ch = { team: t.i, why, old: old.name, seasons: old.tenure, titles: old.titles, hire: hire.name, second: hire.second || null, record: `${t.w}-${t.l}` };
    changes.push(ch);
    news(L, why === 'retired'
      ? { kind: 'COACHING', team: t.i, title: `${old.name} retires. ${t.name} hire ${hire.name}`, text: `${old.name} walks away after ${old.career} seasons on the sideline${old.titles ? ` and ${old.titles} title${old.titles > 1 ? 's' : ''}` : ''}. ${hire.second ? `${hire.name} gets a second chance after ${hire.second}.` : `${hire.name} is a first-time head coach.`}` }
      : { kind: 'COACHING', team: t.i, title: `${t.name} fire ${old.name}`, text: `A ${t.w}-${t.l} season was the last straw. ${hire.second ? `${hire.name}, formerly of ${hire.second}, takes over.` : `${hire.name} takes over.`}` });
  }
  L.coachPool = L.coachPool.slice(-20);
  return changes;
}

// ---------- Fired: pick a new job ----------
export function jobsAfterFiring(L) {
  return R.openJobs(L).filter((i) => i !== L.user.team);
}
export function changeJob(L, ti) {
  const u = L.user;
  const old = L.teams[u.team];
  old.coachName = newCoachName(L);
  old.coach = null; ensureCoach(L, old); old.coach.career = 0; old.coach.tenure = 0;
  const t = L.teams[ti];
  const last = L.history[0];
  const rank = last.standings.findIndex((s) => s.i === ti) + 1;
  u.firedFrom = (u.firedFrom || []).concat(old.i);
  u.team = ti; u.missStreak = 0; u.security = 'Safe for now'; u.lastWins = t.w; u.expect = t.stage; u.lastRank = rank;
  u.priorCoaches = 2 + (ti * 7 + L.seed) % 5;
  t.coachName = u.coach;
  const art = R.hireArticle(L, ti, rank, u.priorCoaches);
  const fired = { kind: 'YOUR HIRE', title: `${old.name} fire ${u.coach}. ${t.name} pounce.`, text: `${u.coach} lasted ${u.career.filter((c) => c.team === old.i).length} seasons at ${old.name}. ${art.text}` };
  L.hireArticle = fired;
  news(L, { ...fired, team: ti });
  return fired;
}

// ---------- 2. Awards night ----------
// The awards themselves are set by endSeason (in dynasty-rules.js).

// ---------- 3. Re-sign ----------
export const expiring = (L, t) => roster(L, t).filter((p) => p.contract && p.contract.left <= 0);

// A player who just lost with a big name wants a little more.
export function askFor(L, p, t) {
  let a = asking(p);
  if (!p.lowKey && p.hype >= 60 && t.lastW != null && (t.w ?? t.lastW) < 6) a *= 1.15;
  // v0.29.0: another team tampered with them, so they want more.
  if (p.tampered?.season === L.season && p.team === t.i) a *= 1.15;
  return r1(a);
}
export function resign(L, pid, years) {
  const p = L.players[pid]; const t = L.teams[p.team];
  const chk = capCheck(L, t, askFor(L, p, t)); if (!chk.ok) return chk;
  setContract(p, askFor(L, p, t), clamp(years, 1, 4));
  return { ok: true, contract: p.contract };
}
export const tagPrice = (L, p) => r1(Math.min(R.maxDeal(), Math.max(asking(p) * 1.3, 8 * R.capScale())));
export function franchiseTag(L, pid) {
  const p = L.players[pid]; const t = L.teams[p.team];
  if (t.tagged != null) return false;
  if (!capCheck(L, t, tagPrice(L, p)).ok) return false;
  setContract(p, tagPrice(L, p), 1);
  p.tagged = L.season; t.tagged = pid;
  return true;
}
export function letGo(L, pid) {
  const p = L.players[pid]; const t = L.teams[p.team];
  t.roster = t.roster.filter((x) => x !== pid);
  p.team = null; p.contract = null; p.formerTeam = t.i;
}
function releaseUnsigned(L, ti) {
  for (const p of expiring(L, L.teams[ti])) letGo(L, p.pid);
}
function aiResign(L) {
  for (const t of L.teams) {
    if (L.user && t.i === L.user.team) continue;
    const exp = expiring(L, t).sort((a, b) => b.power - a.power);
    const kept = roster(L, t).filter((p) => !exp.includes(p));
    const median = [...roster(L, t)].sort((a, b) => a.power - b.power)[Math.floor(t.roster.length / 2)]?.power ?? 70;
    for (const p of exp) {
      // v0.29.0: a card you swayed won't re-sign.
      if (p.swayed?.season === L.season && p.swayed.team !== t.i) { letGo(L, p.pid); continue; }
      const ask = askFor(L, p, t);
      const pay = kept.reduce((n, q) => n + R.capHit(q), 0) + (t.dead || 0);
      const wanted = t.stage === 'rebuild' ? (p.career <= 3 && p.potential >= p.power + 4) || p.power >= median + 4
        : t.stage === 'contender' ? p.power >= median - 2 : p.power >= median;
      if (wanted && capCheck(L, t, ask).ok) { resign(L, p.pid, Math.min(wantYears(p), 3)); kept.push(p); }
      else if (wanted && t.tagged == null && p.power >= 86 && franchiseTag(L, p.pid)) { kept.push(p); news(L, { kind: 'TAGGED', team: t.i, title: `${t.name} tag ${p.name}`, text: `One more season, at ${tagPrice(L, p)}. The franchise tag keeps the star home.` }); }
      else letGo(L, p.pid);
    }
  }
}

// ---------- 4. Development upgrades ----------
// Normal→Star→Superstar, one step per card per off-season, up to 2 per
// team, first 4 seasons only. The contract left is raised ×2 or ×1.5 (max +6 a season).
export function canUpgrade(L, p) {
  const t = L.teams[p.team];
  if (!p.contract || p.contract.left < 1) return { ok: false, why: 'Not under contract' };
  if (p.dev >= 2) return { ok: false, why: 'Already a Superstar' };
  if (p.career > 4) return { ok: false, why: 'Only cards in their first 4 seasons' };
  if (p.upgraded === L.season) return { ok: false, why: 'One step per off-season' };
  if ((t.upgrades || 0) >= UPGRADES_PER_TEAM) return { ok: false, why: `${UPGRADES_PER_TEAM} upgrades a team` };
  const c = upgradeCost(p);
  const cap = capCheck(L, t, c.hitAfter, [p.pid]); if (!cap.ok) return { ok: false, why: cap.why.replace('That puts you', 'The raise puts you') };
  return { ok: true };
}
export function upgradeCost(p) {
  const left = p.contract.left; const rest = R.capHit(p) * left;
  const hit = R.capHit(p);
  const after = Math.min(hit * UPGRADE_MULT[p.dev], hit + UPGRADE_MAX_RAISE) * left;
  return { hitNow: R.capHit(p), hitAfter: r1(after / left), extra: r1((after - rest) / left), left };
}
export function upgrade(L, pid) {
  const p = L.players[pid]; const t = L.teams[p.team];
  const chk = canUpgrade(L, p); if (!chk.ok) return chk;
  const c = upgradeCost(p);
  p.contract = { total: r1(c.hitAfter * c.left), years: c.left, left: c.left };
  p.dev += 1; p.upgraded = L.season; t.upgrades = (t.upgrades || 0) + 1;
  p.revealed = true; // upgrading shows whether the card is a Generational Talent or a bust
  // v0.21.0 (Khalil): the upgrade raises the card's max. Star: up to +10.
  // Superstar: +5 or +10. Never past 99. Banked skill points can then fill it.
  const roll = R.nextRand(L);
  let raise = p.dev === 1 ? 2 + Math.floor(roll * 9) : roll < 0.6 ? 5 : 10;
  if (p.bust) raise = Math.ceil(raise / 2); // busts get half the raise
  const before = R.maxOf(p);
  p.potential = Math.min(99, Math.max(p.potential, p.power) + raise);
  if (!R.manualPoints(L, p)) R.spendPoints(p);
  return { ok: true, gen: !!p.gen, bust: !!p.bust, raise: R.maxOf(p) - before, max: R.maxOf(p) };
}
function aiUpgrades(L) {
  for (const t of L.teams) {
    if (L.user && t.i === L.user.team) continue;
    const cands = roster(L, t).filter((p) => canUpgrade(L, p).ok && p.potential - p.power >= 5).sort((a, b) => (b.potential - b.power) - (a.potential - a.power));
    for (const p of cands) {
      if ((t.upgrades || 0) >= UPGRADES_PER_TEAM) break;
      if (R.payroll(L, t) + upgradeCost(p).extra > R.capOf(t)) continue;
      if (t.stage === 'contender' && p.power < 80) continue;
      upgrade(L, p.pid);
    }
  }
}

// ---------- 5. The draft: 2 rounds (v0.36.0) ----------
// Round 2 goes in the same order. Traded picks are round-1 picks; every team
// keeps its own second-rounder (unless the league took its pick). Second-round
// picks sign cheap 2-season deals.
export const DRAFT_ROUNDS = 2;
export const R2_DEAL = { per: 1.2, years: 2 };
export function setDraftOrder(L) {
  const last = L.history[0];
  const po = L.playoffs;
  // Worst to best: non-playoff teams by record, then play-in losers,
  // quarterfinal losers, semifinal losers, the runner-up and the champion.
  const out = po ? R.playoffLosers(po) : { playin: [], quarters: [], semis: [] };
  const champ = last.champion; const runner = last.runnerUp;
  const byRec = (list) => last.standings.map((s) => s.i).filter((i) => list.includes(i)).reverse();
  const done = new Set([champ, runner, ...out.playin, ...out.quarters, ...out.semis]);
  const rest = last.standings.map((s) => s.i).filter((i) => !done.has(i)).reverse();
  const order = [...rest, ...byRec(out.playin), ...byRec(out.quarters), ...byRec(out.semis), runner, champ];
  const forfeit = order.filter((i) => L.teams[i].forfeitPick);
  forfeit.forEach((i) => news(L, { kind: L.teams[i].forfeitWhy === 'tampering' ? 'SCANDAL' : 'CAP', team: i, title: `${L.teams[i].name} lose their draft pick`, text: L.teams[i].forfeitWhy === 'tampering' ? 'Caught tampering this off-season. The league takes the pick.' : 'Over the soft cap two seasons running. The league takes the pick.' }));
  // v0.18.0: picks traded on the phone go to their new owner.
  const kept = order.filter((i) => !L.teams[i].forfeitPick);
  L.off.from = [...kept, ...kept];
  L.off.order = [...kept.map((i) => pickOwner(L, i)), ...kept];
  L.off.r1 = kept.length;
  kept.forEach((i) => { const o = pickOwner(L, i); if (o !== i) news(L, { kind: 'DRAFT', team: o, title: `${L.teams[o].name} pick for ${L.teams[i].name}`, text: `The pick came over in a trade during the season.` }); });
  L.pickOwner = {};
  L.off.pick = 0; L.off.picks = [];
}
// Who owns each team's pick in the next draft (team index -> owner index).
export const pickOwner = (L, ti) => (L.pickOwner && L.pickOwner[ti] != null ? L.pickOwner[ti] : ti);
export const picksOwnedBy = (L, owner) => L.teams.map((t) => t.i).filter((i) => pickOwner(L, i) === owner);
export const onTheClock = (L) => (L.off.order ? L.off.order[L.off.pick] : null);
export const draftBoard = (L) => (L.draftClass || []).map((pid) => L.players[pid]).filter((p) => p.prospect);

function rookieDeal(pick, round1 = Infinity) { return pick >= round1 ? { ...R2_DEAL } : { per: r1(clamp(5 - pick * 0.1, 1.6, 5)), years: 3 }; }
export const roundOfPick = (L, n) => (L.off.r1 != null && n >= L.off.r1 ? 2 : 1);
export const pickInRound = (L, n) => (roundOfPick(L, n) === 2 ? n - L.off.r1 : n) + 1;

export function makePick(L, ti, pid) {
  const p = L.players[pid]; const t = L.teams[ti];
  if (!p || !p.prospect) return false;
  if (seriesCount(L, t, p.series) >= MAX_PER_SERIES) return false;
  const n = L.off.pick;
  const deal = rookieDeal(n, L.off.r1 ?? Infinity);
  p.prospect = false; p.team = ti; p.career = 1; p.draftPick = n + 1; p.draftSeason = L.season; p.draftRound = roundOfPick(L, n);
  setContract(p, deal.per, deal.years);
  t.roster.push(pid);
  L.off.picks.push({ pick: n + 1, team: ti, pid, round: roundOfPick(L, n) });
  L.off.pick += 1;
  if (n === 0) news(L, { kind: 'DRAFT', team: ti, title: `${t.name} take ${p.name} first overall`, text: `A ${p.role} from ${p.series}. The headshot looks familiar. The name is brand new.` });
  return true;
}
function aiChoose(L, t, rand) {
  const need = new Set(ROLES.filter((r) => !roster(L, t).some((p) => p.role === r)));
  const board = draftBoard(L).filter((p) => seriesCount(L, t, p.series) < MAX_PER_SERIES);
  let best = null; let bv = -Infinity;
  for (const p of board) {
    const v = p.aiEye + (need.has(p.role) ? 4 : 0) + (t.stage === 'contender' ? p.power * 0.2 : 0) + rand() * 3;
    if (v > bv) { bv = v; best = p; }
  }
  return best;
}
export function simDraft(L, untilUser = true) {
  const rand = randOf(L);
  while (L.off.pick < L.off.order.length) {
    const ti = onTheClock(L);
    if (untilUser && L.user && ti === L.user.team) return ti;
    const p = aiChoose(L, L.teams[ti], rand);
    if (!p) { L.off.pick += 1; continue; }
    makePick(L, ti, p.pid);
  }
  return null;
}
function finishDraft(L) {
  if (L.off.order) simDraft(L, false);
  // Undrafted prospects become free agents.
  for (const p of draftBoard(L)) { p.prospect = false; p.career = 1; p.undrafted = true; }
  L.draftClass = [];
  // Every other retired headshot comes back as an undrafted newcomer, so the
  // league never runs short of cards.
  const extra = Math.max(0, (L.off.retired?.length || 0) - DRAFT_SIZE);
  addNewcomers(L, extra);
}
export function addNewcomers(L, n) {
  const rand = randOf(L);
  const used = new Set(Object.values(L.players).map((p) => p.name));
  const out = [];
  for (let k = 0; k < n; k++) {
    let f = L.headshots.length ? L.headshots.splice(Math.floor(rand() * L.headshots.length), 1)[0] : null;
    if (!f) { const r = Object.values(L.players).filter((p) => p.retired); if (!r.length) break; const q = r[Math.floor(rand() * r.length)]; f = { cid: q.cid, series: q.series, franchise: q.franchise, portrait: q.portrait, role: q.role, second: q.second }; }
    const p = makeProspect(L, f, rand, used);
    p.prospect = false; p.career = 1; p.undrafted = true; p.power -= 2;
    L.players[p.pid] = p; out.push(p.pid);
  }
  return out;
}

// ---------- 6. Free agency: 3 rounds with an interest meter ----------
export const faPool = (L) => Object.values(L.players).filter((p) => p.team == null && !p.retired && !p.prospect);
export const emergencyPool = (L) => faPool(L).filter((p) => p.power <= EMERGENCY_MAX_POWER);

// How much a player wants to join team t with this offer (0–100).
export function interest(L, p, t, offer) {
  const ask = asking(p);
  const ratio = offer.per / ask;
  const parts = {};
  parts.money = clamp((ratio - 0.75) / 0.5, 0, 1) * 40;
  const wins = t.w;
  parts.winning = clamp(wins / 10, 0, 1) * (p.lowKey ? 26 : 18);
  const ahead = roster(L, t).filter((q) => q.role === p.role && q.power >= p.power).length;
  parts.time = (ahead === 0 ? 1 : ahead === 1 ? 0.45 : 0.1) * (p.lowKey ? 24 : 14);
  const same = seriesCount(L, t, p.series);
  parts.friends = (same === 0 ? 0 : same === 1 ? 0.6 : 1) * 8;
  const style = L.user && t.i === L.user.team ? L.user.quiz.style : null;
  const fits = style === 'attack' ? ['Striker', 'Speedster'] : style === 'defense' ? ['Tank'] : style === 'mind' ? ['Mystic', 'Tactician'] : [];
  parts.style = (fits.includes(p.role) ? 1 : 0.4) * 6;
  const buzz = roster(L, t).reduce((n, q) => n + q.hype + q.aura, 0) / Math.max(1, t.roster.length) / 2;
  parts.spotlight = p.lowKey ? 0 : clamp(buzz / 70, 0, 1) * clamp(p.aura / 60, 0.5, 1.4) * 9;
  if (L.user && t.i === L.user.team && L.user.rep) parts.legacy = LG.faPull(L.user.rep);
  // v0.29.0: tampering (yours or an AI team's) leaves the card leaning that way.
  if ((p.swayed?.season === L.season && p.swayed.team === t.i) || (p.tampered?.season === L.season && p.tampered.team === t.i)) parts.tamper = 14;
  const yrs = Math.abs((offer.years || wantYears(p)) - wantYears(p));
  const score = Object.values(parts).reduce((n, v) => n + v, 0) - yrs * 4;
  const blocked = same >= MAX_PER_SERIES ? `Already ${MAX_PER_SERIES} from ${p.series}` : null;
  return { score: blocked ? 0 : Math.round(clamp(score, 0, 100)), parts, ask: r1(ask), blocked };
}

export function openFreeAgency(L) {
  L.off.fa = { round: 1, offers: {}, results: [], done: false };
  return L.off.fa;
}
export function makeOffer(L, pid, per, years) {
  const fa = L.off.fa; const t = L.teams[L.user.team];
  per = Math.min(per, R.maxDeal());
  if (!fa.offers[pid] && Object.keys(fa.offers).length >= faSpots(L, t)) return { ok: false, why: `No room for more offers (you can go up to ${FA_OVER} over and cut later).` };
  // Every open offer has to fit under the cap at once.
  const others = Object.entries(fa.offers).filter(([k]) => Number(k) !== pid).map(([, o]) => o.per);
  const supers = others.filter((x) => R.isSupermax(x)).length;
  const chk = capCheck(L, t, r1(per), [], others.reduce((n, x) => n + x, 0));
  if (!chk.ok) return chk;
  if (R.isSupermax(per) && R.supermaxCount(L, t) + supers >= R.SUPERMAX_LIMIT) return { ok: false, why: `You already have ${R.SUPERMAX_LIMIT} supermax deals (counting your open offers).` };
  fa.offers[pid] = { per: r1(per), years };
  return { ok: true };
}
export const withdraw = (L, pid) => { delete L.off.fa.offers[pid]; };

function aiValue(L, t, p) {
  if (t.stage === 'rebuild') return p.potential * 0.6 + p.power * 0.4 - p.career * 1.5;
  if (t.stage === 'contender') return p.power + (p.hype - 50) * 0.04;
  const need = !roster(L, t).some((q) => q.role === p.role && q.power >= p.power - 2);
  return p.power + (need ? 5 : 0);
}

export function resolveRound(L) {
  const fa = L.off.fa; const rand = randOf(L);
  const pool = faPool(L);
  const bids = new Map(); // pid -> [{ti, per, years}]
  const add = (pid, b) => { if (!bids.has(pid)) bids.set(pid, []); bids.get(pid).push(b); };
  for (const [pid, o] of Object.entries(fa.offers)) add(Number(pid), { ti: L.user.team, per: o.per, years: o.years });
  for (const t of L.teams) {
    if (L.user && t.i === L.user.team) continue;
    const spots = openSpots(L, t); if (spots <= 0) continue;
    const room = R.capOf(t) - R.payroll(L, t);
    let supers = R.supermaxCount(L, t);
    const cands = pool.filter((p) => seriesCount(L, t, p.series) < MAX_PER_SERIES).sort((a, b) => aiValue(L, t, b) - aiValue(L, t, a)).slice(0, spots * 2 + fa.round);
    let budget = room;
    for (const p of cands) {
      const per = r1(asking(p) * (0.88 + rand() * 0.27 + (fa.round - 1) * -0.05));
      if (per > budget && per > MIN_SALARY) continue;
      if (R.isSupermax(per)) { if (supers >= R.SUPERMAX_LIMIT) continue; supers += 1; }
      budget -= per;
      add(p.pid, { ti: t.i, per: Math.max(MIN_SALARY, per), years: Math.min(wantYears(p), 3) });
    }
  }
  const bar = FA_BAR[fa.round - 1];
  const signed = [];
  const order = [...bids.keys()].map((pid) => L.players[pid]).sort((a, b) => b.power - a.power);
  for (const p of order) {
    const list = bids.get(p.pid)
      .filter((b) => faSpots(L, L.teams[b.ti]) > 0)
      .map((b) => ({ ...b, i: interest(L, p, L.teams[b.ti], b) }))
      .filter((b) => !b.i.blocked)
      .sort((a, b) => b.i.score - a.i.score);
    const top = list[0];
    const userBid = list.find((b) => L.user && b.ti === L.user.team);
    if (top && top.i.score >= bar) {
      const t = L.teams[top.ti];
      setContract(p, top.per, top.years);
      p.team = t.i; t.roster.push(p.pid);
      signed.push({ pid: p.pid, team: t.i, per: top.per, years: top.years, user: t.i === L.user?.team, beat: userBid && top.ti !== L.user.team ? userBid.i.score : null });
    } else if (userBid) {
      signed.push({ pid: p.pid, team: null, user: true, missed: true, score: userBid.i.score, bar });
    }
  }
  const big = signed.filter((s) => s.team != null).sort((a, b) => L.players[b.pid].power - L.players[a.pid].power)[0];
  if (big) news(L, { kind: 'SIGNED', team: big.team, title: `${L.teams[big.team].name} land ${L.players[big.pid].name}`, text: `${big.per} a season for ${big.years} season${big.years > 1 ? 's' : ''}. The biggest name in round ${fa.round} of free agency.` });
  fa.results.push({ round: fa.round, signed });
  fa.offers = {};
  if (fa.round >= FA_ROUNDS) fa.done = true; else fa.round += 1;
  return signed;
}

// After round 3: AI teams fill up with minimum deals.
function faCleanup(L) {
  if (L.off.fa && !L.off.fa.done) { while (!L.off.fa.done) resolveRound(L); }
  for (const t of L.teams) {
    if (L.user && t.i === L.user.team) continue;
    while (openSpots(L, t) > 0) {
      let p = faPool(L).filter((q) => seriesCount(L, t, q.series) < MAX_PER_SERIES).sort((a, b) => b.power - a.power)[0];
      if (!p) { const add = addNewcomers(L, 1); if (!add.length) break; p = L.players[add[0]]; }
      signMinimum(L, t.i, p.pid, bargainPrice(p));
    }
    while (openSpots(L, t) < 0) {
      const cut = roster(L, t).sort((a, b) => aiValue(L, t, a) - aiValue(L, t, b))[0];
      release(L, cut.pid);
    }
  }
}
export const BARGAIN = 0.6;          // leftovers after round 3 sign for 60% of their ask
export const EMERGENCY_MAX_POWER = 78; // in-season pickups are depth cards
export const bargainPrice = (p) => Math.max(MIN_SALARY, r1(asking(p) * BARGAIN));
export function signMinimum(L, ti, pid, per = MIN_SALARY) {
  const p = L.players[pid]; const t = L.teams[ti];
  setContract(p, per, 1);
  p.team = ti; t.roster.push(pid);
}
// Fill the user's empty spots with the best leftovers on 1-season bargain deals.
export function fillWithMinimum(L) {
  const t = L.teams[L.user.team]; const out = [];
  while (openSpots(L, t) > 0) {
    let p = faPool(L).filter((q) => seriesCount(L, t, q.series) < MAX_PER_SERIES).sort((a, b) => b.power - a.power)[0];
    if (!p) { const add = addNewcomers(L, 1); if (!add.length) break; p = L.players[add[0]]; }
    signMinimum(L, t.i, p.pid, bargainPrice(p)); out.push(p.pid);
  }
  return out;
}
// Cutting a card: this season's cap hit stays on the books as dead money.
export function release(L, pid) {
  const p = L.players[pid]; const t = L.teams[p.team];
  t.dead = r1((t.dead || 0) + R.capHit(p));
  t.roster = t.roster.filter((x) => x !== pid);
  p.team = null; p.contract = null; p.formerTeam = t.i;
}

// ---------- 7. Start the next season ----------
export function startNextSeason(L) {
  const t = L.teams[L.user.team];
  if (t.roster.length !== ROSTER_SIZE) return { ok: false, why: `Your roster needs exactly ${ROSTER_SIZE} cards (you have ${t.roster.length}).` };
  R.resetForSeason(L);
  if (R.hooks.preseason) R.hooks.preseason(L);
  const era = LG.seasonStartNews(L);
  if (era) news(L, { ...era, team: L.user.team });
  for (const tm of L.teams) {
    tm.coachName = tm.coachName || 'Coach';
  }
  return { ok: true };
}

// ---------- In season: trades (deadline after Week 8) ----------
// Trades: in season through the deadline, and again in the off-season until
// draft day (v0.20.0).
export const PRE_DRAFT = ['fired', 'retire', 'legacy', 'awards', 'resign', 'upgrade', 'draft'];
export const offseasonTrades = (L) => L.phase === 'offseason' && PRE_DRAFT.includes(L.off?.step);
export const tradeOpen = (L) => (L.phase === 'season' && L.week <= R.TRADE_DEADLINE) || offseasonTrades(L);
// Draft day (v0.23.0): the slots still to be picked trade as 'd<slot>'.
export const isSlot = (x) => typeof x === 'string' && x[0] === 'd';
export const slotOf = (x) => Number(x.slice(1));
export const draftSlotsOwnedBy = (L, owner) => (L.phase === 'offseason' && L.off?.step === 'draft' && L.off.order
  ? L.off.order.map((o, k) => (o === owner && k >= L.off.pick ? `d${k}` : null)).filter(Boolean) : []);
export const anyPickOwner = (L, x) => (isSlot(x) ? (slotOf(x) >= (L.off?.pick ?? 0) ? L.off?.order?.[slotOf(x)] : -1) : pickOwner(L, x));
export const pickName = (L, x) => (isSlot(x) ? `No. ${slotOf(x) + 1} pick today` : `${L.teams[x].abbr} draft pick`);
export const tradeClosedWhy = (L) => (L.phase === 'offseason'
  ? 'Trades are closed from the draft until next season. They open again in Week 1.'
  : L.phase === 'season' ? `The trade deadline (after Week ${R.TRADE_DEADLINE}) has passed. Trades open again after the season, until draft day.`
  : 'Trades are closed for the playoffs. They open again after the season, until draft day.');

// What a card is worth to a team, by its stage (Khalil's rule):
// rebuilds want youth, potential and cap space; contenders want Power now;
// a few pieces away pays for the role it is missing.
export function tradeValue(L, p, t) {
  const hit = R.capHit(p); const left = p.contract?.left || 1;
  if (t.stage === 'rebuild') return p.potential * 0.55 + p.power * 0.35 + Math.max(0, 5 - p.career) * 3 - hit * 0.45 - (p.career >= 6 ? 8 : 0);
  if (t.stage === 'contender') return p.power * 1.05 + (p.hype - 50) * 0.06 - hit * 0.12 - (p.career <= 1 ? 2 : 0);
  const starters = R.aiStarters(L, t);
  const weakest = starters.filter((q) => q.role === p.role).sort((a, b) => a.power - b.power)[0];
  const fills = !weakest || p.power > weakest.power + 2;
  return p.power * 0.9 + (fills ? 7 : 0) + (p.potential - p.power) * 0.15 - hit * 0.25 - left * 0.3;
}

// give: user's pids, get: their pids. Same number each way keeps rosters at 10.
// ---------- Draft picks in trades (v0.22.0) ----------
// A pick's worth: by where that team projects to pick (worst team picks
// first; in the off-season, last season's final standings) and who's buying.
export function projectedSlot(L, ti) {
  const order = R.standings(L).map((t) => t.i).reverse();
  return order.indexOf(ti) + 1;
}
export function pickValue(L, ti, forTeam) {
  const n = isSlot(ti) ? (L.off?.order?.length || L.teams.length) : L.teams.length;
  const frac = (isSlot(ti) ? slotOf(ti) : projectedSlot(L, ti) - 1) / Math.max(1, n - 1); // 0 = top pick
  const base = forTeam.stage === 'rebuild' ? 16 : forTeam.stage === 'contender' ? 7 : 11;
  return base * (1.3 - frac * 0.8);
}
export function movePicks(L, picks, to) {
  L.pickOwner = L.pickOwner || {};
  for (const ti of picks) { if (isSlot(ti)) L.off.order[slotOf(ti)] = to; else L.pickOwner[ti] = to; }
}

// opts: { givePicks: [team index of picks you send], getPicks: [picks you get] }
export function evaluateTrade(L, ti, give, get, opts = {}) {
  const me = L.teams[L.user.team]; const them = L.teams[ti];
  const gk = opts.givePicks || []; const tk = opts.getPicks || [];
  if (!tradeOpen(L)) return { ok: false, score: 0, why: tradeClosedWhy(L) };
  if (give.length !== get.length) return { ok: false, score: 0, why: 'Trade the same number of cards each way (picks can go on top).' };
  if (!give.length && !gk.length && !tk.length) return { ok: false, score: 0, why: 'Pick cards or draft picks to trade.' };
  if (!give.length && !(gk.length && tk.length)) return { ok: false, score: 0, why: 'A trade with no cards has to be picks both ways.' };
  if (gk.some((x) => anyPickOwner(L, x) !== me.i) || tk.some((x) => anyPickOwner(L, x) !== them.i)) return { ok: false, score: 0, why: 'One of those picks has already moved (or been used).' };
  const gp = give.map((pid) => L.players[pid]); const tp = get.map((pid) => L.players[pid]);
  for (const p of tp) if (seriesCount(L, me, p.series, give) + tp.filter((q) => q.series === p.series).length > MAX_PER_SERIES) return { ok: false, score: 0, why: `You'd have more than ${MAX_PER_SERIES} from ${p.series}.` };
  for (const p of gp) if (seriesCount(L, them, p.series, get) + gp.filter((q) => q.series === p.series).length > MAX_PER_SERIES) return { ok: false, score: 0, why: `They'd have more than ${MAX_PER_SERIES} from ${p.series}.` };
  if (L.phase === 'offseason') {
    const up = [...gp, ...tp].find((p) => (p.contract?.left ?? 1) <= 0);
    if (up) return { ok: false, score: 0, why: `${up.name}'s contract is up. ${up.team === me.i ? 'Re-sign them first.' : 'They are headed to free agency.'}` };
  }
  if (gp.some((p) => p.injury > 0)) return { ok: false, score: 0, why: 'They won\'t take an injured card.' };
  const inV = gp.reduce((n, p) => n + tradeValue(L, p, them), 0);
  const outV = tp.reduce((n, p) => n + tradeValue(L, p, them), 0);
  const capAfter = R.payroll(L, them) - tp.reduce((n, p) => n + R.capHit(p), 0) + gp.reduce((n, p) => n + R.capHit(p), 0);
  const myAfter = R.payroll(L, me) - gp.reduce((n, p) => n + R.capHit(p), 0) + tp.reduce((n, p) => n + R.capHit(p), 0);
  // Hard cap: a trade can't leave either side over it (unless it lowers their payroll).
  if (myAfter > R.capOf(me) + 0.05 && myAfter > R.payroll(L, me)) return { ok: false, score: 0, why: `That puts you over the ${R.capOf(me)} salary cap.` };
  const supIn = (list) => list.filter((p) => R.isSupermax(R.capHit(p))).length;
  if (R.supermaxCount(L, me, give) + supIn(tp) > R.SUPERMAX_LIMIT && supIn(tp) > supIn(gp)) return { ok: false, score: 0, why: `You'd have more than ${R.SUPERMAX_LIMIT} supermax deals.` };
  if (R.supermaxCount(L, them, get) + supIn(gp) > R.SUPERMAX_LIMIT && supIn(gp) > supIn(tp)) return { ok: false, score: 0, why: `They'd have more than ${R.SUPERMAX_LIMIT} supermax deals.` };
  const capOk = capAfter <= R.capOf(them) + 0.05 || capAfter <= R.payroll(L, them);
  const margin = inV - outV + gk.reduce((n, x) => n + pickValue(L, x, them), 0) - tk.reduce((n, x) => n + pickValue(L, x, them), 0);
  const score = Math.round(clamp(50 + margin * 6, 0, 100));
  if (!capOk) return { ok: false, score: Math.min(score, 30), why: 'It puts them too far over the cap.' };
  return { ok: margin >= 2, score, margin, why: margin >= 2 ? `${them.name} (${R.STAGE_LABEL[them.stage]}) accept.` : `${them.name} (${R.STAGE_LABEL[them.stage]}) want more.` };
}
// fromTi sends `give` to toTi and gets `get` back (plus draft picks, if any).
export function doTrade(L, fromTi, toTi, give, get, picks = {}) {
  const a = L.teams[fromTi]; const b = L.teams[toTi];
  const gk = picks.givePicks || []; const tk = picks.getPicks || [];
  if (gk.length || tk.length) {
    movePicks(L, gk, b.i); movePicks(L, tk, a.i);
    const pk = (list) => list.map((x) => (isSlot(x) ? `the No. ${slotOf(x) + 1} pick` : `the ${L.teams[x].abbr} pick`)).join(' and ');
    if (!give.length) {
      L.trades.push({ season: L.season, week: L.week, a: a.i, b: b.i, aGot: [], bGot: [], aPicks: tk.slice(), bPicks: gk.slice() });
      L.news.unshift({ week: L.week, kind: 'TRADE', team: a.i, title: `${a.name} and ${b.name} swap draft picks`, text: `${a.name} send ${pk(gk)} and get ${pk(tk)}.` });
      return;
    }
  }
  for (const pid of give) { a.roster = a.roster.filter((x) => x !== pid); b.roster.push(pid); L.players[pid].team = b.i; L.players[pid].formerTeam = a.i; }
  for (const pid of get) { b.roster = b.roster.filter((x) => x !== pid); a.roster.push(pid); L.players[pid].team = a.i; L.players[pid].formerTeam = b.i; }
  L.trades.push({ season: L.season, week: L.week, a: a.i, b: b.i, aGot: get.slice(), bGot: give.slice(), aPicks: tk.slice(), bPicks: gk.slice() });
  const pks = (list) => list.map((x) => (isSlot(x) ? `the No. ${slotOf(x) + 1} pick` : `the ${L.teams[x].abbr} pick`)).join(' and ');
  L.news.unshift({ week: L.week, kind: 'TRADE', team: a.i, title: `${a.name} trade ${[...give.map((pid) => L.players[pid].name), ...(gk.length ? [pks(gk)] : [])].join(' + ')} to ${b.name}`,
    text: `${a.name} get ${[...get.map((pid) => L.players[pid].name), ...(tk.length ? [pks(tk)] : [])].join(' + ')} back.` });
}

// AI teams make the odd deal before the deadline.
function aiTrade(L, rand) {
  if (rand() > 0.45) return;
  for (let k = 0; k < 3; k++) if (aiTryTrade(L, rand)) return;
}
function aiTryTrade(L, rand) {
  const sellers = L.teams.filter((t) => t.stage === 'rebuild' && (!L.user || t.i !== L.user.team));
  const buyers = L.teams.filter((t) => t.stage === 'contender' && (!L.user || t.i !== L.user.team));
  if (!sellers.length || !buyers.length) return;
  const s = sellers[Math.floor(rand() * sellers.length)]; const b = buyers[Math.floor(rand() * buyers.length)];
  const vet = roster(L, s).filter((p) => p.career >= 4 && p.injury <= 0).sort((x, y) => y.power - x.power)[0];
  const kid = roster(L, b).filter((p) => p.career <= 2 && p.injury <= 0 && p.pid !== vet?.pid).sort((x, y) => (y.potential - y.power) - (x.potential - x.power))[0];
  if (!vet || !kid) return;
  if (seriesCount(L, b, vet.series, [kid.pid]) >= MAX_PER_SERIES || seriesCount(L, s, kid.series, [vet.pid]) >= MAX_PER_SERIES) return;
  let sGain = tradeValue(L, kid, s) - tradeValue(L, vet, s);
  const bGain = tradeValue(L, vet, b) - tradeValue(L, kid, b);
  // v0.23.0: AI teams trade picks too. A contender throws in its pick to get
  // a rebuild to sell (rebuilds love picks).
  const picks = [];
  if (pickOwner(L, b.i) === b.i && L.phase === 'season' && (sGain < 1 || rand() < 0.4)) {
    const pv = pickValue(L, b.i, s);
    if (sGain + pv >= 1 && bGain >= 2) { picks.push(b.i); sGain += pv; }
  }
  if (sGain < 1 || bGain < 1) return false;
  const bAfter = R.payroll(L, b) - R.capHit(kid) + R.capHit(vet);
  if (bAfter > R.capOf(b) && R.capHit(vet) > R.capHit(kid)) return false;
  if (R.isSupermax(R.capHit(vet)) && R.supermaxCount(L, b, [kid.pid]) >= R.SUPERMAX_LIMIT) return false;
  doTrade(L, b.i, s.i, [kid.pid], [vet.pid], { givePicks: picks });
  return true;
}

// Emergency pickup in season: sign a free agent at the minimum, cutting someone.
export function emergencyPickup(L, signPid, cutPid) {
  const t = L.teams[L.user.team];
  const p = L.players[signPid]; const cut = L.players[cutPid];
  // v0.31.0: waiver-wire rules. Any free agent; depth cards cost the minimum.
  if (p.waiver?.season === L.season && p.waiver.from === t.i) return { ok: false, why: 'You cut him this season.' };
  if (seriesCount(L, t, p.series, [cutPid]) >= MAX_PER_SERIES) return { ok: false, why: `You'd have more than ${MAX_PER_SERIES} from ${p.series}.` };
  const per = p.power <= EMERGENCY_MAX_POWER ? MIN_SALARY : bargainPrice(p);
  if (per > MIN_SALARY) { const cap = capCheck(L, t, per, [cutPid], R.capHit(cut)); if (!cap.ok) return cap; }
  release(L, cutPid);
  cut.waiver = { from: t.i, season: L.season, week: L.week };
  signMinimum(L, t.i, signPid, per);
  L.news.unshift({ week: L.week, kind: 'SIGNED', team: t.i, title: `${t.name} sign ${p.name}`, text: `${per} for the rest of the season. ${cut.name} released.` });
  return { ok: true, per };
}

R.hooks.buildDraftClass = buildDraftClass;
R.hooks.aiTrade = (L, rand) => aiTrade(L, rand);
