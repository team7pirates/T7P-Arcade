// DYNASTY: the end of an era and the New Era (v0.13.0). Pure rules, no DOM.
//
// A dynasty's story ends when the last known character (the original
// roster: anime, Marvel, DC) retires. That takes about 10–11 seasons.
// The off-season it happens gets a "Legacy" step: the send-off, your career
// summary and a final OSM cover. The save then rolls on into the New Era
// with only made-up characters, and the finished dynasty is archived as a
// Coach's Legacy that carries reputation into new saves.

import * as R from './dynasty-rules.js';
import * as MD from './dynasty-media.js';

export const ARCHIVE_KEY = 'dynasty:legacy';
export const COUNTDOWN_FROM = 60;   // start the "legends remain" countdown here

// Original characters were built from the roster; newcomers carry a star rating.
export const isLegend = (p) => p.stars == null;
export const legendsLeft = (L) => Object.values(L.players).filter((p) => !p.retired && isLegend(p));
// Legends who retire at the end of this season (their last year).
export const finalYear = (L) => legendsLeft(L).filter((p) => p.career >= p.careerLen);

export function migrate(L) {
  if (L.user && !L.user.coached) L.user.coached = {};
  return L;
}

// ---------- Season hooks ----------
// Count every season a card played for you, plus its damage and KOs.
R.hooks.seasonRowLegacy = (L, row) => {
  migrate(L);
  const u = L.user; if (!u) return;
  for (const pid of L.teams[u.team].roster) {
    const p = L.players[pid]; const c = u.coached[pid] || (u.coached[pid] = { s: 0, dmg: 0, ko: 0 });
    c.s += 1; c.dmg += p.stats.dmg; c.ko += p.stats.ko;
  }
  void row;
};

// News and OSM lines for the countdown. Called at the start of each season.
export function seasonStartNews(L) {
  if (L.era === 2) return null;
  const left = legendsLeft(L).length; const last = finalYear(L).length;
  if (left === 0 || left > COUNTDOWN_FROM) return null;
  if (last === left) {
    return { kind: 'FAREWELL TOUR', title: `The farewell tour: the last ${left} legend${left === 1 ? '' : 's'} play their final season`,
      text: `${legendsLeft(L).sort((a, b) => b.power - a.power).slice(0, 4).map((p) => p.name).join(', ')}${left > 4 ? ' and more' : ''}. When they go, an era of the AFL goes with them.` };
  }
  return { kind: 'END OF AN ERA', title: `${left} legends remain in the AFL`, text: `${last} of them are in their final season. The made-up generation is taking over.` };
}
export function issueTeaser(L) {
  if (L.era === 2) return null;
  const left = legendsLeft(L).length;
  if (!left || left > COUNTDOWN_FROM) return null;
  return finalYear(L).length === left ? `The farewell tour: ${left} legends left` : `${left} legends remain`;
}

// ---------- The end of an era ----------
// Called by startOffseason after retirements. Returns true when the last
// legend just retired.
export function checkEnd(L, retired) {
  if (L.era === 2 || L.complete || !L.user) return false;
  if (legendsLeft(L).length > 0) return false;
  L.lastLegends = retired.filter((r) => isLegend(L.players[r.pid] || {})).sort((a, b) => b.power - a.power).map((r) => r.pid);
  return true;
}

