// DYNASTY rules: the Anime Fighting League (AFL).
// Pure functions, no DOM, so the season can be simulated in Node too
// (see /home/claude/sim/dynasty*.mjs). Screens live in dynasty.js.
//
// Release 1 ("The Season"): league setup with a simulated last season,
// coach quiz, 12-week schedule, weekly lineups with the rival's final swap,
// fatigue + injuries, growth every 3 weeks, Hype (combat) and Aura (media),
// division-winner playoffs, the Zenith Clash, awards and job security.
// Release 2 ("The Off-season") lives in dynasty-off.js.

import { runMatch, rng, beats, ROLES } from '../core/combat.js';
import { aiLineup, rivalSwap, damageDealt, shuffle, matchup } from './brawl-rules.js';

export const SAVE_VERSION = 1;
export const SLOTS = 3;
export const ROSTER_SIZE = 10;
export const STARTERS = 5;
export const MAX_PER_SERIES = 3;
export const WEEKS = 12;
export const TRADE_DEADLINE = 8;
export const CAP = 150;
export const MAG_EVERY = 3;
export const SCOUT_WEEKLY = 8;   // scouting points a week
export const SCOUT_COST = 6;     // 3/4 of a week's points
// Filled in by dynasty-off.js so the season loop can call off-season pieces
// (AI trades, the draft class) without a circular import.
export const hooks = {};

export const DIVISIONS = ['Origin', 'Elemental', 'Cyber-Martial', 'Mythic'];
export const CONFERENCES = ['Eastern', 'Western'];
// Division trophies (Khalil's art, 2026-11-17): Origin, Elemental, Cyber-Martial, Mythic.
export const DIV_TROPHY = ['The Sentinel Vanguard', 'The Northern Cross', 'The Golden Shore', 'The Sovereign Shield'];
export const ARENA_ART = [2001, 2002, 2003, 2004];

// [abbr, name, primary, secondary, arena]; 8 per division, in division order.
export const TEAMS = [
  ['T7P', 'Team 7 Pirates', '#15131A', '#D4AF37', 'The Black Flag Colosseum'],
  ['SPC', 'Shinobi Pirate Ciphers', '#0F8C8C', '#C0C6CC', 'The Cipher Dome'],
  ['KBP', "Kobi's Prodigies", '#5B2A86', '#D4AF37', 'Generational Arena'],
  ['JNX', 'Jinx Assassins', '#0B0B0E', '#9B4DFF', 'The Silent Keep'],
  ['AST', 'Astral Knights', '#12234D', '#F2F4FA', 'Starlight Pavilion'],
  ['CRV', 'Crimson Vanguard', '#B3122E', '#4A4F57', 'Vanguard Fortress'],
  ['MCH', 'Mecha Titans', '#6E7378', '#FF7A1A', 'The Titanium Foundry'],
  ['SPB', 'Spectral Blades', '#E8ECF0', '#121214', 'The Ethereal Ring'],
  ['OBS', 'Obsidian Dragons', '#0E0E10', '#12A150', 'The Obsidian Crater'],
  ['AZR', 'Azure Sorcerers', '#1E7FD6', '#C0C6CC', 'Mana Pool Pavilion'],
  ['STM', 'Storm Syndicate', '#2E2A6E', '#FFD92E', 'The Eye of the Storm'],
  ['LUN', 'Lunar Phantoms', '#5C6670', '#EEF1F4', 'Crescent Moon Arena'],
  ['SOL', 'Solar Flares', '#FF8A1E', '#C2182B', 'The Solar Core'],
  ['IRO', 'Iron Alchemists', '#9E3B22', '#8A9199', 'The Crucible'],
  ['VOD', 'Void Walkers', '#3D1466', '#050507', 'Event Horizon Center'],
  ['CRY', 'Crystal Guardians', '#8ED8F0', '#F2B8C6', 'The Prism'],
  ['NEO', 'Neon Ronin', '#FF2E93', '#18E0FF', 'Neon City Circuit'],
  ['CYB', 'Cybernetic Samurai', '#3A3F45', '#2BD55A', 'The Silicon Dojo'],
  ['APX', 'Apex Brawlers', '#B71C2A', '#B58A3C', 'The Apex Ring'],
  ['GRV', 'Gravity Monks', '#8A4FC4', '#A86B32', 'The Floating Temple'],
  ['CHR', 'Chrome Shinobi', '#C7CCD1', '#FFD21F', 'The Chrome Citadel'],
  ['ROG', 'Rogue Mechas', '#4A4F55', '#4CE36A', 'The Scrapyard'],
  ['QNT', 'Quantum Fighters', '#1F4FA8', '#FFFFFF', 'Atom Smash Arena'],
  ['STL', 'Steel Lotus', '#4A7FA8', '#FF6FA8', 'The Metallic Garden'],
  ['CEL', 'Celestial Kitsune', '#F4F1EA', '#C2182B', 'The Nine-Tailed Shrine'],
  ['ABY', 'Abyssal Leviathans', '#0D3A6B', '#6ED6A8', 'Deep Sea Dome'],
  ['SOV', 'Sovereign Griffons', '#D4AF37', '#FFFFFF', 'Sovereign Peak'],
  ['VIP', 'Venom Vipers', '#3FBF3F', '#0E0E0E', "The Viper's Nest"],
  ['VAL', 'Valkyrie Legion', '#4AB3F0', '#C9CED3', 'The Sky Hall'],
  ['CHM', 'Chimera Coalition', '#A8733A', '#2E6B34', 'The Beast Pen'],
  ['ONI', 'Oni Warlords', '#B3121E', '#3A3A3D', 'The Demon Gate'],
  ['BEH', 'Dire Behemoths', '#6B4A2E', '#EDE6D6', 'Behemoth Crater'],
];

