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
