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
//
// v0.27.0: a lock screen, phone customization (wallpapers, lock screen, app
// layout, icon themes, phone color, sounds, text size), texting anyone,
// bonds, quick texts, and typing your own replies with an AI key.

import { h, fill, avatar, pushBack } from './ui.js';
import { characters } from './characters.js';
import { sfx } from './sfx.js';
import { profile } from './profile.js';
import { markRead, openSnap, pendingMentions, newSnaps, thread as threadFor, pick, mentionBadge, snapBadge, badgeTotal, hushMentions, hushSnaps, readAll, dismissNote, clearNotes, snapBack, streakOf, STREAK_BONUS } from './phone-core.js';
import * as D from './phone-dating.js';
import { loadPrefs, getPrefs, setPrefs, wallpaperCss, lockWallpaper, shrinkImage, arrange, GRADIENTS, ARENAS, CLOCK_STYLES, CLOCK_COLORS, ICON_THEMES, FRAMES, SOUNDS, TEXT_SIZES } from './phone-prefs.js';
import { ai } from './ai.js';
import { aiSetup } from './ai-setup.js';
import { characterReply } from './phone-ai.js';
import { languageSwitch, scrub, filterOn } from './language.js';
import { addBond, bondOf, levelOf, useQuick, quickFor, quickBackFor } from './phone-bonds.js';
import { lenzPhoto, photoUrl } from './phone-scenes.js';

const ALL_APPS = {
  messages: ['Messages', '💬'], chirp: ['Chirp', '🐦'], lenz: ['Lenz', '📸'], boo: ['Boo', '👻'],
  dating: ['Matchup', '💘'], news: ['News', '📰'], deals: ['Deals', '💼'], calendar: ['Calendar', '📅'],
  wallet: ['Wallet', '👛'], photos: ['Photos', '🖼️'], settings: ['Settings', '⚙️'],
};
const TONES = {
  hostile: '🔥 HOSTILE', humble: '🤝 HUMBLE', accept: '✅ ACCEPT', decline: '✋ PASS', flirt: '💘 FLIRT', funny: '😂 FUNNY', date: '📅 ASK OUT',
  hype: '📣 HYPE', focus: '🧠 FOCUS', loose: '⚡ LET LOOSE', power: '💪 POWER UP', gloat: '😤 GLOAT', respect: '🤝 RESPECT', later: '💜 SWEET',
};
const fmtN = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 10000 ? `${(n / 1000).toFixed(1)}K` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : Math.round(n || 0).toLocaleString());
const keyLabel = (k) => (k === ' ' ? 'Space' : k.length === 1 ? k.toUpperCase() : k);

const FOLD_KEY = 't7p:phoneFolded';

