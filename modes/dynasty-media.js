// DYNASTY release 3: Media and History. Pure rules, no DOM (Node-safe).
//   - OSM (Otaku Sports Magazine): an issue every 3 weeks, 4 a season.
//   - The Fight Night Dojo: weekly picks for the 3 biggest games and a
//     player to watch; its record is kept.
//   - Rivalry trophy holders, the award race, the Museum and the coach's
//     trophy shelf.
// Aura comes from being seen: the OSM cover (+3), the OSM spotlight (+2)
// and the Dojo's player to watch (+1). Hype stays with combat.

import * as R from './dynasty-rules.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const MAX_ISSUES = 12;

export function migrate(L) {
  L.mags = L.mags || [];
  L.rivalHolders = L.rivalHolders || {};
  L.dojoRecord = L.dojoRecord || { w: 0, l: 0, season: { w: 0, l: 0 } };
  return L;
}

// ---------- Rivalry trophies ----------
// The winner of the latest meeting holds the trophy.
function updateRivals(L, games) {
  for (const g of games) {
    const rv = R.isRivalry(g.home, g.away, L);
    if (rv && g.result) L.rivalHolders[rv[2]] = { team: g.result.winner, season: L.season, week: L.week, score: [Math.max(...g.result.score), Math.min(...g.result.score)], lost: g.result.winner === g.home ? g.away : g.home };
  }
}
export const rivalryList = (L) => R.RIVALRIES.map(([a, b, name]) => ({
  name, a: L.teams.findIndex((t) => t.abbr === a), b: L.teams.findIndex((t) => t.abbr === b), holder: L.rivalHolders?.[name] || null,
}));

// ---------- The Fight Night Dojo ----------
export const winChance = (L, home, away) => R.winChance(L, home, away);
function marquee(L, week) {
  const games = L.schedule[week - 1] || [];
  const val = (g) => 60 - (L.teams[g.home].rank || 32) - (L.teams[g.away].rank || 32) + (R.isRivalry(g.home, g.away, L) ? 30 : 0)
    + (L.user && (g.home === L.user.team || g.away === L.user.team) ? 10 : 0);
  return games.slice().sort((a, b) => val(b) - val(a)).slice(0, 3);
}
// This week's picks (made once, before the games).
export function dojoWeek(L) {
  migrate(L);
  if (L.phase !== 'season') return null;
  if (L.dojo && L.dojo.season === L.season && L.dojo.week === L.week) return L.dojo;
  const games = marquee(L, L.week).map((g) => {
    const p = winChance(L, g.home, g.away);
    return { home: g.home, away: g.away, pick: p >= 0.5 ? g.home : g.away, chance: Math.round(Math.max(p, 1 - p) * 100) };
  });
  // Player to watch: the hottest card in the Game of the Week.
  const g0 = games[0];
  let watch = null;
  if (g0) {
    const ps = [...L.teams[g0.home].roster, ...L.teams[g0.away].roster].map((pid) => L.players[pid]).filter((p) => p.injury <= 0);
    watch = ps.sort((a, b) => (b.hype + b.power) - (a.hype + a.power))[0]?.pid ?? null;
    if (watch != null) L.players[watch].aura = Math.min(100, L.players[watch].aura + 1);
  }
  L.dojo = { season: L.season, week: L.week, games, watch, graded: false };
  return L.dojo;
}
function gradeDojo(L, games) {
  const d = L.dojo;
  if (!d || d.graded || d.season !== L.season || d.week !== L.week) return;
  for (const pick of d.games) {
    const g = games.find((x) => x.home === pick.home && x.away === pick.away);
    if (!g?.result) continue;
    pick.right = g.result.winner === pick.pick;
    L.dojoRecord[pick.right ? 'w' : 'l'] += 1;
    if (L.dojoRecord.seasonNo !== L.season) { L.dojoRecord.seasonNo = L.season; L.dojoRecord.season = { w: 0, l: 0 }; }
    L.dojoRecord.season[pick.right ? 'w' : 'l'] += 1;
  }
  d.graded = true;
  L.dojoLast = d;
}

