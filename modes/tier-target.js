// TIER TARGET — Multiply · Splash.
// Each round picks a stat category and a target. Ten characters are dealt one
// at a time; place each on a multiplier square (S 4×, A 3× ×2, B 2× ×3,
// C 1× ×4). Each placement adds stat × multiplier to the Round Value.
// Land near the target: Green = big points, Yellow = small, Red costs a life.
// 3 lives. 5 passes per game. A wildcard every 5 wins. Hard Mode doubles
// points and hides every number.

import { h, fill, toast, closeSheet, sheet, confirmSheet } from '../core/ui.js';
import { profile } from '../core/profile.js';
import { records } from '../core/records.js';
import { characters } from '../core/characters.js';
import { characterCard } from '../core/card.js';
import { modeHeader, howToPlay } from '../core/mode-kit.js';
import { go } from '../core/router.js';
import { shareText } from '../core/grid-board.js';
import { store } from '../core/store.js';
import { sfx } from '../core/sfx.js';

// v0.23.0: the game in progress is saved; leave any time and pick it back up
// until you start a new one.
const SAVE_KEY = 'save:tier-target';
function packGame(g) {
  return { ...g, pool: undefined, deck: g.deck.map((c) => c.id), current: g.current?.id ?? null, cat: g.cat.id,
    squares: g.squares.map((x) => ({ ...x, card: x.card ? x.card.id : null })) };
}
function unpackGame(d) {
  const get = (id) => characters.get(id);
  const pool = characters.list.filter((c) => !c.retired && c.powerLevel);
  const deck = d.deck.map(get).filter(Boolean);
  if (!deck.length) return null;
  return { ...d, pool, deck, current: d.current != null ? get(d.current) : null, cat: CATEGORIES.find((c) => c.id === d.cat) || CATEGORIES[0],
    squares: d.squares.map((x) => ({ ...x, card: x.card != null ? get(x.card) : null })) };
}
const saveGame = () => (game ? store.set(SAVE_KEY, packGame(game)) : store.remove(SAVE_KEY));

const SQUARES = [
  { mult: 4, tier: 'S' },
  { mult: 3, tier: 'A' }, { mult: 3, tier: 'A' },
  { mult: 2, tier: 'B' }, { mult: 2, tier: 'B' }, { mult: 2, tier: 'B' },
  { mult: 1, tier: 'C' }, { mult: 1, tier: 'C' }, { mult: 1, tier: 'C' }, { mult: 1, tier: 'C' },
];
const ROWS = [[0], [1, 2], [3, 4, 5], [6, 7, 8, 9]];
const TOTAL_MULT = SQUARES.reduce((n, s) => n + s.mult, 0); // 20
const MAX_LIVES = 3;
const MAX_PASSES = 5;
const SURGE_POINTS = 400;
const STREAK_BONUS = 1000;

// Round categories. Every value is on the 1–100 scale.
export const CATEGORIES = [
  { id: 'power', name: 'Power Level', text: 'How strong they are.', uses: ['powerLevel'], fn: (c) => c.powerLevel },
  { id: 'aura', name: 'Aura', text: 'How iconic their presence is.', uses: ['aura'], fn: (c) => c.aura },
  { id: 'clutch', name: 'Clutch', text: 'How reliable they are under pressure.', uses: ['clutch'], fn: (c) => c.clutch },
  { id: 'chaos', name: 'Chaos', text: 'How unpredictable they are.', uses: ['chaos'], fn: (c) => c.chaos },
  { id: 'star', name: 'Star Power', text: 'Power and Aura, half and half.', uses: ['powerLevel', 'aura'], fn: (c) => Math.round(c.powerLevel * 0.5 + c.aura * 0.5) },
  { id: 'big-game', name: 'Big Game', text: 'Clutch 60%, Power 40%.', uses: ['clutch', 'powerLevel'], fn: (c) => Math.round(c.clutch * 0.6 + c.powerLevel * 0.4) },
  { id: 'loose-cannon', name: 'Loose Cannon', text: 'Chaos 60%, Power 40%.', uses: ['chaos', 'powerLevel'], fn: (c) => Math.round(c.chaos * 0.6 + c.powerLevel * 0.4) },
  { id: 'main-character', name: 'Main Character', text: 'Aura and Clutch, half and half.', uses: ['aura', 'clutch'], fn: (c) => Math.round(c.aura * 0.5 + c.clutch * 0.5) },
  { id: 'threat', name: 'Threat Level', text: 'Power 50%, Aura 20%, Clutch 15%, Chaos 15%.', uses: ['powerLevel', 'aura', 'clutch', 'chaos'], fn: (c) => Math.round(c.powerLevel * 0.5 + c.aura * 0.2 + c.clutch * 0.15 + c.chaos * 0.15) },
];

