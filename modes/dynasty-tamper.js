// DYNASTY: off-season tampering (v0.29.0). No screen code.
//
// During the re-sign step, other teams' cards whose contracts just ran out
// are still theirs for a few days. You can text up to 3 of them to sway them.
//   - It might work: they refuse to re-sign and hit free agency leaning your
//     way (+14 interest from your team).
//   - It might not: they say no and like you a little less.
//   - You might get caught (separate roll). The texts leak, the sway is void,
//     and it is a scandal in the news and the preseason magazine. First time
//     this off-season: a 3.0 cap fine (dead money). After that: your
//     first-round pick (or a double fine if you already traded it).
//     Every extra text raises the odds of getting caught.
//   - Your bond with the player helps a lot. So does a pitch that fits:
//     money (you have the cap space), winning (your record beats theirs),
//     playing time (nobody ahead of them at their role), or keep it quiet
//     (a bit less likely to work, much less likely to leak).
// AI teams tamper too: one of your expiring cards may text you that another
// team is in their ear. Their ask goes up 15% and that team gets the same
// +14 pull in free agency. You can report it (55%: the league finds proof,
// the other team loses its pick and the ask goes back down).

import * as R from './dynasty-rules.js';
import * as O from './dynasty-off.js';
import { say, back, sys } from '../core/phone-core.js';
import { bondOf, addBond, meet } from '../core/phone-bonds.js';

export const TEXTS = 3;
export const SWAY_PULL = 14;
export const AI_RAISE = 1.15;
export const AI_CHANCE = 0.45;
export const AI_VS_AI = 0.3;
export const REPORT_PROOF = 0.55;
export const CAP_FINE = 3;

const r1 = (n) => Math.round(n * 10) / 10;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const news = (L, item) => { L.news.unshift({ week: 0, off: true, ...item }); L.news = L.news.slice(0, 40); };
export const keyOf = (p) => `p-${p.pid}`;
const who = (p) => ({ key: keyOf(p), name: p.name, cid: p.cid ?? null, kind: 'player' });

function state(L) {
  if (!L.tamper || L.tamper.season !== L.season) L.tamper = { season: L.season, used: 0, caught: 0, ai: false };
  return L.tamper;
}
export const isOpen = (L) => !!L.user && L.phase === 'offseason' && L.off?.step === 'resign';
export const textsLeft = (L) => Math.max(0, TEXTS - state(L).used);
export const swayedBy = (L, p, ti) => p.swayed?.season === L.season && p.swayed.team === ti;
export const tamperedBy = (L, p, ti) => p.tampered?.season === L.season && p.tampered.team === ti;
// Free-agency pull for team ti (used in O.interest).
export const pull = (L, p, ti) => (swayedBy(L, p, ti) || tamperedBy(L, p, ti) ? SWAY_PULL : 0);

// The best expiring cards on other teams that you could text.
export function targets(L) {
  if (!isOpen(L)) return [];
  const out = [];
  for (const t of L.teams) if (t.i !== L.user.team) out.push(...O.expiring(L, t));
  return out.sort((a, b) => b.power - a.power).slice(0, 8);
}

// Odds for each pitch: { sway, caught } as 0-1.
export function odds(L, p, pitch) {
  const me = L.teams[L.user.team]; const t = L.teams[p.team]; const st = state(L);
  let sway = 0.3 + (bondOf(L.phone, keyOf(p)) - 10) / 150;
  if (pitch === 'money') sway += R.capOf(me) - R.payroll(L, me) >= O.askFor(L, p, me) ? (p.lowKey ? 0.08 : 0.16) : -0.12;
  if (pitch === 'winning') sway += clamp(((me.w || 0) - (t.w || 0)) / 25, -0.15, 0.18);
  if (pitch === 'time') {
    const ahead = me.roster.map((pid) => L.players[pid]).filter((q) => q.role === p.role && q.power >= p.power).length;
    sway += ahead === 0 ? 0.16 : ahead === 1 ? 0 : -0.12;
  }
  if (t.stage === 'contender') sway -= 0.05;
  let caught = 0.14 + st.used * 0.1 + (p.hype >= 70 ? 0.06 : 0);
  if (pitch === 'quiet') { sway *= 0.85; caught *= 0.4; }
  return { sway: clamp(sway, 0.08, 0.8), caught: clamp(caught, 0.04, 0.6) };
}
const pct = (x) => `${Math.round(x * 100)}%`;