// ---------- OSM Spotlight quotes (v0.16.1) ----------
// The spotlight runs one coach quote, picked at random: an Aura quote (calm,
// confident) gives the roster +5 Aura, a Chaos quote (trash talk) +5 Chaos,
// for the next 3 weeks, until the next issue comes out. Quotes follow the
// team's form (hot, winning, even, losing, cold).
export const QUOTE_BOOST = 5;
export const QUOTE_WEEKS = 3;
export function moodOf(t) {
  if (t.streak >= 3) return 'hot';
  if (t.streak <= -3) return 'cold';
  if (t.w > t.l) return 'winning';
  if (t.w < t.l) return 'losing';
  return 'even';
}
const QUOTES = {
  hot: {
    aura: ['"We don\'t celebrate wins any more. We expect them."', '"${star} is playing like a legend. We just try to keep up."', '"Stay humble, stay hungry. The streak takes care of itself."'],
    chaos: ['"Line them up. Whoever\'s next is getting the same thing."', '"Tell ${rival} we\'re coming. They know it already."', '"Nobody in this league wants to see us right now. Good."'],
  },
  winning: {
    aura: ['"${star} sets the tone. The rest of us follow."', '"We\'re ahead of schedule, but nobody here is satisfied."', '"Good teams win. Great teams keep their heads down and win again."'],
    chaos: ['"People called us a fluke. Check the standings."', '"We\'re not here to make friends. We\'re here to take trophies."', '"${rival} can talk all they want. We\'ll see them in the ring."'],
  },
  even: {
    aura: ['"We\'re right where we need to be. Stay patient."', '"Every week is a chance to show who we really are."', '"${star} keeps us steady. That matters in a season like this."'],
    chaos: ['"The gloves are off. Somebody\'s about to get hurt."', '"I\'m done being polite. Next team pays for it."', '"We\'re .500 and dangerous. That\'s the worst kind of team to face."'],
  },
  losing: {
    aura: ['"It\'s a long season. We\'ll be there at the end."', '"I believe in this locker room. The results will come."', '"${star} hasn\'t stopped working. Neither have we."'],
    chaos: ['"I\'m sick of losing. Somebody\'s going to feel that."', '"We\'re angry. Whoever we play next is going to find out."', '"Write us off. Please. It makes this easier."'],
  },
  cold: {
    aura: ['"Losing streaks end. Character doesn\'t."', '"We look in the mirror, we fix it, we move on."', '"Nobody\'s pointing fingers in here. We climb out together."'],
    chaos: ['"I\'m flipping the table. Nobody\'s job is safe, mine included."', '"Enough. The next team catches every bit of this."', '"We\'re backed into a corner. Corners are where we bite."'],
  },
};
export function spotlightQuotes(L, t, star) {
  const pool = QUOTES[moodOf(t)];
  const rv = R.rival(L, t.i);
  const fill = (q) => q.replace('${star}', star.name).replace('${rival}', rv ? L.teams[rv.team].name : 'the rest of the league');
  const pick = (arr) => fill(arr[Math.floor(R.nextRand(L) * arr.length)]);
  return { aura: pick(pool.aura), chaos: pick(pool.chaos) };
}
export function chooseQuote(L, mag, stat) {
  const sp = mag?.spotlight; if (!sp || sp.pick) return false;
  if (mag.season !== L.season || L.mags[0] !== mag) return false;
  sp.pick = stat;
  L.user.boost = { stat, season: L.season, from: mag.week + 1, to: mag.week + QUOTE_WEEKS, issue: mag.issue };
  return true;
}
// Is the quote boost live for this week?
export function boostNow(L) {
  const b = L.user?.boost;
  if (!b || b.season !== L.season) return null;
  const wk = L.phase === 'playoffs' ? R.WEEKS + 1 : L.week;
  return wk >= b.from && wk <= b.to ? b : null;
}