// Drag the phone button anywhere; it remembers where you left it.
// v0.35.0: works with a mouse on PC too. Drop it in the bottom-right corner
// to send it home. Phone and PC remember their own spots.
const POS_KEY = 't7p:phoneButton';
function makeDraggable(btn, onDrag) {
  const touch = () => matchMedia('(pointer: coarse)').matches;
  const key = () => (touch() ? POS_KEY : `${POS_KEY}:pc`);
  const clamp = (x, y) => [Math.max(6, Math.min(innerWidth - btn.offsetWidth - 6, x)), Math.max(6, Math.min(innerHeight - btn.offsetHeight - 6, y))];
  const place = (x, y) => { const [cx, cy] = clamp(x, y); btn.style.position = 'fixed'; btn.style.left = `${cx}px`; btn.style.top = `${cy}px`; btn.style.right = 'auto'; btn.style.bottom = 'auto'; btn.classList.add('is-moved'); return [cx, cy]; };
  const restore = () => {
    try { const p = JSON.parse(localStorage.getItem(key()) || 'null'); if (p) requestAnimationFrame(() => place(p.x * innerWidth, p.y * innerHeight)); } catch { /* ignore */ }
  };
  let start = null;
  btn.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const r = btn.getBoundingClientRect();
    start = { x: e.clientX, y: e.clientY, bx: r.left, by: r.top, moving: false, id: e.pointerId };
    // A mouse leaves the button before the drag starts; hold on to it.
    if (e.pointerType === 'mouse') { e.preventDefault(); try { btn.setPointerCapture(e.pointerId); } catch { /* ignore */ } }
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
      // Dropped back in the bottom-right corner: snap home and forget the spot.
      if (r.right > innerWidth - 90 && r.bottom > innerHeight - 90) {
        btn.style.position = btn.style.left = btn.style.top = btn.style.right = btn.style.bottom = '';
        btn.classList.remove('is-moved');
        try { localStorage.removeItem(key()); } catch { /* ignore */ }
      } else {
        try { localStorage.setItem(key(), JSON.stringify({ x: r.left / innerWidth, y: r.top / innerHeight })); } catch { /* ignore */ }
      }
      btn.classList.remove('is-dragging');
    }
    start = null;
  };
  btn.addEventListener('pointerup', end); btn.addEventListener('pointercancel', end);
  btn.addEventListener('dragstart', (e) => e.preventDefault());
  btn.draggable = false;
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
  let setPage = null; let wpFor = 'home'; let aiBusy = null; let search = '';
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
    h('button', { class: 'ph-home', 'aria-label': 'Home (tap again to close)', onClick: () => (app === 'home' || app === 'lock' ? toggle(false) : go('home')) }));
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
    if (x.photo) return h('div', { class: cls }, h('img', { src: photoUrl(x.photo), alt: '', loading: 'lazy', style: 'object-position:center' }));
    const c = x.cid != null ? characters.get(x.cid) : null; const u = c && characters.portraitUrl(c);
    if (u) return h('div', { class: cls }, h('img', { src: u, alt: c.name, loading: 'lazy' }));
    if (x.art) return h('div', { class: cls }, h('img', { src: x.art, alt: '', loading: 'lazy' }));
    return h('div', { class: `${cls} is-blank` }, h('span', {}, x.icon || '📸'));
  };

  function go(a, key = null) {
    app = a; if (a === 'thread') threadKey = key; if (a === 'post') postId = key; stopView();
    // v0.30.0: opening an app clears its badge (and its notifications).
    const ph = opts.getPhone(); let changed = false;
    if (ph && (a === 'chirp' || a === 'boo')) {
      changed = (a === 'chirp' ? hushMentions(ph) : hushSnaps(ph)) > 0;
      const before = ph.notes.length; ph.notes = ph.notes.filter((n) => n.app !== a); changed = changed || ph.notes.length !== before;
    }
    if (ph && a === 'dating' && !ph.datingHush) { ph.datingHush = true; changed = true; }
    if (ph && a === 'deals') for (const d of ph.deals || []) if (d.status === 'offer' && !d.hush) { d.hush = true; changed = true; }
    if (ph && a === 'thread' && key != null) { const before = ph.notes.length; ph.notes = ph.notes.filter((n) => !(n.app === 'msg' && n.key === key)); changed = changed || ph.notes.length !== before; }
    if (changed) opts.save?.();
    draw();
  }
  // v0.30.0: dismiss notifications (✕, swipe, or Clear all).
  function dismiss(id) { const ph = opts.getPhone(); dismissNote(ph, id); opts.save?.(); sfx.play('tap'); draw(); }
  function clearAll() { const ph = opts.getPhone(); clearNotes(ph); if (ph) { ph.datingHush = true; for (const d of ph.deals || []) if (d.status === 'offer') d.hush = true; } opts.save?.(); sfx.play('tap'); draw(); }
  const clearBtn = (ph) => (ph?.notes?.length || badgeTotal(ph) ? h('button', { class: 'ph-clear', onClick: (e) => { e.stopPropagation(); clearAll(); } }, 'Clear all') : null);
  // Swipe a notification sideways to dismiss it. Returns true when it swiped.
  function swipeable(li, id) {
    let x0 = null; let dx = 0;
    li.addEventListener('pointerdown', (e) => { x0 = e.clientX; dx = 0; });
    li.addEventListener('pointermove', (e) => { if (x0 == null) return; dx = e.clientX - x0; if (Math.abs(dx) > 8) { li.style.transform = `translateX(${dx}px)`; li.style.opacity = String(Math.max(0.2, 1 - Math.abs(dx) / 160)); } });
    const end = () => { if (x0 == null) return; x0 = null; if (Math.abs(dx) > 70) { li.dataset.swiped = '1'; dismiss(id); } else { li.style.transform = ''; li.style.opacity = ''; } };
    li.addEventListener('pointerup', end); li.addEventListener('pointercancel', end); li.addEventListener('pointerleave', end);
    li.addEventListener('click', (e) => { if (li.dataset.swiped || Math.abs(dx) > 8) { e.stopPropagation(); e.preventDefault(); } }, true);
    return li;
  }
  const xBtn = (id) => h('button', { class: 'ph-note-x', 'aria-label': 'Dismiss notification', onClick: (e) => { e.stopPropagation(); dismiss(id); } }, '✕');
  // The back button: out one screen at a time.
  function goBack() {
    if (viewing) { stopView(); draw(); return; }
    if (wpPick) { wpPick = false; draw(); return; }
    if (app === 'settings' && setPage) { setPage = null; draw(); return; }
    if (app === 'compose') { go('messages'); return; }
    if (app === 'thread') go(String(threadKey).startsWith('date-') ? 'dating' : wide() ? 'home' : 'messages');
    else if (app === 'post') go('chirp');
    else go('home');
  }

  function badgeOf(id, ph) {
    if (!ph) return 0;
    if (id === 'messages') return ph.unread || 0;
    if (id === 'chirp') return mentionBadge(ph);
    if (id === 'boo') return snapBadge(ph);
    if (id === 'deals') return (ph.deals || []).filter((d) => d.status === 'offer' && !d.hush).length;
    if (id === 'dating') return !ph.datingHush && D.nextProfile(ph) && !(ph.dating?.matches.length) ? 1 : 0;
    return 0;
  }
  function appIcon(id, label, icon, ph) {
    const n = badgeOf(id, ph);
    const glyph = id === 'calendar'
      ? h('span', { class: 'ph-cal-glyph' }, h('b', {}, new Date().toLocaleDateString([], { weekday: 'short' }).toUpperCase()), h('span', {}, String(new Date().getDate())))
      : icon;
    return h('button', { class: 'ph-app', onClick: () => go(id) }, h('span', { class: `ph-app-icon is-${id}` }, glyph, n ? h('span', { class: 'ph-dot' }, String(n)) : null), h('span', { class: 'ph-app-label' }, label));
  }

  // Tapping a notification opens it and clears it (go() clears texts, Chirp and Boo).
  const openNote = (n) => {
    const ph = opts.getPhone();
    if (ph && !['msg', 'chirp', 'boo'].includes(n.app)) { ph.notes = ph.notes.filter((x) => x.id !== n.id); opts.save?.(); }
    return (n.app === 'msg' ? go('thread', n.key) : ALL_APPS[n.app] && appIds.includes(n.app) ? (n.app === 'chirp' ? (chirpTab = 'mentions', go('chirp')) : go(n.app)) : go('messages'));
  };

  // ---------- Lock screen (v0.27.0) ----------
  function lockScreen(ph) {
    const pr = getPrefs();
    const notes = (ph?.notes || []).slice(0, 5);
    screen.style.background = wallpaperCss(lockWallpaper());
    const t = time(); const [hh, mm] = t.split(':');
    const unlock = (then) => { sfx.play('tap'); if (then) then(); else go('home'); };
    let y0 = null;
    const clock = pr.clock === 'stacked'
      ? h('p', { class: 'ph-lclock is-stacked', style: `color:${pr.clockColor}` }, h('span', {}, hh), h('span', {}, mm))
      : h('p', { class: `ph-lclock is-${pr.clock}`, style: `color:${pr.clockColor}` }, t);
    fill(screen, status(), h('div', { class: 'ph-lock2',
      onPointerdown: (e) => { y0 = e.clientY; },
      onPointerup: (e) => { if (y0 != null && y0 - e.clientY > 50) unlock(); y0 = null; } },
    h('div', { class: 'ph-lock-top' }, h('p', { class: 'ph-lock-date', style: `color:${pr.clockColor}` }, new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })), clock),
    notes.length ? h('ul', { class: 'ph-lnotes' }, h('li', { class: 'ph-lnotes-head' }, clearBtn(ph)), notes.map((n) => swipeable(h('li', { class: 'ph-note-li' }, h('button', { class: 'ph-lnote', onClick: (e) => { e.stopPropagation(); unlock(() => openNote(n)); } },
      h('span', { class: 'ph-note-app' }, n.app === 'msg' ? 'MESSAGES' : (ALL_APPS[n.app]?.[0] || n.app).toUpperCase()),
      h('b', {}, n.title), h('span', { class: 'ph-lnote-text' }, pr.previews ? n.text : 'Tap to view')), xBtn(n.id)), n.id))) : h('span', { class: 'ph-lnotes' }),
    h('button', { class: 'ph-unlock', onClick: () => unlock() }, h('span', { class: 'ph-unlock-bar', 'aria-hidden': 'true' }), 'Swipe up or tap to unlock')));
  }

  // ---------- Home screen ----------
  function home(ph) {
    const ws = opts.widgets ? opts.widgets(ph) : [];
    const notes = (ph?.notes || []).slice(0, wide() ? 3 : 4);
    const lay = arrange(appIds);
    const grid = lay.grid.map((id) => [id, ...ALL_APPS[id]]);
    const dock = lay.dock.map((id) => [id, ...ALL_APPS[id]]);
    screen.style.background = wallpaperCss(getPrefs().home);
    const clockW = h('div', { class: 'ph-widget ph-w-clock' }, h('p', { class: 'ph-clock' }, time()), h('p', { class: 'ph-date' }, new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })),
      ws.length ? h('div', { class: 'ph-widgets' }, ws.map(([v, k]) => h('div', {}, h('p', { class: 'ph-wv' }, String(v)), h('p', { class: 'ph-wk' }, k)))) : null);
    const notesW = h('div', { class: 'ph-widget ph-w-notes' }, h('div', { class: 'ph-w-hrow' }, h('p', { class: 'ph-w-h' }, 'NOTIFICATIONS'), clearBtn(ph)),
      notes.length ? h('ul', { class: 'ph-notes' }, notes.map((n) => swipeable(h('li', { class: 'ph-note-li' }, h('button', { class: 'ph-note', onClick: () => openNote(n) },
        h('span', { class: 'ph-note-app' }, n.app === 'msg' ? 'MESSAGES' : (ALL_APPS[n.app]?.[0] || n.app).toUpperCase()), h('span', { class: 'ph-note-title' }, n.title), h('span', { class: 'ph-note-text' }, n.text)), xBtn(n.id)), n.id)))
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
    fill(screen, status(), top('Messages', () => go('home'), newBtn()),
      ph?.unread ? h('div', { class: 'ph-readall-row' }, h('button', { class: 'ph-clear', onClick: () => { readAll(ph); opts.save?.(); sfx.play('tap'); draw(); } }, 'Mark all read')) : null,
      messageList(ph));
  }
  const newBtn = () => h('button', { class: 'ph-back ph-new', 'aria-label': 'New message', onClick: () => { search = ''; go('compose'); } }, '✏️');

  // ---------- Text anyone (v0.27.0) ----------
  const isDate = (t) => String(t.key).startsWith('date-');
  const shortName = (n) => String(n).split(/[ (]/)[0];
  function contacts(ph) {
    const map = new Map();
    const add = (w) => { if (w?.key && !map.has(w.key) && w.kind !== 'office') map.set(w.key, w); };
    (ph?.threads || []).forEach(add);
    (opts.contacts ? opts.contacts(ph) : []).forEach(add);
    (ph?.met || []).forEach(add);
    return [...map.values()].sort((a, b) => bondOf(ph, b.key) - bondOf(ph, a.key) || String(a.name).localeCompare(b.name));
  }
  function composeApp(ph) {
    if (!ph) { go('messages'); return; }
    const all = contacts(ph);
    const listEl = h('ul', { class: 'ph-list' });
    const drawList = () => {
      const q = search.trim().toLowerCase();
      const list = q ? all.filter((c) => String(c.name).toLowerCase().includes(q)) : all;
      fill(listEl, list.length ? list.map((c) => { const lv = levelOf(bondOf(ph, c.key)); return h('li', {}, h('button', { class: 'ph-row', onClick: () => {
        const t = threadFor(ph, { key: c.key, name: c.name, cid: c.cid, kind: c.kind, icon: c.icon });
        opts.save?.(); go('thread', t.key);
      } }, face(c), h('span', { class: 'ph-row-text' }, h('span', { class: 'ph-row-name' }, c.name), h('span', { class: 'ph-row-last' }, `${lv[2]} ${lv[1]} · bond ${bondOf(ph, c.key)}`)))); })
        : h('li', {}, h('p', { class: 'ph-empty' }, q ? 'Nobody by that name.' : 'You haven\'t met anyone yet. Fight, play and people will start texting.')));
    };
    const box = h('input', { class: 'ph-search', placeholder: 'Search people', 'aria-label': 'Search people', value: search });
    box.addEventListener('input', () => { search = box.value; drawList(); });
    drawList();
    fill(screen, status(), top('New message', () => goBack()), h('div', { class: 'ph-pad' }, box), listEl);
  }

  // A reply button (or a typed reply that picked one). Runs the mode's rule.
  function chooseOption(ph, t, o) {
    if (t.pending.type === 'date') {
      const ctx = opts.dateCtx?.();
      if (!ctx) { flash('No dates right now.'); return { ok: false }; }
      const res = D.reply(ph, t.key, o.id, ctx);
      if (res?.date) { opts.onDate?.(res.date); sfx.play('fanfare'); }
      opts.save?.();
      return { ok: true, line: res?.line || null };
    }
    return { ok: true, line: opts.onReply(t.key, o.id) };
  }
  function bondNote(ph, t, d) {
    if (!d) return capped(ph, t.key) ? 'Bond maxed for today.' : '';
    const lv = levelOf(bondOf(ph, t.key));
    return `Bond ${d > 0 ? '+' : ''}${d} (${lv[1]})`;
  }
  const capped = (ph, key) => { const b = ph?.bonds?.[key]; return !!b && b.up >= 8; };
  async function sendTyped(ph, t, raw) {
    const text = scrub(String(raw || '').trim()).slice(0, 300);
    if (!text || aiBusy) return;
    const pending = t.pending;
    const tmp = { from: 'me', text, tmp: true };
    t.msgs.push(tmp); aiBusy = t.key; draw();
    let res;
    try {
      res = await characterReply({ t, text, history: t.msgs.filter((m) => m !== tmp), options: pending?.options || null, setting: opts.aiSetting?.() || '' });
    } catch (e) {
      t.msgs = t.msgs.filter((m) => m !== tmp); aiBusy = null; draw();
      flash(`${e.message}${pending ? ' Use a reply button instead.' : ''}`);
      return;
    }
    t.msgs = t.msgs.filter((m) => m !== tmp);
    let line = null;
    if (pending && t.pending === pending) {
      const o = pending.options.find((x) => x.id === res.choice) || pending.options[0];
      const before = t.msgs.length;
      const r = chooseOption(ph, t, o);
      if (!r.ok) { aiBusy = null; draw(); return; }
      line = r.line;
      const added = t.msgs.slice(before);
      const mineMsg = added.find((m) => m.from === 'me');
      if (mineMsg) mineMsg.text = text; else t.msgs.splice(before, 0, { from: 'me', text });
      const theirs = t.msgs.slice(before).find((m) => m.from === 'them');
      if (theirs) theirs.text = res.reply; else t.msgs.push({ from: 'them', text: res.reply });
    } else {
      t.msgs.push({ from: 'me', text }, { from: 'them', text: res.reply });
    }
    const d = addBond(ph, t.key, res.tone, { romance: isDate(t) });
    opts.save?.(); aiBusy = null;
    sfx.play(res.tone === 'hostile' || res.tone === 'rude' ? 'special' : 'correct');
    draw();
    const msg = [line, bondNote(ph, t, d)].filter(Boolean).join(' · ');
    if (msg) flash(msg);
  }
  // v0.28.0: mode actions in a chat, like asking a Fusion fighter for backup.
  function threadActions(ph, t) {
    const list = opts.threadActions ? opts.threadActions(ph, t) : [];
    if (!list.length || t.pending) return null;
    return h('div', { class: 'ph-actions' }, list.map((a) => h('button', { class: 'ph-action', disabled: !!a.disabled || !!aiBusy, onClick: () => {
      const line = a.run(); opts.save?.(); sfx.play('fanfare'); draw(); if (line) flash(line);
    } }, h('b', {}, a.label), a.hint ? h('span', { class: 'ph-muted' }, a.hint) : null)));
  }
  function composer(ph, t) {
    if (t.kind === 'office') return null;
    if (ai.ready()) {
      const box = h('input', { class: 'ph-type', placeholder: t.pending ? 'Type your own reply…' : `Text ${shortName(t.name)}…`, maxlength: 300, 'aria-label': 'Type a message', disabled: !!aiBusy });
      const send = () => { const v = box.value; box.value = ''; sendTyped(ph, t, v); };
      box.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); send(); } else e.stopPropagation(); });
      return h('div', { class: 'ph-composer' }, box, h('button', { class: 'ph-send', 'aria-label': 'Send', disabled: !!aiBusy, onClick: send }, '➤'));
    }
    const setup = h('button', { class: 'ph-linkbtn', onClick: () => { setPage = 'ai'; go('settings'); } }, ai.hasKey() ? 'AI replies are off or out for today. Check Settings.' : 'Type your own: add a free AI key in Settings ›');
    if (t.pending) return h('div', { class: 'ph-composer is-hint' }, setup);
    const QK = quickFor(opts.mode);
    const quick = isDate(t) ? [{ tone: 'flirty', text: 'Thinking about you 😊' }, ...QK.filter((q) => q.tone !== 'hostile')] : QK;
    return h('div', { class: 'ph-composer is-quick' },
      h('div', { class: 'ph-quick' }, quick.map((q) => h('button', { class: `ph-qchip is-${q.tone}`, onClick: () => {
        if (!useQuick(ph, t.key)) { flash(`${shortName(t.name)} is busy. Text again tomorrow.`); return; }
        t.msgs.push({ from: 'me', text: q.text });
        const backs = q.tone === 'flirty' ? ['Same 😊', 'Stop it, you\'re sweet', 'Was just about to text you!'] : quickBackFor(opts.mode)[q.tone];
        t.msgs.push({ from: 'them', text: pick(backs, Math.random) });
        const d = addBond(ph, t.key, q.tone, { romance: isDate(t) });
        opts.save?.(); sfx.play(q.tone === 'hostile' ? 'special' : 'tap'); draw();
        const n = bondNote(ph, t, d); if (n) flash(n);
      } }, q.text))),
      setup);
  }

  function threadPane(ph, t) {
    if (t.unread) { markRead(ph, t.key); opts.save?.(); }
    const msgs = h('div', { class: 'ph-msgs' }, t.msgs.map((m) => h('p', { class: `ph-msg is-${m.from}` }, m.text)));
    const opt = t.pending ? h('div', { class: 'ph-opts' }, h('p', { class: 'ph-opts-head' }, 'YOUR REPLY'),
      t.pending.options.map((o) => h('button', { class: `ph-opt is-${o.tone}`, disabled: !!aiBusy, onClick: () => {
        const r = chooseOption(ph, t, o);
        if (!r.ok) return;
        const d = addBond(ph, t.key, o.tone, { romance: isDate(t) });
        opts.save?.();
        sfx.play(o.tone === 'hostile' || o.tone === 'gloat' ? 'special' : 'correct');
        draw();
        const msg = [r.line, bondNote(ph, t, d)].filter(Boolean).join(' · ');
        if (msg) flash(msg);
      } }, h('span', { class: 'ph-opt-text' }, o.text), h('span', { class: 'ph-opt-hint' }, `${o.tag || TONES[o.tone] || ''}${o.hint ? ` · ${o.hint}` : ''}`)))) : null;
    const lv = levelOf(bondOf(ph, t.key));
    if (aiBusy === t.key) msgs.append(h('p', { class: 'ph-msg is-them is-typing' }, h('span'), h('span'), h('span')));
    const pane = h('div', { class: 'ph-thread' }, h('div', { class: 'ph-top ph-top-thread' },
      h('button', { class: 'ph-back', 'aria-label': 'Back', onClick: () => goBack() }, '‹'),
      h('div', { class: 'ph-thread-who' }, face(t), h('p', { class: 'ph-title' }, t.name),
        t.kind !== 'office' ? h('span', { class: 'ph-bond', title: `Bond ${bondOf(ph, t.key)} / 100` }, `${lv[2]} ${lv[1]} · ${bondOf(ph, t.key)}`) : null), h('span')), msgs, opt, threadActions(ph, t), composer(ph, t));
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
    let typer = null;
    if (p.pending && ai.ready()) {
      const box = h('input', { class: 'ph-type', placeholder: `Reply to ${p.who}…`, maxlength: 280, 'aria-label': 'Type a reply', disabled: !!aiBusy });
      const send = async () => {
        const text = scrub(box.value.trim()).slice(0, 280); if (!text || aiBusy) return;
        aiBusy = `post${p.id}`; draw();
        try {
          const res = await characterReply({ t: { key: `post${p.id}`, name: p.who, kind: p.hater ? 'hater' : 'fan' }, text, history: [{ from: 'them', text: p.text }], options: p.pending.options, setting: opts.aiSetting?.() || '' });
          const line = opts.onPostReply ? opts.onPostReply(p.id, res.choice) : null;
          const ans = p.answers || []; const i = ans.map((a) => a.who).lastIndexOf('me');
          if (i >= 0) { ans[i].text = text; if (ans[i + 1]) ans[i + 1].text = res.reply; else ans.push({ who: p.who, text: res.reply }); }
          opts.save?.(); aiBusy = null; sfx.play('correct'); draw(); if (line) flash(line);
        } catch (e) { aiBusy = null; draw(); flash(`${e.message} Use a reply button instead.`); }
      };
      box.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); send(); } });
      typer = h('div', { class: 'ph-composer' }, box, h('button', { class: 'ph-send', 'aria-label': 'Send', disabled: !!aiBusy, onClick: send }, aiBusy ? '…' : '➤'));
    }
    fill(screen, status(), top('Post', () => goBack()),
      h('div', { class: 'ph-feed' }, postCard(p, true),
        (p.answers || []).map((a) => h('article', { class: 'ph-post is-reply' }, a.who === 'me' ? face({ cid: me.cid, who: me.name }) : face({ who: a.who }),
          h('div', { class: 'ph-post-body' }, h('p', { class: 'ph-post-who' }, h('b', {}, a.who === 'me' ? me.name : a.who.replace(/^@/, '')), h('span', { class: 'ph-muted' }, ` replying to ${a.who === 'me' ? (p.who.startsWith('@') ? p.who : `@${p.who}`) : `@${String(me.name).replace(/[^\w]/g, '')}`}`)), richText(a.text))))),
      opt, typer);
  }

  // ---------- Lenz (photos) ----------
  function lenzApp(ph) {
    const list = ph?.lenz || [];
    if (ph) ph.lenzSeen = list[0]?.id || ph.lenzSeen;
    fill(screen, status(), h('div', { class: 'ph-lenz-top' }, h('button', { class: 'ph-back', 'aria-label': 'Back', onClick: () => go('home') }, '‹'), h('span', { class: 'ph-lenz-logo' }, 'Lenz'), h('span', { class: 'ph-muted' }, ph?.followers != null ? `${fmtN(ph.followers)} followers` : '')),
      list.length ? h('div', { class: 'ph-lenz' }, list.map((p) => h('article', { class: 'ph-lpost' },
        h('p', { class: 'ph-lpost-who' }, face({ cid: p.cid, icon: p.icon, who: p.who }), h('b', {}, p.who), p.verified ? h('span', { class: 'ph-verified' }, '✔') : null, p.mine ? null : h('span', { class: 'ph-muted' }, ' · Suggested for you')),
        lenzPhoto(p),
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
  function sendBack(ph, s) {
    const n = snapBack(ph, s.id); if (!n) return;
    addBond(ph, s.key, 'friendly');
    let msg = n >= 2 ? `🔥 ${n}-snap streak with ${shortName(s.from)}.` : `Snapped back. Start a streak with ${shortName(s.from)}.`;
    if (n >= STREAK_BONUS) { const extra = opts.onSnapStreak?.(n, s); if (extra) msg += ` ${extra}`; }
    opts.save?.(); sfx.play('tap'); flash(msg);
  }
  function booApp(ph) {
    const list = ph?.snaps || [];
    if (viewing) {
      const s = viewing;
      const n = streakOf(ph, s.key);
      fill(screen, h('div', { class: 'ph-snap-view' },
        h('button', { class: 'ph-snap-close', 'aria-label': 'Close snap', onClick: () => { stopView(); draw(); } }),
        pic(s, 'ph-snap-pic'), h('span', { class: 'ph-snap-bar' }, h('span', {})), h('span', { class: 'ph-snap-from' }, `👻 ${s.from}${n ? ` · 🔥 ${n}` : ''}`), h('span', { class: 'ph-snap-cap' }, s.caption),
        s.key && !s.back ? h('button', { class: 'ph-snap-back', onClick: (e) => { e.stopPropagation(); sendBack(ph, s); stopView(); draw(); } }, `📸 Snap back${n ? ` · keep the 🔥 ${n} going` : ''}`) : null));
      return;
    }
    fill(screen, status(), h('div', { class: 'ph-boo-top' }, h('button', { class: 'ph-back', 'aria-label': 'Back', onClick: () => go('home') }, '‹'), h('span', { class: 'ph-boo-logo' }, '👻 Boo'), h('span')),
      list.length ? h('ul', { class: 'ph-list' }, list.map((s) => h('li', {}, h('button', { class: `ph-row${s.seen ? '' : ' is-unread'}`, onClick: () => {
        if (s.seen && s.key && !s.back) { sendBack(ph, s); draw(); return; }
        if (s.seen) { flash('Opened snaps are gone. It\'s saved in Photos.'); return; }
        openSnap(ph, s.id); opts.save?.(); viewing = s; sfx.play('flip'); draw();
        viewTimer = setTimeout(() => { if (viewing === s) { stopView(); if (open && app === 'boo') draw(); } }, 5000);
      } }, face({ cid: s.cid, icon: s.icon, who: s.from }), h('span', { class: 'ph-row-text' }, h('span', { class: 'ph-row-name' }, s.from, streakOf(ph, s.key) ? h('span', { class: 'ph-streak' }, ` 🔥${streakOf(ph, s.key)}`) : null), h('span', { class: 'ph-row-last' }, s.seen ? `${s.back ? 'Snapped back' : s.key ? 'Opened · tap to snap back' : 'Opened'}${s.when ? ` · ${s.when}` : ''}` : `New snap${s.when ? ` · ${s.when}` : ''}`)),
        h('span', { class: `ph-snap-sq${s.seen ? ' is-seen' : ''}`, 'aria-hidden': 'true' }))))) : h('p', { class: 'ph-empty' }, 'No snaps yet.'),
      h('p', { class: 'ph-muted ph-pad' }, `A snap disappears after you open it. You get 5 seconds. Snap back to start a streak 🔥; at ${STREAK_BONUS} or more, every snap back ${opts.streakPerk || 'gives a small bonus'}. Miss one and it resets.`));
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

  // ---------- Settings (v0.27.0: pages for every way to set up the phone) ----------
  let charPicks = null;
  const tog = (label, on, onChange, hint = null) => h('button', { class: `ph-tog${on ? ' is-on' : ''}`, role: 'switch', 'aria-checked': String(!!on), onClick: async () => { await onChange(!on); sfx.play('tap'); draw(); } },
    h('span', { class: 'ph-tog-text' }, h('span', {}, label), hint ? h('span', { class: 'ph-muted' }, hint) : null), h('span', { class: 'ph-tog-k', 'aria-hidden': 'true' }));
  const chips = (list, value, onPick) => h('div', { class: 'ph-chips' }, list.map(([id, label]) => h('button', { class: `ph-chip${value === id ? ' is-on' : ''}`, 'aria-pressed': String(value === id), onClick: async () => { await onPick(id); sfx.play('pick'); draw(); } }, label)));
  function settings() {
    const pr = getPrefs();
    const page = (title, ...body) => fill(screen, status(), top(title, () => goBack()), h('div', { class: 'ph-set' }, ...body));
    if (setPage === 'wallpaper') {
      const cur = wpFor === 'lock' ? (pr.lock || pr.home) : pr.home;
      const choose = (w) => setPrefs(wpFor === 'lock' ? { lock: w, sameWallpaper: false } : { home: w });
      const sw = (w, label) => {
        const on = cur && cur.kind === w.kind && String(cur.id) === String(w.id);
        return h('button', { class: `ph-wp${on ? ' is-on' : ''}`, 'aria-pressed': String(!!on), 'aria-label': label, style: `background:${wallpaperCss(w)}`, onClick: async () => { await choose(w); sfx.play('pick'); draw(); } }, h('span', {}, label));
      };
      if (wpPick) {
        if (!charPicks) { const all = characters.list.filter((c) => c.portrait && !c.retired); charPicks = Array.from({ length: 12 }, () => all[Math.floor(Math.random() * all.length)]).filter(Boolean); }
        fill(screen, status(), top('Pick a character', () => goBack()),
          h('div', { class: 'ph-set' }, h('div', { class: 'ph-wps' }, charPicks.map((c) => sw({ kind: 'char', id: c.id }, c.name))),
            h('button', { class: 'ph-mini', onClick: () => { charPicks = null; draw(); } }, '🔀 Shuffle')));
        return;
      }
      const upload = h('input', { type: 'file', accept: 'image/*', class: 'ph-file', 'aria-label': 'Upload a wallpaper', onChange: async (e) => {
        const f = e.target.files?.[0]; if (!f) return;
        try { const data = await shrinkImage(f); await choose({ kind: 'custom', id: `custom-${wpFor}`, data }); flash('Wallpaper set.'); draw(); }
        catch { flash('That picture didn\'t work. Try another one.'); }
      } });
      const iconId = profile.value?.iconId;
      page('Wallpaper',
        chips([['home', 'Home screen'], ['lock', 'Lock screen']], wpFor, (id) => { wpFor = id; }),
        wpFor === 'lock' ? tog('Same as the home screen', pr.sameWallpaper, (v) => setPrefs({ sameWallpaper: v })) : null,
        wpFor === 'lock' && pr.sameWallpaper ? h('p', { class: 'ph-muted' }, 'Turn this off to give the lock screen its own wallpaper.') : h('div', { class: 'ph-wps' },
          Object.entries(GRADIENTS).map(([id, [label]]) => sw({ kind: 'grad', id }, label)),
          ARENAS.map((id, i) => sw({ kind: 'arena', id }, `Arena ${i + 1}`)),
          iconId != null && characters.get(iconId)?.portrait ? sw({ kind: 'char', id: iconId }, 'Your icon') : null,
          cur?.kind === 'custom' ? sw(cur, 'Your photo') : null,
          cur?.kind === 'char' && cur.id !== iconId ? sw(cur, characters.get(cur.id)?.name || 'Character') : null),
        wpFor === 'lock' && pr.sameWallpaper ? null : h('div', { class: 'ph-set-row' },
          h('button', { class: 'ph-mini', onClick: () => { wpPick = true; draw(); } }, '🧑 A character'),
          h('label', { class: 'ph-mini ph-upload' }, '🖼️ Upload a photo', upload)),
        h('p', { class: 'ph-muted' }, 'Wallpapers are the same in every mode.'));
      return;
    }
    if (setPage === 'lock') {
      page('Lock screen',
        tog('Lock screen', pr.lockOn, (v) => setPrefs({ lockOn: v }), 'Shows each time you open the phone'),
        h('p', { class: 'ph-set-h' }, 'CLOCK'), chips(CLOCK_STYLES, pr.clock, (id) => setPrefs({ clock: id })),
        h('p', { class: 'ph-set-h' }, 'CLOCK COLOR'),
        h('div', { class: 'ph-swatches' }, CLOCK_COLORS.map((c) => h('button', { class: `ph-swatch${pr.clockColor === c ? ' is-on' : ''}`, style: `background:${c}`, 'aria-label': `Clock color ${c}`, onClick: async () => { await setPrefs({ clockColor: c }); sfx.play('pick'); draw(); } }))),
        tog('Show message previews', pr.previews, (v) => setPrefs({ previews: v }), 'Off: notifications just say "Tap to view"'));
      return;
    }
    if (setPage === 'apps') {
      const lay = arrange(appIds);
      const ids = lay.order.filter((id) => id !== 'settings');
      const move = async (id, dir) => { const o = [...ids]; const i = o.indexOf(id); const j = i + dir; if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; await setPrefs({ order: o }); draw(); };
      const dockT = async (id) => { let d = pr.dock.filter((x) => appIds.includes(x)); if (d.includes(id)) d = d.filter((x) => x !== id); else { if (d.length >= 4) { flash('The dock holds 4 apps. Take one out first.'); return; } d = [...d, id]; } await setPrefs({ dock: d }); sfx.play('tap'); draw(); };
      const hideT = async (id) => { const hd = pr.hidden.includes(id) ? pr.hidden.filter((x) => x !== id) : [...pr.hidden, id]; await setPrefs({ hidden: hd }); sfx.play('tap'); draw(); };
      page('Apps',
        h('p', { class: 'ph-muted' }, '▲▼ moves an app. 📌 puts it in the dock (4 max). 👁 hides it.'),
        h('ul', { class: 'ph-arrange' }, ids.map((id) => h('li', { class: pr.hidden.includes(id) ? 'is-hidden' : '' },
          h('span', { class: `ph-app-icon is-${id} is-mini` }, ALL_APPS[id][1]), h('span', { class: 'ph-arr-name' }, ALL_APPS[id][0]),
          h('button', { class: 'ph-arr-btn', 'aria-label': `Move ${ALL_APPS[id][0]} up`, onClick: () => move(id, -1) }, '▲'),
          h('button', { class: 'ph-arr-btn', 'aria-label': `Move ${ALL_APPS[id][0]} down`, onClick: () => move(id, 1) }, '▼'),
          h('button', { class: `ph-arr-btn${lay.dock.includes(id) ? ' is-on' : ''}`, 'aria-pressed': String(lay.dock.includes(id)), 'aria-label': `Dock ${ALL_APPS[id][0]}`, onClick: () => dockT(id) }, '📌'),
          h('button', { class: `ph-arr-btn${pr.hidden.includes(id) ? ' is-on' : ''}`, 'aria-pressed': String(pr.hidden.includes(id)), 'aria-label': `Hide ${ALL_APPS[id][0]}`, onClick: () => hideT(id) }, '👁')))),
        h('button', { class: 'ph-mini', onClick: async () => { await setPrefs({ order: null, dock: ['messages', 'chirp', 'lenz', 'boo'], hidden: [] }); draw(); } }, 'Reset layout'));
      return;
    }
    if (setPage === 'look') {
      page('Look',
        h('p', { class: 'ph-set-h' }, 'APP ICONS'), chips(ICON_THEMES, pr.icons, (id) => setPrefs({ icons: id })),
        h('p', { class: 'ph-set-h' }, 'PHONE COLOR'),
        h('div', { class: 'ph-swatches' }, FRAMES.map(([id, label, c]) => h('button', { class: `ph-swatch${pr.frame === id ? ' is-on' : ''}`, style: `background:${c}`, 'aria-label': label, title: label, onClick: async () => { await setPrefs({ frame: id }); sfx.play('pick'); draw(); } }))),
        h('p', { class: 'ph-muted' }, 'The phone color shows on bigger screens.'),
        h('p', { class: 'ph-set-h' }, 'TEXT SIZE'), chips(TEXT_SIZES, pr.text, (id) => setPrefs({ text: id })));
      return;
    }
    if (setPage === 'sounds') {
      page('Sounds',
        h('p', { class: 'ph-set-h' }, 'NOTIFICATION SOUND'), chips(SOUNDS, pr.sound, (id) => { if (id !== 'silent') sfx.play(id); return setPrefs({ sound: id }); }),
        tog('Vibrate', pr.vibrate, (v) => setPrefs({ vibrate: v }), 'On phones that can vibrate'));
      return;
    }
    if (setPage === 'ai') { page('AI texting', aiSetup({ compact: true, onChange: () => {} })); return; }
    if (setPage === 'language') { page('Language', languageSwitch(() => draw()), h('p', { class: 'ph-muted' }, 'This is the same switch as in the arcade\'s Settings.')); return; }
    if (setPage === 'shortcut') {
      const k = opts.getKey();
      page('Phone shortcut',
        h('p', { class: 'ph-muted' }, `Press this key anywhere in ${opts.shortcutWhere || 'this mode'} to bring the phone up or put it away.`),
        h('button', { class: `ph-key${capturing ? ' is-capturing' : ''}`, onClick: () => { capturing = true; draw(); } }, capturing ? 'Press any key…' : keyLabel(k)),
        h('button', { class: 'ph-mini', onClick: () => { opts.setKey('p'); capturing = false; draw(); } }, 'Reset to P'));
      return;
    }
    const row = (id, icon, label, sub) => h('li', {}, h('button', { class: 'ph-setrow', onClick: () => { setPage = id; wpPick = false; draw(); } }, h('span', { class: 'ph-setrow-ic', 'aria-hidden': 'true' }, icon), h('span', { class: 'ph-row-text' }, h('span', { class: 'ph-row-name' }, label), sub ? h('span', { class: 'ph-row-last' }, sub) : null), h('span', { class: 'ph-muted' }, '›')));
    fill(screen, status(), top('Settings', () => go('home')),
      h('ul', { class: 'ph-setlist' },
        row('wallpaper', '🖼️', 'Wallpaper', 'Home and lock screen'),
        row('lock', '🔒', 'Lock screen', pr.lockOn ? 'On' : 'Off'),
        row('apps', '🧩', 'Apps', 'Arrange, dock and hide'),
        row('look', '🎨', 'Look', 'Icons, phone color, text size'),
        row('sounds', '🔔', 'Sounds', pr.vibrate ? 'Vibrate' : (SOUNDS.find(([id]) => id === pr.sound)?.[1] || 'Ding')),
        row('ai', '🤖', 'AI texting', ai.hasKey() ? (ai.config.on ? 'On' : 'Off') : 'Type your own replies'),
        row('language', '🤬', 'Language filter', filterOn() ? 'On' : 'Off (18+)'),
        row('shortcut', '⌨️', 'Phone shortcut', keyLabel(opts.getKey()))));
  }

  function draw() {
    const ph = opts.getPhone();
    const pr = getPrefs();
    screen.style.background = '';
    screen.classList.toggle('is-wide', wide());
    screen.dataset.app = app;
    screen.dataset.icons = pr.icons; screen.dataset.text = pr.text; device.dataset.frame = pr.frame;
    ({ lock: () => lockScreen(ph), compose: () => composeApp(ph), home: () => home(ph), messages: () => messages(ph), thread: () => threadView(ph), chirp: () => chirpApp(ph), post: () => postView(ph), lenz: () => lenzApp(ph), boo: () => booApp(ph), photos: () => photosApp(ph), calendar: () => calendarApp(ph), wallet: () => walletApp(ph), news: () => news(ph), deals: () => deals(ph), dating: () => datingApp(ph), settings }[app] || (() => home(ph)))();
    refreshBadge();
  }
  function refreshBadge() {
    const ph = opts.getPhone();
    const n = badgeTotal(ph);
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
      sfx.play('flip'); setPage = null; app = getPrefs().lockOn ? 'lock' : 'home'; draw();
      loadPrefs().then(() => { if (open && (app === 'home' || app === 'lock')) { if (app === 'lock' && !getPrefs().lockOn) app = 'home'; draw(); } });
      release = pushBack(() => { if (viewing || wpPick || setPage || (app !== 'home' && app !== 'lock')) { goBack(); return 'stay'; } release = null; toggle(false); return null; });
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
  loadPrefs();
  refreshBadge();

  return {
    toggle, refresh: () => { if (open) draw(); else refreshBadge(); }, flash,
    // Something new arrived: pop a banner and buzz.
    ping() {
      const ph = opts.getPhone(); const n = ph?.notes[0];
      refreshBadge();
      if (n && n.id !== lastPinged) {
        lastPinged = n.id;
        const pr = getPrefs();
        if (pr.vibrate) { try { navigator.vibrate?.(120); } catch { /* ignore */ } } else if (pr.sound !== 'silent') sfx.play(pr.sound);
        flash(`📱 ${n.title}: ${pr.previews ? n.text : 'New message'}`);
      }
      if (open) draw();
    },
    openThread(key) { toggle(true); go('thread', key); },
    openApp(id) { toggle(true); go(id); },
    destroy() { document.removeEventListener('keydown', onKey); if (open) toggle(false); wrap.remove(); toastEl.remove(); document.documentElement.classList.remove('ph-is-open'); },
    show(on) { wrap.hidden = !on; if (!on && open) toggle(false); },
  };
}
