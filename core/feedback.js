// The playtest questionnaire (v0.26.0): the questions, sending, and when to
// ask.
//
// Sending: the game has no server, so answers go through FormSubmit
// (formsubmit.co), which emails them to Khalil. The form is activated and
// FEEDBACK_TO is FormSubmit's random alias, not his address.
// No internet? The answers wait in the outbox and go out the next time the
// app is online.
//
// New players get a one-time welcome: "please play for a week, then fill out
// the questionnaire." The footer shows "PLAYTEST · DAY 3 OF 7" during that week.
// Asking without being annoying: after the week (7 days since the welcome, and
// at least 20 minutes of real play), a small card on the main menu (never a
// pop-up, never in the middle of a game), never more than once per visit.
// "Not now" hides it for 3 days; after 3 "Not now"s it stops asking.
// "Don't ask again" stops it for good. It's always in Settings and in the
// menu's icon bar, so anyone can fill it out early.

import { store } from './store.js';
import { playtime, fmtTime } from './playtime.js';
import { APP_VERSION } from './version.js';
import { MODES } from './modes.js';

// FormSubmit's random alias for Khalil's inbox (v0.26.1), so his address
// isn't in the public code.
export const FEEDBACK_TO = '94237ee80cf66493c72478d769104a4f';
const ENDPOINT = () => `https://formsubmit.co/ajax/${FEEDBACK_TO}`;
const STATUS = 'feedback:status';
const DRAFT = 'feedback:draft';
const OUTBOX = 'feedback:outbox';

export const NUDGE = { weekDays: 7, minPlay: 20 * 60, snoozeDays: 3, maxSnoozes: 3 };

// ---------- The questions ----------
// kind: choice | scale (1-5) | text | modes (the per-mode table) | pick (one mode)
export const SECTIONS = [
  { title: 'About you', qs: [
    { id: 'device', kind: 'choice', q: 'What did you play on?', options: ['Phone', 'PC / laptop', 'Tablet'] },
    { id: 'anime', kind: 'scale', q: 'How much do you watch anime or read comics?', low: 'Not at all', high: 'A lot' },
    { id: 'name', kind: 'text', q: 'Your name or nickname (optional)', short: true },
  ] },
  { title: 'First impressions', qs: [
    { id: 'knew', kind: 'scale', q: 'When you first opened the app, did you know what to do?', low: 'No idea', high: 'Right away' },
    { id: 'first', kind: 'text', q: 'What was the first thing you tried, and why?' },
  ] },
  { title: 'The modes', qs: [
    { id: 'modes', kind: 'modes', q: 'Rate the ones you played (1 = didn\'t like it, 5 = loved it) and give each one word.' },
    { id: 'favorite', kind: 'pick', q: 'Which was your favorite?' },
    { id: 'favoriteWhy', kind: 'text', q: 'Why?' },
    { id: 'quit', kind: 'pick', q: 'Which one did you quit fastest?' },
    { id: 'quitWhy', kind: 'text', q: 'Why?' },
  ] },
  { title: 'Fun and boredom', qs: [
    { id: 'bored', kind: 'text', q: 'When did you start to get bored, if ever? What were you doing?' },
    { id: 'slow', kind: 'text', q: 'Was anything too slow, too long, or something you skipped every time?' },
    { id: 'again', kind: 'scale', q: 'How likely are you to play again tomorrow?', low: 'Not likely', high: 'For sure' },
    { id: 'daily', kind: 'text', q: 'What would make you come back every day?' },
  ] },
  { title: 'Bugs and confusion', qs: [
    { id: 'bugs', kind: 'text', q: 'Did anything break, freeze or look wrong? Where?' },
    { id: 'confusing', kind: 'text', q: 'Was anything confusing, like a rule, a button or what a number meant?' },
  ] },
  { title: 'Last words', qs: [
    { id: 'friend', kind: 'scale', q: 'How likely are you to tell a friend about it?', low: 'Not likely', high: 'For sure' },
    { id: 'change', kind: 'text', q: 'If you could add or change one thing, what would it be?' },
    { id: 'else', kind: 'text', q: 'Anything else?' },
  ] },
];
export const RATED = [...MODES.map((m) => [m.id, m.name]), ['phone', 'The phone (texts, Chirp, Lenz, Boo)']];

export function guessDevice() {
  if (matchMedia('(pointer: coarse)').matches) return Math.min(screen.width, screen.height) >= 700 ? 'Tablet' : 'Phone';
  return 'PC / laptop';
}