export const RIVALRIES = [
  ['T7P', 'SPC', "The Pirate's Bounty"],
  ['KBP', 'JNX', 'The Silent Dagger'],
  ['CEL', 'ONI', 'The Blood Moon Mask'],
  ['NEO', 'CYB', 'The Silicon Katana'],
  ['SOL', 'LUN', 'The Eclipse Relic'],
  ['OBS', 'CRY', 'The Shattered Prism'],
];

export const AWARDS = {
  prodigy: 'The Generational Prodigy Player',
  Striker: 'The Vanguard Blade', Tank: 'The Obsidian Shield', Speedster: 'The Phantom Step Award',
  Mystic: 'The Aether Eye', Tactician: 'The Cipher Scroll',
  coach: "The Grandmaster's Cloak", awakening: 'The Awakening Award', phoenix: 'The Phoenix Rebirth Trophy',
};

// Trophy art in art/afl/trophies/<file>.webp. Missing ones (division trophies, coach award) fall back to the crest.
export const TROPHY_ART = {
  "The Pirate's Bounty": 'pirates-bounty', 'The Silent Dagger': 'silent-dagger', 'The Blood Moon Mask': 'blood-moon',
  'The Silicon Katana': 'silicon-katana', 'The Eclipse Relic': 'eclipse-relic', 'The Shattered Prism': 'shattered-prism',
  'The Celestial Grail': 'grail', 'The Generational Prodigy Player': 'prodigy', 'The Generational Prodigy Award': 'prodigy',
  'The Vanguard Blade': 'vanguard', 'The Obsidian Shield': 'obsidian', 'The Phantom Step Award': 'phantom',
  'The Aether Eye': 'aether', 'The Cipher Scroll': 'cipher',
  "The Grandmaster's Cloak": 'cloak', 'The Awakening Award': 'awakening', 'The Phoenix Rebirth Trophy': 'phoenix',
  'The Sentinel Vanguard': 'div-east', 'The Northern Cross': 'div-north', 'The Golden Shore': 'div-west', 'The Sovereign Shield': 'div-south',
};
export const trophyFile = (name) => (TROPHY_ART[name] ? `art/afl/trophies/${TROPHY_ART[name]}.webp` : null);

// Rookie coach names: any culture for any team (Khalil's rule for newcomers).
const FIRST = ['Haku', 'Marcus', 'Ren', 'Elena', 'Kenji', 'Darius', 'Aiko', 'Viktor', 'Sora', 'Imani', 'Tobias', 'Mei', 'Rafael', 'Yuki', 'Andre', 'Lena',
  'Kaito', 'Nadia', 'Felix', 'Hana', 'Omar', 'Rin', 'Silas', 'Zara', 'Kofi', 'Ingrid', 'Takumi', 'Bianca', 'Leon', 'Saya', 'Dmitri', 'Amara', 'Jonah', 'Noor'];
const LAST = ['Ardent', 'Kurogane', 'Vance', 'Hoshino', 'Mercer', 'Okafor', 'Senju', 'Castellano', 'Tachibana', 'Holt', 'Varga', 'Nakamura', 'Reyes', 'Kirishima',
  'Brandt', 'Sato', 'Delacroix', 'Mbeki', 'Fujiwara', 'Lindqvist', 'Haddad', 'Arata', 'Novak', 'Kaneda', 'Osei', 'Takeda', 'Moreau', 'Ishikawa', 'Quinn', 'Aizawa'];

// ---------- The coach quiz (5 questions) ----------
export const QUIZ = [
  { key: 'origin', q: 'Where did you come from?', options: [
    { id: 'street', label: 'The streets', bio: 'Street fighter' },
    { id: 'academy', label: 'A fighting academy', bio: 'Academy graduate' },
    { id: 'royal', label: 'A royal bloodline', bio: 'Royal bloodline' },
    { id: 'wasteland', label: 'The wastelands', bio: 'Wasteland survivor' },
  ] },
  { key: 'style', q: 'How do you coach?', options: [
    { id: 'attack', label: 'All-out attack', bio: 'All-out attack', perk: 'Strikers and Speedsters +1 Power' },
    { id: 'defense', label: 'Defense first', bio: 'Defense first', perk: 'Tanks +1 Power, and your cards wear down 10% slower' },
    { id: 'mind', label: 'Mind games', bio: 'Mind games', perk: 'Rival coaches only get their final swap half the time' },
  ] },
  { key: 'career', q: 'What did you do before coaching?', options: [
    { id: 'champion', label: 'Underground champion', bio: 'Underground champion', perk: 'Your roster starts with +8 Hype' },
    { id: 'medic', label: 'Team medic', bio: 'Team medic', perk: 'Injuries heal a week faster' },
    { id: 'scout', label: 'Scout', bio: 'Scout', perk: '+2 scouting points a week (used when the draft arrives)' },
    { id: 'analyst', label: 'Film analyst', bio: 'Film analyst', perk: 'Game Plans show one extra key' },
  ] },
  { key: 'anime', q: 'What is your favorite anime?', series: true },
  { key: 'chasing', q: 'What are you chasing?', options: [
    { id: 'rings', label: 'Rings', bio: 'Rings' },
    { id: 'money', label: 'Money', bio: 'Money' },
    { id: 'legacy', label: 'Legacy', bio: 'Legacy' },
  ] },
];

