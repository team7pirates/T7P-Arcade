// Time played (v0.26.0). Counts only while you're actually playing: the app
// is on screen and you tapped, clicked, scrolled or pressed a key in the last
// 2 minutes. Kept per mode and per day, on this device only.
//   store 'playtime' = { total, modes: { id: secs }, days: { 'YYYY-MM-DD': secs },
//                        sessions, firstSeen }

import { store } from './store.js';
import { current } from './router.js';

const KEY = 'playtime';
const TICK = 10;            // seconds
const IDLE = 120 * 1000;    // stop counting after 2 minutes with no input
const SAVE_EVERY = 6;       // ticks (a minute)
let data = null;
let lastInput = Date.now();
let ticks = 0;
let started = false;

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const blank = () => ({ total: 0, modes: {}, days: {}, sessions: 0, firstSeen: today() });
// Screens that aren't a mode count as "menu".
const OTHER = new Set(['menu', 'settings', 'about', 'changelog', 'feedback', '']);
function where() {
  let name = '';
  try { name = current(); } catch { name = ''; }
  return OTHER.has(name) ? 'menu' : name;
}

async function save() { if (data) { try { await store.set(KEY, data); } catch { /* ignore */ } } }

export const playtime = {
  async start() {
    if (started) return;
    started = true;
    data = { ...blank(), ...((await store.get(KEY, null)) || {}) };
    data.sessions += 1;
    save();
    const poke = () => { lastInput = Date.now(); };
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) => addEventListener(ev, poke, { passive: true, capture: true }));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); else lastInput = Date.now(); });
    setInterval(() => {
      if (document.visibilityState !== 'visible' || Date.now() - lastInput > IDLE) return;
      const d = today(); const m = where();
      data.total += TICK;
      data.modes[m] = (data.modes[m] || 0) + TICK;
      data.days[d] = (data.days[d] || 0) + TICK;
      ticks += 1;
      if (ticks % SAVE_EVERY === 0) {
        const keys = Object.keys(data.days).sort();
        if (keys.length > 60) keys.slice(0, keys.length - 60).forEach((k) => delete data.days[k]);
        save();
      }
    }, TICK * 1000);
  },
  get value() { return data || blank(); },
  today() { return (data?.days || {})[today()] || 0; },
  // The last 7 days, today included.
  week() {
    const days = data?.days || {}; let n = 0;
    for (let i = 0; i < 7; i += 1) { const d = new Date(); d.setDate(d.getDate() - i); const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; n += days[k] || 0; }
    return n;
  },
  daysPlayed() { return Object.values(data?.days || {}).filter((s) => s >= 60).length; },
  save,
};

// "2h 14m", "38m", "under a minute"
export function fmtTime(secs) {
  const m = Math.floor((secs || 0) / 60);
  if (m < 1) return 'under a minute';
  const hrs = Math.floor(m / 60);
  return hrs ? `${hrs}h ${m % 60}m` : `${m}m`;
}