// ---------- OSM: an issue every 3 weeks ----------
const COVER_LINES = [
  (n, t) => `${n} is carrying ${t}. Nobody can stop it.`,
  (n, t) => `How ${n} became the scariest card in the AFL.`,
  (n, t) => `${t} have a superstar, and it's ${n}.`,
  (n, t) => `${n}: "We're just getting started."`,
];
export function makeIssue(L) {
  migrate(L);
  const week = L.week; // the week that just finished
  const issue = Math.round(week / R.MAG_EVERY);
  const potm = (L.potm?.pids || []).map((pid) => L.players[pid]).filter(Boolean);
  const race = R.awardRace(L).slice(0, 5);
  const cover = potm.slice().sort((a, b) => (b.stats.dmg + b.stats.ko * 2000) - (a.stats.dmg + a.stats.ko * 2000))[0] || race[0]?.p;
  if (!cover) return null;
  cover.aura = Math.min(100, cover.aura + 3);
  const rand = () => R.nextRand(L);
  const power = L.teams.slice().sort((a, b) => a.rank - b.rank).slice(0, 10).map((t) => ({ i: t.i, rank: t.rank, prev: t.prevRank, w: t.w, l: t.l }));
  const risers = L.teams.filter((t) => t.prevRank).sort((a, b) => (b.prevRank - b.rank) - (a.prevRank - a.rank));
  // Spotlight: the user's team, its best performer gets the feature.
  let spotlight = null;
  if (L.user) {
    const t = L.teams[L.user.team];
    const star = t.roster.map((pid) => L.players[pid]).sort((a, b) => (b.stats.dmg + b.stats.ko * 2000) - (a.stats.dmg + a.stats.ko * 2000))[0];
    if (star) {
      star.aura = Math.min(100, star.aura + 2);
      const met = t.w >= Math.round(week * (t.stage === 'contender' ? 0.66 : t.stage === 'few' ? 0.55 : 0.4));
      spotlight = {
        team: t.i, pid: star.pid, record: `${t.w}-${t.l}`, rank: t.rank,
        line: met ? `${t.name} are ahead of schedule. The front office wanted "${R.EXPECT_LABEL[t.stage].toLowerCase()}". So far, so good.`
          : `${t.name} are behind where the front office wants them ("${R.EXPECT_LABEL[t.stage].toLowerCase()}"). ${L.user.coach} needs a run.`,
        mood: moodOf(t), quotes: spotlightQuotes(L, t, star),
        // The magazine runs one quote at random (Khalil: a choice would always be Aura).
        pick: R.nextRand(L) < 0.5 ? 'aura' : 'chaos',
      };
      L.user.boost = { stat: spotlight.pick, season: L.season, from: week + 1, to: week + QUOTE_WEEKS, issue };
    }
  }
  const mag = {
    season: L.season, issue, week,
    cover: { pid: cover.pid, team: cover.team, line: COVER_LINES[Math.floor(rand() * COVER_LINES.length)](cover.name, cover.team != null ? L.teams[cover.team].name : 'the league') },
    teasers: [
      power[0] ? `No. 1: ${L.teams[power[0].i].name} (${power[0].w}-${power[0].l})` : null,
      risers[0] && risers[0].prevRank - risers[0].rank > 0 ? `Rising: ${risers[0].name}, up ${risers[0].prevRank - risers[0].rank}` : null,
      race[0] ? `GPP race: ${race[0].p.name} leads` : null,
      R.hooks.issueTeaser ? R.hooks.issueTeaser(L) : null,
    ].filter(Boolean).slice(-3),
    potm: potm.map((p) => ({ pid: p.pid, team: p.team, role: p.role, dmg: p.stats.dmg, ko: p.stats.ko, w: p.stats.w, l: p.stats.l })),
    power,
    race: race.map(({ p, s }, i) => ({ pid: p.pid, team: p.team, odds: R.oddsFor(i, s, race[0].s) })),
    spotlight,
    rivals: rivalryList(L).map((r) => ({ name: r.name, a: r.a, b: r.b, holder: r.holder?.team ?? null })),
    news: (L.news || []).filter((n) => n.week && n.week > week - R.MAG_EVERY && n.kind !== 'OSM').slice(0, 6).map((n) => ({ kind: n.kind, title: n.title, team: n.team, trophy: n.trophy || null })),
    read: false,
  };
  L.mags.unshift(mag);
  L.mags = L.mags.slice(0, MAX_ISSUES);
  return mag;
}

