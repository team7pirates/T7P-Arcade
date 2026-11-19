// The phone (v0.17.0 in Forbidden Fusion, shared with Dynasty in v0.18.0).
// v0.25.0: a foldable phone. It takes over the whole screen when it opens,
// folds and unfolds (cover screen and the big inner screen), has a home
// screen of apps with widgets, and a wallpaper you pick in Settings.
//
// Apps: Messages (texts only), Chirp (the bird app: posts and @mentions),
// Lenz (photos), Boo (snaps that disappear), Matchup (dating), News, Deals,
// Calendar, Wallet, Photos and Settings. Modes choose which apps they show.
//
// Open it with the "Open phone" button or a key (P by default; change it in
// the phone's Settings). Close it with the ✕, the home bar, Escape, the key,
// or the device's back button (back walks out one screen at a time).

import { h, fill, avatar, pushBack } from './ui.js';
import { characters } from './characters.js';
import { sfx } from './sfx.js';
import { store } from './store.js';
import { profile } from './profile.js';
import { markRead, openSnap, pendingMentions, newSnaps } from './phone-core.js';
import * as D from './phone-dating.js';

const ALL_APPS = {
  messages: ['Messages', '💬'], chirp: ['Chirp', '🐦'], lenz: ['Lenz', '📸'], boo: ['Boo', '👻'],
  dating: ['Matchup', '💘'], news: ['News', '📰'], deals: ['Deals', '💼'], calendar: ['Calendar', '📅'],
  wallet: ['Wallet', '👛'], photos: ['Photos', '🖼️'], settings: ['Settings', '⚙️'],
};
const DOCK = ['messages', 'chirp', 'lenz', 'boo'];
const TONES = {
  hostile: '🔥 HOSTILE', humble: '🤝 HUMBLE', accept: '✅ ACCEPT', decline: '✋ PASS', flirt: '💘 FLIRT', funny: '😂 FUNNY', date: '📅 ASK OUT',
  hype: '📣 HYPE', focus: '🧠 FOCUS', loose: '⚡ LET LOOSE', gloat: '😤 GLOAT', respect: '🤝 RESPECT', later: '💜 SWEET',
};
const fmtN = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 10000 ? `${(n / 1000).toFixed(1)}K` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : Math.round(n || 0).toLocaleString());
const keyLabel = (k) => (k === ' ' ? 'Space' : k.length === 1 ? k.toUpperCase() : k);

// ---------- Wallpapers (shared by every mode) ----------
const WP_KEY = 'phone:wallpaper';
const FOLD_KEY = 't7p:phoneFolded';
const GRADIENTS = {
  midnight: ['Midnight', 'radial-gradient(ellipse at 30% 0%, #3a1a5c, #0e0a14 65%)'],
  sunset: ['Sunset', 'linear-gradient(170deg, #ff9a5a 0%, #c2416b 45%, #2a0f3a 100%)'],
  ocean: ['Ocean', 'linear-gradient(160deg, #2bc0e4 0%, #1e5799 50%, #0b1630 100%)'],
  gold: ['Gold rush', 'linear-gradient(160deg, #f0c060 0%, #8a5a14 50%, #1a1006 100%)'],
  sakura: ['Sakura', 'radial-gradient(circle at 70% 20%, #ffc0d9 0%, #c25a8c 40%, #2a0f22 100%)'],
  forest: ['Forest', 'linear-gradient(170deg, #4caf7a 0%, #1d5b45 50%, #07140f 100%)'],
};
const ARENAS = ['2001', '2002', '2003', '2004'];
let wallpaper = null; // { kind: 'grad'|'arena'|'char'|'custom', id, data }
let wpLoaded = null;
const loadWallpaper = () => (wpLoaded ||= store.get(WP_KEY, null).then((w) => { wallpaper = w || { kind: 'grad', id: 'midnight' }; return wallpaper; }).catch(() => { wallpaper = { kind: 'grad', id: 'midnight' }; }));
function wallpaperCss(w = wallpaper) {
  if (!w) return GRADIENTS.midnight[1];
  if (w.kind === 'grad') return (GRADIENTS[w.id] || GRADIENTS.midnight)[1];
  const shade = 'linear-gradient(180deg, rgba(0,0,0,.25), rgba(0,0,0,.45))';
  if (w.kind === 'arena') return `${shade}, url("art/afl/arenas/${w.id}.webp") center / cover`;
  if (w.kind === 'char') { const c = characters.get(w.id); const u = c && characters.portraitUrl(c); return u ? `${shade}, url("${u}") center top / cover, #120b1c` : GRADIENTS.midnight[1]; }
  if (w.kind === 'custom' && w.data) return `${shade}, url("${w.data}") center / cover`;
  return GRADIENTS.midnight[1];
}
async function setWallpaper(w) { wallpaper = w; try { await store.set(WP_KEY, w); } catch { /* ignore */ } }
// Shrink an uploaded photo so it fits in the save (about 1080 px tall).
function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1400 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}

