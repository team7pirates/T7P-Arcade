// Save cleanup (v0.22.0). Every 2 days, when the game starts, old clutter is
// trimmed from the saves and a short note says what happened. Only things you
// can't miss go: old phone texts, old regular magazine issues, and the
// day-to-day details (fatigue, old contracts, growth) of players who retired
// more than 2 seasons ago. Seasons, records, trophies, rosters, stats,
// history, the Museum, the Pantheon, Hall of Fame entries and every season
// review issue are never touched.

import { store } from './store.js';
import { toast } from './ui.js';

export const CLEANUP_EVERY = 2 * 24 * 60 * 60 * 1000;
const KEY = 'cleanup:last';
const KEEP_MSGS = 25;
const KEEP_THREADS = 24;
const KEEP_ISSUES = 6;
const RETIRED_DROP = ['fatigue', 'injury', 'mileage', 'contract', 'growth', 'lastStats', 'injuredNow', 'sp', 'startPower', 'startHype', 'startAura', 'scout', 'stars', 'prospect'];

function trimPhone(ph, count) {
  if (!ph || !Array.isArray(ph.threads)) return;
  for (const t of ph.threads) {
    if (Array.isArray(t.msgs) && t.msgs.length > KEEP_MSGS) { count.texts += t.msgs.length - KEEP_MSGS; t.msgs = t.msgs.slice(-KEEP_MSGS); }
  }
  if (ph.threads.length > KEEP_THREADS) {
    const keep = ph.threads.filter((t, i) => i < KEEP_THREADS || t.pending || t.unread || t.kind === 'date');
    count.threads += ph.threads.length - keep.length; ph.threads = keep;
  }
  if (Array.isArray(ph.offers) && ph.offers.length > 8) ph.offers = ph.offers.slice(0, 8);
  for (const k of ['feed', 'news']) if (Array.isArray(ph[k]) && ph[k].length > 30) { count.posts += ph[k].length - 30; ph[k] = ph[k].slice(0, 30); }
  if (Array.isArray(ph.deals)) ph.deals = ph.deals.filter((d, i) => d.status === 'offer' || d.status === 'active' || i < 10);
  if (ph.used && Object.keys(ph.used).length > 200) ph.used = {};
}

function trimDynasty(L, count) {
  trimPhone(L.phone, count);
  if (Array.isArray(L.mags)) {
    // Keep every season review, every legacy issue and the newest regular issues.
    let regular = 0;
    const keep = L.mags.filter((m) => {
      if (m.review || m.legacy) return true;
      regular += 1;
      return regular <= KEEP_ISSUES || !m.read;
    });
    count.issues += L.mags.length - keep.length; L.mags = keep;
  }
  if (L.players) {
    for (const p of Object.values(L.players)) {
      if (!p.retired || (L.season - (p.retiredSeason ?? L.season)) < 2) continue;
      let did = false;
      for (const k of RETIRED_DROP) if (k in p) { delete p[k]; did = true; }
      if (did) count.players += 1;
    }
  }
}

function trimFusion(d, run, count) {
  if (d) trimPhone(d.lastPhone, count);
  if (run) trimPhone(run.phone, count);
}

// Returns a summary, or null when nothing was due.
export async function runCleanup({ force = false } = {}) {
  const last = await store.get(KEY, 0);
  if (!force && Date.now() - last < CLEANUP_EVERY) return null;
  const count = { texts: 0, threads: 0, posts: 0, issues: 0, players: 0 };
  const all = await store.all();
  for (const [key, val] of Object.entries(all)) {
    try {
      if (/^dynasty:slot\d$/.test(key) && val) { trimDynasty(val, count); await store.set(key, val); }
      else if (/^fusion:slot\d$/.test(key) && val) { trimFusion(val, null, count); await store.set(key, val); }
      else if (/^fusion:run:slot\d$/.test(key) && val) { trimFusion(null, val, count); await store.set(key, val); }
    } catch { /* a save we can't read is left alone */ }
  }
  await store.set(KEY, Date.now());
  const parts = [];
  if (count.texts + count.threads) parts.push(`${count.texts + count.threads} old phone message${count.texts + count.threads === 1 ? '' : 's'}`);
  if (count.posts) parts.push(`${count.posts} old feed post${count.posts === 1 ? '' : 's'}`);
  if (count.issues) parts.push(`${count.issues} old magazine issue${count.issues === 1 ? '' : 's'}`);
  if (count.players) parts.push(`day-to-day details of ${count.players} long-retired player${count.players === 1 ? '' : 's'}`);
  const summary = { count, text: parts.length ? `Save cleanup: removed ${parts.join(', ')}. Your seasons, records, trophies, stats, history and Hall of Fame are untouched.` : null };
  if (summary.text) {
    await store.set('cleanup:note', { at: Date.now(), text: summary.text });
    toast(summary.text, { duration: 9000 });
  }
  return summary;
}
