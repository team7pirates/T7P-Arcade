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
        quote: met ? `"${star.name} sets the tone. The rest of us follow."` : `"It's a long season. We'll be there at the end."`,
      };
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
