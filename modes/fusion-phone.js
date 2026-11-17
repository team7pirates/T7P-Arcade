// FORBIDDEN FUSION: the phone (v0.17.0). The story engine, no screen code.
//
// Floor 1 is a normal fight. After that, everything is shaped by the phone:
// after each floor you clear, someone reaches out, and how you answer decides
// who you fight next.
//   - Trash talk: answer HOSTILE and the trash-talker is your next opponent
//     (a callout: Bounty ×1.5, big follower jump). HUMBLE keeps the climb
//     normal (and earns a little respect). Leaving them on read changes nothing.
//   - The boss (the floor before every boss floor) either wants to test you
//     first (accept: you fight their lieutenant now; beat them and the boss
//     comes in rattled, −5 Power) or says you're not worth their time
//     (HOSTILE: "bring everyone", so the boss floor becomes a crew of 3 weaker
//     cards for Bounty ×1.6; HUMBLE: the boss comes alone, as normal).
//   - Sponsors offer a deal with a task (clear 3 floors, clear a floor above
//     half health, win a callout). Finish it for Bounty and followers.
//   - Your trainer checks in when you're hurt: rest (heal 12% now, next floor
//     pays 20% less) or push on.
//   - Fans and haters DM you; replies move your followers.
// Followers stay with you between climbs. Every 2,500 gives +1 Aura in the
// Tower (up to +10).

import { floorPower, isBoss, swarmSize, BOSS_EVERY } from './fusion-rules.js';

export const MAX_FOLLOWER_AURA = 10;
export const FOLLOWERS_PER_AURA = 2500;
export const followerAura = (n) => Math.min(MAX_FOLLOWER_AURA, Math.floor((n || 0) / FOLLOWERS_PER_AURA));
export const CALLOUT_BOUNTY = 1.5;
export const CREW_BOUNTY = 1.6;
export const REST_HEAL = 0.12;
export const REST_PENALTY = 0.8;

const pick = (arr, rand) => arr[Math.floor(rand() * arr.length)];
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => (v[k] != null ? v[k] : ''));
const short = (name) => String(name).split(' ')[0];

// ---------- Phone state ----------
export function newPhone(followers = 0) {
  return { threads: [], feed: [], news: [], deals: [], followers, unread: 0, notes: [], seq: 1 };
}
export function thread(ph, who) {
  let t = ph.threads.find((x) => x.key === who.key);
  if (!t) { t = { key: who.key, name: who.name, cid: who.cid ?? null, kind: who.kind, msgs: [], pending: null, unread: 0 }; ph.threads.unshift(t); }
  else { ph.threads = [t, ...ph.threads.filter((x) => x !== t)]; }
  return t;
}
function say(ph, who, text, floor) {
  const t = thread(ph, who);
  t.msgs.push({ from: 'them', text, floor });
  t.unread += 1; ph.unread += 1;
  note(ph, who.name, text, 'msg', t.key);
  return t;
}
export function me(ph, t, text) { t.msgs.push({ from: 'me', text }); }
function sys(t, text) { t.msgs.push({ from: 'sys', text }); }
function note(ph, title, text, app, key = null) {
  ph.notes.unshift({ id: ph.seq++, title, text, app, key });
  ph.notes = ph.notes.slice(0, 6);
}
function post(ph, who, text, likes, floor, cid = null) {
  ph.feed.unshift({ id: ph.seq++, who, text, likes, floor, cid });
  ph.feed = ph.feed.slice(0, 60);
}
function headline(ph, title, text, floor) {
  ph.news.unshift({ id: ph.seq++, title, text, floor });
  ph.news = ph.news.slice(0, 40);
  note(ph, 'AGN Wire', title, 'news');
}
export function gainFollowers(ph, n) { ph.followers = Math.max(0, Math.round(ph.followers + n)); }

// ---------- Lines ----------
const TRASH = [
  'Floor {floor}? Cute. {me} hasn\'t fought anyone real yet.',
  'Saw your last fight. If that\'s the best the Gym can make, I\'m not worried.',
  'Everybody keeps saying your name. Let me be the one who shuts them up.',
  'You got lucky on floor {floor}. Luck runs out.',
  'I\'ve been waiting for someone like you to climb this high. Easy work.',
  'They call you the Forbidden One? I call you my next highlight.',
];
const HOSTILE_REPLY = ['Pull up. Next floor, you and me.', 'Say less. You\'re next.', 'Talk is cheap. Meet me on floor {next}.'];
const HUMBLE_REPLY = ['Respect. I\'ll see you when I see you.', 'Just here to climb. Good luck up there.', 'All love. I\'m focused on my own fights.'];
const HOSTILE_BACK = ['Bet. Don\'t blink.', 'Finally. Floor {next}.', 'Clear your schedule.'];
const HUMBLE_BACK = ['...Fine. Stay out of my way.', 'Soft. Whatever.', 'We\'ll see how long that lasts.'];

