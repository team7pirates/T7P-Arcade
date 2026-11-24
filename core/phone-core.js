// The phone's shared state helpers (v0.18.0): threads, notes and unread
// counts. Forbidden Fusion and Dynasty both keep a phone object shaped like
//   { threads: [], notes: [], unread: 0, seq: 1, ...mode extras }
// and the phone screen (core/phone-ui.js) draws it.

export const pick = (arr, rand) => arr[Math.floor(rand() * arr.length)];
export const fillIn = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => (v[k] != null ? v[k] : ''));

export function basePhone(extra = {}) {
  return { threads: [], notes: [], unread: 0, seq: 1, ...extra };
}
export function thread(ph, who) {
  let t = ph.threads.find((x) => x.key === who.key);
  if (!t) { t = { key: who.key, name: who.name, cid: who.cid ?? null, icon: who.icon ?? null, kind: who.kind, msgs: [], pending: null, unread: 0 }; ph.threads.unshift(t); }
  else { ph.threads = [t, ...ph.threads.filter((x) => x !== t)]; if (who.icon) t.icon = who.icon; }
  return t;
}
export function note(ph, title, text, app, key = null) {
  ph.notes.unshift({ id: ph.seq++, title, text, app, key });
  ph.notes = ph.notes.slice(0, 6);
}
export function say(ph, who, text, extra = {}) {
  const t = thread(ph, who);
  t.msgs.push({ from: 'them', text, ...extra });
  t.unread += 1; ph.unread += 1;
  note(ph, who.name, text, 'msg', t.key);
  return t;
}
export const mine = (t, text) => t.msgs.push({ from: 'me', text });
export const sys = (t, text) => t.msgs.push({ from: 'sys', text });
export const back = (t, text) => t.msgs.push({ from: 'them', text });
export function markRead(ph, key) {
  const t = ph?.threads.find((x) => x.key === key);
  if (t) { ph.unread = Math.max(0, ph.unread - t.unread); t.unread = 0; }
}
// Keep long threads from growing forever.
export function trim(ph, keep = 40) {
  for (const t of ph.threads) if (t.msgs.length > keep) t.msgs = t.msgs.slice(-keep);
  if (ph.threads.length > 30) ph.threads = ph.threads.filter((t, i) => i < 30 || t.pending);
}
// v0.19.0: a line won't come back until `gap` turns have passed (a floor in
// Fusion, a week in Dynasty). `now` is a number that goes up each turn.
export function fresh(ph, arr, rand, now, gap = 2) {
  if (!ph.used) ph.used = {};
  for (const k of Object.keys(ph.used)) if (now - ph.used[k] > gap + 1) delete ph.used[k];
  const ok = arr.filter((t) => !(t in ph.used) || now - ph.used[t] > gap);
  const t = pick(ok.length ? ok : arr, rand);
  ph.used[t] = now;
  return t;
}