const help = howToPlay('tier-target', 'Tier Target', [
  'Each round has a category (like Power Level or Clutch) and a target number.',
  'Ten characters are dealt one at a time. Put each on a square: S is 4×, A is 3×, B is 2×, C is 1×.',
  'Each square adds the character\'s category value times its multiplier to your Round Value.',
  'Fill all ten squares and land near the target. Green earns big points, Yellow earns a little, Red costs a life.',
  'You have 3 lives. Pass skips a character (5 per game). Every 5 rounds won earns a Wildcard, which swaps in the best of the next few characters.',
  'The ⚡ square adds 400 bonus points. Every 5-round streak adds 1,000.',
  'Hard Mode doubles your points but hides every number and tier.',
]);

let game = null;
let lastGame = null;
let hardChoice = false;

function shuffle(a) {
  const x = a.slice();
  for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; }
  return x;
}
const fmt = (n) => Math.round(n).toLocaleString();

function newGame(hard) {
  const pool = characters.list.filter((c) => !c.retired && c.powerLevel);
  const g = {
    hard, round: 0, score: 0, lives: MAX_LIVES, streak: 0, bestStreak: 0, wins: 0,
    passes: MAX_PASSES, wildcards: 0, deck: shuffle(pool), deckIdx: 0, pool, lastCat: null,
  };
  newRound(g);
  return g;
}

function newRound(g) {
  g.round += 1;
  const choices = CATEGORIES.filter((c) => c.id !== g.lastCat);
  g.cat = choices[Math.floor(Math.random() * choices.length)];
  g.lastCat = g.cat.id;
  const mean = g.pool.reduce((n, c) => n + g.cat.fn(c), 0) / g.pool.length;
  g.target = Math.round(mean * TOTAL_MULT * (0.92 + Math.random() * 0.16));
  g.greenHalf = Math.max(1, Math.round(g.target * (g.hard ? 0.018 : 0.032)));
  g.yellowHalf = Math.round(g.target * 0.085);
  g.squares = SQUARES.map((s) => ({ ...s, card: null, value: 0, surge: false }));
  g.squares[Math.floor(Math.random() * g.squares.length)].surge = true;
  g.running = 0;
  g.filled = 0;
  g.result = null;
  deal(g);
}

function deal(g) {
  if (g.deckIdx >= g.deck.length) { g.deck = shuffle(g.pool); g.deckIdx = 0; }
  g.current = g.deck[g.deckIdx++];
}

