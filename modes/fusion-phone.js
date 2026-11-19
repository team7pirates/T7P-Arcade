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
//   - v0.25.0: fans and haters @ you on Chirp (the bird app) instead of
//     texting; reply from the post. Big wins go up on Lenz, and the people
//     you beat send Boo snaps.
//   - v0.18.0: the people you beat text you after the fight. GLOAT for
//     followers, but they want a rematch 3 floors later (a revenge callout:
//     +3 Power, Bounty ×1.5). Show RESPECT and they send you a tip: +4 Aura
//     for your next floor.
//   - v0.18.0: Matchup (core/phone-dating.js): a good date is +5 Aura for
//     your next floor.
// Followers stay with you between climbs. Every 2,500 gives +1 Aura in the
// Tower (up to +10).

import { floorPower, isBoss, swarmSize, BOSS_EVERY } from './fusion-rules.js';
import { chirp, lenzPost, snap, answerPost } from '../core/phone-core.js';
import { meet, bondOf, addBond, levelOf } from '../core/phone-bonds.js';

export const MAX_FOLLOWER_AURA = 10;
export const FOLLOWERS_PER_AURA = 2500;
export const followerAura = (n) => Math.min(MAX_FOLLOWER_AURA, Math.floor((n || 0) / FOLLOWERS_PER_AURA));
export const CALLOUT_BOUNTY = 1.5;
export const CREW_BOUNTY = 1.6;
export const REST_HEAL = 0.12;
export const REST_PENALTY = 0.8;
// v0.28.0: allies. A fighter you're Close with (bond 60+) can back you up on
// your next floor: they jump in mid-fight with one big hit (two at Ride or
// die, bond 80+). You pay them a share of that floor's Bounty, only if you win.
// No backup on boss floors, nobody backs you up against themselves, and an
// ally rests 3 floors after helping.
export const ALLY_BOND = 60;
export const ALLY_BEST = 80;
export const ALLY_REST = 3;
export const allyCut = (bond) => (bond >= ALLY_BEST ? 0.2 : 0.3);
export const allyUses = (bond) => (bond >= ALLY_BEST ? 2 : 1);

const pick = (arr, rand) => arr[Math.floor(rand() * arr.length)];
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => (v[k] != null ? v[k] : ''));
const short = (name) => String(name).split(' ')[0];
// v0.19.0: a line you saw (or sent) won't come back for 2 floors.
export const FRESH_GAP = 2;
function fresh(r, arr, rand) {
  const ph = r.phone; const now = r.floor || 0;
  if (!ph.used) ph.used = {};
  for (const k of Object.keys(ph.used)) if (now - ph.used[k] > FRESH_GAP + 1) delete ph.used[k];
  const ok = arr.filter((t) => !(t in ph.used) || now - ph.used[t] > FRESH_GAP);
  const t = pick(ok.length ? ok : arr, rand);
  ph.used[t] = now;
  return t;
}