export function buildLegacy(L) {
  migrate(L);
  const u = L.user;
  const rows = u.career;
  const w = rows.reduce((n, c) => n + c.w, 0); const l = rows.reduce((n, c) => n + c.l, 0);
  const teams = [...new Set(rows.map((c) => c.team))].map((i) => { const t = L.teams[i]; return { abbr: t.abbr, name: t.name, c1: t.c1, c2: t.c2, crest: t.crest, seasons: rows.filter((c) => c.team === i).length }; });
  const best = Object.entries(u.coached).map(([pid, c]) => ({ pid: Number(pid), ...c })).filter((x) => L.players[x.pid])
    .sort((a, b) => (b.dmg + b.ko * 2000) - (a.dmg + a.ko * 2000)).slice(0, 5)
    .map((x) => { const p = L.players[x.pid]; return { pid: x.pid, name: p.name, cid: p.cid, portrait: !!p.portrait, series: p.series, role: p.role, seasons: x.s, dmg: x.dmg, ko: x.ko }; });
  const mine = (L.pantheon || []).filter((x) => rows.some((c) => c.team === x.team && c.season === x.season) || (u.coached[x.pid]?.s || 0) >= 2)
    .map((x) => ({ name: x.name, power: x.power, cid: x.cid, portrait: !!x.portrait }));
  const trophies = MD.trophyShelf(L).map((x) => ({ name: x.name, why: x.why }));
  return {
    id: `${L.seed}-${L.season}-${Date.now()}`, coach: u.coach, finishedSeason: L.season, seasons: rows.length,
    w, l, titles: rows.filter((c) => c.champion).length, playoffs: rows.filter((c) => c.playoffs).length,
    teams, best, pantheon: mine, trophies,
    lastLegends: (L.lastLegends || []).slice(0, 6).map((pid) => { const p = L.players[pid]; return p ? { name: p.name, cid: p.cid, portrait: !!p.portrait, power: p.power } : null; }).filter(Boolean),
    date: new Date().toISOString().slice(0, 10),
  };
}

// The final OSM issue: the coach on the cover.
export function legacyIssue(L, lg) {
  return {
    legacy: true, season: L.season, issue: 'FINAL', week: R.WEEKS, read: false,
    cover: { pid: null, team: L.user.team, line: `${lg.seasons} seasons. ${lg.titles} Celestial Grail${lg.titles === 1 ? '' : 's'}. The coach who saw the legends out.` },
    teasers: [`${lg.w}-${lg.l} career record`, `${lg.playoffs} playoff trip${lg.playoffs === 1 ? '' : 's'}`, `${lg.trophies.length} trophies on the shelf`],
    lg, potm: [], power: [], race: [], rivals: [], news: [],
  };
}

// Finish the dynasty: mark the save, start the New Era. The caller archives
// the returned summary (it lives outside the save, in ARCHIVE_KEY).
export function completeDynasty(L) {
  if (L.complete) return L.legacy;
  const lg = buildLegacy(L);
  L.legacy = lg; L.complete = true; L.era = 2; L.eraSince = L.season + 1;
  L.mags = [legacyIssue(L, lg), ...(L.mags || [])];
  L.news.unshift({ week: 0, off: true, kind: 'THE NEW ERA', team: L.user.team, title: 'The last legend has retired. The New Era begins.',
    text: `Every card in the AFL is now a newcomer. ${L.user.coach} stays on to see what comes next.` });
  return lg;
}

// ---------- Reputation carried into new saves ----------
export function reputation(archive) {
  const list = archive || [];
  return { dynasties: list.length, titles: list.reduce((n, x) => n + (x.titles || 0), 0) };
}
// 2+ career titles: one extra missed season before the hot seat and firing.
export const securityGrace = (rep) => (rep && rep.titles >= 2 ? 1 : 0);
// Free agents like a proven winner.
export const faPull = (rep) => (rep ? Math.min(8, rep.titles * 2 + rep.dynasties) : 0);

export function bigNameArticle(L, ti, rep) {
  const t = L.teams[ti]; const s = L.history[0].standings.find((x) => x.i === ti);
  const coach = L.user.coach;
  const g = rep.titles;
  return { kind: 'YOUR HIRE', title: g ? `${g === 1 ? 'Grail winner' : `${['', '', 'Two', 'Three', 'Four', 'Five'][g] || g}-time Grail winner`} ${coach} takes over ${t.name}` : `${coach}, a coach with a legacy, takes over ${t.name}`,
    text: `${t.name} went ${s.w}-${s.l} last season and went big for their next coach. ${coach} has already finished ${rep.dynasties} dynast${rep.dynasties === 1 ? 'y' : 'ies'}${g ? ` and won ${g} Celestial Grail${g === 1 ? '' : 's'}` : ''}. The AFL expects results.` };
}

// All-time trophy cabinet across every finished dynasty.
export function cabinet(archive) {
  const n = {};
  for (const x of archive || []) for (const t of x.trophies || []) n[t.name] = (n[t.name] || 0) + 1;
  return Object.entries(n).map(([name, c]) => ({ name, n: c })).sort((a, b) => b.n - a.n);
}

R.hooks.issueTeaser = issueTeaser;