// ---------- Award races (the race page) ----------
export function roleRaces(L) {
  const race = R.awardRace(L);
  return R.ROLES.map((role) => ({ role, award: R.AWARDS[role], top: race.filter((x) => x.p.role === role).slice(0, 3) }));
}
export function breakoutRace(L) {
  return Object.values(L.players).filter((p) => p.team != null && p.startPower != null && p.career <= 3 && p.power > p.startPower)
    .sort((a, b) => (b.power - b.startPower) - (a.power - a.startPower)).slice(0, 3);
}
export function comebackRace(L) {
  return Object.values(L.players).filter((p) => p.team != null && p.startHype != null && p.startHype < 45 && p.hype > p.startHype)
    .sort((a, b) => (b.hype - b.startHype) - (a.hype - a.startHype)).slice(0, 3);
}

// ---------- The Museum ----------
export function titleBoard(L) {
  const n = {};
  for (const row of L.history) n[row.champion] = (n[row.champion] || 0) + 1;
  return Object.entries(n).map(([i, c]) => ({ team: Number(i), n: c })).sort((a, b) => b.n - a.n);
}
export function gppBoard(L) {
  const n = {};
  for (const row of L.history) if (row.prodigy) n[row.prodigy] = (n[row.prodigy] || 0) + 1;
  return Object.entries(n).map(([pid, c]) => ({ pid: Number(pid), n: c })).sort((a, b) => b.n - a.n).slice(0, 8);
}
export function rivalryBook(L) {
  return R.RIVALRIES.map(([a, b, name]) => {
    const ai = L.teams.findIndex((t) => t.abbr === a); const bi = L.teams.findIndex((t) => t.abbr === b);
    const won = { [ai]: 0, [bi]: 0 };
    for (const row of L.history) { const h = row.rivals?.[name]; if (h != null && won[h] != null) won[h] += 1; }
    return { name, a: ai, b: bi, won, holder: L.rivalHolders?.[name]?.team ?? null };
  });
}
export function recordBook(L) {
  const rows = L.history;
  const best = rows.reduce((b, r) => { const [w] = (r.record || '0-0').split('-').map(Number); return w > (b?.w ?? -1) ? { w, row: r } : b; }, null);
  const blow = rows.filter((r) => r.score).sort((a, b) => (b.score[0] - b.score[1]) - (a.score[0] - a.score[1]))[0];
  const pan = (L.pantheon || []).slice().sort((a, b) => b.power - a.power)[0];
  return [
    best ? ['Best champion record', `${best.row.record}, ${L.teams[best.row.champion].name} (season ${best.row.season})`] : null,
    blow ? ['Biggest Zenith Clash win', `${blow.score[0]}–${blow.score[1]}, ${L.teams[blow.champion].name} (season ${blow.season})`] : null,
    pan ? ['Highest Power in the Pantheon', `${pan.name}, ${pan.power}`] : null,
    ['Dojo picks, all time', `${L.dojoRecord?.w || 0}-${L.dojoRecord?.l || 0}`],
    ['OSM issues printed', String((L.mags || []).length >= MAX_ISSUES ? `${MAX_ISSUES}+` : (L.mags || []).length)],
  ].filter(Boolean);
}