// ---------- Phone state ----------
export function newPhone(followers = 0) {
  return { threads: [], feed: [], lenz: [], snaps: [], gallery: [], news: [], deals: [], followers, unread: 0, notes: [], seq: 1 };
}
export function thread(ph, who) {
  let t = ph.threads.find((x) => x.key === who.key);
  if (!t) { t = { key: who.key, name: who.name, cid: who.cid ?? null, kind: who.kind, msgs: [], pending: null, unread: 0 }; ph.threads.unshift(t); }
  else { ph.threads = [t, ...ph.threads.filter((x) => x !== t)]; }
  return t;
}
function say(ph, who, text, floor) {
  const t = thread(ph, who);
  if (who.icon) t.icon = who.icon;
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
function post(ph, who, text, likes, floor, cid = null, extra = {}) {
  return chirp(ph, { who, text, likes, floor, cid, when: `Floor ${floor}`, verified: who === '@AGN_Wire', ...extra });
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
  'Your whole climb is a highlight reel of easy fights.',
  'I watched you breathe hard on floor {floor}. That\'s embarrassing.',
  'You fight like you read the manual last night.',
  'The Gym really let you out looking like that?',
  'Stop climbing. You\'re making the rest of us look bored.',
  'I\'ll make it quick. I have plans after.',
  'Your fans are loud. Let\'s see how loud they are after I\'m done.',
  'Floor {floor} was a warm-up for me. It was your peak.',
];
const HOSTILE_REPLY = ['Pull up. Next floor, you and me.', 'Say less. You\'re next.', 'Talk is cheap. Meet me on floor {next}.', 'Floor {next}. Bring your excuses.', 'You picked the wrong fighter to text.', 'I\'ll see you on floor {next}. Don\'t be late.', 'Keep my name out your mouth. Floor {next}.', 'Book it. You and me, floor {next}.'];
const HUMBLE_REPLY = ['Respect. I\'ll see you when I see you.', 'Just here to climb. Good luck up there.', 'All love. I\'m focused on my own fights.', 'Appreciate the attention. Back to work.', 'Hope you have a good climb too.', 'I let my fights do the talking.', 'Noted. Stay safe up there.', 'Not today. I\'ve got a floor to clear.'];
const CLOWN_REPLY = ['Who? 😂', 'Sorry, I only respond to fighters with highlights.', 'This you? *posts your worst loss*', 'Did your trainer write that for you? 🤣', 'I\'d fight you but you\'re not on my level. Literally. Floor numbers.', 'Cute message. Framing it.'];
const HOSTILE_BACK = ['Bet. Don\'t blink.', 'Finally. Floor {next}.', 'Clear your schedule.', 'I\'ve been waiting for this.', 'Don\'t back out now.', 'Perfect. Bring a medic.'];
const HUMBLE_BACK = ['...Fine. Stay out of my way.', 'Soft. Whatever.', 'We\'ll see how long that lasts.', 'Boring. But okay.', 'Hm. Classy. I hate it.', 'Your loss. Or mine. Whatever.'];
const CLOWN_MAD = ['Oh you think you\'re FUNNY? Floor {next}. Me. You.', 'Laugh now. I\'m booking floor {next}.', 'Screenshot this: floor {next}, you\'re done.'];
const CLOWN_QUIET = ['...', 'whatever bro', 'lol ok', 'blocked'];

const BOSS_TEST = ['Everybody says you\'re special. {lt} works for me. Floor {next}. Show me.', 'Before you climb to me, get past {lt} on floor {next}. If you can.', 'You made it to floor {floor}. Before you get to me, I want to see what you really have. My lieutenant, {lt}, is waiting on floor {next}.', 'I don\'t fight strangers. Beat {lt} on floor {next} and maybe I\'ll take you seriously.'];
const BOSS_SNUB = ['You think I fight every nobody who climbs? My crew waits on floor {boss}.', 'Floor {boss} is mine. You\'ll never see me. Just my people.', 'Floor {boss}? You\'re not worth my time. My crew will handle you.', 'I\'ve watched your climb. I\'m not impressed. When you get to floor {boss}, you\'ll meet my people, not me.'];
const FANS = ['Been with you since floor 1! 🔥', 'You\'re the reason I watch the Tower now.', 'Can you shout me out after your next win?? 🙏', 'My little brother dressed as you for school today 😭', 'Watched floor {floor} three times. Unreal.', 'Got your fighter as my lock screen now.', 'Please never stop climbing.', 'Floor {floor} had me screaming at my phone!!'];
const HATERS = ['Overrated. Floor {floor} is where you fold.', 'Bandwagon fighter with a borrowed face.', 'I\'ll be laughing when you lose.', 'Your fans are bots.', 'Mid fighter, loud fans.', 'Lucky. Every. Single. Floor.', 'Can\'t wait for the boss to humble you.', 'You only beat people who were tired.'];
const CLAP = ['Watch the next floor and cry about it.', 'Keep watching. I know you will.', 'You spelled "goat" wrong.', 'Write me a longer one next time.', 'Thanks for the views 😘'];
const IGNORE = ['🙏 Appreciate you watching anyway.', 'All good. Enjoy the show.', 'Hope your day gets better.', 'Love you too 💜'];
const LOVE = ['Thank you! This one\'s for you 🔥', 'You\'re the best. Next floor\'s for you.', 'Shout-out to you! 🙌', 'This means a lot. Let\'s keep going.'];
const FLEX = ['Just getting started. Stay tuned.', 'You haven\'t seen anything yet.', 'Top floor or nothing.', 'Get comfortable. It\'s a long climb.'];
const TRAINER_HURT = ['You took a beating on floor {floor}. I can patch you up if you sit out a round of promo work. Your call.', 'You\'re running hot and hurt. Rest up a bit before the next one?', 'That last fight cost you. Ice bath and some tape? It\'ll slow the money down.', 'I\'m not sending you up there like this. Ten minutes on my table?', 'You\'re limping. Rest or keep pushing, I\'m with you either way.'];
// Each sponsor's task fits what they sell (v0.18.0).
const SPONSORS = [
  { brand: 'Kiai Energy', icon: '⚡', rep: 'Tomo at Kiai Energy', task: 'clear3', label: 'Clear the next 3 floors', pay: 1.0,
    pitch: 'Kiai Energy is about stamina. Show the Tower you don\'t run out: clear the next 3 floors in a row' },
  { brand: 'Shinobi Wear', icon: '🥷', rep: 'Ren at Shinobi Wear', task: 'healthy', label: 'Clear a floor with more than half your health left', pay: 0.8,
    pitch: 'Shinobi Wear is clean and untouchable. Win a floor without getting roughed up (more than half your health left)' },
  { brand: 'Callout Cola', icon: '🥤', rep: 'Jess at Callout Cola', task: 'callout', label: 'Accept a callout and win it', pay: 1.3,
    pitch: 'Callout Cola: for people who answer back. Accept a callout and win it' },
  { brand: 'Zenith Gloves', icon: '🥊', rep: 'Hiro at Zenith Gloves', task: 'boss', label: 'Beat the next boss', pay: 1.5,
    pitch: 'Zenith Gloves are made for knockouts. Put them on and beat the next boss' },
];
const FEED_WIN = ['{me} said "next" and meant it. Floor {floor} done.', 'Not even close. {me} on floor {floor}.', 'Clip of the day: {me} vs {foe}.', 'Tower check: {me} still standing after floor {floor}.', '{me} just cleared floor {floor} and didn\'t even look tired.', 'Floor {floor} down. This climb is different.', 'Somebody check on {foe}. {me} is not playing.', 'The Tower is shaking. {me} on floor {floor}!!'];
const FEED_HATE = ['{me} fans are acting like floor {floor} was hard 💀', 'Ask me again when {me} sees a real boss.', '{me} is a fraud, wait for the boss.', 'Floor {floor} was a gift. Next one\'s real.'];
const FAN_NAMES = ['@TowerWatcher', '@ForbiddenFan99', '@OmegaSwarmSZN', '@BountyHunterX', '@GymRatTV', '@FloorByFloor', '@AGN_Fan', '@TopFloorTalk'];
// After you beat them.
const BEATEN_SALTY = ['My hand slipped. That\'s all that was.', 'You didn\'t beat me. I beat myself.', 'Don\'t post that clip.', 'Lucky shot. Lucky fight.', 'That was luck. Run it back.', 'I slipped. Don\'t get comfortable.', 'Enjoy it while it lasts.', 'Everybody saw that. Next time is different.'];
const BEATEN_GOOD = ['That special move was nasty. Teach me sometime?', 'You hit harder than you look.', 'Okay, I see the hype now.', 'Go win it all. Make me look good.', 'GG. You\'re the real thing.', 'Respect. I didn\'t think you had that in you.', 'Good fight. My body hurts. 😂', 'Okay. You earned that one.'];
const GLOAT = ['Ice that ego while you\'re at it.', 'Stay on the floor next time.', 'Highlight of my week. Thanks.', 'I barely broke a sweat.', 'Sit down. Floor {floor} belongs to me.', 'Tell everybody who did that to you.', 'That\'s what happens when you get in my way.'];
const RESPECT = ['You were tougher than I thought.', 'Proud to share the floor with you.', 'Heal up. Run it back sometime, friendly.', 'Real one. Respect.', 'Good fight. You pushed me.', 'Respect. You made me work for it.', 'GG. Heal up.'];
const REVENGE = ['I can\'t sleep since that fight. Floor {floor}. Let\'s fix that.', 'Round two. Floor {floor}. No excuses this time.', 'Remember me? Floor {floor}. Me and you. Again.', 'I trained for this. Rematch on floor {floor}.', 'You talked a lot after last time. Floor {floor}.'];
export const BEATEN_TIP = 4;       // Aura for your next floor after a respectful reply
export const REVENGE_GAP = 3;      // floors until a gloated foe comes back
export const DATE_AURA = 5;        // Aura for your next floor after a date

// ---------- After floor 1 onward: plan the next event ----------
// Called after a floor is cleared, before the next floor is planned.
// ctx: { floor (just cleared), hp, maxHp, foes (ids, names), roster, rand, me (fighter name), hard }
export function afterFloor(r, ctx) {
  const ph = r.phone; const { floor, rand, roster } = ctx;
  const next = floor + 1;
  r.plan = r.plan || {};
  const foeName = ctx.foes[0]?.name || 'them';
  // v0.27.0: everyone you fight goes in your contacts.
  for (const f of ctx.foes || []) if (f?.id != null) meet(ph, { key: `c${f.id}`, name: f.name, cid: f.id, kind: ctx.boss ? 'boss' : 'rival' });
  meet(ph, { key: 'trainer', name: 'Coach Daichi (your trainer)', kind: 'trainer' });
  // Deals that just finished or failed.
  settleDeals(r, ctx);
  // The feed and the news react to every floor.
  post(ph, pick(FAN_NAMES, rand), fill(fresh(r, FEED_WIN, rand), { me: ctx.me, floor, foe: foeName }), 50 + Math.floor(rand() * 400) + floor * 40, floor);
  if (rand() < 0.4) post(ph, pick(FAN_NAMES, rand), fill(fresh(r, FEED_HATE, rand), { me: ctx.me, floor }), 10 + Math.floor(rand() * 90), floor);
  gainFollowers(ph, 60 + floor * 25 + (ctx.underdog ? 120 : 0) + (ctx.callout ? 300 : 0) + (ctx.boss ? 400 : 0));
  if (ctx.boss) headline(ph, `${ctx.me} takes down the boss of floor ${floor}`, `${foeName} falls. The Tower has a new name to fear.`, floor);
  else if (ctx.callout) headline(ph, `${ctx.me} answers the callout`, `${foeName} talked. ${ctx.me} answered on floor ${floor}.`, floor);
  else if (floor % 3 === 0) headline(ph, `${ctx.me} reaches floor ${next}`, `${floor} floors cleared on this climb${ctx.hard ? ' (Hard)' : ''}.`, floor);

  // The fighter you just beat has something to say.
  beatenEvent(r, ctx);
  allyOfferEvent(r, ctx);
  lenzEvent(r, ctx);
  snapEvent(r, ctx);
  // One main event: what decides the next floor.
  const bossNext = isBoss(next);
  const bossAfter = isBoss(next + 1);
  // A rematch you earned by gloating comes first.
  if (r.revenge && next >= r.revenge.floor && !bossNext && !bossAfter && !r.plan[next]) revengeEvent(r, ctx, next);
  if (bossAfter && !r.plan[next]) { bossEvent(r, ctx, next); }
  else if (!bossNext && !r.plan[next]) { trashEvent(r, ctx, next); }
  // Side events.
  if (ctx.hp / ctx.maxHp < 0.45 && !bossNext) trainerEvent(r, ctx);
  if (rand() < Math.min(0.75, 0.35 * (r.build?.talents?.dealChance || 1)) && !ph.deals.some((d) => d.status === 'active' || d.status === 'offer')) dealEvent(r, ctx);
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
  const t = say(r.phone, who, fill(fresh(r, TRASH, ctx.rand), { floor: ctx.floor, me: short(ctx.me) }), ctx.floor);
  t.pending = { type: 'trash', floor: next, cid: c.id, options: [
    { id: 'hostile', tone: 'hostile', text: fill(fresh(r, HOSTILE_REPLY, ctx.rand), { next }), hint: `${short(c.name)} becomes your floor ${next} opponent · Bounty ×${CALLOUT_BOUNTY}` },
    { id: 'humble', tone: 'humble', text: fresh(r, HUMBLE_REPLY, ctx.rand), hint: 'Keep climbing as normal · a few followers for staying classy' },
    { id: 'clown', tone: 'funny', text: fresh(r, CLOWN_REPLY, ctx.rand), hint: `+180 followers · coin flip: they get mad and call you out anyway (Bounty ×${CALLOUT_BOUNTY})` },
  ], cname: c.name };
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
    const t = say(r.phone, who, fill(fresh(r, BOSS_TEST, ctx.rand), { floor: ctx.floor, next, lt: lt.name }), ctx.floor);
    t.pending = { type: 'boss-test', floor: next, bossFloor, lt: lt.id, options: [
      { id: 'accept', tone: 'hostile', text: `Send ${short(lt.name)}. Then I\'m coming for you.`, hint: `Floor ${next} is ${short(lt.name)} (+4 Power) · win and the boss comes in rattled (−5 Power)` },
      { id: 'decline', tone: 'humble', text: 'I don\'t need to audition. See you on your floor.', hint: 'Normal floor next · the boss comes at full strength' },
    ] };
  } else {
    const t = say(r.phone, who, fill(fresh(r, BOSS_SNUB, ctx.rand), { boss: bossFloor }), ctx.floor);
    t.pending = { type: 'boss-snub', floor: bossFloor, options: [
      { id: 'hostile', tone: 'hostile', text: 'Send all of them. I\'ll come through every one.', hint: `Floor ${bossFloor} becomes the boss\'s crew of 3 · Bounty ×${CREW_BOUNTY}` },
      { id: 'humble', tone: 'humble', text: 'Respect. I\'ll earn the fight with you.', hint: 'The boss fights you alone, as normal' },
    ] };
  }
}