// ---------- Draft and status ----------
export const loadDraft = async () => (await store.get(DRAFT, null)) || { device: guessDevice(), modes: {} };
export const saveDraft = (d) => store.set(DRAFT, d).catch(() => {});
export const status = async () => (await store.get(STATUS, null)) || { submitted: null, snoozedUntil: 0, snoozes: 0, never: false, welcomed: null };
// Which day of the playtest week this is (1-7), or null once the week is over.
export function playtestDay(s) {
  if (!s?.welcomed || s.submitted) return null;
  const day = Math.floor((Date.now() - new Date(s.welcomed).getTime()) / 864e5) + 1;
  return day >= 1 && day <= NUDGE.weekDays ? day : null;
}
export const markWelcomed = () => setStatus({ welcomed: new Date().toISOString() });
async function setStatus(patch) { const s = { ...(await status()), ...patch }; await store.set(STATUS, s); return s; }

// ---------- Building the email ----------
function emailBody(a) {
  const pt = playtime.value;
  const rows = { _subject: `T7P Arcade playtest: ${a.name || 'anonymous'} (v${APP_VERSION})`, _template: 'table', _captcha: 'false' };
  rows['App version'] = APP_VERSION;
  rows['Sent'] = new Date().toLocaleString();
  rows['Screen'] = `${screen.width}×${screen.height} (${guessDevice()})`;
  rows['Time played (tracked)'] = `${fmtTime(pt.total)} over ${playtime.daysPlayed()} day(s), ${pt.sessions} visit(s)`;
  rows['Time per mode'] = Object.entries(pt.modes).sort((x, y) => y[1] - x[1]).map(([m, s]) => `${(MODES.find((x) => x.id === m)?.name) || (m === 'menu' ? 'Menus' : m)}: ${fmtTime(s)}`).join(' · ') || 'none';
  for (const sec of SECTIONS) {
    for (const q of sec.qs) {
      if (q.kind === 'modes') {
        for (const [id, name] of RATED) {
          const r = a.modes?.[id] || {};
          if (r.fun || r.word) rows[`Mode · ${name}`] = `${r.fun ? `${r.fun}/5` : 'no rating'}${r.word ? ` · "${r.word}"` : ''}`;
        }
      } else {
        let v = a[q.id];
        if (q.kind === 'pick') v = RATED.find(([id]) => id === v)?.[1] || v;
        if (q.kind === 'scale' && v) v = `${v}/5`;
        rows[q.q] = v == null || v === '' ? '—' : String(v);
      }
    }
  }
  return rows;
}

async function post(body) {
  const res = await fetch(ENDPOINT(), { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) });
  let j = null; try { j = await res.json(); } catch { /* ignore */ }
  if (!res.ok) throw new Error(j?.message || `HTTP ${res.status}`);
  if (j && (j.success === false || j.success === 'false')) throw new Error(j.message || 'Not sent');
  return j;
}

// Returns 'sent' or 'queued' (no internet: it goes out later).
export async function submit(answers) {
  const body = emailBody(answers);
  await setStatus({ submitted: new Date().toISOString(), version: APP_VERSION });
  await store.remove(DRAFT).catch(() => {});
  try {
    if (!navigator.onLine) throw new Error('offline');
    await post(body);
    return 'sent';
  } catch {
    const box = (await store.get(OUTBOX, null)) || [];
    box.push(body);
    await store.set(OUTBOX, box.slice(-10));
    return 'queued';
  }
}
// Try the outbox again (on start and when the internet comes back).
let flushing = null;
export function flushOutbox() {
  if (!flushing) flushing = doFlush().finally(() => { flushing = null; });
  return flushing;
}
async function doFlush() {
  if (!navigator.onLine) return 0;
  const box = (await store.get(OUTBOX, null)) || [];
  if (!box.length) return 0;
  const left = [];
  for (const b of box) { try { await post(b); } catch { left.push(b); } }
  await store.set(OUTBOX, left);
  return box.length - left.length;
}
export function startOutbox() {
  setTimeout(() => { flushOutbox().catch(() => {}); }, 5000);
  addEventListener('online', () => { flushOutbox().catch(() => {}); });
}

// ---------- When to ask ----------
let askedThisVisit = false;
export async function shouldNudge() {
  if (askedThisVisit) return false;
  const s = await status();
  if (s.submitted || s.never || s.snoozes >= NUDGE.maxSnoozes || Date.now() < (s.snoozedUntil || 0)) return false;
  if (!s.welcomed) return false;
  const days = (Date.now() - new Date(s.welcomed).getTime()) / 864e5;
  const ready = days >= NUDGE.weekDays && playtime.value.total >= NUDGE.minPlay;
  if (ready) askedThisVisit = true;
  return ready;
}
export async function snooze() { const s = await status(); return setStatus({ snoozedUntil: Date.now() + NUDGE.snoozeDays * 864e5, snoozes: (s.snoozes || 0) + 1 }); }
export const never = () => setStatus({ never: true });
