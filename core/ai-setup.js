// The "AI texting" setup (v0.27.0), used in the arcade's Settings and in the
// phone's Settings: pick a service, follow its steps, paste a key, test it.

import { h, fill } from './ui.js';
import { ai, PROVIDERS, provider, DAILY_LIMIT } from './ai.js';
import { sfx } from './sfx.js';

export function aiSetup({ compact = false, onChange } = {}) {
  const root = h('div', { class: `ai-setup${compact ? ' is-compact' : ''}` });
  let status = ai.config.ok ? { ok: true, text: 'Working. Characters will answer what you type.' } : null;
  let busy = false; let show = false;

  function draw() {
    const c = ai.config; const p = provider(c.provider);
    const keyIn = h('input', { class: 'ai-input', type: show ? 'text' : 'password', placeholder: 'Paste your key here', autocomplete: 'off', spellcheck: 'false', 'aria-label': `${p.name} key` });
    keyIn.value = c.key || '';
    const modelIn = h('input', { class: 'ai-input', placeholder: p.kind === 'gemini' ? 'Picked for you (optional)' : (p.model || 'Model name'), 'aria-label': 'Model (optional)' });
    modelIn.value = c.model || '';
    const baseIn = p.id === 'custom' ? h('input', { class: 'ai-input', placeholder: 'https://…/v1', 'aria-label': 'Base URL' }) : null;
    if (baseIn) baseIn.value = c.base || '';
    const save = async () => {
      if (busy) return;
      ai.set({ key: keyIn.value.trim(), model: modelIn.value.trim(), ...(baseIn ? { base: baseIn.value.trim() } : {}) });
      if (!keyIn.value.trim()) { status = { ok: false, text: 'Paste a key first.' }; draw(); return; }
      busy = true; status = { ok: null, text: 'Testing…' }; draw();
      try { await ai.test(); status = { ok: true, text: 'Working. Characters will answer what you type.' }; sfx.play('correct'); }
      catch (e) { status = { ok: false, text: e.message }; sfx.play('wrong'); }
      busy = false; draw(); onChange?.();
    };
    fill(root,
      h('p', { class: 'caption muted ai-intro' }, 'Type your own replies on the phone and characters text back. Bring a key from one of these services; most are free. Your key is saved only in this browser. It never goes into saves, and it\'s only sent to the service you pick.'),
      h('div', { class: 'ai-providers', role: 'radiogroup', 'aria-label': 'AI service' }, PROVIDERS.map((x) => h('button', {
        class: `ai-prov${x.id === c.provider ? ' is-on' : ''}`, role: 'radio', 'aria-checked': String(x.id === c.provider),
        onClick: () => { if (x.id !== c.provider) { ai.set({ provider: x.id, key: '', model: '', base: '' }); status = null; draw(); onChange?.(); } },
      }, h('b', {}, x.name), x.free !== '—' ? h('span', { class: `ai-badge${x.free === 'Paid' ? ' is-paid' : ''}` }, x.free) : null, x.browser === 'test' ? h('span', { class: 'ai-badge is-test' }, 'Test first') : null))),
      h('div', { class: 'ai-guide' },
        h('ol', { class: 'ai-steps' }, p.steps.map((s) => h('li', {}, s))),
        p.url ? h('a', { class: 'btn btn-secondary btn-sm', href: p.url, target: '_blank', rel: 'noopener' }, `Get a ${p.name} key ↗`) : null,
        h('p', { class: 'caption muted' }, p.note)),
      baseIn ? h('label', { class: 'ai-field' }, h('span', { class: 'caption' }, 'Base URL'), baseIn) : null,
      h('label', { class: 'ai-field' }, h('span', { class: 'caption' }, 'Key'), h('span', { class: 'ai-keyrow' }, keyIn,
        h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onClick: () => { show = !show; keyIn.type = show ? 'text' : 'password'; } }, show ? 'Hide' : 'Show'))),
      h('label', { class: 'ai-field' }, h('span', { class: 'caption' }, 'Model (optional)'), modelIn),
      h('div', { class: 'ai-actions' },
        h('button', { class: 'btn btn-primary btn-sm', disabled: busy, onClick: save }, busy ? 'Testing…' : 'Save and test'),
        c.key ? h('button', { class: 'btn btn-secondary btn-sm', onClick: () => { ai.forget(); status = null; draw(); onChange?.(); } }, 'Remove key') : null),
      status ? h('p', { class: `ai-status${status.ok ? ' is-ok' : status.ok === false ? ' is-bad' : ''}`, role: 'status' }, status.ok ? '✓ ' : status.ok === false ? '✕ ' : '', status.text) : null,
      c.key ? h('label', { class: 'ai-on' }, (() => { const i = h('input', { type: 'checkbox', checked: c.on }); i.addEventListener('change', () => { ai.set({ on: i.checked }); onChange?.(); }); return i; })(), h('span', {}, ' Use AI replies')) : null,
      c.key ? h('p', { class: 'caption muted' }, `AI messages today: ${ai.usedToday()} / ${DAILY_LIMIT}. Free plans have their own limits too. If one runs out, the reply buttons still work.`) : null);
  }
  draw();
  return root;
}