// Open (or reopen) a thread with a player on another team.
export function start(L, pid) {
  const p = L.players[pid]; const ph = L.phone;
  if (!isOpen(L) || !p || p.team == null || p.team === L.user.team) return null;
  meet(ph, who(p));
  const t = L.teams[p.team];
  const th = say(ph, who(p), `Coach? I'm still a ${t.name} for a few more days. You know you're not supposed to be texting me.`);
  const opt = (id, tone, text, label) => { const o = odds(L, p, id); return { id, tone, text, hint: `${label} · ${pct(o.sway)} it works · ${pct(o.caught)} it leaks` }; };
  th.pending = { type: 'tamper', pid, season: L.season, options: textsLeft(L) > 0 ? [
    opt('money', 'neutral', 'We have the cap space. You\'d get paid what you\'re worth.', 'Money'),
    opt('winning', 'neutral', 'Come win with us. We\'re building something.', 'Winning'),
    opt('time', 'neutral', 'You\'d start for us. No one ahead of you.', 'Playing time'),
    opt('quiet', 'neutral', 'Just saying hi. Keep your options open.', 'Keep it quiet'),
    { id: 'leave', tone: 'later', text: 'You\'re right. Forget I texted.', hint: 'No risk, uses nothing' },
  ] : [{ id: 'leave', tone: 'later', text: 'Never mind. Good luck.', hint: `You've used all ${TEXTS} texts this off-season` }] };
  return th;
}

function scandal(L, ti, p, from) {
  const t = L.teams[ti]; const ownPick = O.pickOwner(L, ti) === ti;
  const second = ti === L.user.team ? state(L).caught >= 1 : true;
  let penalty;
  if (second && ownPick && !t.forfeitPick) { t.forfeitPick = true; t.forfeitWhy = 'tampering'; penalty = 'The league takes their first-round pick.'; }
  else { const fine = second ? CAP_FINE * 2 : CAP_FINE; t.dead = r1((t.dead || 0) + fine); penalty = `The league fines them ${fine} in cap space this season.`; }
  if (ti === L.user.team) state(L).caught += 1;
  news(L, { kind: 'SCANDAL', team: ti, title: `${t.name} caught tampering with ${p.name}`, text: `Texts to the ${from.name} card leaked before free agency. ${penalty}` });
  return penalty;
}

// Your reply in a 'tamper' thread. Returns a line for a toast.
export function reply(L, th, p, o) {
  const pl = L.players[p.pid];
  if (!isOpen(L) || !pl || pl.team == null || pl.team === L.user.team) { sys(th, 'The window closed. Re-signing is over.'); return 'Too late.'; }
  if (o.id === 'leave') { back(th, 'Smart. We never talked. 🤐'); return null; }
  const st = state(L); const from = L.teams[pl.team];
  const od = odds(L, pl, o.id);
  st.used += 1;
  const rand = Math.random;
  const works = rand() < od.sway;
  const leak = rand() < od.caught;
  let out;
  if (works) {
    pl.swayed = { team: L.user.team, season: L.season };
    back(th, pl.lowKey ? 'Okay. I\'m listening. Don\'t make me regret it.' : 'Say less. I\'m not re-signing here. See you in free agency. 😏');
    addBond(L.phone, keyOf(pl), 'accept');
    out = `${pl.name} won't re-sign with the ${from.name}. Free agency, leaning your way.`;
    sys(th, `${pl.name} hits free agency with +${SWAY_PULL} interest in your team.`);
  } else {
    back(th, ['Appreciate it coach, but I\'m staying put.', 'Nah. I owe them one more run.', 'Not interested. Please stop texting me.'][Math.floor(rand() * 3)]);
    addBond(L.phone, keyOf(pl), 'decline');
    out = `${pl.name} isn't biting.`;
  }
  if (leak) {
    delete pl.swayed;
    const penalty = scandal(L, L.user.team, pl, from);
    sys(th, `The texts leaked. SCANDAL. ${penalty}${works ? ' The deal you had is off.' : ''}`);
    out = `Caught tampering! ${penalty}`;
  }
  return out;
}

