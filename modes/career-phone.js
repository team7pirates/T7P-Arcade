// My Career (v0.41.0, part 4): your phone, sponsorships, retirement and the
// Hall of Fame. Uses the shared phone (core/phone-core.js) like Dynasty and
// Forbidden Fusion; the phone lives in L.career.phone.

import * as R from './dynasty-rules.js';
import { basePhone, say, chirp, lenzPost, snap, fresh, fillIn, sys, back, mine, streakOf } from '../core/phone-core.js';
import { pickPhoto } from '../core/phone-scenes.js';
import { store } from '../core/store.js';
import * as C from './career-rules.js';

const pick = (arr, rand = Math.random) => arr[Math.floor(rand() * arr.length)];
const r1 = (x) => Math.round(x * 10) / 10;
export const AGENT = { key: 'agent', name: 'Nia Vance (agent)', kind: 'agent', icon: '💼' };

export function phoneOf(L) {
  const c = L.career;
  if (!c.phone) c.phone = basePhone({ followers: 1200 + Math.floor(Math.random() * 800) });
  if (!c.deals) c.deals = [];
  if (c.earnings == null) c.earnings = 0;
  return c.phone;
}
const nowOf = (L) => L.season * 20 + R.gameWeek(L);
const line = (L, arr) => fresh(phoneOf(L), arr, Math.random, nowOf(L));

// ---------- Sponsorships ----------
// Original brands only. A deal pays every season it runs, as long as you keep
// your Hype at or above its bar at season's end; drop below and the brand
// walks. Up to 3 at once. Bigger names come when your Hype, awards and fame grow.
export const BRANDS = [
  { id: 'volt', name: 'Volt Fizz', what: 'energy drink', tier: 1 },
  { id: 'ichiban', name: 'Ichiban Ramen', what: 'ramen chain', tier: 1 },
  { id: 'ironclad', name: 'Ironclad Gym', what: 'gym chain', tier: 1 },
  { id: 'ascend', name: 'Ascend', what: 'sneakers', tier: 2 },
  { id: 'nova', name: 'Nova Audio', what: 'headphones', tier: 2 },
  { id: 'shinobi', name: 'Shinobi Streetwear', what: 'clothing', tier: 2 },
  { id: 'lumen', name: 'Lumen', what: 'watches', tier: 3 },
  { id: 'apex', name: 'Apex Motors', what: 'cars', tier: 3 },
];
export const MAX_DEALS = 3;
// Your star power: Hype, trophies, followers.
export function fame(L) {
  const p = C.me(L); const ph = phoneOf(L);
  return p.hype + (L.career.trophies || []).length * 4 + Math.min(30, (ph.followers || 0) / 2000);
}
export function makeOffer(L, rand = Math.random) {
  const c = L.career; const f = fame(L);
  const tier = f >= 95 ? 3 : f >= 70 ? 2 : 1;
  const taken = new Set(c.deals.map((d) => d.id));
  const pool = BRANDS.filter((b) => b.tier <= tier && !taken.has(b.id) && c.offerId !== b.id);
  if (!pool.length || c.deals.length >= MAX_DEALS) return null;
  const b = pick(pool.filter((x) => x.tier === Math.max(...pool.map((y) => y.tier))), rand);
  const per = r1((b.tier === 3 ? 6 : b.tier === 2 ? 3 : 1.2) * R.capScale() * (0.85 + rand() * 0.3));
  const years = 1 + Math.floor(rand() * 3);
  const bar = Math.max(40, Math.min(75, Math.round(C.me(L).hype - 5 + b.tier * 2)));
  return { id: b.id, name: b.name, what: b.what, tier: b.tier, per, years, bar };
}
function offerText(o) { return `${o.name} (${o.what}) want you as the face of their next campaign: ${o.per} a season for ${o.years} season${o.years > 1 ? 's' : ''}. They need your Hype at ${o.bar}+ at the end of each season.`; }
export function sendOffer(L, why = '') {
  const o = makeOffer(L); if (!o) return null;
  const ph = phoneOf(L);
  L.career.offerId = o.id;
  const th = say(ph, AGENT, `${why ? `${why} ` : ''}${offerText(o)}`);
  th.pending = { type: 'deal', season: L.season, offer: o, options: [
    { id: 'yes', tone: 'friendly', text: 'Sign me up.', hint: `+${o.per} a season` },
    { id: 'no', tone: 'focus', text: 'Pass. I\'m focused on fighting.', hint: 'No deal' },
  ] };
  return o;
}
export function reply(L, key, optionId) {
  const ph = phoneOf(L);
  const th = ph.threads.find((x) => x.key === key);
  if (!th || !th.pending) return null;
  const pd = th.pending; const o = pd.options.find((x) => x.id === optionId);
  if (!o) return null;
  mine(th, o.text); th.pending = null;
  if (pd.type === 'deal') {
    L.career.offerId = null;
    if (o.id === 'no') { back(th, 'Your call. I\'ll keep the line open.'); return 'You passed.'; }
    if (L.career.deals.length >= MAX_DEALS) { back(th, 'You\'re already at three deals. Let one run out first.'); return 'Too many deals.'; }
    const d = { ...pd.offer, left: pd.offer.years, since: L.season };
    L.career.deals.push(d);
    back(th, 'Done. Contracts are signed. Look good out there.');
    sys(th, `${d.name}: ${d.per} a season for ${d.years}. Keep Hype ${d.bar}+.`);
    lenzPost(ph, { who: C.me(L).name, cid: C.me(L).cid, photo: pickPhoto(ph, pick(['train', 'off', 'fight'])), caption: `Proud to join the ${d.name} family. 🤝 #ad`, likes: Math.round(ph.followers * 0.08) + 30, when: `Season ${L.season}`, mine: true, verified: fame(L) >= 70 });
    return `Signed with ${d.name}.`;
  }
  return null;
}
// End of season: pay deals, check Hype bars, add salary to career earnings.
export function seasonPayday(L) {
  const p = C.me(L); const c = L.career; const ph = phoneOf(L);
  const out = { salary: R.capHit(p), deals: 0, dropped: [] };
  for (const d of c.deals) {
    if (p.hype >= d.bar) { out.deals += d.per; d.left -= 1; }
    else { out.dropped.push(d.name); d.left = 0; d.dropped = true; }
  }
  c.deals = c.deals.filter((d) => d.left > 0 && !d.dropped);
  c.earnings = r1((c.earnings || 0) + out.salary + out.deals);
  c.dealEarnings = r1((c.dealEarnings || 0) + out.deals);
  if (out.dropped.length) say(ph, AGENT, `Bad news: ${out.dropped.join(' and ')} dropped you. Your Hype fell under their bar.`);
  return out;
}