function beatenEvent(r, ctx) {
  const foe = ctx.foes[0]; if (!foe) return;
  const big = ctx.callout || ctx.boss || ctx.type === 'lieutenant' || ctx.type === 'revenge';
  if (!big && ctx.rand() > 0.55) return;
  const who = { key: `c${foe.id}`, name: foe.name, cid: foe.id, kind: ctx.boss ? 'boss' : 'rival' };
  const salty = ctx.rand() < (ctx.callout || ctx.type === 'revenge' ? 0.75 : 0.5);
  const t = say(r.phone, who, fresh(r, salty ? BEATEN_SALTY : BEATEN_GOOD, ctx.rand), ctx.floor);
  const canRevenge = !ctx.boss && !r.revenge;
  t.pending = { type: 'beaten', cid: foe.id, floor: ctx.floor, options: [
    { id: 'gloat', tone: 'gloat', text: fill(fresh(r, GLOAT, ctx.rand), { floor: ctx.floor }), hint: canRevenge ? `+250 followers · ${short(foe.name)} wants a rematch in ${REVENGE_GAP} floors (+3 Power, Bounty ×${CALLOUT_BOUNTY})` : '+250 followers' },
    { id: 'respect', tone: 'respect', text: fresh(r, RESPECT, ctx.rand), hint: `+80 followers · they send you a tip: +${BEATEN_TIP} Aura next floor` },
  ] };
}

