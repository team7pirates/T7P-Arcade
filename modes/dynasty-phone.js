// DYNASTY: the phone (v0.18.0). The story engine, no screen code; the screen
// is core/phone-ui.js.
//
// After every week:
//   - GM calls (as texts): other GMs offer trades before the deadline (after
//     Week 8). Some offers move a draft pick: a contender may give you its
//     pick to get your better card, and a rebuild may want your pick for a
//     veteran. Accept, or pass. An offer is good for one week.
//   - Shop your pick: text the League Office and next week a GM calls about it.
//   - Team chat: text your squad before the next game. HYPE (+3 Aura),
//     FOCUS (+3 Clutch) or LET LOOSE (+3 Chaos), for the next game only.
//   - After a win, the losing coach texts you. GLOAT (+2 Chaos next game) or
//     show RESPECT (+2 Aura next game).
//   - Matchup (core/phone-dating.js): a date is +2 Aura next game.
// Phone boosts only count for the next game and stack to +5 a stat.
//   - v0.25.0: fans post about your games on Chirp (the bird app). When one
//     @s your team you can answer: HYPE THE FANS (+1 Aura next game) or CLAP
//     BACK (+1 Chaos). Wins go up on Lenz, and your fighters send Boo snaps.
//     Texts stay in Messages.

import * as R from './dynasty-rules.js';
import * as O from './dynasty-off.js';
import { basePhone, pick, fresh, fillIn, say, mine, back, sys, note, trim, chirp, lenzPost, snap, answerPost } from '../core/phone-core.js';
import * as D from '../core/phone-dating.js';

export const CHAT_BOOST = 3;
export const COACH_BOOST = 2;
export const DATE_BOOST = 2;
export const OFFER_CHANCE = 0.5;

const GM_FIRST = ['Darnell', 'Keiko', 'Marco', 'Priya', 'Hank', 'Sofia', 'Tariq', 'Mei', 'Owen', 'Lucia', 'Rashad', 'Yuki', 'Gus', 'Imani', 'Viktor', 'Noor', 'Cal', 'Hana', 'Reggie', 'Ines'];
const GM_LAST = ['Cole', 'Fujita', 'Russo', 'Shah', 'Briggs', 'Alves', 'Haddad', 'Lin', 'Pratt', 'Moreno', 'Grant', 'Mori', 'Kent', 'Okoye', 'Petrov', 'Aziz', 'Boone', 'Ito', 'Hayes', 'Duarte'];
export const gmName = (t) => `${GM_FIRST[t.i % GM_FIRST.length]} ${GM_LAST[(t.i * 7 + 3) % GM_LAST.length]}`;

const SQUAD_OPENERS = ['Coach, the whole squad is in the chat. Talk to us.', 'Film session done. Anything before {opp}?', '{opp} said we\'re soft. Your move, coach.', 'Last practice before {opp}. Words?', 'Coach, big one this week. Say something.', 'Group chat is quiet. Hype us up, coach.', 'We\'re locked in. What\'s the message for {opp}?', 'Coach. {opp} are talking. Your call.'];
const HYPE = ['This is our league. Fight like it.', 'Every camera in the arena is on us. Smile, then win.', 'Make them regret showing up.', 'Nobody in this league wants to see us. Let\'s go!', 'We are the main event. Act like it.', 'They came to watch us. Give them a show.'];
const FOCUS = ['Win the first round and the rest follows.', 'Trust the matchups. Trust each other.', 'One fight at a time. No highlights, just wins.', 'Stick to the game plan. Win your matchup.', 'Heads down. Every round counts.', 'Discipline wins this one. Stay sharp.'];
const LOOSE = ['Throw the playbook out. Surprise me.', 'Go out there and cause problems.', 'Play like it\'s the backyard. Have fun.', 'Have fun out there. Swing big.', 'No pressure. Go be dangerous.', 'Break their game plan. Get weird with it.'];
const SQUAD_BACK = ['Heard 🗣️', 'We got you coach', 'Running through walls rn', '💯', '🔥🔥🔥', 'LET\'S GOOO', 'Say less coach 💪', 'Locked in.', '🫡'];
const LOSER = ['Your fighters showed up today. Mine didn\'t.', 'Well coached. I\'ll be studying that tape.', 'We\'ll get you in the rematch.', 'Good win. We\'ll see you again.', 'You got us this time.', 'Enjoy it. Next time is different.', 'Respect. Your squad came ready.'];
const GLOAT = ['Maybe take notes next time.', 'Tell your owner I said hi.', 'Rough day at the office, huh?', 'Tell your fighters to get used to it.', 'Same time next season?', 'We didn\'t even need the swap.'];
const RESPECT = ['Your team made it close. Good luck the rest of the way.', 'Thanks for a clean fight.', 'Respect. See you down the road.', 'Good game, coach. Your squad made us earn it.', 'Respect. That was a real fight.', 'GG. Tough team you have.'];

