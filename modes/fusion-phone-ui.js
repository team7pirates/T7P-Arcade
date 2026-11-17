// FORBIDDEN FUSION: the phone's screens (v0.17.0). A phone that slides up over
// the Tower: Messages, Buzz (the feed), AGN Wire (news), Deals and Settings.
// Open it with the "Open phone" button or a key (P by default; change it in
// the phone's Settings).

import { h, fill } from '../core/ui.js';
import { avatar } from '../core/ui.js';
import { characters } from '../core/characters.js';
import { sfx } from '../core/sfx.js';
import { followerAura, markRead } from './fusion-phone.js';

const APPS = [
  ['messages', 'Messages', '💬'], ['buzz', 'Buzz', '🐦'], ['news', 'AGN Wire', '📰'], ['deals', 'Deals', '💼'], ['settings', 'Settings', '⚙️'],
];
const fmtN = (n) => (n >= 10000 ? `${(n / 1000).toFixed(1)}k` : Math.round(n).toLocaleString());
const keyLabel = (k) => (k === ' ' ? 'Space' : k.length === 1 ? k.toUpperCase() : k);

// opts: { getPhone() -> phone|null, getRun() -> run|null, onReply(key, optionId) -> string|null, getKey(), setKey(k), onFollowers? }
export function createPhone(opts) {
  let open = false; let app = 'home'; let threadKey = null; let capturing = false;
  const screen = h('div', { class: 'ph-screen' });
  const badge = h('span', { class: 'ph-badge', hidden: true });
  const btn = h('button', { class: 'ph-open', 'aria-label': 'Open phone', onClick: () => toggle() }, h('span', { 'aria-hidden': 'true' }, '📱'), h('span', { class: 'ph-open-text' }, 'Open phone'), badge);
  const toastEl = h('div', { class: 'ph-toast', role: 'status', 'aria-live': 'polite' });
  const frame = h('div', { class: 'ph-frame', role: 'dialog', 'aria-modal': 'false', 'aria-label': 'Phone', hidden: true },
    h('div', { class: 'ph-notch' }), screen,
    h('button', { class: 'ph-home', 'aria-label': 'Home', onClick: () => go('home') }));
  const wrap = h('div', { class: 'ph-root' }, frame, btn, toastEl);

  const time = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const top = (title, back) => h('div', { class: 'ph-top' },
    back ? h('button', { class: 'ph-back', 'aria-label': 'Back', onClick: back }, '‹') : h('span', { class: 'ph-time' }, time()),
    h('p', { class: 'ph-title' }, title),
    h('button', { class: 'ph-x', 'aria-label': 'Close phone', onClick: () => toggle(false) }, '✕'));
  const face = (t, size = 'sm') => {
    if (t.cid != null) { const c = characters.get(t.cid); if (c) return avatar(c, characters, size); }
    const icon = { trainer: '🥋', sponsor: '💼', fan: '💜', hater: '😈' }[t.kind] || '👤';
    return h('span', { class: `ph-ava ph-ava-${size}` }, icon);
  };

  function go(a, key = null) { app = a; threadKey = key; draw(); }

  function home(ph) {
    const r = opts.getRun();
    fill(screen,
      h('div', { class: 'ph-lock' },
        h('p', { class: 'ph-date' }, new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })),
        h('p', { class: 'ph-clock' }, time()),
        h('div', { class: 'ph-widgets' },
          h('div', {}, h('p', { class: 'ph-wv' }, r ? `F${r.next?.floor ?? r.floor}` : '—'), h('p', { class: 'ph-wk' }, 'FLOOR')),
          h('div', {}, h('p', { class: 'ph-wv' }, fmtN(ph?.followers || 0)), h('p', { class: 'ph-wk' }, 'FOLLOWERS')),
          h('div', {}, h('p', { class: 'ph-wv' }, `+${followerAura(ph?.followers || 0)}`), h('p', { class: 'ph-wk' }, 'AURA'))),
        ph && ph.notes.length ? h('ul', { class: 'ph-notes' }, ph.notes.slice(0, 4).map((n) => h('li', {}, h('button', { class: 'ph-note', onClick: () => (n.app === 'msg' ? go('thread', n.key) : go(n.app)) },
          h('span', { class: 'ph-note-app' }, n.app === 'msg' ? 'MESSAGES' : n.app === 'news' ? 'AGN WIRE' : n.app.toUpperCase()), h('span', { class: 'ph-note-title' }, n.title), h('span', { class: 'ph-note-text' }, n.text))))) : h('p', { class: 'ph-empty' }, r ? 'Clear a floor and your phone lights up.' : 'Start a climb. People will be watching.')),
      h('div', { class: 'ph-dock' }, APPS.map(([id, label, icon]) => {
        const n = id === 'messages' ? ph?.unread || 0 : id === 'deals' ? (ph?.deals || []).filter((d) => d.status === 'offer').length : 0;
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
    const r = opts.getRun(); if (r) markRead(r, t.key);
    refreshBadge();
    const msgs = h('div', { class: 'ph-msgs' }, t.msgs.map((m) => h('p', { class: `ph-msg is-${m.from}` }, m.text)));
    const opt = t.pending ? h('div', { class: 'ph-opts' }, h('p', { class: 'ph-opts-head' }, 'YOUR REPLY'),
      t.pending.options.map((o) => h('button', { class: `ph-opt is-${o.tone}`, onClick: () => {
        const line = opts.onReply(t.key, o.id);
        sfx.play(o.tone === 'hostile' ? 'special' : 'correct');
        draw();
        if (line) flash(line);
      } }, h('span', { class: 'ph-opt-text' }, o.text), h('span', { class: 'ph-opt-hint' }, `${o.tone === 'hostile' ? '🔥 HOSTILE' : '🤝 HUMBLE'} · ${o.hint}`)))) : null;
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

  function settings() {
    const k = opts.getKey();
    fill(screen, top('Settings', () => go('home')),
      h('div', { class: 'ph-set' },
        h('p', { class: 'ph-set-h' }, 'PHONE SHORTCUT'),
        h('p', { class: 'ph-muted' }, 'Press this key anywhere in Forbidden Fusion to bring the phone up or put it away.'),
        h('button', { class: `ph-key${capturing ? ' is-capturing' : ''}`, onClick: () => { capturing = true; draw(); } }, capturing ? 'Press any key…' : keyLabel(k)),
        h('button', { class: 'ph-mini', onClick: () => { opts.setKey('p'); capturing = false; draw(); } }, 'Reset to P')));
  }

  function draw() {
    const ph = opts.getPhone();
    ({ home: () => home(ph), messages: () => messages(ph), thread: () => threadView(ph), buzz: () => buzz(ph), news: () => news(ph), deals: () => deals(ph), settings }[app] || (() => home(ph)))();
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
  let toastTimer = null;
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
      if (n) { sfx.play('correct'); flash(`📱 ${n.title}: ${n.text}`); }
      if (open) draw();
    },
    openThread(key) { toggle(true); go('thread', key); },
    destroy() { document.removeEventListener('keydown', onKey); wrap.remove(); },
  };
}