function revengeEvent(r, ctx, next) {
  const rv = r.revenge; r.revenge = null;
  r.plan[next] = { type: 'revenge', ids: [rv.cid], mod: 3, mult: CALLOUT_BOUNTY };
  const t = say(r.phone, { key: `c${rv.cid}`, name: rv.name, cid: rv.cid, kind: 'rival' }, fill(fresh(r, REVENGE, ctx.rand), { floor: next }), ctx.floor);
  sys(t, `REMATCH: ${rv.name} is your floor ${next} opponent (+3 Power) · Bounty ×${CALLOUT_BOUNTY}.`);
  headline(r.phone, `${rv.name} wants revenge`, `After the trash talk, ${rv.name} called for a rematch on floor ${next}.`, ctx.floor);
}

function trainerEvent(r, ctx) {
  if (r.phone.threads.find((t) => t.key === 'trainer')?.pending) return;
  const who = { key: 'trainer', name: 'Coach Daichi (your trainer)', kind: 'trainer' };
  const t = say(r.phone, who, fill(fresh(r, TRAINER_HURT, ctx.rand), { floor: ctx.floor }), ctx.floor);
  t.pending = { type: 'rest', options: [
    { id: 'rest', tone: 'humble', text: 'You\'re right. Patch me up.', hint: `Heal ${Math.round(REST_HEAL * 100)}% now · next floor pays ${Math.round((1 - REST_PENALTY) * 100)}% less Bounty` },
    { id: 'push', tone: 'hostile', text: 'No time. I\'m going up.', hint: 'No heal · full Bounty' },
  ] };
}