function phoneOf(L) {
  if (!L.phone) L.phone = basePhone({ offers: [] });
  if (!L.phone.offers) L.phone.offers = [];
  if (L.phone.followers == null) L.phone.followers = 4000 + Math.floor(Math.random() * 3000);
  return L.phone;
}
const mineTeam = (L) => L.teams[L.user.team];
// A number that goes up every week, for the no-repeat rule (a line won't come back for 2 weeks).
export const nowOf = (L) => L.season * 20 + R.gameWeek(L);
const line = (L, arr) => fresh(phoneOf(L), arr, Math.random, nowOf(L));
const roster = (L, t) => t.roster.map((pid) => L.players[pid]);

// Set up the phone the first time it opens in a save.
export function ensure(L) {
  const ph = phoneOf(L);
  if (!ph.welcomed) {
    ph.welcomed = true;
    officeEvent(L, true);
    squadEvent(L);
  }
  return ph;
}

// ---------- Boosts for the next game ----------
export function addBoost(L, stat, n) {
  const wk = R.gameWeek(L);
  let b = L.user.phoneBoost;
  if (!b || b.season !== L.season || b.week !== wk) b = L.user.phoneBoost = { season: L.season, week: wk, aura: 0, clutch: 0, chaos: 0 };
  b[stat] = Math.min(R.PHONE_BOOST_MAX, (b[stat] || 0) + n);
}
export function boostText(L) {
  const b = R.phoneBoostNow(L);
  if (!b) return null;
  const parts = ['aura', 'clutch', 'chaos'].filter((k) => b[k]).map((k) => `+${b[k]} ${k.toUpperCase()}`);
  return parts.length ? parts.join(' · ') : null;
}

// ---------- Draft picks ----------
// How much a team's pick is worth, by where that team sits right now (worst
// team picks first) and who's buying (rebuilds love picks).
export const projectedSlot = (L, ti) => O.projectedSlot(L, ti);
export const pickValue = (L, ti, forTeam) => O.pickValue(L, ti, forTeam);
export const pickLabel = (L, ti) => `${L.teams[ti].abbr} draft pick (projected No. ${projectedSlot(L, ti)})`;