// ---------- The weekly phone ----------
const COACH = (L) => ({ key: 'coach', name: `Coach ${C.myTeam(L).coachName}`, kind: 'coach', icon: '📋' });
const FANS = ['{me} is HIM 🔥', 'Who taught {me} to fight like that??', '{me} cooking every week', 'Put {me} in the lineup every game coach', '{me} rookie card going up 📈', '{me} just different'];
const HATERS = ['{me} overrated, I said what I said', '{me} disappeared tonight 💀', 'Bench {me}. Next question.', '{me} fans real quiet now'];
const MY_POSTS = { big: ['Another one. 🔥', 'Locked in all week. This is why.', 'They\'re gonna remember that one.'], win: ['Team win. On to the next.', 'Good work by everybody. 💪'], potw: ['Player of the Week. God is good. 🙏', 'Week {week} belonged to us. 🏅'] };
const SNAPS = { train: ['early gym. you coming? 💪', 'extra reps after practice'], eat: ['team dinner after this 🍜', 'cheat meal, don\'t tell coach 🍔'], off: ['recovery day 🌅', 'ice bath again 🥶'], fight: ['locked in for this week 🔒', 'bus ride vibes 🎧'] };
export const SNAP_AURA = 1;

// After your team's game (C.finishGame entry).
export function afterGame(L, e) {
  const ph = phoneOf(L); const p = C.me(L); const rand = Math.random;
  const v = { me: p.name, week: e.week ?? '' };
  // Followers follow your play and your Hype.
  const grow = e.played ? ({ 'A+': 600, A: 350, B: 150, C: 60, D: 0, F: -80 }[e.grade] || 0) + (e.won ? 80 : 0) + (e.mvp ? 300 : 0) : 20;
  ph.followers = Math.max(500, Math.round((ph.followers || 1500) + grow * (0.7 + p.hype / 100)));
  // The coach, on your big nights and your bad ones.
  const q = C.coachReact(L, e);
  if (q) say(ph, COACH(L), q);
  // Fans on Chirp.
  if (e.played && (e.grade === 'A+' || e.grade === 'A' || e.mvp || rand() < 0.3)) {
    chirp(ph, { who: pick(['animefan_22', 'aflwatcher', 'ko_counter', 'gridiron_gojo', 'tank_tuesdays', 'bracketbuster']), handle: '', text: fillIn(pick(e.grade === 'D' || e.grade === 'F' ? HATERS : FANS), v), likes: 40 + Math.floor(rand() * 400), mention: true, when: e.week ? `Week ${e.week}` : e.round });
  }
  // Your Lenz: only the big moments.
  const big = e.played && e.won && (e.grade === 'A+' || e.mvp || e.round);
  if (big) lenzPost(ph, { who: p.name, cid: p.cid, photo: pickPhoto(ph, 'win', rand), caption: fillIn(pick(MY_POSTS.big), v), likes: Math.round(ph.followers * (0.06 + rand() * 0.05)), when: e.week ? `Week ${e.week}` : e.round, mine: true, verified: fame(L) >= 70, comments: [{ who: 'aflwatcher', text: fillIn(pick(FANS), v) }] });
  if (e.potw?.me) lenzPost(ph, { who: p.name, cid: p.cid, photo: pickPhoto(ph, 'win', rand), caption: fillIn(pick(MY_POSTS.potw), v), likes: Math.round(ph.followers * 0.12), when: `Week ${e.week}`, mine: true, verified: fame(L) >= 70 });
  // A teammate snaps you now and then (snap back for a streak).
  if (rand() < 0.4 && L.phase === 'season') {
    const mates = C.myTeam(L).roster.map((pid) => L.players[pid]).filter((x) => !x.me && x.portrait);
    const streaky = mates.filter((x) => streakOf(ph, `snap-${x.pid}`));
    const m = streaky.length && rand() < 0.5 ? pick(streaky) : pick(mates);
    const type = pick(['train', 'eat', 'off', 'fight']);
    if (m) snap(ph, { from: m.name, cid: m.cid, key: `snap-${m.pid}`, photo: pickPhoto(ph, type, rand), caption: pick(SNAPS[type]), when: e.week ? `Week ${e.week}` : '' });
  }
  // Your agent: a sponsor calls after a breakout night, or now and then.
  const hasOffer = ph.threads.some((t) => t.key === 'agent' && t.pending);
  if (!hasOffer && L.career.deals.length < MAX_DEALS && ((e.mvp || e.grade === 'A+') ? rand() < 0.35 : rand() < 0.08)) sendOffer(L, e.mvp ? 'Phones are ringing after that one.' : '');
  if (e.potw?.me && !hasOffer) sendOffer(L, 'Player of the Week! Brands noticed.');
}
// Snap streak: +1 Aura for your next fight per snap back at 3+.
export function onSnapStreak(L) {
  const k = C.trainKey(L);
  const b = L.career.boost?.k === k ? L.career.boost : (L.career.boost = { k, aura: 0 });
  b.aura = Math.min(3, b.aura + SNAP_AURA);
  return `+${b.aura} Aura for your next fight.`;
}
export const auraBoost = (L) => (L.career.boost?.k === C.trainKey(L) ? L.career.boost.aura : 0);
// New season: the agent checks in.
export function seasonStart(L) {
  const ph = phoneOf(L);
  if (!ph.welcomed) { ph.welcomed = true; say(ph, AGENT, `Welcome to the league. I'm Nia, your agent. I handle the money and the brands; you handle the fighting. Text me if you need anything.`); }
  const t = C.myTeam(L);
  say(ph, COACH(L), C.me(L).career <= 1 ? `Welcome to ${t.name}. Work hard and you'll play.` : `New season. Same expectations.`);
  if (L.career.deals.length < MAX_DEALS && fame(L) >= 55) sendOffer(L, 'New season, new money.');
}