export async function render() {
  await profile.update({ lastMode: 'tier-target' });
  const root = h('section', { class: 'screen mode tier-target' });
  root._cleanup = () => { closeSheet(); lastGame = null; };

  if (!game) { const d = await store.get(SAVE_KEY, null); if (d) game = unpackGame(d); }
  let resumed = !!game;

  // ---------- Start ----------
  function drawStart() {
    const rec = records.get('tier-target');
    const toggle = h('input', { type: 'checkbox', id: 'tt-hard', class: 'switch-input', role: 'switch', checked: hardChoice });
    toggle.addEventListener('change', () => { hardChoice = toggle.checked; });
    fill(root,
      modeHeader({ title: 'Tier Target', sub: 'MULTIPLY · SPLASH', onHelp: () => help.show() }),
      h('div', { class: 'tt-start panel' },
        h('div', { class: 'tt-mini-board', 'aria-hidden': 'true' }, ROWS.map((row) => h('div', { class: 'tt-row' },
          row.map((i) => h('span', { class: `tt-sq tier-sq-${SQUARES[i].tier.toLowerCase()}` }, `${SQUARES[i].mult}×`))))),
        h('p', { class: 'body-text' }, 'Place ten characters on the multiplier squares and land your Round Value on the target.'),
        h('div', { class: 'set-row' },
          h('label', { for: 'tt-hard', class: 'set-text' },
            h('span', { class: 'heading' }, 'Hard Mode'),
            h('span', { class: 'caption muted' }, 'Double points, but every number and tier is hidden.')),
          h('span', { class: 'switch' }, toggle, h('span', { class: 'switch-track', 'aria-hidden': 'true' })),
        ),
        h('p', { class: 'caption muted' }, recordLine(rec)),
        h('button', { class: 'btn btn-primary btn-wide', onClick: () => { game = newGame(hardChoice); saveGame(); sfx.play('flip'); drawGame(); } }, 'Start'),
      ),
    );
  }

  // ---------- Playing ----------
  function drawGame() {
    if (!game) { drawStart(); return; }
    const g = game;
    const hard = g.hard;

    const squaresLeft = g.squares.filter((s) => !s.card).map((s) => `${s.mult}×`).join(' ');
    fill(root,
      modeHeader({ title: 'Tier Target', sub: `ROUND ${g.round}${hard ? ' · HARD' : ''}`, onHelp: () => help.show(), onBack: () => go('menu') }),
      h('div', { class: 'tt-saved' }, h('span', { class: 'caption muted' }, 'Your game saves as you play. Leave any time.'),
        h('button', { class: 'btn btn-secondary btn-sm', onClick: startNew }, 'Start a new game')),
      h('button', { class: 'tt-cat', onClick: () => showCategory(g.cat) },
        h('span', { class: 'label-spaced' }, 'CATEGORY'),
        h('span', { class: 'tt-cat-name' }, g.cat.name),
        h('span', { class: 'caption muted' }, g.cat.text),
      ),
      h('div', { class: 'hud tt-hud' },
        hudItem('TARGET', fmt(g.target), 'gold'),
        hudItem('SCORE', fmt(g.score)),
        h('div', { class: 'hud-item' }, h('span', { class: 'label-spaced' }, 'LIVES'),
          h('span', { class: 'lives', 'aria-label': `${g.lives} of ${MAX_LIVES} lives` },
            Array.from({ length: MAX_LIVES }, (_, i) => h('span', { class: `life${i < g.lives ? '' : ' is-lost'}`, 'aria-hidden': 'true' })))),
        hudItem('STREAK', String(g.streak)),
      ),
      meter(g),
      g.current ? h('div', { class: 'tt-deal' },
        h('div', { class: 'tt-deal-value' },
          h('span', { class: 'label-spaced' }, g.cat.name.toUpperCase()),
          h('span', { class: 'stat gold' }, hard ? '?' : String(g.cat.fn(g.current))),
        ),
        characterCard(g.current, { hideNumbers: hard, highlight: g.cat.uses, size: 'row' }),
        h('div', { class: 'tt-deal-actions' },
          h('button', { class: 'btn btn-secondary', disabled: g.passes <= 0, onClick: pass }, `Pass (${g.passes})`),
          g.wildcards > 0 ? h('button', { class: 'btn btn-secondary', onClick: wildcard }, `Wildcard (${g.wildcards})`) : null,
        ),
        h('p', { class: 'caption muted tt-prompt' }, `Tap a square to place ${g.current.name}. Open: ${squaresLeft}`),
      ) : null,
      board(g),
    );
    // On wide screens the dealt card and the pyramid sit side by side.
    const deal = root.querySelector('.tt-deal'); const bd = root.querySelector('.tt-board');
    if (deal && bd) { const wrap = h('div', { class: 'tt-play' }); deal.replaceWith(wrap); wrap.append(deal, bd); }
    else if (bd) { const wrap = h('div', { class: 'tt-play is-board-only' }); bd.replaceWith(wrap); wrap.append(bd); }
  }

  async function startNew() {
    const ok = await confirmSheet({ title: 'START A NEW GAME?', message: `Your game in progress (round ${game.round}, ${fmt(game.score)} points) ends without counting toward your records.`, confirmLabel: 'Start new' });
    if (!ok) return;
    game = null; await saveGame(); drawStart();
  }

  function meter(g) {
    const max = g.target + g.yellowHalf * 3;
    const pct = (v) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
    const yLo = g.target - g.yellowHalf;
    const gLo = g.target - g.greenHalf;
    return h('div', { class: 'tt-meter', role: 'img', 'aria-label': g.hard ? 'Round Value hidden' : `Round Value ${fmt(g.running)} of target ${fmt(g.target)}` },
      h('div', { class: 'tt-track' },
        h('span', { class: 'tt-zone zone-yellow', style: { left: pct(yLo), width: pct(g.yellowHalf * 2) } }),
        h('span', { class: 'tt-zone zone-green', style: { left: pct(gLo), width: pct(g.greenHalf * 2) } }),
        g.hard ? null : h('span', { class: 'tt-fill', style: { width: pct(g.running) } }),
      ),
      h('div', { class: 'tt-meter-labels' },
        h('span', {}, g.hard ? 'Round Value: hidden' : `Round Value ${fmt(g.running)}`),
        h('span', {}, `${10 - g.filled} to place`),
      ),
    );
  }

  function board(g) {
    return h('div', { class: 'tt-board', role: 'group', 'aria-label': 'Multiplier squares' }, ROWS.map((row) => h('div', { class: 'tt-row' },
      row.map((i) => {
        const sq = g.squares[i];
        if (sq.card) {
          return h('div', { class: `tt-sq tier-sq-${sq.tier.toLowerCase()} is-filled` },
            sq.surge ? h('span', { class: 'tt-surge' }, '⚡') : null,
            h('span', { class: 'tt-sq-name' }, sq.card.name),
            h('span', { class: 'tt-sq-val' }, g.hard ? `${sq.mult}×` : `${sq.mult}× = ${fmt(sq.value)}`),
          );
        }
        return h('button', {
          class: `tt-sq tier-sq-${sq.tier.toLowerCase()}`, disabled: !g.current,
          'aria-label': `${sq.tier} square, ${sq.mult} times${sq.surge ? ', power surge' : ''}`,
          onClick: () => place(i),
        },
          sq.surge ? h('span', { class: 'tt-surge' }, '⚡') : null,
          h('span', { class: 'tt-sq-tier' }, sq.tier),
          h('span', { class: 'tt-sq-mult' }, `${sq.mult}×`),
        );
      }))));
  }

  function place(i) {
    const g = game;
    const sq = g.squares[i];
    if (!g.current || sq.card) return;
    sq.card = g.current;
    sq.value = g.cat.fn(g.current) * sq.mult;
    g.running += sq.value;
    g.filled += 1;
    sfx.play('pick');
    if (sq.surge) { g.score += SURGE_POINTS * (g.hard ? 2 : 1); toast(`⚡ Power surge +${SURGE_POINTS * (g.hard ? 2 : 1)}`); sfx.play('special'); }
    if (g.filled >= SQUARES.length) {
      g.current = null;
      saveGame();
      drawGame();
      setTimeout(evaluate, 350);
    } else {
      deal(g);
      saveGame();
      drawGame();
    }
  }

  function pass() {
    const g = game;
    if (g.passes <= 0 || !g.current) return;
    g.passes -= 1;
    deal(g);
    sfx.play('flip');
    saveGame();
    drawGame();
  }

  // Swap the current character for the best of the next six.
  function wildcard() {
    const g = game;
    if (g.wildcards <= 0 || !g.current) return;
    g.wildcards -= 1;
    let best = null;
    for (let k = 0; k < 6; k++) {
      const c = g.deck[(g.deckIdx + k) % g.deck.length];
      if (!best || g.cat.fn(c) > g.cat.fn(best)) best = c;
    }
    g.current = best;
    sfx.play('fanfare');
    saveGame();
    drawGame();
  }

  function evaluate() {
    const g = game;
    const diff = Math.abs(g.running - g.target);
    const mult = g.hard ? 2 : 1;
    let res = 'RED';
    let pts = 0;
    const bonuses = [];
    if (diff <= g.greenHalf) { res = 'GREEN'; pts = (500 + Math.round((1 - diff / g.greenHalf) * 300)) * mult; }
    else if (diff <= g.yellowHalf) { res = 'YELLOW'; pts = 100 * mult; }

    if (res === 'RED') {
      g.lives -= 1;
      g.streak = 0;
    } else {
      g.score += pts;
      g.streak += 1;
      g.wins += 1;
      g.bestStreak = Math.max(g.bestStreak, g.streak);
      if (g.wins % 5 === 0) { g.wildcards += 1; bonuses.push('Wildcard earned'); }
      if (g.streak % 5 === 0) { g.score += STREAK_BONUS; bonuses.push(`${g.streak}-round streak +${fmt(STREAK_BONUS)}`); }
    }
    sfx.play(res === 'GREEN' ? 'win' : res === 'YELLOW' ? 'correct' : 'wrong');
    showResult(res, pts, diff, bonuses);
  }

  function showResult(res, pts, diff, bonuses) {
    const g = game;
    const titles = { GREEN: 'SPLASH!', YELLOW: 'ON THE RIM', RED: 'BRICK' };
    const over = g.lives <= 0;
    let s;
    const next = () => { s.close(); };
    s = sheet({
      title: titles[res],
      center: true,
      onClose: () => { if (over) finish(); else { newRound(game); saveGame(); drawGame(); } },
      content: h('div', { class: `tt-result is-${res.toLowerCase()}` },
        h('p', { class: 'tt-result-line' }, `Round Value ${fmt(g.running)} · Target ${fmt(g.target)}`),
        h('p', { class: 'caption muted' }, `Off by ${fmt(diff)}${res === 'RED' ? (g.running > g.target ? ', too high' : ', too low') : ''}`),
        res === 'RED'
          ? h('p', { class: 'tt-result-pts bad' }, '−1 LIFE')
          : h('p', { class: 'tt-result-pts' }, `+${fmt(pts)} POINTS`),
        bonuses.length ? h('p', { class: 'caption gold' }, bonuses.join(' · ')) : null,
        h('div', { class: 'btn-row update-actions' },
          h('button', { class: 'btn btn-primary', 'data-autofocus': '', onClick: next }, over ? 'See final score' : 'Next round')),
      ),
    });
  }

  async function finish() {
    const g = game;
    game = null;
    await saveGame();
    let newBest = false;
    const key = g.hard ? 'hard' : 'normal';
    await records.update('tier-target', (r) => {
      const x = r[key] || { games: 0 };
      x.games += 1;
      if (x.bestScore === undefined) x.bestScore = g.score;
      else if (g.score > x.bestScore) { newBest = true; x.bestScore = g.score; }
      x.bestStreak = Math.max(x.bestStreak || 0, g.bestStreak);
      x.bestRound = Math.max(x.bestRound || 0, g.round);
      r[key] = x;
      return r;
    });
    lastGame = { ...g, newBest };
    sfx.play(newBest ? 'fanfare' : 'gong');
    drawOver();
  }

  function drawOver() {
    const g = lastGame;
    if (!g) { drawStart(); return; }
    const share = async () => {
      const how = await shareText(`T7P Arcade · Tier Target${g.hard ? ' (Hard)' : ''}\n${fmt(g.score)} points · round ${g.round} · best streak ${g.bestStreak}`);
      if (how === 'copied') toast('Result copied. Paste it anywhere.');
      else if (how === 'failed') toast('Sharing is not available here.');
    };
    fill(root,
      modeHeader({ title: 'Tier Target', sub: 'GAME OVER', onHelp: () => help.show(), onBack: () => go('menu') }),
      h('div', { class: 'result-head' },
        h('p', { class: 'label-spaced' }, 'FINAL SCORE'),
        h('h2', { class: 'display-lg gold' }, fmt(g.score)),
        g.newBest ? h('p', { class: 'new-best' }, 'NEW PERSONAL BEST') : null,
      ),
      h('div', { class: 'result-stats' },
        stat('Rounds', g.round), stat('Won', g.wins), stat('Best streak', g.bestStreak),
      ),
      h('div', { class: 'result-actions' },
        h('button', { class: 'btn btn-primary', onClick: () => { lastGame = null; game = newGame(g.hard); saveGame(); drawGame(); } }, 'Play again'),
        h('button', { class: 'btn btn-secondary', onClick: share }, 'Share'),
        h('button', { class: 'btn btn-secondary', onClick: () => { lastGame = null; drawStart(); } }, 'Change mode'),
      ),
    );
  }

  function showCategory(cat) {
    sheet({
      title: cat.name.toUpperCase(),
      content: h('div', {},
        h('p', { class: 'body-text' }, cat.text),
        h('p', { class: 'caption muted' }, 'The target is about 20 times the average value in this category, so aim for an average character on every square.'),
      ),
    });
  }

  if (game) {
    drawGame();
    if (resumed) { toast(`Welcome back: round ${game.round}, ${fmt(game.score)} points.`); resumed = false; }
    // Left right after the tenth card: score that round now.
    if (game.filled >= SQUARES.length && !game.current) setTimeout(evaluate, 350);
  } else if (lastGame) drawOver();
  else drawStart();
  help.showFirstTime();
  return root;
}

function recordLine(rec) {
  const n = rec.normal;
  const hd = rec.hard;
  const parts = [];
  if (n) parts.push(`Best ${fmt(n.bestScore)}`);
  if (hd) parts.push(`Hard best ${fmt(hd.bestScore)}`);
  return parts.length ? parts.join(' · ') : 'No games yet.';
}

function hudItem(label, value, cls = '') {
  return h('div', { class: 'hud-item' }, h('span', { class: 'label-spaced' }, label), h('span', { class: `stat ${cls}` }, value));
}

function stat(label, value) {
  return h('div', { class: 'result-stat' }, h('span', { class: 'stat' }, String(value)), h('span', { class: 'label-spaced' }, label));
}
