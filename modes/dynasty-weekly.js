// DYNASTY: the Weekly Recap and Weekly Preview (v0.14.0). Pure rules, no DOM.
// The recap looks back at a finished week; the preview looks at the week
// ahead. Playoff chances come from a quick simulation of the rest of the
// season (the playoff field is 10 teams: 4 division winners plus 6).

import * as R from './dynasty-rules.js';
import * as MD from './dynasty-media.js';

const team = (L, i) => L.teams[i];
const pct = (x) => Math.round(x * 100);

// ---------- Playoff chances ----------
// fix = { home, away, winner } forces one game's result.
export function playoffOdds(L, { fix = null, n = 240, fromWeek = L.week } = {}) {
  const str = L.teams.map((t) => R.strength(L, t));
  const chance = (h, a) => 1 / (1 + Math.exp(-(str[h] - str[a] + 0.8) / 3.2));
  const left = [];
  for (let w = fromWeek; w <= R.WEEKS; w++) for (const g of L.schedule[w - 1] || []) if (!g.result) left.push(g);
  const made = new Array(L.teams.length).fill(0);
  let seed = 1234567 + L.week * 97 + (fix ? fix.home * 31 + fix.winner : 0);
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let k = 0; k < n; k++) {
    const w = L.teams.map((t) => t.w);
    for (const g of left) {
      let win;
      if (fix && g.home === fix.home && g.away === fix.away) win = fix.winner;
      else win = rnd() < chance(g.home, g.away) ? g.home : g.away;
      w[win] += 1;
    }
    // v0.23.0: 4 division winners plus the 6 best other records (play-in included).
    const val = (i) => w[i] + (L.teams[i].rw - L.teams[i].rl) * 0.01 + rnd() * 0.001;
    const winners = [];
    for (let d = 0; d < 4; d++) {
      let best = -1; let bv = -1;
      L.teams.forEach((t, i) => { if (t.div !== d) return; const v = val(i); if (v > bv) { bv = v; best = i; } });
      winners.push(best);
    }
    const rest = L.teams.map((t) => t.i).filter((i) => !winners.includes(i)).sort((a, b) => val(b) - val(a)).slice(0, R.PLAYOFF_TEAMS - 4);
    for (const i of [...winners, ...rest]) made[i] += 1;
  }
  return made.map((m) => m / n);
}

// ---------- Draft stock (moves a little every week) ----------
function updateStock(L) {
  const board = (L.draftClass || []).map((pid) => L.players[pid]).filter((p) => p && p.prospect);
  if (!board.length) return;
  let seed = L.week * 7919 + L.season * 104729;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (const p of board) {
    p.buzz = p.buzz == null ? p.aiEye : p.buzz + (p.potential - p.buzz) * 0.15 + (rnd() - 0.5) * 6;
  }
  board.sort((a, b) => b.buzz - a.buzz).forEach((p, i) => { p.stockPrev = p.stock ?? i + 1; p.stock = i + 1; });
}
const stockLabel = (rank) => `#${rank}`;
export function draftStock(L) {
  const board = (L.draftClass || []).map((pid) => L.players[pid]).filter((p) => p && p.prospect && p.stock && p.stockPrev);
  const mv = (p) => p.stockPrev - p.stock;
  const risers = board.filter((p) => mv(p) > 0).sort((a, b) => mv(b) - mv(a)).slice(0, 5);
  const fallers = board.filter((p) => mv(p) < 0).sort((a, b) => mv(a) - mv(b)).slice(0, 5);
  const row = (p) => ({ pid: p.pid, from: stockLabel(p.stockPrev), to: stockLabel(p.stock) });
  return { risers: risers.map(row), fallers: fallers.map(row) };
}

R.hooks.afterWeekWeekly = (L) => updateStock(L);

// ---------- The Weekly Recap ----------
const sideOf = (g, pid) => (g.result.home.includes(pid) ? 'home' : 'away');
const totals = (g) => g.result.rounds?.reduce((t, r) => [t[0] + r[0], t[1] + r[1]], [0, 0]) || [0, 0];