const BOSS_TEST = ['You made it to floor {floor}. Before you get to me, I want to see what you really have. My lieutenant, {lt}, is waiting on floor {next}.', 'I don\'t fight strangers. Beat {lt} on floor {next} and maybe I\'ll take you seriously.'];
const BOSS_SNUB = ['Floor {boss}? You\'re not worth my time. My crew will handle you.', 'I\'ve watched your climb. I\'m not impressed. When you get to floor {boss}, you\'ll meet my people, not me.'];
const FANS = ['Been with you since floor 1! 🔥', 'You\'re the reason I watch the Tower now.', 'Can you shout me out after your next win?? 🙏'];
const HATERS = ['Overrated. Floor {floor} is where you fold.', 'Bandwagon fighter with a borrowed face.', 'I\'ll be laughing when you lose.'];
const TRAINER_HURT = ['You took a beating on floor {floor}. I can patch you up if you sit out a round of promo work. Your call.', 'You\'re running hot and hurt. Rest up a bit before the next one?'];
const SPONSORS = [
  { brand: 'Kiai Energy', task: 'clear3', label: 'Clear the next 3 floors', pay: 1.0 },
  { brand: 'Shinobi Wear', task: 'healthy', label: 'Clear a floor with more than half your health left', pay: 0.8 },
  { brand: 'Ramen Rush', task: 'callout', label: 'Accept a callout and win it', pay: 1.3 },
  { brand: 'Zenith Gloves', task: 'boss', label: 'Beat the next boss', pay: 1.5 },
];
const FEED_WIN = ['{me} just cleared floor {floor} and didn\'t even look tired.', 'Floor {floor} down. This climb is different.', 'Somebody check on {foe}. {me} is not playing.', 'The Tower is shaking. {me} on floor {floor}!!'];
const FEED_HATE = ['{me} is a fraud, wait for the boss.', 'Floor {floor} was a gift. Next one\'s real.'];
const FAN_NAMES = ['@TowerWatcher', '@ForbiddenFan99', '@OmegaSwarmSZN', '@BountyHunterX', '@GymRatTV', '@FloorByFloor', '@AGN_Fan', '@KiaiKid'];

// ---------- After floor 1 onward: plan the next event ----------
// Called after a floor is cleared, before the next floor is planned.
// ctx: { floor (just cleared), hp, maxHp, foes (ids, names), roster, rand, me (fighter name), hard }
export function afterFloor(r, ctx) {
  const ph = r.phone; const { floor, rand, roster } = ctx;
  const next = floor + 1;
  r.plan = r.plan || {};
  const foeName = ctx.foes[0]?.name || 'them';
  // Deals that just finished or failed.
  settleDeals(r, ctx);
  // The feed and the news react to every floor.
  post(ph, pick(FAN_NAMES, rand), fill(pick(FEED_WIN, rand), { me: ctx.me, floor, foe: foeName }), 50 + Math.floor(rand() * 400) + floor * 40, floor);
  if (rand() < 0.4) post(ph, pick(FAN_NAMES, rand), fill(pick(FEED_HATE, rand), { me: ctx.me, floor }), 10 + Math.floor(rand() * 90), floor);
  gainFollowers(ph, 60 + floor * 25 + (ctx.underdog ? 120 : 0) + (ctx.callout ? 300 : 0) + (ctx.boss ? 400 : 0));
  if (ctx.boss) headline(ph, `${ctx.me} takes down the boss of floor ${floor}`, `${foeName} falls. The Tower has a new name to fear.`, floor);
  else if (ctx.callout) headline(ph, `${ctx.me} answers the callout`, `${foeName} talked. ${ctx.me} answered on floor ${floor}.`, floor);
  else if (floor % 3 === 0) headline(ph, `${ctx.me} reaches floor ${next}`, `${floor} floors cleared on this climb${ctx.hard ? ' (Hard)' : ''}.`, floor);

  // One main event: what decides the next floor.
  const bossNext = isBoss(next);
  const bossAfter = isBoss(next + 1);
  if (bossAfter && !r.plan[next]) { bossEvent(r, ctx, next); }
  else if (!bossNext && !r.plan[next]) { trashEvent(r, ctx, next); }
  // Side events.
  if (ctx.hp / ctx.maxHp < 0.45 && !bossNext) trainerEvent(r, ctx);
  if (rand() < 0.35 && !ph.deals.some((d) => d.status === 'active' || d.status === 'offer')) dealEvent(r, ctx);
  if (rand() < 0.5) fanEvent(r, ctx);
}

