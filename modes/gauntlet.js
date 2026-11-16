// THE GAUNTLET — Survival time attack.
// 5:00 on the clock. Grids grow from 2×2 to 5×5. A correct pick adds 2 seconds,
// clearing a board adds (squares × 4) seconds. A strike costs 5 seconds, a burn
// costs 15. After every cleared grid, choose a power-up. The run ends at 0:00.
// Leaving the screen pauses the clock; the run is kept until the app closes.

import { h, fill, toast, closeSheet } from '../core/ui.js';
import { profile } from '../core/profile.js';
import { records } from '../core/records.js';
import { generateGrid } from '../core/grid.js';
import { renderBoard, openGuess, emptyCells, filledCount, shareText } from '../core/grid-board.js';
import { modeHeader, howToPlay, createClock, formatTime } from '../core/mode-kit.js';
import { go } from '../core/router.js';

const START_MS = 5 * 60 * 1000;
const CORRECT_MS = 2000;
const STRIKE_MS = 5000;
const BURN_MS = 15000;
const FREEZE_MS = 15000;

const TIERS = [
  { min: 8, name: 'CIPHER GOD' },
  { min: 6, name: 'PHANTOM' },
  { min: 4, name: 'SHADOW AGENT' },
  { min: 2, name: 'OPERATIVE' },
  { min: 0, name: 'RECRUIT' },
];
export const tierFor = (grids) => TIERS.find((t) => grids >= t.min).name;
const sizeFor = (cleared) => Math.min(5, cleared + 2);

const POWER_UPS = [
  { id: 'skip', name: 'Skip Protocol', text: 'Your next burn costs no time.' },
  { id: 'freeze', name: 'Time Freeze', text: `+${FREEZE_MS / 1000} seconds right now.` },
  { id: 'intel', name: 'Intel Drop', text: 'One square of the next grid is filled for you.' },
];

const help = howToPlay('gauntlet', 'Gauntlet', [
  'You start with 5:00 on the clock. Clear as many grids as you can before it hits 0:00.',
  'Grids grow: 2×2, then 3×3, 4×4, and 5×5 from then on.',
  'A correct pick adds 2 seconds. Clearing a grid adds 4 seconds for every square.',
  'A wrong guess costs 5 seconds. Burning a square costs 15 seconds.',
  'After each cleared grid, choose a power-up: Skip Protocol, Time Freeze or Intel Drop.',
  'Ranks: Recruit, Operative (2 grids), Shadow Agent (4), Phantom (6), Cipher God (8).',
  'Leaving the screen pauses the clock.',
]);

let run = null;        // the run in progress
let lastRun = null;    // the finished run, for the results screen

function newRun() {
  return {
    timeMs: START_MS,
    cleared: 0,
    correct: 0,
    strikes: 0,
    burns: 0,
    skipReady: false,
    intelReady: false,
    phase: 'playing',  // playing | powerup
    grid: null,
    cells: null,
    lastCats: [],
  };
}

function nextGrid(r) {
  const size = sizeFor(r.cleared);
  const grid = generateGrid({ size, difficulty: 'gauntlet', avoid: r.lastCats });
  r.grid = grid;
  r.cells = emptyCells(size);
  r.lastCats = [...grid.rows, ...grid.cols];
  if (r.intelReady) {
    r.intelReady = false;
    // Fill the square with the fewest answers, using its rarest answer.
    let best = null;
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        const a = grid.answers[i][j];
        if (!best || a.length < best.n) best = { i, j, n: a.length };
      }
    }
    const pick = grid.answers[best.i][best.j]
      .map((id) => ({ id, uses: grid.answers.flat().filter((list) => list.includes(id)).length }))
      .sort((x, y) => x.uses - y.uses)[0];
    r.cells[best.i][best.j] = { kind: 'intel', id: pick.id };
  }
}

