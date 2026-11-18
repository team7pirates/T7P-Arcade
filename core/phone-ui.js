// The phone (v0.17.0 in Forbidden Fusion, shared with Dynasty in v0.18.0).
// A phone that slides up over the mode: Messages, Matchup (dating), and per
// mode Buzz, AGN Wire, Deals. Open it with the "Open phone" button or a key
// (P by default; change it in the phone's Settings). Close it with the ✕,
// the home bar, Escape or the key again.

import { h, fill, avatar } from './ui.js';
import { characters } from './characters.js';
import { sfx } from './sfx.js';
import { markRead } from './phone-core.js';
import * as D from './phone-dating.js';

const ALL_APPS = {
  messages: ['Messages', '💬'], dating: ['Matchup', '💘'], buzz: ['Buzz', '🐦'], news: ['AGN Wire', '📰'], deals: ['Deals', '💼'], settings: ['Settings', '⚙️'],
};
const TONES = {
  hostile: '🔥 HOSTILE', humble: '🤝 HUMBLE', accept: '✅ ACCEPT', decline: '✋ PASS', flirt: '💘 FLIRT', funny: '😂 FUNNY', date: '📅 ASK OUT',
  hype: '📣 HYPE', focus: '🧠 FOCUS', loose: '⚡ LET LOOSE', gloat: '😤 GLOAT', respect: '🤝 RESPECT', later: '💜 SWEET',
};
const fmtN = (n) => (n >= 10000 ? `${(n / 1000).toFixed(1)}k` : Math.round(n).toLocaleString());
const keyLabel = (k) => (k === ' ' ? 'Space' : k.length === 1 ? k.toUpperCase() : k);

// opts: {
//   getPhone() -> phone|null, save(), getKey(), setKey(k),
//   onReply(key, optionId) -> string|null   (mode replies; Matchup threads are handled here)
//   apps: ['messages', 'dating', ...], widgets(ph) -> [[value, label]], empty(ph) -> string,
//   dateCtx() -> { rand, turn, where, when, perk, turnLabel } | null (null: no dates right now),
//   onDate(person), shortcutWhere: 'Forbidden Fusion'
// }
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

