// GRIDS — Solo deployment.
// Fill a 3×3 grid: each square needs a character who fits both its row and
// its column. Easy 1×, Medium 2×, Hard 4× points. A wrong guess costs 5 points
// (times the multiplier). Burn skips a square for no points.
// A grid in progress is saved, so closing the app never loses it.

import { h, fill, toast, confirmSheet } from '../core/ui.js';
import { store } from '../core/store.js';
import { profile } from '../core/profile.js';
import { records } from '../core/records.js';
import { characters } from '../core/characters.js';
import { generateGrid, DIFFICULTIES, cellPoints, fits } from '../core/grid.js';
import { renderBoard, openGuess, emptyCells, filledCount, emojiGrid, shareText } from '../core/grid-board.js';
import { modeHeader, howToPlay, createClock, formatTime } from '../core/mode-kit.js';
import { go } from '../core/router.js';

const SAVE_KEY = 'save:grids';
const LEVELS = ['easy', 'medium', 'hard'];
const LEVEL_TEXT = {
  easy: 'Big series and well-known traits. Every square has at least 3 answers.',
  medium: 'Smaller groups and teams. Every square has 2 to 15 answers.',
  hard: 'Traits crossed with traits. Some squares have only one answer.',
};

const help = howToPlay('grids', 'Grids', [
  'Fill every square with a character who fits both its row and its column.',
  'Tap a row or column name to see what it means.',
  'Each character can only be used once per grid.',
  'Squares with fewer possible answers are worth more points. Easy pays 1×, Medium 2× and Hard 4×.',
  'A wrong guess costs 5 points (times the multiplier).',
  'Stuck? Burn a square to fill it for no points. You will not see who it was.',
  'Finish with no wrong guesses and no burns to grow your flawless streak.',
  'Your grid is saved as you play, so you can close the app and come back.',
]);

let session = null;     // the grid being played (also kept in storage)
let lastResult = null;  // the finished grid, for the results screen
let lastCats = [];      // categories from the previous grid, to avoid repeats

