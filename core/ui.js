// Small UI helpers shared by every screen: build elements, open a bottom
// sheet, show a toast. Text always goes in as text (never as HTML), so a
// codename or character name can't break the page.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'style' && typeof value === 'object') {
      for (const [prop, v] of Object.entries(value)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, String(v));
        else el.style[prop] = v;
      }
    }
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
  append(el, children);
  return el;
}

// Replace an element's contents, skipping empty (null/false) children.
export function fill(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

// An inline SVG icon from a small set, drawn with currentColor.
const ICONS = {
  back: 'M15 18l-6-6 6-6',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12l5 5 9-11',
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  info: 'M12 22a10 10 0 100-20 10 10 0 000 20zM12 16v-4M12 8h.01',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  search: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z',
};

export function icon(name, size = 20) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', ICONS[name] || '');
  svg.append(path);
  return svg;
}

// A character's picture: the portrait when there is one, otherwise initials
// on the franchise color.
export function avatar(c, chars, size = 'md') {
  const url = chars.portraitUrl(c);
  const el = h('span', { class: `avatar avatar-${size} fr-${c.franchise}`, 'aria-hidden': 'true' });
  if (url) {
    const img = h('img', { src: url, alt: '', loading: 'lazy', decoding: 'async' });
    img.addEventListener('error', () => { img.remove(); el.textContent = chars.initials(c); });
    el.append(img);
  } else {
    el.textContent = chars.initials(c);
  }
  return el;
}

// Bottom sheet (a panel that slides up). Returns { close, body }.
let openSheet = null;

export function sheet({ title, content, onClose, wide = false, center = false }) {
  if (openSheet) openSheet.close();
  const root = document.getElementById('sheet-root');
  const previousFocus = document.activeElement;

  const closeBtn = h('button', { class: 'icon-btn', 'aria-label': 'Close' }, icon('close'));
  const body = h('div', { class: 'sheet-body' });
  const panel = h('div', { class: `sheet${wide ? ' sheet-wide' : ''}${center ? ' sheet-center' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'sheet-head' }, h('h2', { class: 'sheet-title' }, title), closeBtn),
    body,
  );
  const scrim = h('div', { class: `scrim${center ? ' scrim-center' : ''}` }, panel);
  append(body, [content]);

  function close() {
    if (!scrim.isConnected) return;
    document.removeEventListener('keydown', onKey);
    scrim.classList.add('closing');
    const done = () => { scrim.remove(); };
    if (document.documentElement.classList.contains('reduce-motion')) done();
    else setTimeout(done, 180);
    openSheet = null;
    if (previousFocus && previousFocus.focus) previousFocus.focus();
    if (onClose) onClose();
  }
  function onKey(e) { if (e.key === 'Escape') close(); }

  closeBtn.addEventListener('click', close);
  scrim.addEventListener('click', (e) => { if (e.target === scrim) close(); });
  document.addEventListener('keydown', onKey);
  root.append(scrim);
  requestAnimationFrame(() => {
    const first = panel.querySelector('[data-autofocus], input, button:not(.icon-btn), [tabindex="0"]') || closeBtn;
    first.focus({ preventScroll: true });
  });

  openSheet = { close, body };
  return openSheet;
}

export function closeSheet() { if (openSheet) openSheet.close(); }

// Toast: a short message at the bottom. Optional action button.
export function toast(message, { action, onAction, duration = 3500 } = {}) {
  const root = document.getElementById('toast-root');
  root.replaceChildren();
  const el = h('div', { class: 'toast' }, h('span', {}, message));
  if (action) {
    el.append(h('button', { class: 'toast-action', onClick: () => { el.remove(); onAction(); } }, action));
    duration = Math.max(duration, 10000);
  }
  root.append(el);
  setTimeout(() => el.remove(), duration);
}

// Confirm inside a sheet; resolves true or false.
export function confirmSheet({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const finish = (v) => { if (answered) return; answered = true; s.close(); resolve(v); };
    const s = sheet({
      title,
      onClose: () => finish(false),
      content: h('div', {},
        h('p', { class: 'body-text' }, message),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn btn-secondary', onClick: () => finish(false) }, 'Cancel'),
          h('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, onClick: () => finish(true) }, confirmLabel),
        ),
      ),
    });
  });
}
