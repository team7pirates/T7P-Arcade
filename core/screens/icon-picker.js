// Pick Your Icon: set a codename and choose any character as your icon.

import { h, icon, avatar, sheet, toast } from '../ui.js';
import { characters } from '../characters.js';
import { profile, cleanCodename, CODENAME_MAX } from '../profile.js';
import { refresh } from '../router.js';

export function openIconPicker() {
  const codename = h('input', {
    class: 'input', id: 'codename', type: 'text', maxlength: CODENAME_MAX,
    autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false',
    placeholder: 'ENTER CODENAME', value: profile.value.codename,
  });
  const saveName = async () => {
    const clean = cleanCodename(codename.value);
    codename.value = clean;
    if (clean !== profile.value.codename) {
      await profile.update({ codename: clean });
      refresh();
    }
  };
  codename.addEventListener('change', saveName);
  codename.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); codename.blur(); } });

  const search = h('input', {
    class: 'input', type: 'search', autocomplete: 'off', spellcheck: 'false',
    placeholder: 'Search a hero or villain', 'aria-label': 'Search characters',
  });
  const results = h('ul', { class: 'pick-list', role: 'listbox', 'aria-label': 'Characters' });
  const count = h('p', { class: 'caption muted', 'aria-live': 'polite' });

  const draw = () => {
    const list = characters.search(search.value, 60);
    const chosen = profile.value.iconId;
    results.replaceChildren(...list.map((c) => h('li', {},
      h('button', {
        class: `pick-row${c.id === chosen ? ' is-chosen' : ''}`,
        role: 'option', 'aria-selected': c.id === chosen ? 'true' : 'false',
        onClick: () => choose(c),
      },
        avatar(c, characters, 'sm'),
        h('span', { class: 'pick-text' },
          h('span', { class: 'pick-name' }, c.name, c.label ? h('span', { class: 'pick-label' }, ` · ${c.label}`) : null),
          h('span', { class: 'pick-series' }, c.series),
        ),
        c.id === chosen ? h('span', { class: 'pick-check' }, icon('check', 18)) : null,
      ),
    )));
    count.textContent = list.length ? '' : 'No characters match that search.';
  };
  search.addEventListener('input', draw);

  const s = sheet({
    title: 'PICK YOUR ICON',
    wide: true,
    onClose: saveName,
    content: h('div', { class: 'picker' },
      h('label', { class: 'field-label', for: 'codename' }, 'Your codename'),
      codename,
      h('div', { class: 'search-wrap' }, icon('search', 18), search),
      count,
      results,
    ),
  });

  async function choose(c) {
    await saveName();
    await profile.update({ iconId: c.id });
    s.close();
    refresh();
    toast(`${c.name} is your icon.`);
  }

  draw();
}