export async function render() {
  await profile.update({ lastMode: 'grids' });
  if (!session) session = await store.get(SAVE_KEY, null);

  const root = h('section', { class: 'screen mode grids' });
  let clock = null;

  const persist = () => store.set(SAVE_KEY, session);
  const stopClock = () => {
    if (!clock) return;
    if (session) { session.elapsedMs = clock.ms; persist(); }
    clock.destroy();
    clock = null;
  };
  root._cleanup = () => { stopClock(); lastResult = null; };

  // ---------- Difficulty picker ----------
  function drawPicker() {
    stopClock();
    const recs = records.get('grids');
    fill(root, 
      modeHeader({ title: 'Grids', sub: 'SOLO DEPLOYMENT', onHelp: () => help.show() }),
      session && !session.done ? h('button', { class: 'resume-card', onClick: drawGame },
        h('span', { class: 'label-spaced gold' }, 'GRID IN PROGRESS'),
        h('span', { class: 'heading' }, `Resume ${DIFFICULTIES[session.difficulty].label}`),
        h('span', { class: 'caption muted' }, `${filledCount(session)} of 9 squares · ${session.score} points`),
      ) : null,
      h('h2', { class: 'label-spaced picker-title' }, 'PICK YOUR DIFFICULTY'),
      h('div', { class: 'diff-list' }, LEVELS.map((lv) => {
        const d = DIFFICULTIES[lv];
        const rec = recs[lv] || {};
        return h('button', { class: `diff-card diff-${lv}`, onClick: () => start(lv) },
          h('span', { class: 'diff-top' },
            h('span', { class: 'diff-name' }, d.label),
            h('span', { class: 'diff-mult' }, `${d.multiplier}×`),
          ),
          h('span', { class: 'body-text diff-text' }, LEVEL_TEXT[lv]),
          h('span', { class: 'caption muted' },
            rec.best !== undefined ? `Best ${rec.best} · Flawless streak ${rec.streak || 0}` : 'Not played yet'),
        );
      })),
    );
  }

  async function start(level) {
    if (session && !session.done && filledCount(session) > 0) {
      const ok = await confirmSheet({
        title: 'START A NEW GRID?',
        message: 'Your grid in progress will be thrown away.',
        confirmLabel: 'New grid',
        danger: true,
      });
      if (!ok) return;
    }
    const grid = generateGrid({ size: 3, difficulty: level, avoid: lastCats });
    if (!grid) { toast('Could not make a grid. Try again.'); return; }
    lastCats = [...grid.rows, ...grid.cols];
    session = {
      difficulty: level,
      grid,
      cells: emptyCells(3),
      score: 0,
      strikes: [],
      burns: 0,
      elapsedMs: 0,
      done: false,
      rosterVersion: characters.version,
    };
    await persist();
    drawGame();
  }

  // ---------- Playing ----------
  function drawGame() {
    if (!session || session.done) { drawPicker(); return; }
    const { grid, difficulty } = session;
    const d = DIFFICULTIES[difficulty];

    const scoreEl = h('span', { class: 'stat' }, String(session.score));
    const timeEl = h('span', { class: 'stat' }, formatTime(session.elapsedMs, { up: true }));
    const strikeEl = h('span', { class: 'stat' }, String(session.strikes.length));
    const boardWrap = h('div', { class: 'board-wrap' });
    const strikeList = h('p', { class: 'strike-list caption' });

    const updateHud = () => {
      scoreEl.textContent = String(session.score);
      strikeEl.textContent = String(session.strikes.length);
      strikeList.textContent = session.strikes.length ? `Strikes: ${session.strikes.join(', ')}` : '';
    };
    const drawBoard = (flash) => boardWrap.replaceChildren(renderBoard(grid, session, { onCell, flash }));

    function onCell(r, c) {
      openGuess(grid, session, r, c, {
        multiplier: d.multiplier,
        burnNote: 'Fills the square for no points. You will not see who it was, and the grid will not count as flawless.',
        onGuess(ch) {
          if (fits(grid, r, c, ch.id)) {
            session.cells[r][c] = { kind: 'hit', id: ch.id };
            session.score += cellPoints(grid.answers[r][c].length) * d.multiplier;
            persist();
            updateHud();
            drawBoard({ r, c, kind: 'hit' });
            checkDone();
            return { ok: true };
          }
          const cost = 5 * d.multiplier;
          session.score -= cost;
          session.strikes.push(ch.name);
          persist();
          updateHud();
          return { ok: false, message: `${ch.name} doesn't fit. −${cost} points.` };
        },
        onBurn() {
          session.cells[r][c] = { kind: 'burn', id: null };
          session.burns += 1;
          persist();
          drawBoard({ r, c, kind: 'burn' });
          checkDone();
        },
      });
    }

    function checkDone() {
      if (filledCount(session) === grid.size * grid.size) finish();
    }

    fill(root, 
      modeHeader({ title: 'Grids', sub: `${d.label.toUpperCase()} · ${d.multiplier}× POINTS`, onHelp: () => help.show(), onBack: () => go('menu') }),
      h('div', { class: 'hud' },
        h('div', { class: 'hud-item' }, h('span', { class: 'label-spaced' }, 'SCORE'), scoreEl),
        h('div', { class: 'hud-item' }, h('span', { class: 'label-spaced' }, 'TIME'), timeEl),
        h('div', { class: 'hud-item' }, h('span', { class: 'label-spaced' }, 'STRIKES'), strikeEl),
      ),
      boardWrap,
      strikeList,
      h('div', { class: 'game-actions' },
        h('button', { class: 'btn btn-secondary', onClick: endEarly }, 'End grid'),
      ),
    );
    updateHud();
    drawBoard();

    clock = createClock({ startMs: session.elapsedMs, onTick: (ms) => { timeEl.textContent = formatTime(ms, { up: true }); } });
    clock.start();
  }

  async function endEarly() {
    const open = 9 - filledCount(session);
    const ok = await confirmSheet({
      title: 'END THIS GRID?',
      message: `${open} square${open === 1 ? '' : 's'} will count as missed. You keep the points you have.`,
      confirmLabel: 'End grid',
    });
    if (ok) finish();
  }

  async function finish() {
    if (clock) { session.elapsedMs = clock.ms; clock.destroy(); clock = null; }
    session.done = true;
    const s = session;
    const total = s.grid.size * s.grid.size;
    const correct = s.cells.flat().filter((x) => x && x.kind === 'hit').length;
    const complete = filledCount(s) === total;
    const flawless = complete && s.strikes.length === 0 && s.burns === 0;

    let newBest = false;
    let streak = 0;
    await records.update('grids', (g) => {
      const r = g[s.difficulty] || { played: 0, cleared: 0, streak: 0, bestStreak: 0 };
      r.played += 1;
      if (complete) r.cleared += 1;
      if (r.best === undefined) r.best = s.score;
      else if (s.score > r.best) { newBest = true; r.best = s.score; }
      r.streak = flawless ? r.streak + 1 : 0;
      r.bestStreak = Math.max(r.bestStreak, r.streak);
      if (flawless && (r.fastestFlawlessMs === undefined || s.elapsedMs < r.fastestFlawlessMs)) r.fastestFlawlessMs = s.elapsedMs;
      streak = r.streak;
      g[s.difficulty] = r;
      return g;
    });

    lastResult = { ...s, correct, complete, flawless, newBest, streak };
    session = null;
    await store.remove(SAVE_KEY);
    drawResult();
  }

  // ---------- Results ----------
  function drawResult() {
    const r = lastResult;
    if (!r) { drawPicker(); return; }
    const d = DIFFICULTIES[r.difficulty];
    const time = formatTime(r.elapsedMs, { up: true });
    const share = async () => {
      const text = `T7P Arcade · Grids (${d.label})\n${r.score} pts · ${time}${r.flawless ? ' · flawless' : ''}\n${emojiGrid(r)}`;
      const how = await shareText(text);
      if (how === 'copied') toast('Result copied. Paste it anywhere.');
      else if (how === 'failed') toast('Sharing is not available here.');
    };

    fill(root, 
      modeHeader({ title: 'Grids', sub: `${d.label.toUpperCase()} · ${d.multiplier}× POINTS`, onHelp: () => help.show(), onBack: () => go('menu') }),
      h('div', { class: 'result-head' },
        h('h2', { class: 'display-lg' }, r.complete ? (r.flawless ? 'FLAWLESS' : 'GRID CLEARED') : 'GRID ENDED'),
        r.newBest ? h('p', { class: 'new-best' }, 'NEW PERSONAL BEST') : null,
      ),
      h('div', { class: 'result-stats' },
        stat('Score', r.score),
        stat('Time', time),
        stat('Correct', `${r.correct}/9`),
        stat('Strikes', r.strikes.length),
        stat('Burns', r.burns),
        stat('Streak', r.streak),
      ),
      h('p', { class: 'caption muted result-tip' }, 'Tap any square to see every answer that fit.'),
      h('div', { class: 'board-wrap' }, renderBoard(r.grid, r, { reveal: true })),
      h('div', { class: 'result-actions' },
        h('button', { class: 'btn btn-primary', onClick: () => start(r.difficulty) }, 'Play again'),
        h('button', { class: 'btn btn-secondary', onClick: () => { lastResult = null; drawPicker(); } }, 'Change difficulty'),
        h('button', { class: 'btn btn-secondary', onClick: share }, 'Share'),
      ),
    );
  }

  if (session && !session.done) drawGame();
  else if (lastResult) drawResult();
  else drawPicker();

  help.showFirstTime();
  return root;
}

function stat(label, value) {
  return h('div', { class: 'result-stat' },
    h('span', { class: 'stat' }, String(value)),
    h('span', { class: 'label-spaced' }, label),
  );
}