// ---------- Money ----------
// Cap hit per season from Power, nudged by Hype (low-key cards ignore Hype).
export function payFor(power, hype = 50, lowKey = false) {
  const base = 0.00031 * Math.max(0, power - 48) ** 3;
  const mood = lowKey ? 1 : 1 + Math.max(-0.2, Math.min(0.2, (hype - 50) / 250));
  return Math.max(1, Math.round(base * mood * 10) / 10);
}
export const capHit = (p) => (p.contract && p.contract.left > 0 ? Math.round((p.contract.total / p.contract.years) * 10) / 10 : 0);
export const payroll = (league, team) => Math.round((team.roster.reduce((n, pid) => n + capHit(league.players[pid]), 0) + (team.dead || 0)) * 10) / 10;
// This season's cap: the soft cap minus last season's overage.
export const capOf = (team) => Math.round((CAP - (team.capPenalty || 0)) * 10) / 10;

// ---------- Setup ----------
const DEV = [1, 2, 3]; // Normal, Star, Superstar growth speed

function makePlayer(c, rand, pid) {
  const iron = rand() < 0.05;
  const careerLen = iron ? 9 + Math.floor(rand() * 2) : 4 + Math.floor(rand() * 3);
  const career = 1 + Math.floor(rand() * careerLen);        // where they are in it right now
  const dev = rand() < 0.62 ? 0 : rand() < 0.75 ? 1 : 2;
  const room = career <= 2 ? 3 + Math.floor(rand() * 7) : career <= 4 ? Math.floor(rand() * 4) : 0;
  return {
    pid, cid: c.id, name: c.name, series: c.series, franchise: c.franchise, portrait: !!c.portrait,
    role: c.mainRole, second: c.secondRole || null,
    power: c.powerLevel, potential: Math.min(99, c.powerLevel + room),
    aura: c.aura ?? 50, clutch: c.clutch ?? 50, chaos: c.chaos ?? 50,
    dev, iron, career, careerLen,
    lowKey: rand() < 0.25,
    hype: 50, fatigue: 0, injury: 0, mileage: career * 8,
    team: null, contract: null, growth: 0,
    stats: blankStats(), lastStats: null,
  };
}
const blankStats = () => ({ gp: 0, dmg: 0, ko: 0, sp: 0, w: 0, l: 0 });

// Build all 32 rosters with a snake draft: every team covers all five roles,
// no more than 3 from one series, and each AI GM drafts with its own skill,
// so the league has contenders and rebuilds from day one.
function buildRosters(league, rand) {
  const pool = Object.values(league.players).sort((a, b) => b.power - a.power);
  const order = shuffle(league.teams.map((_, i) => i), rand);
  const skill = league.teams.map(() => rand() * 10);           // bigger = sloppier picks
  // The first three rounds go strictly in order, so stars bunch up on some
  // teams (contenders) and others start thin (rebuilds).
  for (let round = 0; round < ROSTER_SIZE; round++) {
    const seq = round < 3 ? order : (round % 2 ? order : order.slice().reverse());
    for (const ti of seq) {
      const team = league.teams[ti];
      const mine = team.roster.map((pid) => league.players[pid]);
      const roles = new Set(mine.map((p) => p.role));
      const series = {};
      mine.forEach((p) => { series[p.series] = (series[p.series] || 0) + 1; });
      const needRole = round < 5 ? ROLES.filter((r) => !roles.has(r)) : null;
      let best = null; let bestV = -Infinity;
      for (const p of pool) {
        if (p.team != null) continue;
        if ((series[p.series] || 0) >= MAX_PER_SERIES) continue;
        let v = p.power - rand() * skill[ti];
        if (needRole && needRole.length && !needRole.includes(p.role)) v -= 30;
        if (v > bestV) { bestV = v; best = p; }
        if (bestV > p.power + 1) break;
      }
      best.team = ti;
      team.roster.push(best.pid);
    }
  }
}

function signAll(league, rand) {
  for (const p of Object.values(league.players)) {
    if (p.team == null) continue;
    const years = 1 + Math.floor(rand() * 4);
    p.contract = { total: Math.round(payFor(p.power, p.hype, p.lowKey) * years * 10) / 10, years, left: years };
  }
}

// Round robin for one division (circle method): 7 rounds of 4 games.
function roundRobin(ids) {
  const a = ids.slice();
  const rounds = [];
  for (let r = 0; r < a.length - 1; r++) {
    const games = [];
    for (let i = 0; i < a.length / 2; i++) games.push(r % 2 ? [a[i], a[a.length - 1 - i]] : [a[a.length - 1 - i], a[i]]);
    rounds.push(games);
    a.splice(1, 0, a.pop());
  }
  return rounds;
}

// 12 weeks: 7 division weeks + 5 weeks against other divisions.
export function makeSchedule(rand) {
  const div = (d) => [0, 1, 2, 3, 4, 5, 6, 7].map((i) => d * 8 + i);
  const divRounds = [0, 1, 2, 3].map((d) => roundRobin(shuffle(div(d), rand)));
  const weeks = [];
  for (let r = 0; r < 7; r++) weeks.push(divRounds.flatMap((rr) => rr[r]));
  const pairings = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]], [[0, 1], [2, 3]], [[0, 2], [1, 3]]];
  pairings.forEach((pair, k) => {
    const games = [];
    for (const [d1, d2] of pair) {
      const a = shuffle(div(d1), rand); const b = shuffle(div(d2), rand);
      a.forEach((t, i) => games.push(k % 2 ? [t, b[(i + k) % 8]] : [b[(i + k) % 8], t]));
    }
    weeks.push(games);
  });
  // Mix cross-division weeks in among division weeks.
  const order = [0, 1, 7, 2, 3, 8, 4, 9, 5, 10, 6, 11];
  return order.map((i) => weeks[i].map(([home, away]) => ({ home, away, result: null })));
}

