// v0.42.0: the Original faces grid (40 made-for-the-game faces) used by the
// create screens in My Career and Forbidden Fusion. Scroll, tap one.
import { h } from './ui.js';
import { characters } from './characters.js';

export function originalsGrid(selectedId, onPick) {
  return h('div', { class: 'face-grid', role: 'listbox', 'aria-label': 'Original faces' },
    characters.originals.map((c) => h('button', {
      class: `face-tile${c.id === selectedId ? ' is-chosen' : ''}`, role: 'option', 'aria-selected': String(c.id === selectedId), 'aria-label': `Face ${c.id - 9000}`,
      onClick: () => onPick(c),
    }, h('img', { src: characters.portraitUrl(c), alt: '', loading: 'lazy', decoding: 'async' }))));
}
// Two tabs: Original faces (default) and Characters (search). `searchPane` is
// the existing character search, built by the caller.
export function faceTabs(gridPane, searchPane, start = 'original') {
  let tab = start;
  const bar = h('div', { class: 'face-tabs', role: 'tablist' });
  const body = h('div', {});
  const draw = () => {
    bar.replaceChildren(...[['original', 'Original faces'], ['chars', 'Characters']].map(([k, l]) => h('button', { class: `face-tab${tab === k ? ' is-on' : ''}`, role: 'tab', 'aria-selected': String(tab === k), onClick: () => { tab = k; draw(); } }, l)));
    body.replaceChildren(tab === 'original' ? gridPane : searchPane);
    if (tab === 'chars') searchPane.querySelector('input')?.focus();
  };
  draw();
  return h('div', { class: 'face-picker' }, bar, body);
}
