// The grid board both Grids and Gauntlet draw: category headers, squares,
// and the guess sheet that opens when a square is tapped.

import { h, icon, avatar, sheet } from './ui.js';
import { characters } from './characters.js';
import { categoryById, cellPoints } from './grid.js';
import { sfx } from './sfx.js';

// state.cells[r][c] is null (open) or { kind: 'hit' | 'burn' | 'intel', id }
export function emptyCells(size) {
  return Array.from({ length: size }, () => Array(size).fill(null));
}

export function usedIds(state) {
  return new Set(state.cells.flat().filter((x) => x && x.id).map((x) => x.id));
}

export function filledCount(state) {
  return state.cells.flat().filter(Boolean).length;
}

// Draw the board. onCell(r, c) is called when an open square is tapped;
// when the game is over (opts.reveal), tapping any square shows its answers.
export function renderBoard(grid, state, { onCell, reveal = false, flash = null } = {}) {
  const size = grid.size;
  const board = h('div', { class: `grid-board size-${size}`, style: { '--n': size }, role: 'grid', 'aria-label': `${size} by ${size} grid` });

  board.append(h('div', { class: 'gb-corner', 'aria-hidden': 'true' }));
  grid.cols.forEach((id) => board.append(header(id, 'col')));

  for (let r = 0; r < size; r++) {
    board.append(header(grid.rows[r], 'row'));
    for (let c = 0; c < size; c++) {
      const cell = state.cells[r][c];
      const rowCat = categoryById(grid.rows[r]);
      const colCat = categoryById(grid.cols[c]);
      const label = `${rowCat.label} and ${colCat.label}`;
      let el;
      if (!cell) {
        el = h('button', {
          class: 'gb-cell is-open', role: 'gridcell',
          'aria-label': reveal ? `${label}: show answers` : `${label}: open square`,
          onClick: () => (reveal ? showAnswers(grid, r, c) : onCell(r, c)),
        }, reveal ? h('span', { class: 'gb-missed' }, 'MISSED') : icon('plus', 22));
      } else {
        const ch = characters.get(cell.id);
        el = h('button', {
          class: `gb-cell is-${cell.kind}`, role: 'gridcell',
          'aria-label': `${label}: ${cell.kind === 'burn' ? 'burned' : ch.name}`,
          onClick: () => (reveal ? showAnswers(grid, r, c) : null),
          tabindex: reveal ? null : '-1',
        },
          cell.kind === 'burn'
            ? h('span', { class: 'gb-burn' }, 'BURNED')
            : [avatar(ch, characters, 'cell'), h('span', { class: 'gb-name' }, ch.name)],
          cell.kind === 'intel' ? h('span', { class: 'gb-badge' }, 'INTEL') : null,
        );
      }
      if (flash && flash.r === r && flash.c === c) el.classList.add(`flash-${flash.kind}`);
      board.append(el);
    }
  }
  return board;
}

// Where long words may break in narrow headers (shown as "SWORDS-MAN").
const SOFT = {
  swordsman: 'Swords\u00ADman', marksman: 'Marks\u00ADman', fullmetal: 'Full\u00ADmetal',
  alchemist: 'Alche\u00ADmist', billionaire: 'Billion\u00ADaire', lightning: 'Light\u00ADning',
  mutation: 'Muta\u00ADtion', katekyo: 'Kate\u00ADkyo', leveling: 'Level\u00ADing',
  stormwatch: 'Storm\u00ADwatch', authority: 'Autho\u00ADrity', academia: 'Aca\u00ADdemia',
};
const soften = (label) => label.replace(/\p{L}+/gu, (w) => SOFT[w.toLowerCase()] || w);

function header(id, axis) {
  const cat = categoryById(id);
  return h('button', {
    class: `gb-head gb-${axis} kind-${cat.kind}`,
    onClick: () => showCategory(cat),
    'aria-label': `${cat.label}. What does this mean?`,
  }, h('span', { class: 'gb-head-text' }, soften(cat.label)));
}

function showCategory(cat) {
  const kind = { series: 'SERIES', tag: 'TRAIT', team: 'TEAM' }[cat.kind];
  sheet({
    title: cat.label.toUpperCase(),
    content: h('div', {},
      h('p', { class: 'label-spaced' }, kind),
      h('p', { class: 'body-text' }, cat.info || ''),
      h('p', { class: 'caption muted' }, `${cat.ids.size} characters in the roster fit this.`),
    ),
  });
}