// ---------- v0.25.0: the social apps ----------
// Texts stay in Messages. Anything posted with an @handle lives in the social
// apps instead:
//   ph.feed  - Chirp (the bird app): posts, mentions you can reply to
//   ph.lenz  - Lenz (the photo app): photo posts with likes and comments
//   ph.snaps - Boo (the ghost app): snaps that disappear after you open them
//   ph.gallery - Photos: snaps you opened and your own Lenz posts
// A post: { id, who, handle, text, likes, reposts, replies, views, cid, icon,
//   when, mention, pending: { type, options }, answers: [{ who, text }] }
export function chirp(ph, post, cap = 60) {
  if (!ph.feed) ph.feed = [];
  const p = { id: ph.seq++, likes: 0, reposts: 0, replies: 0, views: 0, ...post };
  if (!p.views) p.views = Math.round((p.likes || 0) * (9 + Math.random() * 14));
  if (!p.reposts) p.reposts = Math.round((p.likes || 0) * (0.03 + Math.random() * 0.08));
  if (!p.replies) p.replies = Math.round((p.likes || 0) * (0.01 + Math.random() * 0.04));
  ph.feed.unshift(p);
  ph.feed = ph.feed.slice(0, cap);
  if (p.mention) note(ph, `${p.who} mentioned you`, p.text, 'chirp');
  return p;
}
export function lenzPost(ph, post) {
  if (!ph.lenz) ph.lenz = [];
  const p = { id: ph.seq++, likes: 0, comments: [], ...post };
  ph.lenz.unshift(p);
  ph.lenz = ph.lenz.slice(0, 40);
  if (p.mine) {
    if (!ph.gallery) ph.gallery = [];
    ph.gallery.unshift({ id: p.id, cid: p.cid ?? null, art: p.art ?? null, photo: p.photo ?? null, caption: p.caption, when: p.when });
    ph.gallery = ph.gallery.slice(0, 60);
  }
  return p;
}
// v0.36.0: snap streaks. Open a snap and send one back to keep a streak with
// that person going. If they snap again before you snapped back the last one,
// the streak breaks. At STREAK_BONUS or more, each snap back gives the mode's
// small bonus (see opts.onSnapStreak in phone-ui).
export const STREAK_BONUS = 3;
export const streakOf = (ph, key) => (key && ph?.streaks?.[key]?.n) || 0;
export function snapBack(ph, id) {
  const s = (ph.snaps || []).find((x) => x.id === id);
  if (!s || !s.seen || s.back || !s.key) return null;
  s.back = true;
  if (!ph.streaks) ph.streaks = {};
  const st = ph.streaks[s.key] || (ph.streaks[s.key] = { n: 0, best: 0, name: s.from, cid: s.cid ?? null });
  st.n += 1; st.best = Math.max(st.best, st.n); st.name = s.from;
  return st.n;
}
export function snap(ph, s) {
  if (!ph.snaps) ph.snaps = [];
  // Their last snap never got one back: the streak breaks.
  if (s.key && ph.streaks?.[s.key]?.n) {
    const prev = ph.snaps.find((y) => y.key === s.key);
    if (prev && !prev.back) ph.streaks[s.key].n = 0;
  }
  const x = { id: ph.seq++, seen: false, ...s };
  ph.snaps.unshift(x);
  ph.snaps = ph.snaps.filter((y, i) => !y.seen || i < 30).slice(0, 30);
  note(ph, `👻 ${x.from}`, 'sent you a snap', 'boo');
  return x;
}
export function openSnap(ph, id) {
  const s = (ph.snaps || []).find((x) => x.id === id);
  if (!s || s.seen) return null;
  s.seen = true;
  if (!ph.gallery) ph.gallery = [];
  ph.gallery.unshift({ id: s.id, cid: s.cid ?? null, art: s.art ?? null, photo: s.photo ?? null, caption: `${s.from}: ${s.caption}`, when: s.when });
  ph.gallery = ph.gallery.slice(0, 60);
  return s;
}
export const pendingMentions = (ph) => (ph?.feed || []).filter((p) => p.pending).length;
export const newSnaps = (ph) => (ph?.snaps || []).filter((s) => !s.seen).length;
// v0.30.0: clearing notifications. A hushed mention or snap is still there to
// answer or open, it just stops counting toward the badges.
export const mentionBadge = (ph) => (ph?.feed || []).filter((p) => p.pending && !p.hush).length;
export const snapBadge = (ph) => (ph?.snaps || []).filter((s) => !s.seen && !s.hush).length;
export const badgeTotal = (ph) => (ph?.unread || 0) + mentionBadge(ph) + snapBadge(ph);
export function hushMentions(ph) { let n = 0; for (const p of ph?.feed || []) if (p.pending && !p.hush) { p.hush = true; n++; } return n; }
export function hushSnaps(ph) { let n = 0; for (const x of ph?.snaps || []) if (!x.seen && !x.hush) { x.hush = true; n++; } return n; }
export function readAll(ph) { if (!ph) return; for (const t of ph.threads) t.unread = 0; ph.unread = 0; }
// Dismiss one notification. A text's notification takes its unread count with it.
export function dismissNote(ph, id) {
  const n = (ph?.notes || []).find((x) => x.id === id);
  if (!n) return;
  ph.notes = ph.notes.filter((x) => x !== n);
  if (n.app === 'msg' && n.key && !ph.notes.some((x) => x.key === n.key)) markRead(ph, n.key);
}
// Clear all: notifications gone, texts read, social badges hushed.
export function clearNotes(ph) {
  if (!ph) return;
  ph.notes = []; readAll(ph); hushMentions(ph); hushSnaps(ph);
}
// Close an open mention reply (when it's too late to answer).
export function answerPost(ph, id, text, back = null, backWho = null) {
  const p = (ph.feed || []).find((x) => x.id === id);
  if (!p) return null;
  p.pending = null;
  p.answers = [...(p.answers || []), { who: 'me', text }];
  if (back) p.answers.push({ who: backWho || p.who, text: back });
  p.replies = (p.replies || 0) + 1 + (back ? 1 : 0);
  return p;
}