function nearChar(roster, target, avoid, rand, width = 4) {
  let pool = roster.filter((c) => c.powerLevel && !avoid.has(c.id) && Math.abs(c.powerLevel - target) <= width);
  if (pool.length < 4) pool = roster.filter((c) => c.powerLevel && !avoid.has(c.id) && Math.abs(c.powerLevel - target) <= width * 3);
  return pool.length ? pick(pool, rand) : null;
}
const avoidOf = (r) => new Set([...(r.recent || []), ...Object.values(r.plan || {}).flatMap((p) => p.ids || [])]);

function trashEvent(r, ctx, next) {
  // Trash talkers come in hot: stronger than the floor (and past floor 10 they
  // fight alone but at swarm-level danger).
  const c = nearChar(ctx.roster, Math.min(99, floorPower(next, ctx.hard) + 6 + (swarmSize(next) - 1) * 4), avoidOf(r), ctx.rand);
  if (!c) return;
  const who = { key: `c${c.id}`, name: c.name, cid: c.id, kind: 'rival' };
  const t = say(r.phone, who, fill(pick(TRASH, ctx.rand), { floor: ctx.floor, me: short(ctx.me) }), ctx.floor);
  t.pending = { type: 'trash', floor: next, cid: c.id, options: [
    { id: 'hostile', tone: 'hostile', text: fill(pick(HOSTILE_REPLY, ctx.rand), { next }), hint: `${short(c.name)} becomes your floor ${next} opponent · Bounty ×${CALLOUT_BOUNTY}` },
    { id: 'humble', tone: 'humble', text: pick(HUMBLE_REPLY, ctx.rand), hint: 'Keep climbing as normal · a few followers for staying classy' },
  ] };
}

function bossEvent(r, ctx, next) {
  const bossFloor = next + 1;
  const boss = nearChar(ctx.roster, Math.min(99, floorPower(bossFloor, ctx.hard) + 8), avoidOf(r), ctx.rand, 3);
  if (!boss) return;
  r.plan[bossFloor] = { type: 'boss', ids: [boss.id], mod: 0, mult: 1 };
  const who = { key: `c${boss.id}`, name: boss.name, cid: boss.id, kind: 'boss' };
  if (ctx.rand() < 0.55) {
    const lt = nearChar(ctx.roster, Math.min(99, floorPower(next, ctx.hard) + 4), new Set([...avoidOf(r), boss.id]), ctx.rand);
    if (!lt) return;
    const t = say(r.phone, who, fill(pick(BOSS_TEST, ctx.rand), { floor: ctx.floor, next, lt: lt.name }), ctx.floor);
    t.pending = { type: 'boss-test', floor: next, bossFloor, lt: lt.id, options: [
      { id: 'accept', tone: 'hostile', text: `Send ${short(lt.name)}. Then I\'m coming for you.`, hint: `Floor ${next} is ${short(lt.name)} (+4 Power) · win and the boss comes in rattled (−5 Power)` },
      { id: 'decline', tone: 'humble', text: 'I don\'t need to audition. See you on your floor.', hint: 'Normal floor next · the boss comes at full strength' },
    ] };
  } else {
    const t = say(r.phone, who, fill(pick(BOSS_SNUB, ctx.rand), { boss: bossFloor }), ctx.floor);
    t.pending = { type: 'boss-snub', floor: bossFloor, options: [
      { id: 'hostile', tone: 'hostile', text: 'Send all of them. I\'ll come through every one.', hint: `Floor ${bossFloor} becomes the boss\'s crew of 3 · Bounty ×${CREW_BOUNTY}` },
      { id: 'humble', tone: 'humble', text: 'Respect. I\'ll earn the fight with you.', hint: 'The boss fights you alone, as normal' },
    ] };
  }
}