function pickName(rand, used) {
  for (let k = 0; k < 200; k++) {
    const n = `${FIRST[Math.floor(rand() * FIRST.length)]} ${LAST[Math.floor(rand() * LAST.length)]}`;
    if (!used.has(n)) { used.add(n); return n; }
  }
  return `Coach ${used.size + 1}`;
}

export function newLeague(chars, seed = Date.now()) {
  const rand = rng(seed);
  const league = {
    v: SAVE_VERSION, seed, rngState: seed ^ 0x5bd1e995, season: 0, week: 1, phase: 'season',
    teams: TEAMS.map(([abbr, name, c1, c2, arena], i) => ({
      i, abbr, name, c1, c2, arena, div: Math.floor(i / 8), crest: 1001 + i, roster: [], lineup: null,
      w: 0, l: 0, rw: 0, rl: 0, streak: 0, last: [], stage: 'few', expect: null, coachName: '',
      prevRank: null, rank: null, titles: 0, hype: 50,
    })),
    players: {}, nextPid: 1, schedule: [], news: [], history: [], user: null, playoffs: null, lastWeekScores: [],
    pantheon: [], headshots: [], trades: [], careersFixed: true,
  };
  const used = new Set();
  league.teams.forEach((t) => { t.coachName = pickName(rand, used); });
  for (const c of chars) {
    if (!c.powerLevel || c.retired) continue;
    const p = makePlayer(c, rand, league.nextPid++);
    league.players[p.pid] = p;
  }
  buildRosters(league, rand);
  signAll(league, rand);
  league.teams.forEach((t) => { t.stage = stageOf(league, t); });
  league.schedule = makeSchedule(rand);
  return league;
}

// A seeded random stream that survives save/load.
export function nextRand(league) {
  const r = rng(league.rngState)();
  league.rngState = (league.rngState + 0x9E3779B9 + Math.floor(r * 1e9)) >>> 0;
  return r;
}
const randOf = (league) => () => nextRand(league);

// ---------- Team strength and stage ----------
export const rival = (league, ti) => {
  const abbr = league.teams[ti].abbr;
  const r = RIVALRIES.find((x) => x[0] === abbr || x[1] === abbr);
  if (r) return { team: league.teams.find((t) => t.abbr === (r[0] === abbr ? r[1] : r[0])).i, trophy: r[2] };
  return null;
};
export const isRivalry = (a, b, league) => RIVALRIES.find((r) => (r[0] === league.teams[a].abbr && r[1] === league.teams[b].abbr) || (r[1] === league.teams[a].abbr && r[0] === league.teams[b].abbr)) || null;

export function strength(league, team) {
  const ps = team.roster.map((pid) => league.players[pid]).sort((a, b) => b.power - a.power);
  const top = ps.slice(0, 5).reduce((n, p) => n + p.power, 0) / 5;
  const depth = ps.slice(5).reduce((n, p) => n + p.power, 0) / Math.max(1, ps.length - 5);
  return top * 0.8 + depth * 0.2;
}
export function stageOf(league, team) {
  const ranked = league.teams.slice().sort((a, b) => strength(league, b) - strength(league, a));
  const r = ranked.indexOf(team);
  return r < 8 ? 'contender' : r < 20 ? 'few' : 'rebuild';
}
export const STAGE_LABEL = { contender: 'Contender', few: 'A few pieces away', rebuild: 'Rebuild' };
export const EXPECT_LABEL = { contender: 'Make the playoffs', few: 'Win 7 or more', rebuild: 'Win more than last season' };

// ---------- Effective Power for a match ----------
export function effPower(league, p, ctx = {}) {
  let pw = p.power - Math.floor(Math.max(0, p.fatigue - 30) / 10);
  const u = league.user;
  if (u && p.team === u.team) {
    if (u.quiz.anime && p.series === u.quiz.anime) pw += 1;
    if (u.quiz.style === 'attack' && (p.role === 'Striker' || p.role === 'Speedster')) pw += 1;
    if (u.quiz.style === 'defense' && p.role === 'Tank') pw += 1;
  }
  return pw;
}
export function fightCard(league, p, ctx = {}) {
  const big = ctx.big && p.hype >= 80 ? 1 : 0;
  return {
    id: p.cid, pid: p.pid, name: p.name, powerLevel: effPower(league, p, ctx), mainRole: p.role, secondRole: p.second,
    aura: p.aura, clutch: Math.min(100, p.clutch + big * 8), chaos: p.chaos, franchise: p.franchise, portrait: p.portrait,
  };
}

export const available = (p) => p.injury <= 0;

// AI picks its five: one of each role if it can, skipping the worn down.
export function aiStarters(league, team) {
  const ps = team.roster.map((pid) => league.players[pid]).filter(available);
  const score = (p) => effPower(league, p) - (p.fatigue > 60 ? 6 : 0);
  const chosen = [];
  for (const r of ROLES) {
    const best = ps.filter((p) => p.role === r && !chosen.includes(p)).sort((a, b) => score(b) - score(a))[0];
    if (best) chosen.push(best);
  }
  ps.filter((p) => !chosen.includes(p)).sort((a, b) => score(b) - score(a)).forEach((p) => { if (chosen.length < STARTERS) chosen.push(p); });
  // Swap a role filler for a much stronger card when the gap is big.
  const rest = ps.filter((p) => !chosen.includes(p)).sort((a, b) => score(b) - score(a));
  for (const extra of rest) {
    const weakest = chosen.slice().sort((a, b) => score(a) - score(b))[0];
    if (score(extra) > score(weakest) + 8) chosen[chosen.indexOf(weakest)] = extra;
  }
  return chosen.slice(0, STARTERS);
}