// v0.20.0: on touch screens, drag the phone button anywhere; it remembers
// where you left it. On PC it stays in the corner.
const POS_KEY = 't7p:phoneButton';
function makeDraggable(btn, onDrag) {
  const touch = () => matchMedia('(pointer: coarse)').matches;
  const clamp = (x, y) => [Math.max(6, Math.min(innerWidth - btn.offsetWidth - 6, x)), Math.max(6, Math.min(innerHeight - btn.offsetHeight - 6, y))];
  const place = (x, y) => { const [cx, cy] = clamp(x, y); btn.style.position = 'fixed'; btn.style.left = `${cx}px`; btn.style.top = `${cy}px`; btn.style.right = 'auto'; btn.style.bottom = 'auto'; btn.classList.add('is-moved'); return [cx, cy]; };
  const restore = () => {
    if (!touch()) return;
    try { const p = JSON.parse(localStorage.getItem(POS_KEY) || 'null'); if (p) requestAnimationFrame(() => place(p.x * innerWidth, p.y * innerHeight)); } catch { /* ignore */ }
  };
  let start = null;
  btn.addEventListener('pointerdown', (e) => {
    if (!touch() || e.pointerType === 'mouse') return;
    const r = btn.getBoundingClientRect();
    start = { x: e.clientX, y: e.clientY, bx: r.left, by: r.top, moving: false, id: e.pointerId };
  });
  btn.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x; const dy = e.clientY - start.y;
    if (!start.moving && Math.hypot(dx, dy) < 10) return;
    if (!start.moving) { start.moving = true; try { btn.setPointerCapture(e.pointerId); } catch { /* ignore */ } btn.classList.add('is-dragging'); }
    e.preventDefault();
    place(start.bx + dx, start.by + dy);
  });
  const end = (e) => {
    if (!start || e.pointerId !== start.id) return;
    if (start.moving) {
      onDrag();
      const r = btn.getBoundingClientRect();
      try { localStorage.setItem(POS_KEY, JSON.stringify({ x: r.left / innerWidth, y: r.top / innerHeight })); } catch { /* ignore */ }
      btn.classList.remove('is-dragging');
    }
    start = null;
  };
  btn.addEventListener('pointerup', end); btn.addEventListener('pointercancel', end);
  addEventListener('resize', () => { if (btn.classList.contains('is-moved')) { const r = btn.getBoundingClientRect(); place(r.left, r.top); } });
  restore();
}