function trainerEvent(r, ctx) {
  if (r.phone.threads.find((t) => t.key === 'trainer')?.pending) return;
  const who = { key: 'trainer', name: 'Coach Daichi (your trainer)', kind: 'trainer' };
  const t = say(r.phone, who, fill(pick(TRAINER_HURT, ctx.rand), { floor: ctx.floor }), ctx.floor);
  t.pending = { type: 'rest', options: [
    { id: 'rest', tone: 'humble', text: 'You\'re right. Patch me up.', hint: `Heal ${Math.round(REST_HEAL * 100)}% now · next floor pays ${Math.round((1 - REST_PENALTY) * 100)}% less Bounty` },
    { id: 'push', tone: 'hostile', text: 'No time. I\'m going up.', hint: 'No heal · full Bounty' },
  ] };
}

function dealEvent(r, ctx) {
  const d = pick(SPONSORS, ctx.rand);
  const pay = Math.round((20 + ctx.floor * 3) * d.pay);
  const deal = { id: r.phone.seq++, brand: d.brand, task: d.task, label: d.label, pay, followers: 250 + ctx.floor * 20, status: 'offer', start: ctx.floor, progress: 0 };
  r.phone.deals.unshift(deal);
  const who = { key: `deal-${deal.id}`, name: d.brand, kind: 'sponsor' };
  const t = say(r.phone, who, `We love what you're doing in the Tower. Deal: ${d.label.toLowerCase()} and we pay ${pay} Bounty plus a shout-out to our followers. In?`, ctx.floor);
  t.pending = { type: 'deal', deal: deal.id, options: [
    { id: 'accept', tone: 'humble', text: 'Let\'s get it. Deal.', hint: `Pays ${pay} Bounty when done` },
    { id: 'decline', tone: 'hostile', text: 'Not interested.', hint: 'No deal' },
  ] };
  note(r.phone, d.brand, 'New sponsor offer', 'deals');
}

function fanEvent(r, ctx) {
  const hater = ctx.rand() < 0.45;
  const name = pick(FAN_NAMES, ctx.rand);
  const who = { key: `fan-${name}`, name, kind: hater ? 'hater' : 'fan' };
  const t = say(r.phone, who, fill(pick(hater ? HATERS : FANS, ctx.rand), { floor: ctx.floor }), ctx.floor);
  t.pending = { type: hater ? 'hater' : 'fan', options: hater
    ? [{ id: 'clap', tone: 'hostile', text: 'Watch the next floor and cry about it.', hint: 'Followers +150 (spicy), small chance it backfires' },
      { id: 'ignore', tone: 'humble', text: '🙏 Appreciate you watching anyway.', hint: 'Followers +60' }]
    : [{ id: 'love', tone: 'humble', text: 'Thank you! This one\'s for you 🔥', hint: 'Followers +100' },
      { id: 'flex', tone: 'hostile', text: 'Just getting started. Stay tuned.', hint: 'Followers +80' }] };
}