export function recap(L, week) {
  const games = (L.schedule[week - 1] || []).filter((g) => g.result && g.result.lines);
  if (!games.length) return null;
  const all = [];
  for (const g of games) {
    for (const [pid, line] of Object.entries(g.result.lines)) {
      const p = L.players[pid]; if (!p) continue;
      const side = sideOf(g, Number(pid)); const ti = side === 'home' ? g.home : g.away; const opp = side === 'home' ? g.away : g.home;
      const won = g.result.winner === ti;
      const s = g.result.score; const sc = side === 'home' ? [s[0], s[1]] : [s[1], s[0]];
      all.push({ pid: Number(pid), team: ti, opp, home: side === 'home', won, score: sc, dmg: line[0], ko: line[1], sp: line[2], p });
    }
  }
  const top = (list, f) => list.slice().sort((a, b) => f(b) - f(a))[0] || null;
  const fighter = top(all.filter((x) => x.won), (x) => x.dmg);
  const koArtist = top(all.filter((x) => x.pid !== fighter?.pid), (x) => x.ko * 100000 + x.dmg);
  const rookie = top(all.filter((x) => x.p.career <= 1 && x.pid !== fighter?.pid && x.pid !== koArtist?.pid), (x) => x.dmg + x.ko * 3000);
  const bummer = top(all.filter((x) => !x.won), (x) => x.p.power * 1000 - x.dmg);
  const players = [
    fighter && { label: 'FIGHTER OF THE WEEK', ...fighter },
    koArtist && { label: 'KO ARTIST OF THE WEEK', ...koArtist },
    rookie && { label: 'ROOKIE OF THE WEEK', ...rookie },
    bummer && { label: 'BUMMER OF THE WEEK', ...bummer },
  ].filter(Boolean).map(({ p, ...x }) => x);

  const three = games.filter((g) => g.result.rounds.length >= 3);
  const close = three.slice().sort((a, b) => Math.abs(totals(a)[0] - totals(a)[1]) - Math.abs(totals(b)[0] - totals(b)[1]))[0] || null;
  const used = new Set([close]);
  const comebacks = games.filter((g) => !used.has(g) && g.result.rwin.length >= 2 && g.result.rwin[0] !== (g.result.winner === g.home ? 0 : 1));
  const comeback = comebacks.sort((a, b) => Math.abs(b.result.rounds[0][0] - b.result.rounds[0][1]) - Math.abs(a.result.rounds[0][0] - a.result.rounds[0][1]))[0] || null;
  used.add(comeback);
  const sweeps = games.filter((g) => !used.has(g) && g.result.rounds.length === 2);
  const blowout = sweeps.sort((a, b) => Math.abs(totals(b)[0] - totals(b)[1]) - Math.abs(totals(a)[0] - totals(a)[1]))[0] || null;
  const wc = (g) => (g.result.winner === g.home ? g.result.odds : 1 - g.result.odds);
  used.add(blowout);
  const upset = games.filter((g) => !used.has(g) && g.result.odds != null && wc(g) < 0.45).sort((a, b) => wc(a) - wc(b))[0] || null;
  const top25 = games.filter((g) => g.result.rk && g.result.rk[0] <= 25 && g.result.rk[1] <= 25);
  const latest = L.hurtWeek && L.hurtWeek.season === L.season && L.hurtWeek.week === week;
  return {
    week, players,
    close, comeback, blowout, upset, upsetChance: upset ? pct(wc(upset)) : null, top25,
    injuries: latest ? L.hurtWeek.pids.map((pid) => L.players[pid]).filter((p) => p && p.injury > 0).sort((a, b) => b.power - a.power).slice(0, 8).map((p) => p.pid) : [],
    latest: week === L.week - 1 || (L.phase !== 'season' && week === R.WEEKS),
  };
}

export function movers(L) {
  const ts = L.teams.filter((t) => t.prevRank && t.rank);
  const d = (t) => t.prevRank - t.rank;
  return {
    risers: ts.filter((t) => d(t) > 0).sort((a, b) => d(b) - d(a)).slice(0, 5).map((t) => t.i),
    fallers: ts.filter((t) => d(t) < 0).sort((a, b) => d(a) - d(b)).slice(0, 5).map((t) => t.i),
    hot: L.teams.filter((t) => t.streak >= 2).sort((a, b) => b.streak - a.streak).slice(0, 4).map((t) => t.i),
    cold: L.teams.filter((t) => t.streak <= -2).sort((a, b) => a.streak - b.streak).slice(0, 4).map((t) => t.i),
  };
}

export function picture(L) {
  const odds = playoffOdds(L);
  return L.teams.map((t) => ({ i: t.i, odds: odds[t.i] })).sort((a, b) => b.odds - a.odds || team(L, b.i).w - team(L, a.i).w).slice(0, 12);
}

// ---------- The Weekly Preview ----------
const ace = (L, ti) => L.teams[ti].roster.map((pid) => L.players[pid]).filter((p) => p.injury <= 0).sort((a, b) => R.effPower(L, b) - R.effPower(L, a))[0];

