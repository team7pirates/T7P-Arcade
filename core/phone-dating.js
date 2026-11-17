// MATCHUP: the dating app on the phone (v0.18.0). Shared by Forbidden Fusion
// and Dynasty. Everyone here is an invented adult, not a roster character.
// Keep it light: swipe, match, chat, and ask them out. A good date gives a
// small boost for your next fight (each mode decides what that is).
//
// Flow:
//   - Matchup shows one profile at a time: Like or Pass.
//   - A like is a match about 60% of the time. They text first.
//   - Every reply in a match thread is a choice: FLIRT, FUNNY or ASK OUT.
//     Flirt and funny build sparks (♥). Asking out works better with more
//     sparks; a yes is a date and a small boost. One date per turn (a floor
//     in Fusion, a week in Dynasty).

import { pick, fillIn, say, mine, back, sys, note } from './phone-core.js';

export const PEOPLE = [
  { id: 'm1', name: 'Mika Sato', age: 27, job: 'Ramen chef', icon: '🍜', bio: 'Will judge you by how you hold chopsticks. Late-night noodle runs are a love language.' },
  { id: 'm2', name: 'Jordan Reyes', age: 29, job: 'Stunt coordinator', icon: '🎬', bio: 'I fall off buildings for a living. Looking for someone who lands on their feet.' },
  { id: 'm3', name: 'Aiko Nakamura', age: 25, job: 'Arcade owner', icon: '🕹️', bio: 'Top score on every cabinet in my shop. Come try to take one.' },
  { id: 'm4', name: 'Dante Okafor', age: 31, job: 'Sports physio', icon: '🩺', bio: 'I fix fighters for a living. Ice packs on the first date are free.' },
  { id: 'm5', name: 'Sienna Park', age: 28, job: 'Street artist', icon: '🎨', bio: 'Painted half the murals in the city. Tell me your favorite color and I\'ll tell you who you are.' },
  { id: 'm6', name: 'Kai Lomasi', age: 30, job: 'Surf instructor', icon: '🏄', bio: 'Early mornings, big waves, bigger breakfasts.' },
  { id: 'm7', name: 'Rina Kobayashi', age: 26, job: 'Fight commentator', icon: '🎙️', bio: 'I\'ve called a hundred fights. Never had one go my way off the mic.' },
  { id: 'm8', name: 'Marcus Bell', age: 33, job: 'Bakery owner', icon: '🥐', bio: 'Up at 4am. Smells like cinnamon. Will bring snacks to your fights.' },
  { id: 'm9', name: 'Yuna Takeda', age: 24, job: 'Grad student, astronomy', icon: '🔭', bio: 'I can point out every constellation. Rooftop dates only.' },
  { id: 'm10', name: 'Leo Marchetti', age: 32, job: 'Jazz pianist', icon: '🎹', bio: 'Plays Thursdays downtown. Requests are welcome, bad jokes even more.' },
  { id: 'm11', name: 'Nia Brooks', age: 27, job: 'Firefighter', icon: '🚒', bio: 'Runs into burning buildings. Runs away from small talk.' },
  { id: 'm12', name: 'Sora Hayashi', age: 29, job: 'Cat café manager', icon: '🐈', bio: 'Twelve cats, one me. They have to approve you first.' },
];
export const person = (id) => PEOPLE.find((p) => p.id === id);
export const MATCH_CHANCE = 0.6;

const OPENERS = [
  'Okay I have to ask: was that really you on {where}? 👀', 'Hi! Your profile made me laugh. That\'s rare.', 'So... do you always look that serious, or just in photos?',
  'You matched with me. Bold move. 😄', 'Hey you. Saw you on {where}. Impressive.',
];
const FLIRT = ['You\'re even better in person, I bet.', 'Pretty sure you just made my whole week.', 'I was going to play it cool. That\'s over now.', 'Is it hot in here or is that just the screen?'];
const FUNNY = ['Fair warning: my best move is falling asleep during movies.', 'Rate my skills 1 to 10. Wrong answers only.', 'I\'d say I\'m a catch, but I drop things a lot.', 'I promise I\'m funnier than my profile. Low bar, I know.'];
const ASK = ['Want to grab food after my next {when}?', 'Let me take you out. You pick the place.', 'Coffee this week? I\'ll even let you win an argument.'];
const LIKE_BACK = ['Haha okay, you\'re smooth. 😊', 'Stop, I\'m smiling at my phone like a weirdo.', 'Okay that was actually good.', 'You\'re trouble. I like it.'];
const MEH_BACK = ['...lol okay.', 'Interesting choice of words. 😅', 'I\'ll let that one slide.'];
const YES = ['Yes! It\'s a date. 🥰', 'Okay, you talked me into it. See you there!', 'Finally. I was waiting for you to ask.'];
const NO = ['Maybe once I know you a little better. 😊', 'This week is crazy for me. Ask me again soon?', 'Slow down, champ. Keep talking to me first.'];
const AFTER = ['Tonight was really fun. Go win the next one for me. 💜', 'Best date I\'ve had in a long time. Good luck out there!', 'Okay, you\'re officially my favorite fighter now.'];