function showAnswers(grid, r, c) {
  const rowCat = categoryById(grid.rows[r]);
  const colCat = categoryById(grid.cols[c]);
  const list = grid.answers[r][c].map((id) => characters.get(id)).sort((a, b) => a.name.localeCompare(b.name));
  sheet({
    title: 'ANSWERS',
    content: h('div', {},
      h('p', { class: 'label-spaced' }, `${rowCat.label} × ${colCat.label}`),
      h('ul', { class: 'pick-list' }, list.map((ch) => h('li', { class: 'pick-row static' },
        avatar(ch, characters, 'sm'),
        h('span', { class: 'pick-text' }, h('span', { class: 'pick-name' }, ch.name), h('span', { class: 'pick-series' }, ch.series)),
      ))),
    ),
  });
}

// The guess sheet for square (r, c).
// onGuess(char) returns { ok, message } (message shown on a miss; the sheet stays open).
// onBurn() burns the square. burnNote describes what burning costs.
export function openGuess(grid, state, r, c, { multiplier = 1, showPoints = true, onGuess, onBurn, burnNote }) {
  const rowCat = categoryById(grid.rows[r]);
  const colCat = categoryById(grid.cols[c]);
  const used = usedIds(state);

  const input = h('input', {
    class: 'input', type: 'search', autocomplete: 'off', autocorrect: 'off', spellcheck: 'false',
    enterkeyhint: 'search', placeholder: 'Type a name', 'aria-label': 'Search characters',
  });
  const list = h('ul', { class: 'pick-list guess-list', role: 'listbox', 'aria-label': 'Characters' });
  const feedback = h('p', { class: 'guess-feedback', role: 'alert' });

  const draw = () => {
    const q = input.value.trim();
    if (!q) { list.replaceChildren(h('li', { class: 'caption muted guess-hint' }, 'Start typing a name. Search also finds other names, like Pain for Nagato.')); return; }
    const results = characters.search(q, 30);
    if (!results.length) { list.replaceChildren(h('li', { class: 'caption muted guess-hint' }, 'No character by that name.')); return; }
    list.replaceChildren(...results.map((ch) => {
      const isUsed = used.has(ch.id);
      return h('li', {},
        h('button', {
          class: 'pick-row', role: 'option', disabled: isUsed,
          onClick: () => guess(ch),
        },
          avatar(ch, characters, 'sm'),
          h('span', { class: 'pick-text' },
            h('span', { class: 'pick-name' }, ch.name, ch.label ? h('span', { class: 'pick-label' }, ` · ${ch.label}`) : null),
            h('span', { class: 'pick-series' }, isUsed ? 'Already on this grid' : ch.series),
          ),
        ),
      );
    }));
  };

  let busy = false;
  const guess = (ch) => {
    if (busy) return;
    const result = onGuess(ch);
    if (result.ok) { sfx.play('correct'); busy = true; s.close(); return; }
    sfx.play('wrong');
    feedback.textContent = result.message;
    feedback.classList.remove('shake');
    void feedback.offsetWidth;
    feedback.classList.add('shake');
    input.value = '';
    draw();
    input.focus();
  };

  input.addEventListener('input', draw);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const first = list.querySelector('button.pick-row:not([disabled])');
      if (first) first.click();
    }
  });

  const pts = cellPoints(grid.answers[r][c].length) * multiplier;
  const s = sheet({
    title: 'MAKE YOUR PICK',
    wide: true,
    content: h('div', { class: 'guess' },
      h('div', { class: 'guess-cats' },
        h('span', { class: `guess-cat kind-${rowCat.kind}` }, rowCat.label),
        h('span', { class: 'guess-x', 'aria-hidden': 'true' }, '×'),
        h('span', { class: `guess-cat kind-${colCat.kind}` }, colCat.label),
      ),
      showPoints ? h('p', { class: 'caption muted' }, `This square is worth ${pts} points.`) : null,
      h('div', { class: 'search-wrap' }, icon('search', 18), input),
      feedback,
      list,
      onBurn ? h('div', { class: 'guess-burn' },
        h('button', { class: 'btn btn-danger', onClick: () => { busy = true; s.close(); onBurn(); } }, 'Burn this square'),
        h('p', { class: 'caption muted' }, burnNote),
      ) : null,
    ),
  });
  draw();
  return s;
}

// Emoji summary for sharing: 🟪 correct, 🟨 intel, 🔥 burned, ⬛ missed.
export function emojiGrid(state) {
  return state.cells.map((row) => row.map((x) => {
    if (!x) return '⬛';
    if (x.kind === 'burn') return '🔥';
    if (x.kind === 'intel') return '🟨';
    return '🟪';
  }).join('')).join('\n');
}

export async function shareText(text) {
  try {
    if (navigator.share) { await navigator.share({ text }); return 'shared'; }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancelled';
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