export function h2h(L, a, b) {
  const key = a < b ? `${a}-${b}` : `${b}-${a}`;
  const x = L.h2h?.[key];
  return x ? { a: x.w[a] || 0, b: x.w[b] || 0, last: x.last, streak: x.streak } : { a: 0, b: 0, last: null, streak: null };
}

export function preview(L) {
  if (L.phase !== 'season') return null;
  const week = L.week;
  const games = L.schedule[week - 1] || [];
  const dojo = MD.dojoWeek(L);
  const u = L.user;
  const chance = (g) => R.winChance(L, g.home, g.away);
  const gotw = dojo?.games[0] || null;
  // Ace vs ace in the biggest games, plus yours.
  const mine = R.userGame(L);
  const featured = [...(dojo?.games || []).map((d) => games.find((g) => g.home === d.home && g.away === d.away))];
  if (mine && !featured.includes(mine)) featured.unshift(mine);
  const matchups = featured.filter(Boolean).slice(0, 4).map((g) => {
    const a = ace(L, g.away); const h = ace(L, g.home);
    return { home: g.home, away: g.away, mine: g === mine, a: a?.pid ?? null, h: h?.pid ?? null };
  });
  const rivals = games.map((g) => ({ g, rv: R.isRivalry(g.home, g.away, L) })).filter((x) => x.rv).map(({ g, rv }) => {
    const c = chance(g);
    return { home: g.home, away: g.away, trophy: rv[2], book: h2h(L, g.home, g.away), fav: c >= 0.5 ? g.home : g.away, chance: pct(Math.max(c, 1 - c)) };
  });
  // Top-25 matchups with playoff chances now / with a win / with a loss.
  const ranked = games.filter((g) => (team(L, g.home).rank || 99) <= 25 && (team(L, g.away).rank || 99) <= 25)
    .sort((a, b) => (team(L, a.home).rank + team(L, a.away).rank) - (team(L, b.home).rank + team(L, b.away).rank)).slice(0, 3);
  const now = playoffOdds(L);
  const top25 = ranked.map((g) => {
    const hw = playoffOdds(L, { fix: { home: g.home, away: g.away, winner: g.home } });
    const aw = playoffOdds(L, { fix: { home: g.home, away: g.away, winner: g.away } });
    const c = chance(g);
    return { home: g.home, away: g.away, fav: c >= 0.5 ? g.home : g.away, chance: pct(Math.max(c, 1 - c)),
      rows: [[g.away, now[g.away], aw[g.away], hw[g.away]], [g.home, now[g.home], hw[g.home], aw[g.home]]].map(([i, n, w, l]) => ({ i, now: pct(n), win: pct(w), loss: pct(l) })) };
  });
  const lines = games.map((g) => { const c = chance(g); return { home: g.home, away: g.away, fav: c >= 0.5 ? g.home : g.away, dog: c >= 0.5 ? g.away : g.home, chance: pct(Math.max(c, 1 - c)) }; });
  // Ranked favorites who could slip; true toss-ups go under coin flips.
  const upsetAlert = lines.filter((x) => (team(L, x.fav).rank || 99) <= 25 && x.chance > 56 && x.chance <= 78).sort((a, b) => a.chance - b.chance).slice(0, 5);
  const coinFlips = lines.filter((x) => x.chance <= 56).slice(0, 6);
  const race = R.awardRace(L).slice(0, 4).map(({ p }) => {
    const g = games.find((x) => x.home === p.team || x.away === p.team);
    return { pid: p.pid, opp: g ? (g.home === p.team ? g.away : g.home) : null, home: g ? g.home === p.team : null };
  });
  const oldTeam = [];
  for (const g of games) {
    for (const [ti, opp] of [[g.home, g.away], [g.away, g.home]]) {
      for (const pid of L.teams[ti].roster) { const p = L.players[pid]; if (p.formerTeam === opp) oldTeam.push({ pid, team: ti, opp, home: ti === g.home }); }
    }
  }
  const injuries = Object.values(L.players).filter((p) => p.team != null && p.injury > 0).sort((a, b) => b.power - a.power).slice(0, 8).map((p) => p.pid);
  return { week, gotw, gotwChance: gotw ? pct(R.winChance(L, gotw.home, gotw.away)) : null, matchups, rivals, top25, upsetAlert, coinFlips, race, oldTeam: oldTeam.slice(0, 8), injuries, mine: mine ? { home: mine.home, away: mine.away } : null, u: u?.team };
}