export function createPhone(opts) {
  const APPS = (opts.apps || ['messages', 'dating', 'settings']).map((id) => [id, ...ALL_APPS[id]]);
  let open = false; let app = 'home'; let threadKey = null; let capturing = false;
  const screen = h('div', { class: 'ph-screen' });
  const badge = h('span', { class: 'ph-badge', hidden: true });
  let dragged = false;
  const btn = h('button', { class: 'ph-open', 'aria-label': 'Open phone', onClick: () => { if (dragged) { dragged = false; return; } toggle(); } }, h('span', { 'aria-hidden': 'true' }, '📱'), h('span', { class: 'ph-open-text' }, 'Open phone'), badge);
  makeDraggable(btn, () => { dragged = true; });
  const toastEl = h('div', { class: 'ph-toast', role: 'status', 'aria-live': 'polite' });
  const frame = h('div', { class: 'ph-frame', role: 'dialog', 'aria-modal': 'false', 'aria-label': 'Phone', hidden: true },
    h('div', { class: 'ph-notch' }), screen,
    h('button', { class: 'ph-home', 'aria-label': 'Home (tap again to close)', onClick: () => (app === 'home' ? toggle(false) : go('home')) }));
  const wrap = h('div', { class: 'ph-root' }, frame, btn, toastEl);

  const time = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const top = (title, back) => h('div', { class: 'ph-top' },
    back ? h('button', { class: 'ph-back', 'aria-label': 'Back', onClick: back }, '‹') : h('span', { class: 'ph-time' }, time()),
    h('p', { class: 'ph-title' }, title),
    h('button', { class: 'ph-x', 'aria-label': 'Close phone', onClick: () => toggle(false) }, '✕'));
  const face = (t, size = 'sm') => {
    if (t.cid != null) { const c = characters.get(t.cid); if (c) return avatar(c, characters, size); }
    const icon = t.icon || { trainer: '🥋', sponsor: '💼', fan: '💜', hater: '😈', gm: '📞', team: '👥', coach: '🧢', date: '💘' }[t.kind] || '👤';
    return h('span', { class: `ph-ava ph-ava-${size}` }, icon);
  };

  function go(a, key = null) { app = a; threadKey = key; draw(); }

  function home(ph) {
    const ws = opts.widgets ? opts.widgets(ph) : [];
    fill(screen,
      h('div', { class: 'ph-lock' },
        h('button', { class: 'ph-x ph-x-home', 'aria-label': 'Close phone', onClick: () => toggle(false) }, '✕'),
        h('p', { class: 'ph-date' }, new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })),
        h('p', { class: 'ph-clock' }, time()),
        ws.length ? h('div', { class: 'ph-widgets' }, ws.map(([v, k]) => h('div', {}, h('p', { class: 'ph-wv' }, String(v)), h('p', { class: 'ph-wk' }, k)))) : null,
        ph && ph.notes.length ? h('ul', { class: 'ph-notes' }, ph.notes.slice(0, 4).map((n) => h('li', {}, h('button', { class: 'ph-note', onClick: () => (n.app === 'msg' ? go('thread', n.key) : ALL_APPS[n.app] ? go(n.app) : go('messages')) },
          h('span', { class: 'ph-note-app' }, n.app === 'msg' ? 'MESSAGES' : n.app === 'news' ? 'AGN WIRE' : n.app === 'dating' ? 'MATCHUP' : n.app.toUpperCase()), h('span', { class: 'ph-note-title' }, n.title), h('span', { class: 'ph-note-text' }, n.text))))) : h('p', { class: 'ph-empty' }, opts.empty ? opts.empty(ph) : 'Nothing new.')),
      h('div', { class: 'ph-dock' }, APPS.map(([id, label, icon]) => {
        const n = id === 'messages' ? ph?.unread || 0 : id === 'deals' ? (ph?.deals || []).filter((d) => d.status === 'offer').length : id === 'dating' && ph && D.nextProfile(ph) && !(ph.dating?.matches.length) ? 1 : 0;
        return h('button', { class: 'ph-app', onClick: () => go(id) }, h('span', { class: `ph-app-icon is-${id}` }, icon, n ? h('span', { class: 'ph-dot' }, String(n)) : null), h('span', { class: 'ph-app-label' }, label));
      })));
  }

  function messages(ph) {
    const list = ph?.threads || [];
    fill(screen, top('Messages', () => go('home')),
      list.length ? h('ul', { class: 'ph-list' }, list.map((t) => { const last = t.msgs[t.msgs.length - 1]; return h('li', {}, h('button', { class: `ph-row${t.unread ? ' is-unread' : ''}`, onClick: () => go('thread', t.key) },
        face(t), h('span', { class: 'ph-row-text' }, h('span', { class: 'ph-row-name' }, t.name, t.kind === 'boss' ? h('span', { class: 'ph-tag is-boss' }, 'BOSS') : t.kind === 'rival' ? h('span', { class: 'ph-tag' }, 'RIVAL') : null), h('span', { class: 'ph-row-last' }, last ? last.text : '')),
        t.pending ? h('span', { class: 'ph-reply-dot' }, 'REPLY') : t.unread ? h('span', { class: 'ph-dot' }, String(t.unread)) : null)); }))
        : h('p', { class: 'ph-empty' }, 'No messages yet.'));
  }

  function threadView(ph) {
    const t = ph?.threads.find((x) => x.key === threadKey);
    if (!t) { go('messages'); return; }
    if (t.unread) { markRead(ph, t.key); opts.save?.(); }
    refreshBadge();
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
    fill(screen, h('div', { class: 'ph-top ph-top-thread' },
      h('button', { class: 'ph-back', 'aria-label': 'Back', onClick: () => go('messages') }, '‹'),
      h('div', { class: 'ph-thread-who' }, face(t), h('p', { class: 'ph-title' }, t.name)),
      h('button', { class: 'ph-x', 'aria-label': 'Close phone', onClick: () => toggle(false) }, '✕')), msgs, opt);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function buzz(ph) {
    const feed = ph?.feed || [];
    fill(screen, top('Buzz', () => go('home')),
      h('p', { class: 'ph-sub' }, `${fmtN(ph?.followers || 0)} followers · every 2,500 is +1 Aura in the Tower (max +10)`),
      feed.length ? h('ul', { class: 'ph-feed' }, feed.map((p) => h('li', {}, h('p', { class: 'ph-feed-who' }, p.who, h('span', { class: 'ph-muted' }, ` · floor ${p.floor}`)), h('p', { class: 'ph-feed-text' }, p.text), h('p', { class: 'ph-muted' }, `♥ ${fmtN(p.likes)}`))))
        : h('p', { class: 'ph-empty' }, 'Nobody is talking about you yet.'));
  }

  function news(ph) {
    const list = ph?.news || [];
    fill(screen, top('AGN Wire', () => go('home')),
      list.length ? h('ul', { class: 'ph-news' }, list.map((n, i) => h('li', { class: i === 0 ? 'is-lead' : '' }, h('p', { class: 'ph-news-src' }, `AGN · FLOOR ${n.floor}`), h('p', { class: 'ph-news-title' }, n.title), h('p', { class: 'ph-news-text' }, n.text))))
        : h('p', { class: 'ph-empty' }, 'No headlines yet.'));
  }

  function deals(ph) {
    const list = ph?.deals || [];
    const label = { offer: 'OFFER · reply in Messages', active: 'ACTIVE', done: 'PAID', declined: 'DECLINED', lost: 'EXPIRED' };
    fill(screen, top('Deals', () => go('home')),
      list.length ? h('ul', { class: 'ph-deals' }, list.map((d) => h('li', { class: `is-${d.status}` },
        h('p', { class: 'ph-deal-brand' }, d.brand, h('span', { class: 'ph-deal-status' }, label[d.status] || d.status)),
        h('p', { class: 'ph-feed-text' }, d.label), h('p', { class: 'ph-muted' }, `Pays ${d.pay} Bounty + ${fmtN(d.followers)} followers${d.task === 'clear3' && d.status === 'active' ? ` · ${d.progress}/3` : ''}`),
        d.status === 'offer' ? h('button', { class: 'ph-mini', onClick: () => go('thread', `deal-${d.id}`) }, 'Reply') : null)))
        : h('p', { class: 'ph-empty' }, 'Sponsors reach out as you climb.'));
  }

  function datingApp(ph) {
    if (!ph) { fill(screen, top('Matchup', () => go('home')), h('p', { class: 'ph-empty' }, opts.empty ? opts.empty(null) : 'Nothing here yet.')); return; }
    const d = D.dating(ph); const p = D.nextProfile(ph); const ctx = opts.dateCtx?.();
    const doSwipe = (like) => {
      if (!ctx) { flash('Matchup is closed right now.'); return; }
      const res = D.swipe(ph, p.id, like, ctx);
      sfx.play(res.matched ? 'win' : like ? 'tap' : 'flip');
      opts.save?.(); draw(); if (res.line) flash(res.line);
    };
    fill(screen, top('Matchup', () => go('home')),
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

  function settings() {
    const k = opts.getKey();
    fill(screen, top('Settings', () => go('home')),
      h('div', { class: 'ph-set' },
        h('p', { class: 'ph-set-h' }, 'PHONE SHORTCUT'),
        h('p', { class: 'ph-muted' }, `Press this key anywhere in ${opts.shortcutWhere || 'this mode'} to bring the phone up or put it away.`),
        h('button', { class: `ph-key${capturing ? ' is-capturing' : ''}`, onClick: () => { capturing = true; draw(); } }, capturing ? 'Press any key…' : keyLabel(k)),
        h('button', { class: 'ph-mini', onClick: () => { opts.setKey('p'); capturing = false; draw(); } }, 'Reset to P')));
  }

  function draw() {
    const ph = opts.getPhone();
    ({ home: () => home(ph), messages: () => messages(ph), thread: () => threadView(ph), buzz: () => buzz(ph), news: () => news(ph), deals: () => deals(ph), dating: () => datingApp(ph), settings }[app] || (() => home(ph)))();
    refreshBadge();
  }
  function refreshBadge() {
    const ph = opts.getPhone();
    const n = (ph?.unread || 0);
    badge.hidden = !n; badge.textContent = String(n);
    btn.classList.toggle('has-news', !!n);
  }
  function toggle(force) {
    open = force ?? !open;
    frame.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.querySelector('.ph-open-text').textContent = open ? 'Close phone' : 'Open phone';
    if (open) { sfx.play('flip'); draw(); }
  }
  let toastTimer = null; let lastPinged = null;
  function flash(text) { toastEl.textContent = text; toastEl.classList.add('is-on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), 3200); }

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
  refreshBadge();

  return {
    toggle, refresh: () => { if (open) draw(); else refreshBadge(); }, flash,
    // A new message arrived: pop a banner and buzz.
    ping() {
      const ph = opts.getPhone(); const n = ph?.notes[0];
      refreshBadge();
      if (n && n.id !== lastPinged) { lastPinged = n.id; sfx.play('correct'); flash(`📱 ${n.title}: ${n.text}`); }
      if (open) draw();
    },
    openThread(key) { toggle(true); go('thread', key); },
    destroy() { document.removeEventListener('keydown', onKey); wrap.remove(); },
    show(on) { wrap.hidden = !on; if (!on && open) toggle(false); },
  };
}
