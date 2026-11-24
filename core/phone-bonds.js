// Bonds (v0.27.0): how close you are with each person on your phone, 0-100.
// The game sets every change from the tone of what you said; the AI only
// labels the tone. Gains are capped per person per day, so spamming nice
// texts doesn't max anyone out. Fusion allies (next update) and Dynasty
// recruiting (after that) will use these.
//   ph.bonds = { [threadKey]: { v, day, up, down, quick } }
//   ph.met   = [{ key, name, cid, kind, icon }]   people you can text

export const START = 10;
export const DAY_UP = 8;     // most a bond can rise per person per day
export const DAY_DOWN = 12;  // most it can fall
export const QUICK_PER_DAY = 3;

// What each tone does to a bond. Reply buttons use their own tone names too.
export const TONE_BOND = {
  friendly: 3, funny: 3, hype: 3, humble: 2, respect: 2, sweet: 3, flirty: 3, later: 2,
  accept: 3, focus: 2, loose: 2, date: 3, flirt: 3, neutral: 1,
  decline: -1, gloat: -2, hostile: -4, rude: -6,
};
export const LEVELS = [[80, 'Ride or die', '💎'], [60, 'Close', '💜'], [40, 'Friend', '🤝'], [20, 'Acquaintance', '👋'], [0, 'Stranger', '👤']];
export const levelOf = (v) => LEVELS.find(([min]) => v >= min);

const today = () => new Date().toISOString().slice(0, 10);
function rec(ph, key) {
  if (!ph.bonds) ph.bonds = {};
  let b = ph.bonds[key];
  if (!b) b = ph.bonds[key] = { v: START, day: today(), up: 0, down: 0, quick: 0 };
  if (b.day !== today()) { b.day = today(); b.up = 0; b.down = 0; b.quick = 0; }
  return b;
}
export const bondOf = (ph, key) => rec(ph, key).v;

// Apply a tone. Returns the real change (after the daily caps).
export function addBond(ph, key, tone, { romance = false } = {}) {
  const b = rec(ph, key);
  let d = TONE_BOND[tone] ?? 0;
  if ((tone === 'flirty' || tone === 'flirt') && !romance) d = 1; // flirting only really lands on Matchup
  if (d > 0) d = Math.min(d, DAY_UP - b.up);
  if (d < 0) d = -Math.min(-d, DAY_DOWN - b.down);
  if (!d) return 0;
  const before = b.v;
  b.v = Math.max(0, Math.min(100, b.v + d));
  const real = b.v - before;
  if (real > 0) b.up += real; else b.down -= real;
  return real;
}
export const capped = (ph, key) => rec(ph, key).up >= DAY_UP;
export function useQuick(ph, key) { const b = rec(ph, key); if (b.quick >= QUICK_PER_DAY) return false; b.quick += 1; return true; }

// Someone you've met and can text.
export function meet(ph, who) {
  if (!who?.key) return;
  if (!ph.met) ph.met = [];
  const i = ph.met.findIndex((m) => m.key === who.key);
  const m = { key: who.key, name: who.name, cid: who.cid ?? null, kind: who.kind || 'person', icon: who.icon ?? null };
  if (i >= 0) ph.met.splice(i, 1);
  ph.met.unshift(m);
  ph.met = ph.met.slice(0, 80);
}

// Quick texts: the no-key way to keep in touch.
// v0.36.0: each mode has its own. Dynasty: you're a coach. Fusion: a fighter
// in the Tower. quickFor(mode) picks; Fusion is the fallback.
export const QUICK_BY = {
  fusion: [
    { tone: 'friendly', text: 'Hey, how\'s the climb going? 👋' },
    { tone: 'hype', text: 'Saw your last floor. You\'ve been looking strong 🔥' },
    { tone: 'funny', text: 'Random question: who wins, you or the Tower elevator?' },
    { tone: 'hostile', text: 'You\'re not ready for me. See you up the Tower.' },
  ],
  dynasty: [
    { tone: 'friendly', text: 'Hey, how\'s the season treating you? 👋' },
    { tone: 'hype', text: 'Caught your last game. You\'ve been playing great 🔥' },
    { tone: 'funny', text: 'Random question: who wins, you or the team mascot?' },
    { tone: 'hostile', text: 'Enjoy it while it lasts. We\'re coming for your spot in the standings.' },
  ],
};
export const QUICK_BACK_BY = {
  fusion: {
    friendly: ['Doing good! Still climbing.', 'Busy with the Tower, but good. You?', 'Ha, been a while. All good up here.', 'Appreciate you reaching out 🙏'],
    hype: ['Means a lot coming from you 💪', 'You too, honestly. Saw your floors.', 'Ha, been putting in the work.', 'Stop, you\'re gonna make me blush.'],
    funny: ['The elevator. It never misses.', 'LMAO depends if it has snacks', 'Why would you ask me this mid-climb 😂', 'Me. Obviously. ...probably.'],
    hostile: ['Bold words. See you on the next floor.', 'Keep talking. I\'m saving the screenshot.', 'Cute. Real cute.', '...ok then. Bring your Bounty.'],
  },
  dynasty: {
    friendly: ['Doing good! Long season, but good.', 'Busy with practice. You?', 'Ha, been a while. All good here.', 'Appreciate you checking in, coach 🙏'],
    hype: ['Means a lot coming from you, coach 💪', 'Your team\'s been rolling too, honestly.', 'Ha, been putting in the work in practice.', 'Stop, you\'re gonna make me blush.'],
    funny: ['The mascot. Undefeated.', 'LMAO depends if the mascot\'s been training', 'Why would you ask me this on a game week 😂', 'Me. Obviously. ...probably.'],
    hostile: ['Bold words. See you on game day.', 'Keep talking. It\'s going on the locker room wall.', 'Cute. Check the standings.', '...ok then, coach.'],
  },
};
export const quickFor = (mode) => QUICK_BY[mode] || QUICK_BY.fusion;
export const quickBackFor = (mode) => QUICK_BACK_BY[mode] || QUICK_BACK_BY.fusion;
// Older imports.
export const QUICK = QUICK_BY.fusion;
export const QUICK_BACK = QUICK_BACK_BY.fusion;