// ---------- Replies ----------
// Returns a short line for a toast.
export function reply(r, key, optionId, ctx) {
  const ph = r.phone; const t = ph.threads.find((x) => x.key === key);
  if (!t || !t.pending) return null;
  const p = t.pending; const o = p.options.find((x) => x.id === optionId);
  if (!o) return null;
  me(ph, t, o.text);
  t.pending = null;
  r.plan = r.plan || {};
  const back = (text) => t.msgs.push({ from: 'them', text });
  let line = '';
  if (p.type === 'trash') {
    if (o.id === 'hostile') {
      r.plan[p.floor] = { type: 'callout', ids: [p.cid], mod: 0, mult: CALLOUT_BOUNTY };
      back(fill(pick(HOSTILE_BACK, ctx.rand), { next: p.floor }));
      sys(t, `CALLOUT: ${t.name} is your floor ${p.floor} opponent.`);
      gainFollowers(ph, 120);
      post(ph, '@AGN_Wire', `CALLOUT ALERT: ${ctx.me} vs ${t.name} is set for floor ${p.floor}.`, 900 + Math.floor(ctx.rand() * 600), p.floor);
      line = `${t.name} is your next opponent.`;
    } else {
      back(pick(HUMBLE_BACK, ctx.rand));
      gainFollowers(ph, 40);
      line = 'You kept it classy. The climb goes on as normal.';
    }
  } else if (p.type === 'boss-test') {
    if (o.id === 'accept') {
      r.plan[p.floor] = { type: 'lieutenant', ids: [p.lt], mod: 4, mult: 1.2, boss: p.bossFloor };
      back('Good. Don\'t disappoint me.');
      sys(t, `TEST: floor ${p.floor} is the boss's lieutenant. Win and the boss is rattled.`);
      line = 'The boss is sending a lieutenant to test you.';
    } else { back('Then you\'d better be ready.'); line = 'The boss will be waiting at full strength.'; }
  } else if (p.type === 'boss-snub') {
    const plan = r.plan[p.floor];
    if (o.id === 'hostile') {
      if (plan) Object.assign(plan, { type: 'crew', crew: true, mult: CREW_BOUNTY });
      back('Your funeral.');
      sys(t, `THE CREW: floor ${p.floor} is now 3 of the boss's people.`);
      gainFollowers(ph, 150);
      line = `Floor ${p.floor} is now the boss's crew of 3.`;
    } else { back('Hm. Maybe you\'re smarter than you look.'); line = 'The boss will face you alone.'; }
  } else if (p.type === 'rest') {
    if (o.id === 'rest') {
      r.hp = Math.min(r.maxHp, Math.round(r.hp + r.maxHp * REST_HEAL));
      r.restPenalty = true;
      back('Good. Sit down, drink this.');
      line = `Healed ${Math.round(REST_HEAL * 100)}%. Your next floor pays less.`;
    } else { back('Your funeral. Go.'); line = 'No rest. Full Bounty.'; }
  } else if (p.type === 'deal') {
    const d = ph.deals.find((x) => x.id === p.deal);
    if (d) d.status = o.id === 'accept' ? 'active' : 'declined';
    back(o.id === 'accept' ? 'Contract\'s in your Deals app. Get it done.' : 'Your loss.');
    line = o.id === 'accept' ? `Deal signed with ${t.name}.` : 'Deal declined.';
  } else if (p.type === 'fan' || p.type === 'hater') {
    if (o.id === 'clap') {
      if (ctx.rand() < 0.2) { gainFollowers(ph, -120); back('LOL screenshot taken. Everybody saw that.'); line = 'That backfired. −120 followers.'; }
      else { gainFollowers(ph, 150); back('...'); line = '+150 followers.'; }
    } else { const n = o.id === 'love' ? 100 : o.id === 'flex' ? 80 : 60; gainFollowers(ph, n); back(o.id === 'ignore' ? 'whatever' : '!!!!! 😭'); line = `+${n} followers.`; }
  }
  return line;
}

// ---------- The next floor, shaped by the phone ----------
// Returns { ids, mod, mult, type } or null (a normal floor).
export function planFor(r, floor) {
  const p = r.plan?.[floor];
  if (!p) return null;
  if (p.type === 'boss' && r.rattled === floor) return { ...p, mod: -5 };
  return p;
}

// After a floor is won: settle tests (rattle the boss) and deals.
export function onCleared(r, floor) {
  const p = r.plan?.[floor];
  if (p && p.type === 'lieutenant' && p.boss) r.rattled = p.boss;
  if (r.plan) delete r.plan[floor];
}

function settleDeals(r, ctx) {
  for (const d of r.phone.deals) {
    if (d.status !== 'active') continue;
    let done = false;
    if (d.task === 'clear3') { d.progress += 1; done = d.progress >= 3; }
    else if (d.task === 'healthy') done = ctx.hpBefore / ctx.maxHp > 0.5;
    else if (d.task === 'callout') done = !!ctx.callout;
    else if (d.task === 'boss') done = !!ctx.boss;
    if (done) {
      d.status = 'done';
      r.runBounty += d.pay; r.dealBounty = (r.dealBounty || 0) + d.pay;
      gainFollowers(r.phone, d.followers);
      const t = thread(r.phone, { key: `deal-${d.id}`, name: d.brand, kind: 'sponsor' });
      t.msgs.push({ from: 'them', text: `Deal done! ${d.pay} Bounty sent. Our followers love you.` }); t.unread += 1; r.phone.unread += 1;
      note(r.phone, d.brand, `Deal paid: +${d.pay} Bounty`, 'deals');
    }
  }
}

// Pending decisions still waiting before the given floor's fight.
export function waiting(r) {
  return (r.phone?.threads || []).filter((t) => t.pending && ['trash', 'boss-test', 'boss-snub'].includes(t.pending.type));
}
export function markRead(r, key) {
  const t = r.phone.threads.find((x) => x.key === key);
  if (t) { r.phone.unread = Math.max(0, r.phone.unread - t.unread); t.unread = 0; }
}
export { BOSS_EVERY };