export function dating(ph) {
  if (!ph.dating) ph.dating = { seen: [], matches: [], dates: 0, last: null };
  return ph.dating;
}
// The next profile to show, or null when you've seen everyone.
export function nextProfile(ph) {
  const d = dating(ph);
  return PEOPLE.find((p) => !d.seen.includes(p.id)) || null;
}
// Start the deck over (the people you passed on come back).
export function reshuffle(ph) {
  const d = dating(ph);
  d.seen = d.matches.map((m) => m.id);
}
const keyOf = (id) => `date-${id}`;
const who = (p) => ({ key: keyOf(p.id), name: p.name, kind: 'date', icon: p.icon });

function prompt(t, p, m, ctx) {
  const dated = m.lastDate === ctx.turn;
  const chance = askChance(m);
  t.pending = { type: 'date', id: p.id, options: [
    { id: 'flirt', tone: 'flirt', text: pick(FLIRT, ctx.rand), hint: 'Usually builds a spark ♥' },
    { id: 'funny', tone: 'funny', text: pick(FUNNY, ctx.rand), hint: 'A spark if it lands' },
    dated
      ? { id: 'later', tone: 'later', text: 'Can\'t stop thinking about our date.', hint: `You already went out this ${ctx.turnLabel || 'turn'}` }
      : { id: 'ask', tone: 'date', text: fillIn(pick(ASK, ctx.rand), { when: ctx.when || 'fight' }), hint: `${Math.round(chance * 100)}% they say yes · a yes is a date: ${ctx.perk || 'a small boost'}` },
  ] };
}
export const askChance = (m) => Math.min(0.9, 0.3 + 0.15 * (m.sparks || 0));

// Swipe on a profile. ctx: { rand, turn, where, when, perk, turnLabel }
export function swipe(ph, id, like, ctx) {
  const d = dating(ph); const p = person(id);
  if (!p || d.seen.includes(id)) return { matched: false, line: '' };
  d.seen.push(id);
  if (!like) return { matched: false, line: `You passed on ${p.name.split(' ')[0]}.` };
  if (ctx.rand() >= MATCH_CHANCE) return { matched: false, line: 'No match this time. Keep swiping.' };
  const m = { id, sparks: 0, dates: 0, lastDate: null };
  d.matches.unshift(m);
  const t = say(ph, who(p), fillIn(pick(OPENERS, ctx.rand), { where: ctx.where || 'the news' }));
  prompt(t, p, m, ctx);
  note(ph, 'Matchup', `It's a match with ${p.name}!`, 'dating');
  return { matched: true, line: `💘 It's a match with ${p.name}!` };
}

// A reply in a match thread. Returns { line, date: person|null }.
export function reply(ph, key, optionId, ctx) {
  const t = ph.threads.find((x) => x.key === key);
  if (!t || !t.pending || t.pending.type !== 'date') return null;
  const p = person(t.pending.id); const m = dating(ph).matches.find((x) => x.id === p.id);
  const o = t.pending.options.find((x) => x.id === optionId);
  if (!o || !m) return null;
  mine(t, o.text); t.pending = null;
  let line = ''; let date = null;
  if (o.id === 'flirt' || o.id === 'funny') {
    const lands = ctx.rand() < (o.id === 'flirt' ? 0.8 : 0.6);
    if (lands) { m.sparks = Math.min(5, (m.sparks || 0) + 1); back(t, pick(LIKE_BACK, ctx.rand)); line = `${p.name.split(' ')[0]} liked that. ♥ ${m.sparks}`; }
    else { back(t, pick(MEH_BACK, ctx.rand)); line = 'That one didn\'t land.'; }
  } else if (o.id === 'ask') {
    if (ctx.rand() < askChance(m)) {
      back(t, pick(YES, ctx.rand));
      sys(t, `DATE NIGHT with ${p.name}: ${ctx.perk || 'a small boost'}.`);
      back(t, pick(AFTER, ctx.rand));
      m.dates += 1; m.lastDate = ctx.turn; m.sparks = Math.max(1, (m.sparks || 0) - 1);
      dating(ph).dates += 1; dating(ph).last = { id: p.id, turn: ctx.turn };
      date = p; line = `Date with ${p.name.split(' ')[0]}! ${ctx.perk || ''}`.trim();
    } else { back(t, pick(NO, ctx.rand)); m.sparks = Math.max(0, (m.sparks || 0) - 1); line = 'Not yet. Keep talking.'; }
  } else {
    back(t, 'Me neither. 😊'); line = 'Aww.';
  }
  prompt(t, p, m, ctx);
  return { line, date };
}

// When the turn changes, the "you already went out" option flips back to Ask out.
export function refreshPrompts(ph, ctx) {
  const d = dating(ph);
  for (const m of d.matches) {
    const t = ph.threads.find((x) => x.key === keyOf(m.id));
    if (t) prompt(t, person(m.id), m, ctx);
  }
}
// Did you have a date this turn?
export const datedThisTurn = (ph, turn) => !!ph?.dating && ph.dating.last?.turn === turn;