// ---------- Trade offers ----------
const tv = (L, p, t) => O.tradeValue(L, p, t);
function legal(L, ti, give, get) {
  const ev = O.evaluateTrade(L, ti, give, get);
  return ev.margin != null; // blocked trades (series, injury, cap, deadline) have no margin
}
function buildOffer(L, rand, wantPick) {
  const me = mineTeam(L);
  const others = L.teams.filter((t) => t.i !== me.i);
  const myPicks = O.picksOwnedBy(L, me.i);
  const mineP = roster(L, me).filter((p) => p.injury <= 0);
  for (let tries = 0; tries < 12; tries++) {
    const t = pick(others, rand);
    const theirs = roster(L, t).filter((p) => p.injury <= 0);
    const theirPick = O.pickOwner(L, t.i) === t.i ? t.i : null;
    // Which kind of call: a rebuild shopping for your pick, a contender
    // buying your card with its pick, or a straight swap.
    let kind = 'swap';
    if ((wantPick || t.stage === 'rebuild') && myPicks.length && rand() < (wantPick ? 1 : 0.5)) kind = 'sell';
    else if (t.stage === 'contender' && theirPick != null && rand() < 0.5) kind = 'buy';
    const cands = [];
    for (const y of mineP) {
      for (const x of theirs) {
        if (!legal(L, t.i, [y.pid], [x.pid])) continue;
        const their = tv(L, y, t) - tv(L, x, t);
        const myGain = tv(L, x, me) - tv(L, y, me);
        if (kind === 'swap' && their >= 2 && myGain >= 0 && x.power >= y.power - 3) cands.push({ give: [y.pid], get: [x.pid], score: myGain + rand() * 3 });
        if (kind === 'buy') {
          const pv = pickValue(L, theirPick, t); const pvMe = pickValue(L, theirPick, me);
          if (their - pv >= 1 && myGain + pvMe >= -3 && y.power > x.power) cands.push({ give: [y.pid], get: [x.pid], pickTi: theirPick, pickTo: me.i, score: myGain + pvMe + rand() * 3 });
        }
        if (kind === 'sell') {
          const pt = myPicks.includes(me.i) ? me.i : myPicks[0];
          const pv = pickValue(L, pt, t); const pvMe = pickValue(L, pt, me);
          if (their + pv >= 1 && myGain - pvMe >= -4 && x.power > y.power) cands.push({ give: [y.pid], get: [x.pid], pickTi: pt, pickTo: t.i, score: myGain - pvMe + rand() * 3 });
        }
      }
    }
    if (!cands.length) continue;
    cands.sort((a, b) => b.score - a.score);
    const c = cands[Math.floor(rand() * Math.min(3, cands.length))];
    return { id: 0, ti: t.i, kind, ...c, season: L.season, week: L.week, phase: L.phase };
  }
  return null;
}
function offerText(L, o) {
  const t = L.teams[o.ti];
  const y = L.players[o.give[0]]; const x = L.players[o.get[0]];
  const hi = `It's ${gmName(t)}, GM of the ${t.name}.`;
  if (o.kind === 'buy') return `${hi} We're making a run. ${y.name} for ${x.name} AND our draft pick (projected No. ${projectedSlot(L, o.pickTi)}). Deal?`;
  if (o.kind === 'sell') return `${hi} I hear your pick is available. ${x.name} is yours for ${y.name} plus your ${o.pickTi === L.user.team ? '' : `${L.teams[o.pickTi].abbr} `}pick (projected No. ${projectedSlot(L, o.pickTi)}).`;
  return `${hi} I like ${y.name}. Straight up for ${x.name}? Both cards ready to go.`;
}
function offerHint(L, o) {
  const y = L.players[o.give[0]]; const x = L.players[o.get[0]];
  const pk = o.pickTi != null ? ` ${o.pickTo === L.user.team ? '+ you get' : '+ you send'} the ${L.teams[o.pickTi].abbr} pick` : '';
  return `Send ${y.name} (${y.role}, ${y.power}) · get ${x.name} (${x.role}, ${x.power})${pk}`;
}
function offerEvent(L, rand, wantPick = false) {
  const ph = phoneOf(L);
  const o = buildOffer(L, rand, wantPick);
  if (!o) return false;
  o.id = ph.seq++;
  ph.offers.unshift(o); ph.offers = ph.offers.slice(0, 12);
  const t = L.teams[o.ti];
  const th = say(ph, { key: `gm-${t.i}`, name: `${gmName(t)} (${t.abbr} GM)`, kind: 'gm', icon: '📞' }, offerText(L, o));
  th.pending = { type: 'trade', offer: o.id, options: [
    { id: 'accept', tone: 'accept', text: 'Done. Send the paperwork.', hint: offerHint(L, o) },
    { id: 'decline', tone: 'decline', text: 'I\'ll pass for now.', hint: 'Nothing changes' },
  ] };
  note(ph, 'Trade call', `${t.name} want to make a deal`, 'msg', th.key);
  return true;
}
// Offers last one week.
function expireOffers(L) {
  const ph = phoneOf(L);
  for (const th of ph.threads) {
    if (th.pending?.type !== 'trade') continue;
    const o = ph.offers.find((x) => x.id === th.pending.offer);
    if (!o || o.phase !== L.phase || (L.phase === 'season' && (o.season !== L.season || o.week < L.week - 1)) || !O.tradeOpen(L)) { th.pending = null; sys(th, 'Offer expired.'); }
  }
}