// Text with @handles and #tags in blue.
function richText(text, cls = 'ph-post-text') {
  const p = h('p', { class: cls });
  String(text).split(/([@#][\w.]+)/g).forEach((part) => { if (!part) return; p.append(/^[@#][\w.]+$/.test(part) ? h('span', { class: 'ph-link' }, part) : document.createTextNode(part)); });
  return p;
}

// opts: {
//   getPhone() -> phone|null, save(), getKey(), setKey(k),
//   onReply(key, optionId) -> string|null   (texts; Matchup threads are handled here)
//   onPostReply(postId, optionId) -> string|null   (Chirp mentions)
//   apps: ['messages', 'chirp', ...], widgets(ph) -> [[value, label]], empty(ph) -> string,
//   news(ph) -> [{ src, title, text }]   (default: ph.news)
//   calendar(ph) -> [{ when, title, text, tag }], wallet(ph) -> { big: [label, value], rows: [[label, value]] }
//   dateCtx() -> { rand, turn, where, when, perk, turnLabel } | null (null: no dates right now),
//   onDate(person), shortcutWhere: 'Forbidden Fusion'
// }
export function createPhone(opts) {
  const appIds = (opts.apps || ['messages', 'dating', 'settings']).map((id) => (id === 'buzz' ? 'chirp' : id));
  const APPS = appIds.filter((id) => ALL_APPS[id]).map((id) => [id, ...ALL_APPS[id]]);
  let open = false; let app = 'home'; let threadKey = null; let postId = null; let capturing = false;
  let chirpTab = 'all'; let viewing = null; let viewTimer = null; let wpPick = false;
  let folded = true;
  try { folded = localStorage.getItem(FOLD_KEY) !== 'open'; } catch { /* ignore */ }
  let release = null;

  const screen = h('div', { class: 'ph-screen' });
  const badge = h('span', { class: 'ph-badge', hidden: true });
  let dragged = false;
  const btn = h('button', { class: 'ph-open', 'aria-label': 'Open phone', onClick: () => { if (dragged) { dragged = false; return; } toggle(); } }, h('span', { 'aria-hidden': 'true' }, '📱'), h('span', { class: 'ph-open-text' }, 'Open phone'), badge);
  makeDraggable(btn, () => { dragged = true; });
  const toastEl = h('div', { class: 'ph-toast', role: 'status', 'aria-live': 'polite' });
  const foldBtn = h('button', { class: 'ph-fold', onClick: () => setFold(!folded) });
  const device = h('div', { class: 'ph-device' },
    h('span', { class: 'ph-side ph-side-vol', 'aria-hidden': 'true' }), h('span', { class: 'ph-side ph-side-pwr', 'aria-hidden': 'true' }),
    h('span', { class: 'ph-cam', 'aria-hidden': 'true' }), h('span', { class: 'ph-crease', 'aria-hidden': 'true' }), screen,
    h('button', { class: 'ph-home', 'aria-label': 'Home (tap again to close)', onClick: () => (app === 'home' ? toggle(false) : go('home')) }));
  const stage = h('div', { class: 'ph-stage', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Phone', hidden: true, onClick: (e) => { if (e.target === stage) toggle(false); } },
    h('div', { class: 'ph-stage-bar' }, foldBtn, h('button', { class: 'ph-stage-x', 'aria-label': 'Close phone', onClick: () => toggle(false) }, '✕ Close')),
    device, toastEl);
  const wrap = h('div', { class: 'ph-root' }, stage, btn);

  function setFold(f) {
    folded = f;
    try { localStorage.setItem(FOLD_KEY, f ? 'closed' : 'open'); } catch { /* ignore */ }
    stage.classList.toggle('is-open', !f);
    foldBtn.textContent = f ? '↔ Unfold' : '↔ Fold';
    foldBtn.setAttribute('aria-label', f ? 'Unfold the phone' : 'Fold the phone');
    sfx.play('flip');
    if (open) draw();
  }
  stage.classList.toggle('is-open', !folded);
  foldBtn.textContent = folded ? '↔ Unfold' : '↔ Fold';
  const wide = () => !folded && innerWidth > 640;

  const time = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/i, '');
  const svg = (paths, w = 18) => { const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); el.setAttribute('viewBox', '0 0 24 16'); el.setAttribute('width', String(w)); el.setAttribute('height', '12'); paths.forEach(([tag, attrs]) => { const x = document.createElementNS('http://www.w3.org/2000/svg', tag); Object.entries(attrs).forEach(([k, v]) => x.setAttribute(k, v)); el.append(x); }); return el; };
  const status = () => h('div', { class: 'ph-status' }, h('span', {}, time()), h('span', { class: 'ph-status-r', 'aria-hidden': 'true' },
    svg([['rect', { x: 1, y: 10, width: 3.5, height: 5, rx: 1, fill: 'currentColor' }], ['rect', { x: 7, y: 7, width: 3.5, height: 8, rx: 1, fill: 'currentColor' }], ['rect', { x: 13, y: 4, width: 3.5, height: 11, rx: 1, fill: 'currentColor' }], ['rect', { x: 19, y: 1, width: 3.5, height: 14, rx: 1, fill: 'currentColor' }]]),
    svg([['path', { d: 'M2 6a14 14 0 0 1 20 0M5.5 9.5a9 9 0 0 1 13 0M9 13a4 4 0 0 1 6 0', stroke: 'currentColor', 'stroke-width': 2.2, fill: 'none', 'stroke-linecap': 'round' }]]),
    svg([['rect', { x: 1, y: 2, width: 19, height: 12, rx: 3, stroke: 'currentColor', 'stroke-width': 1.6, fill: 'none' }], ['rect', { x: 3.5, y: 4.5, width: 12, height: 7, rx: 1.5, fill: 'currentColor' }], ['rect', { x: 21, y: 6, width: 2, height: 4, rx: 1, fill: 'currentColor' }]], 22)));
  const top = (title, back, extra = null) => h('div', { class: 'ph-top' },
    back ? h('button', { class: 'ph-back', 'aria-label': 'Back', onClick: back }, '‹') : h('span'),
    h('p', { class: 'ph-title' }, title), extra || h('span'));
  const face = (t, size = 'sm') => {
    if (t.cid != null) { const c = characters.get(t.cid); if (c) return avatar(c, characters, size); }
    const icon = t.icon || { trainer: '🥋', sponsor: '💼', fan: '💜', hater: '😈', gm: '📞', team: '👥', coach: '🧢', date: '💘' }[t.kind] || (t.who ? t.who.replace(/^@/, '')[0]?.toUpperCase() : '👤');
    return h('span', { class: `ph-ava ph-ava-${size}${t.hater ? ' is-hater' : ''}` }, icon);
  };
  const pic = (x, cls = 'ph-pic') => {
    const c = x.cid != null ? characters.get(x.cid) : null; const u = c && characters.portraitUrl(c);
    if (u) return h('div', { class: cls }, h('img', { src: u, alt: c.name, loading: 'lazy' }));
    if (x.art) return h('div', { class: cls }, h('img', { src: x.art, alt: '', loading: 'lazy' }));
    return h('div', { class: `${cls} is-blank` }, h('span', {}, x.icon || '📸'));
  };

  function go(a, key = null) { app = a; if (a === 'thread') threadKey = key; if (a === 'post') postId = key; stopView(); draw(); }
  // The back button: out one screen at a time.
  function goBack() {
    if (viewing) { stopView(); draw(); return; }
    if (wpPick) { wpPick = false; draw(); return; }
    if (app === 'thread') go(String(threadKey).startsWith('date-') ? 'dating' : wide() ? 'home' : 'messages');
    else if (app === 'post') go('chirp');
    else go('home');
  }

  function badgeOf(id, ph) {
    if (!ph) return 0;
    if (id === 'messages') return ph.unread || 0;
    if (id === 'chirp') return pendingMentions(ph);
    if (id === 'boo') return newSnaps(ph);
    if (id === 'deals') return (ph.deals || []).filter((d) => d.status === 'offer').length;
    if (id === 'dating') return D.nextProfile(ph) && !(ph.dating?.matches.length) ? 1 : 0;
    return 0;
  }
  function appIcon(id, label, icon, ph) {
    const n = badgeOf(id, ph);
    const glyph = id === 'calendar'
      ? h('span', { class: 'ph-cal-glyph' }, h('b', {}, new Date().toLocaleDateString([], { weekday: 'short' }).toUpperCase()), h('span', {}, String(new Date().getDate())))
      : icon;
    return h('button', { class: 'ph-app', onClick: () => go(id) }, h('span', { class: `ph-app-icon is-${id}` }, glyph, n ? h('span', { class: 'ph-dot' }, String(n)) : null), h('span', { class: 'ph-app-label' }, label));
  }

  // ---------- Home screen ----------
  function home(ph) {
    const ws = opts.widgets ? opts.widgets(ph) : [];
    const notes = (ph?.notes || []).slice(0, wide() ? 3 : 4);
    const openNote = (n) => (n.app === 'msg' ? go('thread', n.key) : ALL_APPS[n.app] && appIds.includes(n.app) ? (n.app === 'chirp' ? (chirpTab = 'mentions', go('chirp')) : go(n.app)) : go('messages'));
    const grid = APPS.filter(([id]) => !DOCK.includes(id));
    const dock = APPS.filter(([id]) => DOCK.includes(id));
    screen.style.background = wallpaperCss();
    const clockW = h('div', { class: 'ph-widget ph-w-clock' }, h('p', { class: 'ph-clock' }, time()), h('p', { class: 'ph-date' }, new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })),
      ws.length ? h('div', { class: 'ph-widgets' }, ws.map(([v, k]) => h('div', {}, h('p', { class: 'ph-wv' }, String(v)), h('p', { class: 'ph-wk' }, k)))) : null);
    const notesW = h('div', { class: 'ph-widget ph-w-notes' }, h('p', { class: 'ph-w-h' }, 'NOTIFICATIONS'),
      notes.length ? h('ul', { class: 'ph-notes' }, notes.map((n) => h('li', {}, h('button', { class: 'ph-note', onClick: () => openNote(n) },
        h('span', { class: 'ph-note-app' }, n.app === 'msg' ? 'MESSAGES' : (ALL_APPS[n.app]?.[0] || n.app).toUpperCase()), h('span', { class: 'ph-note-title' }, n.title), h('span', { class: 'ph-note-text' }, n.text)))))
        : h('p', { class: 'ph-empty is-small' }, opts.empty ? opts.empty(ph) : 'Nothing new.'));
    const gridEl = h('div', { class: 'ph-grid' }, grid.map(([id, label, icon]) => appIcon(id, label, icon, ph)));
    fill(screen, status(),
      wide()
        ? h('div', { class: 'ph-homescroll' }, h('div', { class: 'ph-hwidgets' }, clockW, notesW), gridEl)
        : h('div', { class: 'ph-homescroll' }, clockW, gridEl, notesW),
      h('div', { class: 'ph-dock' }, dock.map(([id, label, icon]) => appIcon(id, label, icon, ph))));
  }

  // ---------- Messages ----------
  function messageList(ph) {
    const list = ph?.threads || [];
    return list.length ? h('ul', { class: 'ph-list' }, list.map((t) => { const last = t.msgs[t.msgs.length - 1]; return h('li', {}, h('button', { class: `ph-row${t.unread ? ' is-unread' : ''}${app === 'thread' && t.key === threadKey ? ' is-active' : ''}`, onClick: () => go('thread', t.key) },
      face(t), h('span', { class: 'ph-row-text' }, h('span', { class: 'ph-row-name' }, t.name, t.kind === 'boss' ? h('span', { class: 'ph-tag is-boss' }, 'BOSS') : t.kind === 'rival' ? h('span', { class: 'ph-tag' }, 'RIVAL') : null), h('span', { class: 'ph-row-last' }, last ? last.text : '')),
      t.pending ? h('span', { class: 'ph-reply-dot' }, 'REPLY') : t.unread ? h('span', { class: 'ph-dot' }, String(t.unread)) : null)); }))
      : h('p', { class: 'ph-empty' }, 'No texts yet.');
  }
  function messages(ph) {
    if (wide() && ph?.threads?.length) { threadKey = ph.threads[0].key; app = 'thread'; threadView(ph); return; }
    fill(screen, status(), top('Messages', () => go('home')), messageList(ph));
  }

  function threadPane(ph, t) {
    if (t.unread) { markRead(ph, t.key); opts.save?.(); }
    const msgs = h('div', { class: 'ph-msgs' }, t.msgs.map((m) => h('p', { class: `ph-msg is-${m.from}` }, m.text)));
    const opt = t.pending ? h('div', { class: 'ph-opts' }, h('p', { class: 'ph-opts-head' }, 'YOUR REPLY'),
      t.pending.options.map((o) => h('button', { class: `ph-opt is-${o.tone}`, onClick: () => {
        let line = null;
        if (t.pending.type === 'date') {
          const ctx = opts.dateCtx?.();
          if (!ctx) { flash('No dates right now.'); return; }
          const res = D.reply(ph, t.key, o.id, ctx);
          line = res?.line || null;
          if (res?.date) { opts.onDate?.(res.date); sfx.play('fanfare'); }
          opts.save?.();
        } else line = opts.onReply(t.key, o.id);
        sfx.play(o.tone === 'hostile' || o.tone === 'gloat' ? 'special' : 'correct');
        draw();
        if (line) flash(line);
      } }, h('span', { class: 'ph-opt-text' }, o.text), h('span', { class: 'ph-opt-hint' }, `${o.tag || TONES[o.tone] || ''}${o.hint ? ` · ${o.hint}` : ''}`)))) : null;
    const pane = h('div', { class: 'ph-thread' }, h('div', { class: 'ph-top ph-top-thread' },
      h('button', { class: 'ph-back', 'aria-label': 'Back', onClick: () => goBack() }, '‹'),
      h('div', { class: 'ph-thread-who' }, face(t), h('p', { class: 'ph-title' }, t.name)), h('span')), msgs, opt);
    requestAnimationFrame(() => { msgs.scrollTop = msgs.scrollHeight; });
    return pane;
  }
  function threadView(ph) {
    const t = ph?.threads.find((x) => x.key === threadKey);
    if (!t) { go('messages'); return; }
    if (wide() && !String(t.key).startsWith('date-')) {
      const pane = threadPane(ph, t);
      fill(screen, status(), h('div', { class: 'ph-split' }, h('div', { class: 'ph-split-l' }, top('Messages', () => go('home')), messageList(ph)), pane));
    } else fill(screen, status(), threadPane(ph, t));
    refreshBadge();
  }

  // ---------- Chirp (the bird app) ----------
  function postCard(p, full = false) {
    const card = h('article', { class: `ph-post${p.mention ? ' is-mention' : ''}${p.pending ? ' is-open' : ''}`, onClick: () => { if (!full) go('post', p.id); } },
      face({ cid: p.cid, icon: p.icon, who: p.who, hater: p.hater }),
      h('div', { class: 'ph-post-body' },
        h('p', { class: 'ph-post-who' }, h('b', {}, p.who.replace(/^@/, '')), p.verified ? h('span', { class: 'ph-verified', 'aria-label': 'verified' }, '✔') : null, h('span', { class: 'ph-muted' }, ` ${p.handle || (p.who.startsWith('@') ? p.who : '')}${p.when ? ` · ${p.when}` : ''}`)),
        richText(p.text),
        h('div', { class: 'ph-post-stats' }, h('span', {}, `💬 ${fmtN(p.replies || 0)}`), h('span', {}, `🔁 ${fmtN(p.reposts || 0)}`),
          h('button', { class: `ph-like${p.liked ? ' is-on' : ''}`, onClick: (e) => { e.stopPropagation(); p.liked = !p.liked; p.likes = (p.likes || 0) + (p.liked ? 1 : -1); opts.save?.(); draw(); } }, `${p.liked ? '♥' : '♡'} ${fmtN(p.likes || 0)}`),
          h('span', {}, `📊 ${fmtN(p.views || 0)}`)),
        p.pending && !full ? h('span', { class: 'ph-reply-dot' }, 'REPLY') : null));
    return card;
  }
  function chirpApp(ph) {
    const feed = ph?.feed || [];
    const list = chirpTab === 'mentions' ? feed.filter((p) => p.mention) : feed;
    const tab = (id, label) => h('button', { class: `ph-tab${chirpTab === id ? ' is-on' : ''}`, onClick: () => { chirpTab = id; draw(); } }, label, id === 'mentions' && pendingMentions(ph) ? h('span', { class: 'ph-dot is-inline' }, String(pendingMentions(ph))) : null);
    fill(screen, status(), h('div', { class: 'ph-chirp-top' }, h('button', { class: 'ph-back', 'aria-label': 'Back', onClick: () => go('home') }, '‹'), h('span', { class: 'ph-chirp-logo' }, '🐦'), h('span')),
      h('div', { class: 'ph-tabs' }, tab('all', 'For you'), tab('mentions', 'Mentions')),
      ph?.followers != null ? h('p', { class: 'ph-sub' }, `${fmtN(ph.followers)} followers${opts.followerNote ? ` · ${opts.followerNote}` : ''}`) : null,
      list.length ? h('div', { class: 'ph-feed' }, list.map((p) => postCard(p))) : h('p', { class: 'ph-empty' }, chirpTab === 'mentions' ? 'Nobody has @ you yet.' : 'Nobody is posting yet.'));
  }
  function postView(ph) {
    const p = (ph?.feed || []).find((x) => x.id === postId);
    if (!p) { go('chirp'); return; }
    const opt = p.pending ? h('div', { class: 'ph-opts' }, h('p', { class: 'ph-opts-head' }, 'REPLY ON CHIRP'),
      p.pending.options.map((o) => h('button', { class: `ph-opt is-${o.tone}`, onClick: () => {
        const line = opts.onPostReply ? opts.onPostReply(p.id, o.id) : null;
        sfx.play(o.tone === 'hostile' || o.tone === 'gloat' ? 'special' : 'correct');
        draw(); if (line) flash(line);
      } }, h('span', { class: 'ph-opt-text' }, o.text), h('span', { class: 'ph-opt-hint' }, `${o.tag || TONES[o.tone] || ''}${o.hint ? ` · ${o.hint}` : ''}`)))) : null;
    const me = opts.me?.() || { name: 'You' };
    fill(screen, status(), top('Post', () => goBack()),
      h('div', { class: 'ph-feed' }, postCard(p, true),
        (p.answers || []).map((a) => h('article', { class: 'ph-post is-reply' }, a.who === 'me' ? face({ cid: me.cid, who: me.name }) : face({ who: a.who }),
          h('div', { class: 'ph-post-body' }, h('p', { class: 'ph-post-who' }, h('b', {}, a.who === 'me' ? me.name : a.who.replace(/^@/, '')), h('span', { class: 'ph-muted' }, ` replying to ${a.who === 'me' ? (p.who.startsWith('@') ? p.who : `@${p.who}`) : `@${String(me.name).replace(/[^\w]/g, '')}`}`)), richText(a.text))))),
      opt);
  }

  // ---------- Lenz (photos) ----------
  function lenzApp(ph) {
    const list = ph?.lenz || [];
    if (ph) ph.lenzSeen = list[0]?.id || ph.lenzSeen;
    fill(screen, status(), h('div', { class: 'ph-lenz-top' }, h('button', { class: 'ph-back', 'aria-label': 'Back', onClick: () => go('home') }, '‹'), h('span', { class: 'ph-lenz-logo' }, 'Lenz'), h('span', { class: 'ph-muted' }, ph?.followers != null ? `${fmtN(ph.followers)} followers` : '')),
      list.length ? h('div', { class: 'ph-lenz' }, list.map((p) => h('article', { class: 'ph-lpost' },
        h('p', { class: 'ph-lpost-who' }, face({ cid: p.cid, icon: p.icon, who: p.who }), h('b', {}, p.who), p.verified ? h('span', { class: 'ph-verified' }, '✔') : null, p.mine ? null : h('span', { class: 'ph-muted' }, ' · Suggested for you')),
        pic(p, 'ph-lpic'),
        h('div', { class: 'ph-lpost-actions' },
          h('button', { class: `ph-like${p.liked ? ' is-on' : ''}`, onClick: () => { p.liked = !p.liked; p.likes = (p.likes || 0) + (p.liked ? 1 : -1); opts.save?.(); draw(); } }, `${p.liked ? '♥' : '♡'} ${fmtN(p.likes || 0)}`),
          h('span', {}, `💬 ${(p.comments || []).length}`)),
        h('p', { class: 'ph-lcap' }, h('b', {}, p.who), ' ', p.caption),
        (p.comments || []).slice(0, 3).map((c) => h('p', { class: 'ph-lcap' }, h('b', {}, c.who.replace(/^@/, '')), ' ', c.text)),
        p.when ? h('p', { class: 'ph-muted' }, p.when) : null)))
        : h('p', { class: 'ph-empty' }, 'No photos yet. Win big and people start posting.'));
  }

  // ---------- Boo (snaps) ----------
  function stopView() { clearTimeout(viewTimer); viewTimer = null; viewing = null; }
  function booApp(ph) {
    const list = ph?.snaps || [];
    if (viewing) {
      const s = viewing;
      fill(screen, h('button', { class: 'ph-snap-view', 'aria-label': 'Close snap', onClick: () => { stopView(); draw(); } },
        pic(s, 'ph-snap-pic'), h('span', { class: 'ph-snap-bar' }, h('span', {})), h('span', { class: 'ph-snap-from' }, `👻 ${s.from}`), h('span', { class: 'ph-snap-cap' }, s.caption)));
      return;
    }
    fill(screen, status(), h('div', { class: 'ph-boo-top' }, h('button', { class: 'ph-back', 'aria-label': 'Back', onClick: () => go('home') }, '‹'), h('span', { class: 'ph-boo-logo' }, '👻 Boo'), h('span')),
      list.length ? h('ul', { class: 'ph-list' }, list.map((s) => h('li', {}, h('button', { class: `ph-row${s.seen ? '' : ' is-unread'}`, onClick: () => {
        if (s.seen) { flash('Opened snaps are gone. It\'s saved in Photos.'); return; }
        openSnap(ph, s.id); opts.save?.(); viewing = s; sfx.play('flip'); draw();
        viewTimer = setTimeout(() => { if (viewing === s) { stopView(); if (open && app === 'boo') draw(); } }, 5000);
      } }, face({ cid: s.cid, icon: s.icon, who: s.from }), h('span', { class: 'ph-row-text' }, h('span', { class: 'ph-row-name' }, s.from), h('span', { class: 'ph-row-last' }, s.seen ? `Opened${s.when ? ` · ${s.when}` : ''}` : `New snap${s.when ? ` · ${s.when}` : ''}`)),
        h('span', { class: `ph-snap-sq${s.seen ? ' is-seen' : ''}`, 'aria-hidden': 'true' }))))) : h('p', { class: 'ph-empty' }, 'No snaps yet.'),
      h('p', { class: 'ph-muted ph-pad' }, 'A snap disappears after you open it. You get 5 seconds.'));
  }

  // ---------- Photos ----------
  function photosApp(ph) {
    const list = ph?.gallery || [];
    fill(screen, status(), top('Photos', () => go('home')),
      list.length ? h('div', { class: 'ph-gallery' }, list.map((g) => h('figure', { class: 'ph-gal' }, pic(g, 'ph-gal-pic'), h('figcaption', {}, g.caption))))
        : h('p', { class: 'ph-empty' }, 'Snaps you open and your Lenz posts are saved here.'));
  }

  // ---------- Calendar and Wallet (each mode fills these) ----------
  function calendarApp(ph) {
    const list = opts.calendar ? opts.calendar(ph) : [];
    fill(screen, status(), top('Calendar', () => go('home')),
      h('p', { class: 'ph-cal-today' }, new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })),
      list.length ? h('ul', { class: 'ph-cal' }, list.map((e) => h('li', { class: e.tag ? `is-${e.tag}` : '' }, h('span', { class: 'ph-cal-when' }, e.when), h('span', { class: 'ph-cal-what' }, h('b', {}, e.title), e.text ? h('span', { class: 'ph-muted' }, e.text) : null))))
        : h('p', { class: 'ph-empty' }, 'Nothing on the calendar.'));
  }
  function walletApp(ph) {
    const w = opts.wallet ? opts.wallet(ph) : null;
    fill(screen, status(), top('Wallet', () => go('home')),
      w ? h('div', { class: 'ph-wallet' },
        h('div', { class: 'ph-wcard' }, h('p', { class: 'ph-w-h' }, w.big[0]), h('p', { class: 'ph-wcard-n' }, w.big[1]), h('p', { class: 'ph-muted' }, w.note || '')),
        h('ul', { class: 'ph-wrows' }, w.rows.map(([k, v]) => h('li', {}, h('span', {}, k), h('b', {}, v))))) : h('p', { class: 'ph-empty' }, 'Nothing here yet.'));
  }

  function news(ph) {
    const list = opts.news ? opts.news(ph) : (ph?.news || []).map((n) => ({ src: `AGN · FLOOR ${n.floor}`, title: n.title, text: n.text }));
    fill(screen, status(), top('News', () => go('home')),
      list.length ? h('ul', { class: 'ph-news' }, list.map((n, i) => h('li', { class: i === 0 ? 'is-lead' : '' }, h('p', { class: 'ph-news-src' }, n.src), h('p', { class: 'ph-news-title' }, n.title), n.text ? h('p', { class: 'ph-news-text' }, n.text) : null)))
        : h('p', { class: 'ph-empty' }, 'No headlines yet.'));
  }

  function deals(ph) {
    const list = ph?.deals || [];
    const label = { offer: 'OFFER · reply in Messages', active: 'ACTIVE', done: 'PAID', declined: 'DECLINED', lost: 'EXPIRED' };
    fill(screen, status(), top('Deals', () => go('home')),
      list.length ? h('ul', { class: 'ph-deals' }, list.map((d) => h('li', { class: `is-${d.status}` },
        h('p', { class: 'ph-deal-brand' }, d.brand, h('span', { class: 'ph-deal-status' }, label[d.status] || d.status)),
        h('p', { class: 'ph-feed-text' }, d.label), h('p', { class: 'ph-muted' }, `Pays ${d.pay} Bounty + ${fmtN(d.followers)} followers${d.task === 'clear3' && d.status === 'active' ? ` · ${d.progress}/3` : ''}`),
        d.status === 'offer' ? h('button', { class: 'ph-mini', onClick: () => go('thread', `deal-${d.id}`) }, 'Reply') : null)))
        : h('p', { class: 'ph-empty' }, 'Sponsors reach out as you climb.'));
  }

  function datingApp(ph) {
    if (!ph) { fill(screen, status(), top('Matchup', () => go('home')), h('p', { class: 'ph-empty' }, opts.empty ? opts.empty(null) : 'Nothing here yet.')); return; }
    const d = D.dating(ph); const p = D.nextProfile(ph); const ctx = opts.dateCtx?.();
    const doSwipe = (like) => {
      if (!ctx) { flash('Matchup is closed right now.'); return; }
      const res = D.swipe(ph, p.id, like, ctx);
      sfx.play(res.matched ? 'win' : like ? 'tap' : 'flip');
      opts.save?.(); draw(); if (res.line) flash(res.line);
    };
    fill(screen, status(), top('Matchup', () => go('home')),
      h('div', { class: 'ph-dating' },
        p ? h('div', { class: 'ph-dcard' },
          h('div', { class: 'ph-dpic' }, h('span', {}, p.icon)),
          h('p', { class: 'ph-dname' }, p.name, h('span', { class: 'ph-muted' }, `, ${p.age}`)),
          h('p', { class: 'ph-djob' }, p.job),
          h('p', { class: 'ph-dbio' }, p.bio),
          h('div', { class: 'ph-dbtns' },
            h('button', { class: 'ph-dbtn is-pass', 'aria-label': `Pass on ${p.name}`, onClick: () => doSwipe(false) }, '✕'),
            h('button', { class: 'ph-dbtn is-like', 'aria-label': `Like ${p.name}`, onClick: () => doSwipe(true) }, '♥')))
          : h('div', { class: 'ph-dcard is-empty' }, h('p', { class: 'ph-empty' }, 'You\'ve seen everyone nearby.'), h('button', { class: 'ph-mini', onClick: () => { D.reshuffle(ph); opts.save?.(); draw(); } }, 'Start over')),
        h('p', { class: 'ph-set-h' }, `MATCHES (${d.matches.length})`),
        d.matches.length ? h('ul', { class: 'ph-list' }, d.matches.map((m) => {
          const q = D.person(m.id); const t = ph.threads.find((x) => x.key === `date-${m.id}`);
          return h('li', {}, h('button', { class: `ph-row${t?.unread ? ' is-unread' : ''}`, onClick: () => go('thread', `date-${m.id}`) },
            h('span', { class: 'ph-ava ph-ava-sm' }, q.icon), h('span', { class: 'ph-row-text' }, h('span', { class: 'ph-row-name' }, q.name), h('span', { class: 'ph-row-last' }, `${'♥'.repeat(m.sparks || 0) || 'No sparks yet'} · ${m.dates} date${m.dates === 1 ? '' : 's'}`)),
            t?.unread ? h('span', { class: 'ph-dot' }, String(t.unread)) : null));
        })) : h('p', { class: 'ph-muted ph-pad' }, 'Like someone to match. Then chat and ask them out.'),
        h('p', { class: 'ph-muted ph-pad' }, `A date: ${ctx?.perk || 'a small boost'}. One per ${ctx?.turnLabel || 'turn'}.`)));
  }

  // ---------- Settings: wallpaper and the shortcut key ----------
  let charPicks = null;
  function settings() {
    const k = opts.getKey();
    const sw = (w, label) => {
      const on = wallpaper && wallpaper.kind === w.kind && String(wallpaper.id) === String(w.id);
      return h('button', { class: `ph-wp${on ? ' is-on' : ''}`, 'aria-pressed': String(!!on), 'aria-label': label, style: `background:${wallpaperCss(w)}`, onClick: async () => { await setWallpaper(w); sfx.play('pick'); draw(); } }, h('span', {}, label));
    };
    if (wpPick) {
      if (!charPicks) { const all = characters.list.filter((c) => c.portrait && !c.retired); charPicks = Array.from({ length: 12 }, () => all[Math.floor(Math.random() * all.length)]).filter(Boolean); }
      fill(screen, status(), top('Pick a character', () => { wpPick = false; draw(); }),
        h('div', { class: 'ph-set' }, h('div', { class: 'ph-wps' }, charPicks.map((c) => sw({ kind: 'char', id: c.id }, c.name))),
          h('button', { class: 'ph-mini', onClick: () => { charPicks = null; draw(); } }, '🔀 Shuffle')));
      return;
    }
    const upload = h('input', { type: 'file', accept: 'image/*', class: 'ph-file', 'aria-label': 'Upload a wallpaper', onChange: async (e) => {
      const f = e.target.files?.[0]; if (!f) return;
      try { const data = await shrinkImage(f); await setWallpaper({ kind: 'custom', id: 'custom', data }); flash('Wallpaper set.'); draw(); }
      catch { flash('That picture didn\'t work. Try another one.'); }
    } });
    const iconId = profile.value?.iconId;
    fill(screen, status(), top('Settings', () => go('home')),
      h('div', { class: 'ph-set' },
        h('p', { class: 'ph-set-h' }, 'WALLPAPER'),
        h('div', { class: 'ph-wps' },
          Object.entries(GRADIENTS).map(([id, [label]]) => sw({ kind: 'grad', id }, label)),
          ARENAS.map((id, i) => sw({ kind: 'arena', id }, `Arena ${i + 1}`)),
          iconId != null && characters.get(iconId)?.portrait ? sw({ kind: 'char', id: iconId }, 'Your icon') : null,
          wallpaper?.kind === 'custom' ? sw(wallpaper, 'Your photo') : null),
        h('div', { class: 'ph-set-row' },
          h('button', { class: 'ph-mini', onClick: () => { wpPick = true; draw(); } }, '🧑 A character'),
          h('label', { class: 'ph-mini ph-upload' }, '🖼️ Upload a photo', upload)),
        h('p', { class: 'ph-muted' }, 'The wallpaper is the same in every mode.'),
        h('p', { class: 'ph-set-h' }, 'PHONE SHORTCUT'),
        h('p', { class: 'ph-muted' }, `Press this key anywhere in ${opts.shortcutWhere || 'this mode'} to bring the phone up or put it away.`),
        h('button', { class: `ph-key${capturing ? ' is-capturing' : ''}`, onClick: () => { capturing = true; draw(); } }, capturing ? 'Press any key…' : keyLabel(k)),
        h('button', { class: 'ph-mini', onClick: () => { opts.setKey('p'); capturing = false; draw(); } }, 'Reset to P')));
  }

  function draw() {
    const ph = opts.getPhone();
    screen.style.background = '';
    screen.classList.toggle('is-wide', wide());
    screen.dataset.app = app;
    ({ home: () => home(ph), messages: () => messages(ph), thread: () => threadView(ph), chirp: () => chirpApp(ph), post: () => postView(ph), lenz: () => lenzApp(ph), boo: () => booApp(ph), photos: () => photosApp(ph), calendar: () => calendarApp(ph), wallet: () => walletApp(ph), news: () => news(ph), deals: () => deals(ph), dating: () => datingApp(ph), settings }[app] || (() => home(ph)))();
    refreshBadge();
  }
  function refreshBadge() {
    const ph = opts.getPhone();
    const n = (ph?.unread || 0) + pendingMentions(ph) + newSnaps(ph);
    badge.hidden = !n; badge.textContent = String(n);
    btn.classList.toggle('has-news', !!n);
  }
  function toggle(force) {
    const next = force ?? !open;
    if (next === open) { if (open) draw(); return; }
    open = next;
    stage.hidden = !open;
    document.documentElement.classList.toggle('ph-is-open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.querySelector('.ph-open-text').textContent = open ? 'Close phone' : 'Open phone';
    if (open) {
      sfx.play('flip'); app = 'home'; draw();
      loadWallpaper().then(() => { if (open && app === 'home') draw(); });
      release = pushBack(() => { if (viewing || wpPick || app !== 'home') { goBack(); return 'stay'; } release = null; toggle(false); return null; });
    } else {
      stopView(); capturing = false;
      if (release) { const r = release; release = null; r(); }
    }
  }
  let toastTimer = null; let lastPinged = null;
  function flash(text) {
    toastEl.textContent = text; toastEl.classList.add('is-on');
    if (!open) { stage.hidden = true; document.body.append(toastEl); toastEl.classList.add('is-floating'); } else { stage.append(toastEl); toastEl.classList.remove('is-floating'); }
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), 3200);
  }

  const onKey = (e) => {
    if (capturing) {
      if (e.key === 'Escape') { capturing = false; draw(); return; }
      if (['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(e.key)) return;
      e.preventDefault(); opts.setKey(e.key.length === 1 ? e.key.toLowerCase() : e.key); capturing = false; draw(); flash(`Phone shortcut: ${keyLabel(opts.getKey())}`); return;
    }
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = opts.getKey();
    if ((e.key.length === 1 ? e.key.toLowerCase() : e.key) === k) { e.preventDefault(); toggle(); }
    else if (e.key === 'Escape' && open) toggle(false);
  };
  document.addEventListener('keydown', onKey);
  document.body.append(wrap);
  loadWallpaper();
  refreshBadge();

  return {
    toggle, refresh: () => { if (open) draw(); else refreshBadge(); }, flash,
    // Something new arrived: pop a banner and buzz.
    ping() {
      const ph = opts.getPhone(); const n = ph?.notes[0];
      refreshBadge();
      if (n && n.id !== lastPinged) { lastPinged = n.id; sfx.play('correct'); flash(`📱 ${n.title}: ${n.text}`); }
      if (open) draw();
    },
    openThread(key) { toggle(true); go('thread', key); },
    openApp(id) { toggle(true); go(id); },
    destroy() { document.removeEventListener('keydown', onKey); if (open) toggle(false); wrap.remove(); toastEl.remove(); document.documentElement.classList.remove('ph-is-open'); },
    show(on) { wrap.hidden = !on; if (!on && open) toggle(false); },
  };
}