function dealEvent(r, ctx) {
  const d = pick(SPONSORS, ctx.rand);
  const pay = Math.round((20 + ctx.floor * 3) * d.pay * (r.build?.talents?.dealPay || 1));
  const deal = { id: r.phone.seq++, brand: d.brand, task: d.task, label: d.label, pay, followers: 250 + ctx.floor * 20, status: 'offer', start: ctx.floor, progress: 0 };
  r.phone.deals.unshift(deal);
  deal.icon = d.icon;
  const who = { key: `deal-${deal.id}`, name: d.brand, kind: 'sponsor', icon: d.icon };
  const t = say(r.phone, who, `Hey, it's ${d.rep}. ${d.pitch}, and we pay ${pay} Bounty plus a shout-out to our followers. In?`, ctx.floor);
  t.pending = { type: 'deal', deal: deal.id, options: [
    { id: 'accept', tone: 'humble', text: 'Let\'s get it. Deal.', hint: `Pays ${pay} Bounty when done` },
    { id: 'decline', tone: 'hostile', text: 'Not interested.', hint: 'No deal' },
  ] };
  note(r.phone, d.brand, 'New sponsor offer', 'deals');
}

function fanEvent(r, ctx) {
  const hater = ctx.rand() < 0.45;
  const name = pick(FAN_NAMES, ctx.rand);
  const handle = `@${String(ctx.me).replace(/[^\w]/g, '') || 'you'}`;
  const text = `${handle} ${fill(fresh(r, hater ? HATERS : FANS, ctx.rand), { floor: ctx.floor })}`;
  const t = post(r.phone, name, text, 20 + Math.floor(ctx.rand() * (hater ? 120 : 400)), ctx.floor, null, { mention: true, hater });
  t.pending = { type: hater ? 'hater' : 'fan', options: hater
    ? [{ id: 'clap', tone: 'hostile', text: fresh(r, CLAP, ctx.rand), hint: 'Followers +150 (spicy), small chance it backfires' },
      { id: 'ignore', tone: 'humble', text: fresh(r, IGNORE, ctx.rand), hint: 'Followers +60' }]
    : [{ id: 'love', tone: 'humble', text: fresh(r, LOVE, ctx.rand), hint: 'Followers +100' },
      { id: 'flex', tone: 'hostile', text: fresh(r, FLEX, ctx.rand), hint: 'Followers +80' }] };
}