// ---------- League office: shop your pick ----------
function officeEvent(L, first = false) {
  const ph = phoneOf(L);
  if (!O.tradeOpen(L) || !O.picksOwnedBy(L, L.user.team).length) return;
  const th = say(ph, { key: 'office', name: 'AFL League Office', kind: 'office', icon: '🏛️' }, first
    ? `Welcome to the AFL. GMs will call you here with trades until the deadline (after Week ${R.TRADE_DEADLINE}). Want us to let them know your draft pick is available?`
    : 'Still want your draft pick on the market?');
  th.pending = { type: 'shop', options: [
    { id: 'shop', tone: 'accept', text: 'Yes. Shop my pick.', hint: 'A GM calls about your pick next week' },
    { id: 'quiet', tone: 'decline', text: 'Keep it quiet.', hint: 'No pick calls unless a GM asks' },
  ] };
}

// ---------- Team chat ----------
function squadEvent(L) {
  const ph = phoneOf(L);
  const me = mineTeam(L);
  const ps = roster(L, me).filter((p) => p.injury <= 0);
  if (!ps.length) return;
  const g = L.phase === 'playoffs' ? R.playoffGameForUser(L) : R.userGame(L);
  if (!g) return;
  const opp = L.teams[g.home === me.i ? g.away : g.home];
  const p = pick(ps, Math.random);
  const th = say(ph, { key: 'squad', name: `${me.name} squad`, kind: 'team', icon: '👥' }, `${p.name}: ${fillIn(line(L, SQUAD_OPENERS), { opp: opp.name })}`);
  th.pending = { type: 'squad', week: R.gameWeek(L), season: L.season, options: [
    { id: 'hype', tone: 'hype', text: line(L, HYPE), hint: `+${CHAT_BOOST} Aura for your fighters next game` },
    { id: 'focus', tone: 'focus', text: line(L, FOCUS), hint: `+${CHAT_BOOST} Clutch next game` },
    { id: 'loose', tone: 'loose', text: line(L, LOOSE), hint: `+${CHAT_BOOST} Chaos next game` },
  ] };
}

// ---------- After a win: the other coach ----------
function coachEvent(L, g) {
  const ph = phoneOf(L);
  const u = L.user.team;
  if (!g?.result || g.result.winner !== u) return;
  const ti = g.home === u ? g.away : g.home; const t = L.teams[ti];
  const th = say(ph, { key: `coach-${ti}`, name: `${t.coachName || 'Coach'} (${t.abbr} coach)`, kind: 'coach', icon: '🧢' }, line(L, LOSER));
  th.pending = { type: 'coach', options: [
    { id: 'gloat', tone: 'gloat', text: line(L, GLOAT), hint: `+${COACH_BOOST} Chaos next game (your squad saw that)` },
    { id: 'respect', tone: 'respect', text: line(L, RESPECT), hint: `+${COACH_BOOST} Aura next game` },
  ] };
}