export async function render() {
  await profile.update({ lastMode: 'gauntlet' });
  const root = h('section', { class: 'screen mode gauntlet' });
  let clock = null;

  const stopClock = () => {
    if (!clock) return;
    if (run) run.timeMs = clock.ms;
    clock.destroy();
    clock = null;
  };
  root._cleanup = () => { stopClock(); closeSheet(); lastRun = null; };

  // ---------- Start screen ----------
  function drawStart() {
    stopClock();
    const rec = records.get('gauntlet');
    fill(root, 
      modeHeader({ title: 'Gauntlet', sub: 'SURVIVAL TIME ATTACK', onHelp: () => help.show() }),
      h('div', { class: 'gauntlet-start panel' },
        h('p', { class: 'stat gold' }, '5:00'),
        h('p', { class: 'body-text' }, 'Clear grid after grid before the clock runs out. Grids grow from 2×2 to 5×5.'),
        h('ul', { class: 'rule-chips' },
          h('li', {}, 'Correct +2s'), h('li', {}, 'Cleared grid + bonus'),
          h('li', { class: 'bad' }, 'Strike −5s'), h('li', { class: 'bad' }, 'Burn −15s'),
        ),
        rec.bestGrids !== undefined
          ? h('p', { class: 'caption muted' }, `Best: ${rec.bestGrids} grids · ${tierFor(rec.bestGrids)}`)
          : h('p', { class: 'caption muted' }, 'No runs yet.'),
        h('button', { class: 'btn btn-primary btn-wide', onClick: () => { run = newRun(); nextGrid(run); drawGame(); } }, 'Start run'),
      ),
    );
  }

  // ---------- Playing ----------
  function drawGame() {
    if (!run) { drawStart(); return; }
    if (run.phase === 'powerup') { drawPowerUp(); return; }
    const { grid } = run;

    const timeEl = h('span', { class: 'stat clock' }, formatTime(run.timeMs));
    const clearedEl = h('span', { class: 'stat' }, String(run.cleared));
    const tierEl = h('span', { class: 'label-spaced gold' }, tierFor(run.cleared));
    const boardWrap = h('div', { class: 'board-wrap' });
    const powerNote = h('p', { class: 'caption gold power-note' }, run.skipReady ? 'Skip Protocol ready: your next burn costs no time.' : '');

    const bump = (kind) => {
      timeEl.classList.remove('bump-up', 'bump-down');
      void timeEl.offsetWidth;
      timeEl.classList.add(kind);
    };
    const drawBoard = (flash) => boardWrap.replaceChildren(renderBoard(grid, run, { onCell, flash }));

    function onCell(r, c) {
      openGuess(grid, run, r, c, {
        showPoints: false,
        burnNote: run.skipReady ? 'Skip Protocol is ready: this burn costs no time.' : `Burning costs ${BURN_MS / 1000} seconds.`,
        onGuess(ch) {
          if (!clock || !clock.running) return { ok: false, message: 'Time is up.' };
          if (grid.answers[r][c].includes(ch.id)) {
            run.cells[r][c] = { kind: 'hit', id: ch.id };
            run.correct += 1;
            clock.add(CORRECT_MS);
            bump('bump-up');
            drawBoard({ r, c, kind: 'hit' });
            checkCleared();
            return { ok: true };
          }
          run.strikes += 1;
          clock.add(-STRIKE_MS);
          bump('bump-down');
          return { ok: false, message: `${ch.name} doesn't fit. −${STRIKE_MS / 1000} seconds.` };
        },
        onBurn() {
          if (!clock || !clock.running) return;
          run.cells[r][c] = { kind: 'burn', id: null };
          run.burns += 1;
          if (run.skipReady) { run.skipReady = false; powerNote.textContent = ''; }
          else { clock.add(-BURN_MS); bump('bump-down'); }
          drawBoard({ r, c, kind: 'burn' });
          checkCleared();
        },
      });
    }

    function checkCleared() {
      if (filledCount(run) < grid.size * grid.size) return;
      run.cleared += 1;
      const bonus = grid.size * grid.size * 4000;
      clock.add(bonus);
      run.timeMs = clock.ms;
      stopClock();
      run.phase = 'powerup';
      run.lastBonus = bonus;
      closeSheet();
      setTimeout(drawPowerUp, 450);
    }

    fill(root, 
      modeHeader({ title: 'Gauntlet', sub: `GRID ${run.cleared + 1} · ${grid.size}×${grid.size}`, onHelp: () => help.show(), onBack: () => go('menu') }),
      h('div', { class: 'hud' },
        h('div', { class: 'hud-item hud-clock' }, h('span', { class: 'label-spaced' }, 'TIME'), timeEl),
        h('div', { class: 'hud-item' }, h('span', { class: 'label-spaced' }, 'CLEARED'), clearedEl),
        h('div', { class: 'hud-item' }, h('span', { class: 'label-spaced' }, 'RANK'), tierEl),
      ),
      powerNote,
      boardWrap,
    );
    drawBoard();

    clock = createClock({
      startMs: run.timeMs,
      countDown: true,
      onTick: (ms) => {
        timeEl.textContent = formatTime(ms);
        timeEl.classList.toggle('is-low', ms <= 30000);
      },
      onZero: () => { closeSheet(); finish(); },
    });
    clock.start();
  }

  // ---------- Power-up between grids ----------
  function drawPowerUp() {
    const choose = (id) => {
      if (id === 'freeze') run.timeMs += FREEZE_MS;
      if (id === 'skip') run.skipReady = true;
      if (id === 'intel') run.intelReady = true;
      run.phase = 'playing';
      nextGrid(run);
      drawGame();
    };
    fill(root, 
      modeHeader({ title: 'Gauntlet', sub: 'CLOCK PAUSED', onHelp: () => help.show(), onBack: () => go('menu') }),
      h('div', { class: 'powerup' },
        h('p', { class: 'label-spaced' }, `GRID ${run.cleared} CLEARED · +${Math.round((run.lastBonus || 0) / 1000)}s`),
        h('h2', { class: 'display-lg gold' }, tierFor(run.cleared)),
        h('p', { class: 'body-text' }, `${formatTime(run.timeMs)} left. Next up: ${sizeFor(run.cleared)}×${sizeFor(run.cleared)}.`),
        h('p', { class: 'label-spaced powerup-pick' }, 'CHOOSE A POWER-UP'),
        h('div', { class: 'powerup-list' }, POWER_UPS.map((p) =>
          h('button', { class: 'powerup-card', onClick: () => choose(p.id) },
            h('span', { class: 'heading' }, p.name),
            h('span', { class: 'caption muted' }, p.text),
          ))),
      ),
    );
  }

  // ---------- Run over ----------
  async function finish() {
    if (!run) return;
    stopClock();
    const r = run;
    run = null;
    let newBest = false;
    await records.update('gauntlet', (g) => {
      g.runs = (g.runs || 0) + 1;
      if (g.bestGrids === undefined) g.bestGrids = r.cleared;
      else if (r.cleared > g.bestGrids) { newBest = true; g.bestGrids = r.cleared; }
      g.bestCorrect = Math.max(g.bestCorrect || 0, r.correct);
      return g;
    });
    lastRun = { ...r, newBest };
    drawResult();
  }

  function drawResult() {
    const r = lastRun;
    if (!r) { drawStart(); return; }
    const tier = tierFor(r.cleared);
    const share = async () => {
      const how = await shareText(`T7P Arcade · Gauntlet\n${tier} · ${r.cleared} grid${r.cleared === 1 ? '' : 's'} cleared\n${r.correct} correct · ${r.strikes} strikes · ${r.burns} burns`);
      if (how === 'copied') toast('Result copied. Paste it anywhere.');
      else if (how === 'failed') toast('Sharing is not available here.');
    };
    fill(root, 
      modeHeader({ title: 'Gauntlet', sub: 'RUN OVER', onHelp: () => help.show(), onBack: () => go('menu') }),
      h('div', { class: 'result-head' },
        h('p', { class: 'label-spaced' }, 'TIME UP'),
        h('h2', { class: 'display-lg gold' }, tier),
        r.newBest ? h('p', { class: 'new-best' }, 'NEW PERSONAL BEST') : null,
      ),
      h('div', { class: 'result-stats' },
        stat('Grids', r.cleared),
        stat('Correct', r.correct),
        stat('Strikes', r.strikes),
        stat('Burns', r.burns),
        stat('Best', records.get('gauntlet').bestGrids ?? r.cleared),
      ),
      r.grid ? h('p', { class: 'caption muted result-tip' }, 'Your last grid. Tap any square to see every answer.') : null,
      r.grid ? h('div', { class: 'board-wrap' }, renderBoard(r.grid, r, { reveal: true })) : null,
      h('div', { class: 'result-actions' },
        h('button', { class: 'btn btn-primary', onClick: () => { lastRun = null; run = newRun(); nextGrid(run); drawGame(); } }, 'Run it back'),
        h('button', { class: 'btn btn-secondary', onClick: share }, 'Share'),
        h('button', { class: 'btn btn-secondary', onClick: () => go('menu') }, 'Menu'),
      ),
    );
  }

  if (run) drawGame();
  else if (lastRun) drawResult();
  else drawStart();

  help.showFirstTime();
  return root;
}

function stat(label, value) {
  return h('div', { class: 'result-stat' },
    h('span', { class: 'stat' }, String(value)),
    h('span', { class: 'label-spaced' }, label),
  );
}