// v0.25.0: reply to an @ on Chirp. Returns a short line for a toast.
export function replyPost(r, id, optionId, ctx) {
  const ph = r.phone; const p = (ph.feed || []).find((x) => x.id === id);
  if (!p || !p.pending) return null;
  const o = p.pending.options.find((x) => x.id === optionId);
  if (!o) return null;
  const type = p.pending.type;
  let line = ''; let back = null;
  if (type === 'hater' && o.id === 'clap') {
    if (ctx.rand() < 0.2) { gainFollowers(ph, -120); back = 'LOL screenshot taken. Everybody saw that.'; line = 'That backfired. −120 followers.'; }
    else { gainFollowers(ph, 150); back = '...'; line = '+150 followers.'; }
  } else { const n = o.id === 'love' ? 100 : o.id === 'flex' ? 80 : 60; gainFollowers(ph, n); back = o.id === 'ignore' ? 'whatever' : '!!!!! 😭'; line = `+${n} followers.`; }
  answerPost(ph, id, o.text, back, p.who);
  p.likes += Math.round(20 + ctx.rand() * 80);
  return line;
}

// ---------- Lenz and Boo ----------
const MY_LENZ = ['Floor {floor}. Still standing. 🗼', 'Another one. Floor {floor} ✅', 'They said I\'d stop at {floor}. 🤫', 'Boss down. Who\'s next? 👑', 'Callout answered. 📸', 'Hard work, floor {floor}.'];
const CHAR_LENZ = ['Training day. 💪', 'Somebody up there is climbing fast. I\'m watching.', 'Rest day. Don\'t get used to it.', 'Warming up for whoever\'s next.', 'New gear, same energy.', 'Tower view hits different tonight.', 'Floor talk is cheap. See you up there.'];
const SNAP_LOST = ['still sore from that 😤', 'run it back soon', 'my trainer is yelling at me rn', 'ok you hit hard', 'not posting that fight 💀', 'GG. ice bath time 🧊'];
function lenzEvent(r, ctx) {
  const ph = r.phone; const { floor, rand } = ctx;
  if (!ph.lenz) ph.lenz = [];
  if (ctx.boss || ctx.callout || floor % 5 === 0) {
    const cap = fill(ctx.boss ? MY_LENZ[3] : ctx.callout ? MY_LENZ[4] : fresh(r, MY_LENZ.slice(0, 3).concat(MY_LENZ[5]), rand), { floor });
    lenzPost(ph, { who: ctx.me, cid: r.build?.faceId ?? null, caption: cap, likes: Math.round(ph.followers * (0.08 + rand() * 0.06)) + 40, when: `Floor ${floor}`, mine: true,
      comments: [{ who: pick(FAN_NAMES, rand), text: fill(pick(FANS, rand), { floor }) }, ...(rand() < 0.5 ? [{ who: pick(FAN_NAMES, rand), text: fill(pick(HATERS, rand), { floor }) }] : [])] });
  }
  if (rand() < 0.35) {
    const c = pick(ctx.roster.filter((x) => x.portrait), rand);
    if (c) lenzPost(ph, { who: c.name, cid: c.id, caption: fresh(r, CHAR_LENZ, rand), likes: 300 + Math.floor(rand() * 9000), when: `Floor ${floor}`, verified: (c.powerLevel || 0) >= 85 });
  }
}
function snapEvent(r, ctx) {
  const foe = ctx.foes?.[0];
  if (!foe || ctx.rand() > 0.4) return;
  snap(r.phone, { from: foe.name, cid: foe.id ?? null, caption: fresh(r, SNAP_LOST, ctx.rand), when: `Floor ${ctx.floor}` });
}