// ---------- v0.25.0: Chirp, Lenz and Boo ----------
const FAN_HANDLES = ['@CouchCoachAFL', '@ArenaRatTV', '@RealityCheckAFL', '@BracketBrain', '@SeasonTicketSam', '@AFLBarbershop', '@HotTakeHana', '@FilmRoomFrank', '@TopRopeTalk', '@NoCapStats'];
const WIN_POSTS = ['{tag} looked unstoppable today. {score} over {opp}.', 'Somebody check on {opp}. {tag} did not play nice.', '{tag} are the real deal and I\'m tired of pretending they aren\'t.', 'That {score} win was a statement. {tag} 🔥', 'Coach of the year talk starts NOW. {tag}', 'Every week {tag} find a new way to win.'];
const LOSS_POSTS = ['{tag} lost to {opp}?? Fire somebody.', '{score}. I need a minute. {tag}', '{tag} fans, we don\'t talk about this one.', 'Overrated. {tag} folded against {opp}.', 'That lineup was a choice, {tag}.', 'Rough night for {tag}. Bounce back or bust.'];
const NEUTRAL = ['Power rankings are a joke this week. Fight me.', 'This league is so much fun right now.', 'Who\'s winning the Grail? Wrong answers only.', 'Trade deadline brain is taking over.', 'Best fight of the week was not even close.', 'Somebody tell me why the refs keep calling it early.'];
const FAN_LOVE = ['Been rocking with {tag} since day one 💜', '{tag} got the best squad in the league no debate', 'I\'d run through a wall for this team. {tag}', 'Front row next home game. {tag} let\'s gooo'];
const FAN_HATE = ['{tag} are a one-season wonder.', 'Can\'t wait for {tag} to fall off.', '{tag} fans are the loudest and the wrongest.', 'Lucky. Every. Week. {tag}'];
const HYPE_FANS = ['Love you all. See you at the next one. 💜', 'This team plays for you. Keep showing up.', 'Best fans in the AFL. Simple as that.'];
const CLAP_BACK = ['Check the standings and get back to me.', 'Save this post. You\'ll want to delete it later.', 'Keep watching. I know you will.'];
const LENZ_WIN = ['Big win. Bigger week. 📸', 'Game day energy. ✅', 'Player of the game. 🏆', 'Locker room was loud tonight.'];
const SNAP_SQUAD = ['coach look at this ice bath 🥶', 'film room again?? 😴', 'gym at 6am, who\'s coming', 'pre-game fit check 🔥', 'we locked in coach 🔒', 'bus ride vibes 🎧'];
const tagOf = (t) => `@${t.abbr}AFL`;
function socialAfterGame(L, g) {
  const ph = phoneOf(L); const me = mineTeam(L); const rand = Math.random;
  const when = L.phase === 'playoffs' ? 'Playoffs' : `Week ${R.gameWeek(L) - 1 || 1}`;
  if (g?.result) {
    const won = g.result.winner === me.i;
    const opp = L.teams[g.home === me.i ? g.away : g.home];
    const s = g.result.score; const sc = g.home === me.i ? s : [s[1], s[0]];
    const v = { tag: tagOf(me), opp: opp.name, score: `${sc[0]}-${sc[1]}` };
    chirp(ph, { who: pick(FAN_HANDLES, rand), text: fillIn(line(L, won ? WIN_POSTS : LOSS_POSTS), v), likes: 40 + Math.floor(rand() * 900), when });
    if (rand() < 0.6) chirp(ph, { who: pick(FAN_HANDLES, rand), text: fillIn(line(L, won ? LOSS_POSTS : WIN_POSTS), { ...v, tag: tagOf(opp), opp: me.name }), likes: 10 + Math.floor(rand() * 300), when });
    ph.followers = Math.max(0, ph.followers + (won ? 250 + Math.floor(rand() * 400) : -Math.floor(rand() * 150)));
    if (won) {
      const best = roster(L, me).filter((p) => p.portrait).sort((a, b) => (b.ovr || b.power || 0) - (a.ovr || a.power || 0));
      const star = best.length ? pick(best.slice(0, 4), rand) : null;
      if (star) lenzPost(ph, { who: me.name, cid: star.cid, caption: `${line(L, LENZ_WIN)} ${star.name} vs ${opp.name}.`, likes: Math.round(ph.followers * (0.06 + rand() * 0.05)), when, mine: true, verified: true,
        comments: [{ who: pick(FAN_HANDLES, rand), text: fillIn(pick(FAN_LOVE, rand), v) }] });
    }
    // One fan @s you directly.
    if (rand() < 0.7) {
      const hater = !won ? rand() < 0.7 : rand() < 0.35;
      const p = chirp(ph, { who: pick(FAN_HANDLES, rand), text: fillIn(line(L, hater ? FAN_HATE : FAN_LOVE), v), likes: 5 + Math.floor(rand() * 200), when, mention: true, hater });
      p.pending = { type: 'fan', season: L.season, week: R.gameWeek(L), options: [
        { id: 'hype', tone: 'hype', text: line(L, HYPE_FANS), hint: '+1 Aura for your fighters next game' },
        { id: 'clap', tone: 'hostile', text: line(L, CLAP_BACK), hint: '+1 Chaos next game' },
      ] };
    }
  } else if (rand() < 0.5) chirp(ph, { who: pick(FAN_HANDLES, rand), text: line(L, NEUTRAL), likes: 20 + Math.floor(rand() * 400), when });
  const top = (L.news || [])[0];
  if (top && top.title && top.title !== ph.lastNewsChirp) { ph.lastNewsChirp = top.title; chirp(ph, { who: '@AFL', text: top.title, likes: 800 + Math.floor(rand() * 4000), when, verified: true }); }
  // A fighter sends a snap.
  if (rand() < 0.45) {
    const ps = roster(L, me).filter((p) => p.portrait && p.injury <= 0);
    const p = ps.length ? pick(ps, rand) : null;
    if (p) snap(ph, { from: p.name, cid: p.cid, caption: line(L, SNAP_SQUAD), when });
  }
  // Old mentions you didn't answer close after a week.
  for (const x of ph.feed || []) if (x.pending && (x.pending.season !== L.season || x.pending.week < R.gameWeek(L))) x.pending = null;
}
export function replyPost(L, id, optionId) {
  const ph = phoneOf(L);
  const p = (ph.feed || []).find((x) => x.id === id);
  if (!p || !p.pending) return null;
  const o = p.pending.options.find((x) => x.id === optionId);
  if (!o) return null;
  const stat = o.id === 'hype' ? 'aura' : 'chaos';
  addBoost(L, stat, 1);
  ph.followers += o.id === 'hype' ? 120 : 60;
  answerPost(ph, id, o.text, o.id === 'hype' ? '!!! 😭💜' : 'ok coach chill 💀', p.who);
  return `+1 ${stat[0].toUpperCase()}${stat.slice(1)} next game.`;
}