export function aiOrder(league, team, rand) {
  const cards = aiStarters(league, team);
  const asCards = cards.map((p) => ({ ...p, mainRole: p.role, powerLevel: effPower(league, p) }));
  return aiLineup(asCards, rand).map((c) => c.pid);
}

// The rival's final swap against the user's locked lineup.
export function rivalAnswer(league, theirPids, myPids, rand) {
  const toCard = (pid) => { const p = league.players[pid]; return { pid, mainRole: p.role, powerLevel: effPower(league, p) }; };
  if (league.user?.quiz.style === 'mind' && rand() < 0.5) return { lineup: theirPids, swapped: null, mind: true };
  const r = rivalSwap(theirPids.map(toCard), myPids.map(toCard));
  return { lineup: r.lineup.map((c) => c.pid), swapped: r.swapped };
}

// ---------- Playing a game ----------
// lineups: { home: [pid×5], away: [pid×5] }. Returns the result object and
// applies stats, fatigue, Hype and injuries.
export function playGame(league, game, lineups, { seed, events: givenEvents, result: given } = {}) {
  const rand = randOf(league);
  const big = !!isRivalry(game.home, game.away, league) || league.phase === 'playoffs';
  const A = lineups.home.map((pid) => fightCard(league, league.players[pid], { big }));
  const B = lineups.away.map((pid) => fightCard(league, league.players[pid], { big }));
  const res = given || runMatch(A, B, { seed: seed ?? Math.floor(rand() * 2 ** 31) });
  const events = givenEvents || res.events;
  const dmg = damageDealt(events, 5, 5);
  const ko = { A: [0, 0, 0, 0, 0], B: [0, 0, 0, 0, 0] };
  const sp = { A: [0, 0, 0, 0, 0], B: [0, 0, 0, 0, 0] };
  const active = { A: 0, B: 0 };
  for (const ev of events) {
    if (ev.t === 'round-start') { active.A = 0; active.B = 0; }
    else if (ev.t === 'enter') active[ev.side] = ev.idx;
    else if (ev.t === 'ko') { const by = ev.side === 'A' ? 'B' : 'A'; ko[by][active[by]] += 1; }
    else if (ev.t === 'attack' && ev.special) sp[ev.side][active[ev.side]] += 1;
  }
  const homeWon = res.winner === 'A';
  const sides = [['A', game.home, lineups.home, homeWon], ['B', game.away, lineups.away, !homeWon]];
  const u = league.user;
  for (const [s, ti, pids, won] of sides) {
    const team = league.teams[ti];
    pids.forEach((pid, i) => {
      const p = league.players[pid];
      p.stats.gp += 1; p.stats.dmg += Math.round(dmg[s][i]); p.stats.ko += ko[s][i]; p.stats.sp += sp[s][i];
      p.stats[won ? 'w' : 'l'] += 1;
      let wear = 16 * (p.role === 'Tank' ? 0.7 : p.role === 'Speedster' ? 1.3 : 1);
      if (u && ti === u.team && u.quiz.style === 'defense') wear *= 0.9;
      p.fatigue = Math.min(100, p.fatigue + wear);
      p.mileage += 1;
      // Hype comes from combat.
      let dh = won ? 2 : -2;
      dh += Math.min(3, ko[s][i]);
      if (big) dh += won ? 2 : 0;
      if (league.phase === 'playoffs') dh += won ? 2 : 0;
      p.hype = clamp(p.hype + dh, 0, 100);
      if (p.fatigue > 70 && rand() < 0.22) {
        p.injury = 1 + Math.floor(rand() * 3) - (u && ti === u.team && u.quiz.career === 'medic' ? 1 : 0);
        if (p.injury <= 0) p.injury = 1;
        p.hype = clamp(p.hype - 3, 0, 100);
        p.injuredNow = true;
      }
    });
    // Bench loses a little Hype.
    team.roster.filter((pid) => !pids.includes(pid)).forEach((pid) => { const p = league.players[pid]; p.hype = clamp(p.hype - 1, 0, 100); });
    if (league.phase === 'season') {
      if (won) { team.w += 1; team.streak = team.streak > 0 ? team.streak + 1 : 1; } else { team.l += 1; team.streak = team.streak < 0 ? team.streak - 1 : -1; }
      team.rw += s === 'A' ? res.score[0] : res.score[1];
      team.rl += s === 'A' ? res.score[1] : res.score[0];
      team.last.push(won ? 'W' : 'L');
    }
  }
  const mvpSide = homeWon ? 'A' : 'B';
  const mvpIdx = dmg[mvpSide].indexOf(Math.max(...dmg[mvpSide]));
  game.result = {
    winner: homeWon ? game.home : game.away, score: res.score,
    home: lineups.home, away: lineups.away,
    mvp: (homeWon ? lineups.home : lineups.away)[mvpIdx],
  };
  return game.result;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Simulate every game this week except the user's (if index given).
export function simWeek(league, skipUser = true) {
  const rand = randOf(league);
  const games = league.schedule[league.week - 1];
  for (const g of games) {
    if (g.result) continue;
    if (skipUser && league.user && (g.home === league.user.team || g.away === league.user.team)) continue;
    playGame(league, g, { home: aiOrder(league, league.teams[g.home], rand), away: aiOrder(league, league.teams[g.away], rand) });
  }
}

export const userGame = (league, week = league.week) => league.schedule[week - 1]?.find((g) => g.home === league.user.team || g.away === league.user.team);

// ---------- End of week ----------
export function endWeek(league) {
  const rand = randOf(league);
  const games = league.schedule[league.week - 1];
  league.lastWeekScores = games.map((g) => ({ home: g.home, away: g.away, winner: g.result.winner, score: g.result.score }));
  // Recovery, injuries, training focus.
  const focus = league.user?.focus || 'rest';
  for (const p of Object.values(league.players)) {
    if (p.team == null) continue;
    const played = games.some((g) => g.result.home.includes(p.pid) || g.result.away.includes(p.pid));
    let rec = played ? 8 : 25;
    if (league.user && p.team === league.user.team && focus === 'rest') rec += 8;
    p.fatigue = Math.max(0, p.fatigue - rec);
    if (p.injury > 0 && !p.injuredNow) { p.injury -= 1; if (p.injury === 0) p.fatigue = Math.min(p.fatigue, 30); }
    p.injuredNow = false;
  }
  league.news = weekNews(league, games).concat(league.news).slice(0, 30);
  if (league.user) league.user.scoutPts = (league.user.scoutPts || 0) + SCOUT_WEEKLY;
  if (league.week <= TRADE_DEADLINE && hooks.aiTrade) hooks.aiTrade(league, rand);
  // Growth and Aura every 3 weeks.
  if (league.week % MAG_EVERY === 0) growthTick(league, rand);
  if (hooks.afterWeek) hooks.afterWeek(league, games);
  rankPower(league);
  if (league.week % MAG_EVERY === 0 && hooks.issue) hooks.issue(league);
  league.week += 1;
  if (league.week > WEEKS) startPlayoffs(league);
}

function growthTick(league, rand) {
  const ps = Object.values(league.players).filter((p) => p.team != null);
  // Performance since the last tick.
  const perf = (p) => {
    const prev = p.lastStats || blankStats();
    return (p.stats.dmg - prev.dmg) / 1000 + (p.stats.ko - prev.ko) * 4 + (p.stats.w - prev.w) * 3;
  };
  const scored = ps.map((p) => ({ p, s: perf(p) })).sort((a, b) => b.s - a.s);
  const top = new Set(scored.slice(0, 40).map((x) => x.p.pid));
  const focus = league.user?.focus;
  for (const { p } of scored) {
    const curve = p.career <= 2 ? 1 : p.career <= 5 ? 0.35 : -0.55;
    let g = curve > 0 ? curve * DEV[p.dev] * (0.5 + rand()) : curve * (p.iron ? 0.4 : 1) * (0.6 + rand() * 0.8) * (1 + p.mileage / 200);
    if (top.has(p.pid) && g > -0.5) g += 1;
    if (league.user && p.team === league.user.team && focus === 'power') g += 0.5;
    p.growth += g;
    while (p.growth >= 1 && p.power < p.potential) { p.power += 1; p.growth -= 1; }
    if (p.growth >= 1) p.growth = 0.99;
    while (p.growth <= -1) { p.power = Math.max(30, p.power - 1); p.growth += 1; }
    if (league.user && p.team === league.user.team && focus === 'clutch' && rand() < 0.5) p.clutch = Math.min(100, p.clutch + 1);
    p.lastStats = { ...p.stats };
  }
  // Aura comes from being seen: OSM picks five Players of the Month (one per role).
  const potm = [];
  for (const r of ROLES) {
    const best = scored.find((x) => x.p.role === r);
    if (best) { best.p.aura = Math.min(100, best.p.aura + 4); potm.push(best.p.pid); }
  }
  // The award race top 4 also gain Aura.
  awardRace(league).slice(0, 4).forEach(({ p }) => { p.aura = Math.min(100, p.aura + 2); });
  league.potm = { week: league.week, pids: potm };
  league.news.unshift({ week: league.week, kind: 'OSM', trophy: null, team: league.players[potm[0]]?.team ?? 0, title: 'OSM names its Players of the Month',
    text: potm.map((pid) => league.players[pid].name).join(', ') + '.' });
}

// The Generational Prodigy race: damage, KOs and wins, weighted.
export function awardRace(league) {
  return Object.values(league.players).filter((p) => p.team != null && p.stats.gp > 0)
    .map((p) => {
      const t = league.teams[p.team];
      const s = p.stats.dmg / 1000 + p.stats.ko * 3 + p.stats.w * 2 + (t.w - t.l) * 1.5 + p.hype / 10;
      return { p, s };
    }).sort((a, b) => b.s - a.s);
}
export function oddsFor(i, s, top) {
  const gap = Math.max(0, top - s);
  return '+' + Math.round((250 + i * 120 + gap * 40) / 10) * 10;
}

export function standings(league) {
  return league.teams.slice().sort((a, b) => (b.w - a.w) || ((b.rw - b.rl) - (a.rw - a.rl)) || (strength(league, b) - strength(league, a)));
}
export function divisionTable(league, d) {
  return standings(league).filter((t) => t.div === d);
}

export function rankPower(league) {
  const score = (t) => (t.w - t.l) * 6 + (t.rw - t.rl) * 1.5 + strength(league, t) * 0.8 + t.streak * 0.8;
  const ranked = league.teams.slice().sort((a, b) => score(b) - score(a));
  ranked.forEach((t, i) => { t.prevRank = t.rank; t.rank = i + 1; });
}

function weekNews(league, games) {
  const out = [];
  const wk = league.week;
  for (const g of games) {
    const r = g.result; const win = league.teams[r.winner]; const lose = league.teams[r.winner === g.home ? g.away : g.home];
    const riv = isRivalry(g.home, g.away, league);
    if (riv) out.push({ week: wk, kind: 'RIVALRY', team: win.i, trophy: riv[2], title: `${win.name} take ${riv[2]}`, text: `${win.name} beat ${lose.name} ${Math.max(...r.score)}–${Math.min(...r.score)}. ${league.players[r.mvp].name} led the way.` });
    else if (lose.rank && win.rank && win.rank - lose.rank >= 10) out.push({ week: wk, kind: 'UPSET', team: win.i, title: `${win.name} stun No. ${lose.rank} ${lose.name}`, text: `${league.players[r.mvp].name} carried the night as ${win.name} won ${Math.max(...r.score)}–${Math.min(...r.score)}.` });
  }
  const streaker = league.teams.slice().sort((a, b) => b.streak - a.streak)[0];
  if (streaker.streak >= 4) out.push({ week: wk, kind: 'STREAK', team: streaker.i, title: `${streaker.name} win ${streaker.streak} straight`, text: 'The longest run in the AFL right now.' });
  for (const p of Object.values(league.players)) {
    if (p.injuredNow && p.team != null) out.push({ week: wk, kind: 'INJURY', team: p.team, title: `${p.name} hurt`, text: `${league.teams[p.team].name} will be without their ${p.role} for ${p.injury} week${p.injury > 1 ? 's' : ''}.` });
  }
  return out.slice(0, 6);
}

// ---------- Playoffs ----------
export function startPlayoffs(league) {
  league.phase = 'playoffs';
  const winners = [0, 1, 2, 3].map((d) => divisionTable(league, d)[0]);
  const seeds = winners.slice().sort((a, b) => (b.w - a.w) || ((b.rw - b.rl) - (a.rw - a.rl))).map((t) => t.i);
  league.playoffs = {
    seeds,
    semis: [{ home: seeds[0], away: seeds[3], result: null }, { home: seeds[1], away: seeds[2], result: null }],
    final: null, champion: null,
  };
}
export function playoffGameForUser(league) {
  const po = league.playoffs; const u = league.user.team;
  if (!po) return null;
  if (po.final && !po.final.result && (po.final.home === u || po.final.away === u)) return po.final;
  if (!po.final) return po.semis.find((g) => !g.result && (g.home === u || g.away === u)) || null;
  return null;
}
export function simPlayoffs(league, untilUser = true) {
  const rand = randOf(league); const po = league.playoffs; const u = league.user?.team;
  for (const g of po.semis) {
    if (g.result) continue;
    if (untilUser && (g.home === u || g.away === u)) return;
    playGame(league, g, { home: aiOrder(league, league.teams[g.home], rand), away: aiOrder(league, league.teams[g.away], rand) });
  }
  if (!po.final) po.final = { home: po.semis[0].result.winner, away: po.semis[1].result.winner, result: null };
  if (!po.final.result) {
    if (untilUser && (po.final.home === u || po.final.away === u)) return;
    playGame(league, po.final, { home: aiOrder(league, league.teams[po.final.home], rand), away: aiOrder(league, league.teams[po.final.away], rand) });
  }
  po.champion = po.final.result.winner;
}

// ---------- End of season ----------
export function endSeason(league) {
  const po = league.playoffs;
  const champ = league.teams[po.champion];
  champ.titles += 1;
  const race = awardRace(league);
  const roleAward = {}; const roleAwardTeams = {};
  for (const r of ROLES) {
    const best = race.find((x) => x.p.role === r);
    if (best) { roleAward[r] = best.p.pid; roleAwardTeams[r] = best.p.team; best.p.aura = Math.min(100, best.p.aura + 5); }
  }
  race[0].p.aura = Math.min(100, race[0].p.aura + 8);
  const final = po.final.result;
  const row = {
    season: league.season, champion: champ.i, coach: champ.coachName,
    runnerUp: po.final.home === champ.i ? po.final.away : po.final.home,
    score: [Math.max(...final.score), Math.min(...final.score)],
    record: `${champ.w}-${champ.l}`,
    prodigy: race[0].p.pid, prodigyName: race[0].p.name, prodigyTeam: race[0].p.team,
    divisions: po.seeds.slice().sort((a, b) => league.teams[a].div - league.teams[b].div),
    roleAwards: roleAward, roleAwardTeams,
    standings: standings(league).map((t) => ({ i: t.i, w: t.w, l: t.l })),
  };
  // Specialty awards (when we know where the season started).
  const active = Object.values(league.players).filter((p) => p.team != null && p.stats.gp > 0);
  const wake = active.filter((p) => p.startPower != null && p.career <= 3).sort((a, b) => (b.power - b.startPower) - (a.power - a.startPower))[0];
  if (wake && wake.power > wake.startPower) { row.awakening = wake.pid; wake.aura = Math.min(100, wake.aura + 3); }
  const phoenix = active.filter((p) => p.startHype != null && p.startHype < 45).sort((a, b) => (b.hype - b.startHype) - (a.hype - a.startHype))[0];
  if (phoenix && phoenix.hype > phoenix.startHype + 5) { row.phoenix = phoenix.pid; phoenix.aura = Math.min(100, phoenix.aura + 3); }
  // Coach of the year: most wins above expectation.
  const coy = league.teams.slice().sort((a, b) => (b.w - expectedWins(b)) - (a.w - expectedWins(a)))[0];
  row.coachOfYear = coy.i;
  if (hooks.seasonRow) hooks.seasonRow(league, row);
  league.history.unshift(row);
  if (league.user) judgeCoach(league);
  league.phase = 'done';
  return row;
}
const expectedWins = (t) => (t.stage === 'contender' ? 8 : t.stage === 'few' ? 6 : 4);

export function playoffTeams(league) {
  const po = league.playoffs;
  return po ? po.seeds : [];
}

function judgeCoach(league) {
  const u = league.user; const t = league.teams[u.team];
  const made = league.playoffs.seeds.includes(u.team);
  let met;
  if (u.expect === 'contender') met = made;
  else if (u.expect === 'few') met = t.w >= 7 || made;
  else met = t.w > (u.lastWins ?? 0) || made;
  u.missStreak = met ? 0 : (u.missStreak || 0) + 1;
  u.security = u.missStreak >= 3 ? 'Fired' : u.missStreak === 2 ? 'Hot seat' : u.missStreak === 1 ? 'Watched closely' : 'Safe for now';
  u.career.push({ season: league.season, team: t.i, w: t.w, l: t.l, playoffs: made, champion: league.playoffs.champion === t.i, met });
  return met;
}

// ---------- A new save: last season, then pick a team ----------
export function simulateFullSeason(league) {
  league.phase = 'season';
  while (league.phase === 'season') { simWeek(league, false); endWeek(league); }
  simPlayoffs(league, false);
  return endSeason(league);
}

export function resetForSeason(league) {
  league.season += 1; league.week = 1; league.phase = 'season'; league.playoffs = null;
  const rand = randOf(league);
  if (league.user) league.user.lastWins = league.teams[league.user.team].w;
  league.teams.forEach((t) => {
    t.lastW = t.w; t.lastL = t.l;
    t.w = 0; t.l = 0; t.rw = 0; t.rl = 0; t.streak = 0; t.last = [];
    t.stage = stageOf(league, t); t.expect = t.stage;
  });
  for (const p of Object.values(league.players)) { p.stats = blankStats(); p.lastStats = null; p.fatigue = 0; p.injury = 0; p.startPower = p.power; p.startHype = p.hype; }
  league.schedule = makeSchedule(rand);
  league.news = (league.news || []).filter((n) => n.off).slice(0, 10);
  league.off = null;
  if (league.user) league.user.expect = league.teams[league.user.team].stage;
  if (hooks.buildDraftClass) hooks.buildDraftClass(league);
  league.lastWeekScores = [];
  rankPower(league);
  league.teams.forEach((t) => { t.prevRank = null; });
}

// Teams the player may take over: the ones that missed last season's playoffs.
export function openJobs(league) {
  const last = league.history[0];
  const out = last.standings.map((s) => s.i).filter((i) => !last.divisions.includes(i));
  return out;
}

export function hire(league, ti, coachName, quiz) {
  const last = league.history[0];
  const t = league.teams[ti];
  const rank = last.standings.findIndex((s) => s.i === ti) + 1;
  const prior = 2 + (ti * 7 + league.seed) % 5;
  league.user = {
    team: ti, coach: coachName, quiz, focus: 'rest', expect: t.stage, lastWins: t.lastW ?? t.w,
    missStreak: 0, security: 'Safe for now', career: [], hiredSeason: league.season + 1, priorCoaches: prior, lastRank: rank,
  };
  t.coachName = coachName;
  if (quiz.career === 'champion') t.roster.forEach((pid) => { league.players[pid].hype = Math.min(100, league.players[pid].hype + 8); });
  return hireArticle(league, ti, rank, prior);
}

export function hireArticle(league, ti, rank, prior) {
  const t = league.teams[ti]; const last = league.history[0]; const s = last.standings.find((x) => x.i === ti);
  const coach = league.user.coach;
  const nonPlayoff = openJobs(league);
  const best = nonPlayoff[0] === ti; const worst = nonPlayoff[nonPlayoff.length - 1] === ti;
  if (best) {
    return { kind: 'YOUR HIRE', title: `${t.name} were one win away. What were they thinking?`,
      text: `${t.name} went ${s.w}-${s.l} and just missed the playoffs, then fired their coach anyway. Now ${coach} gets a roster that is supposed to win right away. The league will be watching.` };
  }
  if (worst) {
    return { kind: 'YOUR HIRE', title: `The ${ordinal(prior + 1)} coach in ${prior + 2} seasons. Is ${coach.split(' ').slice(-1)[0]} the one?`,
      text: `${t.name} finished last in the AFL at ${s.w}-${s.l}. ${coach} inherits a long rebuild, a quiet locker room and a fan base that has heard every promise before.` };
  }
  return { kind: 'YOUR HIRE', title: `${t.name} turn to ${coach}`,
    text: `After a ${s.w}-${s.l} season and a No. ${rank} finish, ${t.name} hand the job to ${coach}. The front office calls it "${STAGE_LABEL[t.stage].toLowerCase()}". The fans just want the playoffs.` };
}
const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd']; const v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

// ---------- Game plan helpers ----------
export function seasonTotals(league, team) {
  const ps = team.roster.map((pid) => league.players[pid]);
  const gp = Math.max(1, team.w + team.l);
  return {
    dmg: Math.round(ps.reduce((n, p) => n + p.stats.dmg, 0) / gp),
    ko: Math.round((ps.reduce((n, p) => n + p.stats.ko, 0) / gp) * 10) / 10,
    sp: ps.reduce((n, p) => n + p.stats.sp, 0),
    fatigue: Math.round(ps.reduce((n, p) => n + p.fatigue, 0) / ps.length),
    power: Math.round((ps.reduce((n, p) => n + p.power, 0) / ps.length) * 10) / 10,
    rounds: team.rw + team.rl ? Math.round((team.rw / (team.rw + team.rl)) * 100) : 0,
  };
}

export { matchup, beats, ROLES };