// ---------- Allies (v0.28.0) ----------
const ALLY_YES = ['Say less. I got your back on floor {next}.', 'I\'ll be there. Don\'t make me carry you.', 'Floor {next}? I\'m in. Bring the snacks after.', 'Text me when you walk in. I\'ll jump in when it counts.', 'For you? Yeah. Floor {next}.'];
const ALLY_OFFER = ['Heard you\'re heading to floor {next}. Want me to jump in if it gets ugly? I\'d take {cut}% of the Bounty.', 'You\'ve been climbing alone too long. Floor {next}, I\'ll back you up. {cut}% of the Bounty and we\'re good.', 'Floor {next} looks rough. I can step in once. Cool if I take {cut}%?'];
const ALLY_THANKS = ['Good work up there. Same time next time?', 'Told you I had you.', 'That felt good. Call me again.', 'Easy money. Let\'s do it again.'];
// Why someone can't back you up next floor, or null if they can.
export function allyBlock(r, key) {
  const ph = r.phone; const next = r.next?.floor ?? (r.floor + 1);
  const b = bondOf(ph, key);
  if (b < ALLY_BOND) return `Get your bond to Close (${ALLY_BOND}) first. It's ${b} now.`;
  if (r.ally) return r.ally.key === key ? `${short(r.ally.name)} is already backing you up on floor ${r.ally.floor}.` : `${short(r.ally.name)} is already backing you up on floor ${r.ally.floor}.`;
  if (isBoss(next)) return 'No backup on boss floors.';
  const t = ph.threads.find((x) => x.key === key) || (ph.met || []).find((x) => x.key === key);
  const cid = t?.cid;
  if (cid != null && (r.next?.ids || []).includes(cid)) return 'They\'re your next opponent.';
  const rest = (r.allyRest || {})[key];
  if (rest && rest > next) return `They're resting until floor ${rest}.`;
  return null;
}
export function bookAlly(r, key) {
  const ph = r.phone; const next = r.next?.floor ?? (r.floor + 1);
  const t = ph.threads.find((x) => x.key === key) || (ph.met || []).find((x) => x.key === key);
  if (!t || t.cid == null) return null;
  const b = bondOf(ph, key);
  r.ally = { key, name: t.name, cid: t.cid, floor: next, uses: allyUses(b), cut: allyCut(b) };
  return r.ally;
}
// The player asks (from the chat). Returns a toast line, or the reason it can't happen.
export function askAlly(r, key) {
  const why = allyBlock(r, key);
  if (why) return { ok: false, line: why };
  const a = bookAlly(r, key);
  if (!a) return { ok: false, line: 'Only fighters can back you up.' };
  const t = thread(r.phone, { key, name: a.name, cid: a.cid, kind: 'rival' });
  me(r.phone, t, `Floor ${a.floor} is coming up. Got my back?`);
  t.msgs.push({ from: 'them', text: fill(fresh(r, ALLY_YES, Math.random), { next: a.floor }) });
  sys(t, `BACKUP: ${a.name} jumps in ${a.uses === 2 ? 'twice' : 'once'} on floor ${a.floor} for ${Math.round(a.cut * 100)}% of that floor's Bounty (only if you win).`);
  return { ok: true, line: `${short(a.name)} has your back on floor ${a.floor}.` };
}
// Now and then a Close fighter offers to help (in afterFloor).
function allyOfferEvent(r, ctx) {
  const ph = r.phone;
  if (r.ally || ctx.rand() > 0.35) return;
  const pickable = (ph.met || []).filter((m) => m.cid != null && !allyBlock(r, m.key) && !(ph.threads.find((t) => t.key === m.key)?.pending));
  if (!pickable.length) return;
  const m = pickable.sort((a, b) => bondOf(ph, b.key) - bondOf(ph, a.key))[0];
  const next = ctx.floor + 1; const cut = Math.round(allyCut(bondOf(ph, m.key)) * 100);
  const t = say(ph, { key: m.key, name: m.name, cid: m.cid, kind: m.kind || 'rival' }, fill(fresh(r, ALLY_OFFER, ctx.rand), { next, cut }), ctx.floor);
  t.pending = { type: 'ally', floor: next, options: [
    { id: 'accept', tone: 'accept', text: 'Let\'s do it. Floor ' + next + '.', hint: `They jump in mid-fight · ${cut}% of the Bounty if you win` },
    { id: 'decline', tone: 'decline', text: 'I got this one. Next time.' },
  ] };
}
// After a floor you won: pay the ally and send them to rest. Returns the fee.
export function settleAlly(r, floor, bounty) {
  const a = r.ally;
  if (!a || a.floor !== floor) { if (a && a.floor < floor) r.ally = null; return 0; }
  const fee = Math.round(bounty * a.cut);
  r.allyRest = { ...(r.allyRest || {}), [a.key]: floor + 1 + ALLY_REST };
  r.allyHelps = (r.allyHelps || 0) + 1;
  const t = thread(r.phone, { key: a.key, name: a.name, cid: a.cid, kind: 'rival' });
  sys(t, `PAID: ${fee.toLocaleString()} Bounty to ${a.name} for the backup on floor ${floor}.`);
  t.msgs.push({ from: 'them', text: fresh(r, ALLY_THANKS, Math.random) });
  addBond(r.phone, a.key, 'friendly');
  r.ally = null;
  return fee;
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
      back(fill(fresh(r, HOSTILE_BACK, ctx.rand), { next: p.floor }));
      sys(t, `CALLOUT: ${t.name} is your floor ${p.floor} opponent.`);
      gainFollowers(ph, 120);
      post(ph, '@AGN_Wire', `CALLOUT ALERT: ${ctx.me} vs ${t.name} is set for floor ${p.floor}.`, 900 + Math.floor(ctx.rand() * 600), p.floor);
      line = `${t.name} is your next opponent.`;
    } else if (o.id === 'clown') {
      gainFollowers(ph, 180);
      post(ph, pick(FAN_NAMES, ctx.rand), `${ctx.me} just cooked ${t.name} in the DMs 😭😭`, 600 + Math.floor(ctx.rand() * 900), p.floor);
      if (ctx.rand() < 0.5) {
        r.plan[p.floor] = { type: 'callout', ids: [p.cid], mod: 0, mult: CALLOUT_BOUNTY };
        back(fill(fresh(r, CLOWN_MAD, ctx.rand), { next: p.floor }));
        sys(t, `CALLOUT: ${t.name} is your floor ${p.floor} opponent.`);
        line = `+180 followers. ${short(t.name)} got mad: floor ${p.floor} callout.`;
      } else { back(fresh(r, CLOWN_QUIET, ctx.rand)); line = '+180 followers. They went quiet.'; }
    } else {
      back(fresh(r, HUMBLE_BACK, ctx.rand));
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
  } else if (p.type === 'ally') {
    if (o.id === 'accept') {
      const why = allyBlock(r, t.key);
      if (why) { back('Ah, never mind. Another time.'); line = why; }
      else {
        const a = bookAlly(r, t.key);
        back(fill(fresh(r, ALLY_YES, ctx.rand), { next: a.floor }));
        sys(t, `BACKUP: ${a.name} jumps in ${a.uses === 2 ? 'twice' : 'once'} on floor ${a.floor} for ${Math.round(a.cut * 100)}% of that floor's Bounty (only if you win).`);
        line = `${short(t.name)} has your back on floor ${a.floor}.`;
      }
    } else { back('Respect. Holler if you need me.'); line = 'You\'ll go it alone.'; }
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
  } else if (p.type === 'beaten') {
    if (o.id === 'gloat') {
      gainFollowers(ph, 250);
      if (!r.revenge && t.kind !== 'boss') { r.revenge = { cid: p.cid, name: t.name, floor: p.floor + REVENGE_GAP }; back('Bet. I\'ll find you.'); sys(t, `${t.name} wants a rematch around floor ${p.floor + REVENGE_GAP}.`); line = `+250 followers. ${short(t.name)} wants a rematch.`; }
      else { back('...'); line = '+250 followers.'; }
      post(ph, pick(FAN_NAMES, ctx.rand), `${ctx.me} is NOT letting ${t.name} live that one down 😭`, 500 + Math.floor(ctx.rand() * 800), p.floor);
    } else {
      gainFollowers(ph, 80);
      r.tip = { floor: r.floor + 1, aura: BEATEN_TIP };
      back(`Respect. Tip: watch their first move on floor ${r.floor + 1}. You'll see it coming.`);
      line = `+${BEATEN_TIP} Aura for your next floor.`;
    }
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
      const t = thread(r.phone, { key: `deal-${d.id}`, name: d.brand, kind: 'sponsor', icon: d.icon });
      t.msgs.push({ from: 'them', text: `Deal done! ${d.pay} Bounty sent. Our followers love you.` }); t.unread += 1; r.phone.unread += 1;
      note(r.phone, d.brand, `Deal paid: +${d.pay} Bounty`, 'deals');
    }
  }
}

// Pending decisions still waiting before the given floor's fight.
export function waiting(r) {
  return (r.phone?.threads || []).filter((t) => t.pending && ['trash', 'boss-test', 'boss-snub'].includes(t.pending.type));
}
// Aura from the phone for this floor: a beaten rival's tip and a good date.
export function phoneAura(r) {
  if (!r?.next) return 0;
  let n = 0;
  if (r.tip && r.tip.floor === r.next.floor) n += r.tip.aura;
  if (r.dateBoost && r.dateBoost.floor === r.next.floor) n += DATE_AURA;
  return n;
}
export function markRead(r, key) {
  const t = r.phone.threads.find((x) => x.key === key);
  if (t) { r.phone.unread = Math.max(0, r.phone.unread - t.unread); t.unread = 0; }
}
export { BOSS_EVERY };