// ---------- After each week (hooked into endWeek) ----------
export function afterWeek(L, games) {
  if (!L.user) return;
  const ph = phoneOf(L);
  if (!ph.welcomed) { ensure(L); return; }
  const rand = Math.random;
  expireOffers(L);
  const g = games?.find((x) => x.home === L.user.team || x.away === L.user.team);
  if (rand() < 0.75) coachEvent(L, g);
  socialAfterGame(L, g);
  if (O.tradeOpen(L)) {
    if (ph.shop) { if (offerEvent(L, rand, true)) ph.shop = false; }
    else if (rand() < OFFER_CHANCE) offerEvent(L, rand);
    if (L.week === 4 && !ph.shop) officeEvent(L);
  }
  squadEvent(L);
  if (D.dating(ph).matches.length) D.refreshPrompts(ph, dateCtx(L));
  trim(ph);
}
// The off-season, until draft day: a GM may call at each step.
export function offseasonOffer(L) {
  if (!L.user || !O.tradeOpen(L)) return false;
  phoneOf(L); expireOffers(L);
  return Math.random() < 0.55 ? offerEvent(L, Math.random) : false;
}
// After a playoff game the user is still alive in.
export function afterPlayoffGame(L, g) {
  if (!L.user || !L.phone) return;
  coachEvent(L, g);
  socialAfterGame(L, g);
  if (L.playoffs && L.playoffs.champion == null) squadEvent(L);
}

export const dateCtx = (L) => ({ rand: Math.random, now: nowOf(L), turn: `s${L.season}w${R.gameWeek(L)}`, turnLabel: 'week', where: 'the AFL broadcast', when: 'game', perk: `+${DATE_BOOST} Aura for your team next game` });
export function onDate(L) { addBoost(L, 'aura', DATE_BOOST); }