// ---------- Retirement and the Hall of Fame ----------
export const RETIRE_FROM = 7;     // you can retire after season 7
export const RETIRE_FORCED = 14;  // after season 14 you have to
export const canRetire = (L) => C.me(L).career >= RETIRE_FROM;
export const mustRetire = (L) => C.me(L).career >= RETIRE_FORCED;
export const HALL_KEY = 'career:hall';
export const HOF_LINE = 45;
export function hofScore(L) {
  const tr = L.career.trophies || []; const tot = C.careerTotals(L);
  const n = (k) => tr.filter((x) => x.kind === k).length;
  const peak = Math.max(C.me(L).power, ...(L.career.seasons || []).map((s) => s.power || 0));
  return Math.round(n('title') * 10 + n('gpt') * 12 + n('roy') * 4 + n('role') * 5 + n('allafl') * 4 + n('potw') + n('awakening') * 2 + n('phoenix') * 2 + n('breakout') * 2
    + (L.career.seasons || []).length * 1.5 + tot.ko / 40 + (peak >= 95 ? 8 : peak >= 90 ? 4 : 0));
}
export async function retire(L) {
  const p = C.me(L);
  const score = hofScore(L);
  const peak = Math.max(p.power, ...(L.career.seasons || []).map((s) => s.power || 0));
  const hof = score >= HOF_LINE;
  const pantheon = hof && peak >= 95 && score >= 70;
  const tot = C.careerTotals(L);
  const teams = [...new Set((L.career.seasons || []).map((s) => s.team).reverse())].map((i) => L.teams[i].abbr);
  const entry = { name: p.name, cid: p.cid, seasons: (L.career.seasons || []).length, totals: tot, trophies: (L.career.trophies || []).length, titles: (L.career.trophies || []).filter((x) => x.kind === 'title').length,
    score, hof, pantheon, peak, teams, earnings: L.career.earnings || 0, drafted: p.draftPick || null, imported: !!L.career.imported, when: Date.now() };
  L.career.retired = entry;
  // Off the roster.
  const t = C.myTeam(L);
  if (t) t.roster = t.roster.filter((x) => x !== p.pid);
  p.retired = true; p.team = null;
  const hall = (await store.get(HALL_KEY, null)) || [];
  hall.unshift(entry);
  await store.set(HALL_KEY, hall.slice(0, 50));
  return entry;
}
export const hallList = async () => (await store.get(HALL_KEY, null)) || [];
