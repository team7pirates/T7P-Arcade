// The playtest questionnaire screen (v0.26.0). Answers save as you go, so you
// can leave and come back. Your time played, screen and app version are added
// for you when you send it.

import { h, fill } from '../ui.js';
import { pageHeader } from './settings.js';
import { go } from '../router.js';
import { sfx } from '../sfx.js';
import { playtime, fmtTime } from '../playtime.js';
import { SECTIONS, RATED, loadDraft, saveDraft, submit } from '../feedback.js';

export async function renderFeedback() {
  const a = await loadDraft();
  if (!a.modes) a.modes = {};
  const root = h('section', { class: 'screen page fb' });
  let saveTimer = null;
  const changed = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => saveDraft(a), 400); };
  const pt = playtime.value;

  const scale = (val, set, low, high) => {
    const row = h('div', { class: 'fb-scale', role: 'radiogroup' });
    const draw = () => fill(row, [1, 2, 3, 4, 5].map((n) => h('button', { type: 'button', class: `fb-n${val() === n ? ' is-on' : ''}`, role: 'radio', 'aria-checked': String(val() === n), onClick: () => { set(val() === n ? null : n); sfx.play('tap'); draw(); changed(); } }, String(n))));
    draw();
    return h('div', { class: 'fb-scale-wrap' }, row, low ? h('p', { class: 'fb-ends caption muted' }, h('span', {}, `1 = ${low}`), h('span', {}, `5 = ${high}`)) : null);
  };
  const text = (id, short) => {
    const el = h(short ? 'input' : 'textarea', { class: 'fb-text', rows: short ? null : 3, maxlength: short ? 40 : 1200, 'aria-label': id });
    el.value = a[id] || '';
    el.addEventListener('input', () => { a[id] = el.value; changed(); });
    return el;
  };
  const choice = (q) => {
    const row = h('div', { class: 'fb-chips' });
    const draw = () => fill(row, q.options.map((o) => h('button', { type: 'button', class: `fb-chip${a[q.id] === o ? ' is-on' : ''}`, 'aria-pressed': String(a[q.id] === o), onClick: () => { a[q.id] = o; sfx.play('tap'); draw(); changed(); } }, o)));
    draw();
    return row;
  };
  const pickMode = (q) => {
    const sel = h('select', { class: 'fb-select', 'aria-label': q.q }, h('option', { value: '' }, 'Pick one'), RATED.map(([id, name]) => h('option', { value: id }, name)));
    sel.value = a[q.id] || '';
    sel.addEventListener('change', () => { a[q.id] = sel.value; changed(); });
    return sel;
  };
  const modesTable = () => h('ul', { class: 'fb-modes' }, RATED.map(([id, name]) => {
    const r = (a.modes[id] ||= {});
    const secs = id === 'phone' ? null : pt.modes[id] || 0;
    const word = h('input', { class: 'fb-text fb-word', maxlength: 30, placeholder: 'One word', 'aria-label': `One word for ${name}` });
    word.value = r.word || '';
    word.addEventListener('input', () => { r.word = word.value; changed(); });
    return h('li', { class: `fb-mode${secs === 0 ? ' is-unplayed' : ''}` },
      h('p', { class: 'fb-mode-name' }, name, secs != null ? h('span', { class: 'caption muted' }, secs ? ` · ${fmtTime(secs)}` : ' · not played yet') : null),
      scale(() => r.fun, (v) => { r.fun = v; }), word);
  }));

  let qn = 0;
  const body = SECTIONS.map((sec) => h('section', { class: 'set-group panel fb-sec' },
    h('h2', { class: 'label-spaced set-title' }, sec.title.toUpperCase()),
    sec.qs.map((q) => {
      qn += 1;
      const input = q.kind === 'scale' ? scale(() => a[q.id], (v) => { a[q.id] = v; }, q.low, q.high)
        : q.kind === 'choice' ? choice(q) : q.kind === 'pick' ? pickMode(q) : q.kind === 'modes' ? modesTable() : text(q.id, q.short);
      return h('div', { class: 'fb-q' }, h('p', { class: 'fb-qtext' }, h('span', { class: 'fb-qn' }, `${qn}.`), ' ', q.q), input);
    })));

  const sendBtn = h('button', { class: 'btn btn-primary btn-wide', onClick: async () => {
    sendBtn.disabled = true; sendBtn.textContent = 'Sending…';
    clearTimeout(saveTimer);
    const res = await submit(a);
    sfx.play('fanfare');
    thanks(res);
  } }, 'Send my answers');

  function thanks(res) {
    fill(root, pageHeader('THANK YOU'),
      h('section', { class: 'set-group panel fb-done' },
        h('p', { class: 'fb-done-big' }, '🙏'),
        h('h2', { class: 'heading' }, res === 'sent' ? 'Sent. Thank you!' : 'Saved. It sends itself.'),
        h('p', { class: 'body-text muted' }, res === 'sent'
          ? 'Your answers went straight to the developer. Every one gets read.'
          : 'You\'re offline right now, so your answers are saved on this device. They send automatically the next time you open the app with internet.'),
        h('button', { class: 'btn btn-primary', onClick: () => go('menu') }, 'Back to the arcade')));
    window.scrollTo(0, 0);
  }

  fill(root, pageHeader('PLAYTEST QUESTIONNAIRE'),
    h('section', { class: 'set-group panel fb-intro' },
      h('p', { class: 'body-text' }, 'Thanks for playtesting T7P Arcade! This takes about 5 minutes. Be honest: "this part was boring" helps more than "it was good." Skip anything you want.'),
      h('p', { class: 'caption muted' }, `Added for you when you send: your time played (${fmtTime(pt.total)} so far, counted only while you're actively playing), your screen size and the app version. Your answers save as you go, so you can leave and come back.`)),
    body,
    h('div', { class: 'fb-send' }, sendBtn));
  root._cleanup = () => { clearTimeout(saveTimer); saveDraft(a); };
  return root;
}