// ---------- Replies ----------
export function reply(L, key, optionId) {
  const ph = phoneOf(L);
  const th = ph.threads.find((x) => x.key === key);
  if (!th || !th.pending) return null;
  const p = th.pending; const o = p.options.find((x) => x.id === optionId);
  if (!o) return null;
  mine(th, o.text); th.pending = null;
  if (p.type === 'squad') {
    if (p.season !== L.season || p.week !== R.gameWeek(L)) { sys(th, 'That game already happened.'); return 'Too late for that game.'; }
    const stat = { hype: 'aura', focus: 'clutch', loose: 'chaos' }[o.id];
    addBoost(L, stat, CHAT_BOOST);
    back(th, line(L, SQUAD_BACK));
    sys(th, `+${CHAT_BOOST} ${stat.toUpperCase()} for your fighters next game.`);
    return `+${CHAT_BOOST} ${stat[0].toUpperCase()}${stat.slice(1)} next game.`;
  }
  if (p.type === 'coach') {
    const stat = o.id === 'gloat' ? 'chaos' : 'aura';
    addBoost(L, stat, COACH_BOOST);
    back(th, o.id === 'gloat' ? '...We\'ll remember that.' : 'Appreciate that, coach.');
    return `+${COACH_BOOST} ${stat[0].toUpperCase()}${stat.slice(1)} next game.`;
  }
  if (p.type === 'shop') {
    ph.shop = o.id === 'shop';
    back(th, ph.shop ? 'Done. Expect a call next week.' : 'Understood.');
    return ph.shop ? 'Your pick is on the market.' : null;
  }
  if (p.type === 'trade') {
    const off = ph.offers.find((x) => x.id === p.offer);
    if (o.id !== 'accept') { back(th, 'Your call. Phone\'s always on.'); if (off) off.status = 'declined'; return 'Offer declined.'; }
    const res = accept(L, off);
    if (!res.ok) { back(th, `Hold on, that doesn't work anymore: ${res.why}`); return res.why; }
    back(th, 'Pleasure doing business. 🤝');
    sys(th, res.text);
    return res.text;
  }
  return null;
}

export function accept(L, off) {
  if (!off) return { ok: false, why: 'The offer is gone.' };
  const me = L.user.team;
  if (!O.tradeOpen(L)) return { ok: false, why: 'trades are closed right now.' };
  if (off.give.some((pid) => L.players[pid]?.team !== me) || off.get.some((pid) => L.players[pid]?.team !== off.ti)) return { ok: false, why: 'one of those cards has moved.' };
  if (!legal(L, off.ti, off.give, off.get)) return { ok: false, why: 'the league won\'t approve it (series limit, injury or cap).' };
  if (off.pickTi != null) {
    const from = off.pickTo === me ? off.ti : me;
    if (O.pickOwner(L, off.pickTi) !== from) return { ok: false, why: 'that pick isn\'t theirs to trade anymore.' };
  }
  if ((off.phase || 'season') !== L.phase) return { ok: false, why: 'that offer is from before the season ended.' };
  O.doTrade(L, me, off.ti, off.give, off.get);
  let text = `Trade done: ${off.get.map((pid) => L.players[pid].name).join(' + ')} join the ${L.teams[me].name}.`;
  if (off.pickTi != null) {
    L.pickOwner = L.pickOwner || {};
    L.pickOwner[off.pickTi] = off.pickTo;
    const to = L.teams[off.pickTo];
    L.news.unshift({ week: L.week, kind: 'TRADE', team: off.pickTo, title: `${to.name} get the ${L.teams[off.pickTi].abbr} draft pick`, text: 'Part of a deal made over the phone.' });
    text += off.pickTo === me ? ` You also get the ${L.teams[off.pickTi].abbr} draft pick.` : ` The ${L.teams[off.pickTi].abbr} pick goes to the ${L.teams[off.ti].name}.`;
  }
  off.status = 'done';
  return { ok: true, text };
}

R.hooks.afterWeekPhone = afterWeek;