// ---------- The coach's trophy shelf ----------
// Built from history: only seasons the user coached that team count.
export function trophyShelf(L) {
  const u = L.user; if (!u) return [];
  const out = [];
  for (const c of u.career) {
    const row = L.history.find((r) => r.season === c.season);
    if (!row) continue;
    const t = L.teams[c.team];
    if (row.champion === c.team) out.push({ name: 'The Celestial Grail', why: `AFL champions · season ${c.season}`, big: true });
    if ((row.divisions || []).includes(c.team)) out.push({ name: R.DIV_TROPHY[t.div], why: `${R.DIVISIONS[t.div]} Division · season ${c.season}` });
    for (const [name, holder] of Object.entries(row.rivals || {})) if (holder === c.team) out.push({ name, why: `Rivalry trophy · season ${c.season}` });
    if (row.prodigyTeam === c.team) out.push({ name: R.AWARDS.prodigy, why: `${row.prodigyName} · season ${c.season}` });
    for (const r of R.ROLES) if (row.roleAwardTeams?.[r] === c.team) out.push({ name: R.AWARDS[r], why: `${L.players[row.roleAwards[r]]?.name || ''} · season ${c.season}` });
    if (row.coachOfYear === c.team) out.push({ name: R.AWARDS.coach, why: `Coach of the Year · season ${c.season}` });
  }
  return out;
}

// ---------- Hooks into the season loop ----------
R.hooks.afterWeek = (L, games) => {
  migrate(L);
  updateRivals(L, games);
  gradeDojo(L, games);
};
R.hooks.issue = (L) => makeIssue(L);
R.hooks.seasonRow = (L, row) => {
  migrate(L);
  row.rivals = Object.fromEntries(Object.entries(L.rivalHolders).map(([k, v]) => [k, v.team]));
};

// ---------- The season review issue (after the Zenith Clash) ----------
export function makeReview(L, row) {
  migrate(L);
  if (L.mags.some((m) => m.review && m.season === row.season)) return null;
  const P = (pid) => (pid != null ? L.players[pid] : null);
  const champ = L.teams[row.champion];
  const champStars = champ.roster.map((pid) => L.players[pid]).sort((a, b) => (b.stats.dmg + b.stats.ko * 2000) - (a.stats.dmg + a.stats.ko * 2000)).slice(0, 3).map((p) => p.pid);
  const gain = (p) => p.aura - (p.startAura ?? p.aura);
  const auraTop = Object.values(L.players).filter((p) => p.team != null).sort((a, b) => gain(b) - gain(a) || b.aura - a.aura).slice(0, 6).map((p) => ({ pid: p.pid, aura: p.aura, gain: gain(p), team: p.team }));
  const mine = L.user ? L.user.career.find((c) => c.season === row.season) : null;
  const best = L.teams.slice().sort((a, b) => b.w - a.w || (b.rw - b.rl) - (a.rw - a.rl))[0];
  const worst = L.teams.slice().sort((a, b) => a.w - b.w)[0];
  const mag = {
    review: true, season: row.season, issue: 'REVIEW', week: R.WEEKS, read: false,
    cover: { pid: champStars[0] ?? null, team: row.champion, line: `${champ.name} win the Celestial Grail, ${row.score[0]}–${row.score[1]} over ${L.teams[row.runnerUp].name}.` },
    teasers: [`GPP: ${row.prodigyName}`, `Best record: ${best.name} (${best.w}-${best.l})`, mine ? `${L.teams[mine.team].abbr}: ${mine.w}-${mine.l}` : null].filter(Boolean),
    row: { champion: row.champion, runnerUp: row.runnerUp, score: row.score, coach: row.coach, record: row.record, divisions: row.divisions || [],
      prodigy: row.prodigy, prodigyName: row.prodigyName, prodigyTeam: row.prodigyTeam, roleAwards: row.roleAwards, roleAwardTeams: row.roleAwardTeams,
      awakening: row.awakening ?? null, phoenix: row.phoenix ?? null, coachOfYear: row.coachOfYear, rivals: row.rivals || {} },
    champStars, auraTop, mine: mine ? { ...mine } : null, best: best.i, worst: worst.i,
    potm: [], power: [], race: [], rivals: [], news: [],
  };
  L.mags.unshift(mag);
  L.mags = L.mags.slice(0, 14);
  // The cover and the season's stars get the magazine's Aura too; it carries into next season.
  const cs = P(champStars[0]); if (cs) cs.aura = Math.min(100, cs.aura + 3);
  return mag;
}
R.hooks.seasonEnd = (L, row) => makeReview(L, row);