// ---------- AI teams tamper too ----------
// Runs once when the re-sign step opens.
export function openWindow(L, rand = Math.random) {
  if (!L.user || !L.phone) return;
  const st = state(L);
  if (st.ai) return; st.ai = true;
  const me = L.teams[L.user.team];
  const mine = O.expiring(L, me).sort((a, b) => b.power - a.power);
  if (mine.length && rand() < AI_CHANCE) {
    const p = mine[0];
    const others = L.teams.filter((t) => t.i !== me.i);
    const rival = others.filter((t) => t.stage === 'contender')[Math.floor(rand() * 3)] || others[Math.floor(rand() * others.length)];
    p.tampered = { team: rival.i, season: L.season };
    const th = say(L.phone, who(p), `Coach, heads up. The ${rival.name} have been in my ear. They're talking big money. My ask just went up.`);
    th.pending = { type: 'tampered', pid: p.pid, rival: rival.i, season: L.season, options: [
      { id: 'report', tone: 'neutral', text: 'Thanks for telling me. I\'m reporting them.', hint: `${pct(REPORT_PROOF)}: they get punished and your ask drops back` },
      { id: 'match', tone: 'friendly', text: 'I\'ll take care of you. Don\'t go anywhere.', hint: 'Bond up · the ask stays high' },
      { id: 'cold', tone: 'hostile', text: 'Then go. Nobody\'s bigger than this team.', hint: 'Bond down' },
    ] };
  }
  // Somewhere else in the league, someone gets caught.
  if (rand() < AI_VS_AI) {
    const cands = [];
    for (const t of L.teams) if (t.i !== me.i) cands.push(...O.expiring(L, t));
    const p = cands.sort((a, b) => b.power - a.power)[Math.floor(rand() * Math.min(5, cands.length))];
    if (p) {
      const thief = L.teams.filter((t) => t.i !== me.i && t.i !== p.team)[Math.floor(rand() * (L.teams.length - 2))];
      if (thief) scandal(L, thief.i, p, L.teams[p.team]);
    }
  }
}

// Your reply in a 'tampered' thread.
export function replyTampered(L, th, pend, o) {
  const p = L.players[pend.pid];
  if (!p || p.team !== L.user.team || !isOpen(L)) { sys(th, 'Re-signing is over.'); return null; }
  const rival = L.teams[pend.rival];
  if (o.id === 'report') {
    if (Math.random() < REPORT_PROOF) {
      delete p.tampered;
      const penalty = scandal(L, rival.i, p, L.teams[L.user.team]);
      back(th, 'Good. They had it coming.');
      sys(th, `The league found the texts. ${penalty} ${p.name}'s ask is back to normal.`);
      return `${rival.name} punished. ${p.name}'s ask drops back.`;
    }
    back(th, 'They deleted everything. Nothing the league can do.');
    addBond(L.phone, keyOf(p), 'decline');
    return 'No proof. The ask stays high.';
  }
  // The phone already moves the bond by the reply's tone.
  if (o.id === 'match') { back(th, 'That\'s what I needed to hear. 🤝'); return null; }
  back(th, '...Wow. Okay coach.');
  return null;
}
