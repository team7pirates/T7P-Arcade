// Grid core: builds the categories (series, traits, teams) from the roster and
// makes grids where every square can be filled with a different character.
// Grids and Gauntlet both use this; later modes can add new kinds of category
// (tiers, roles) once the ratings are in.

import { characters } from './characters.js';

// Tags that fit too many characters to make a good question are left out.
const TOO_COMMON = 0.4;

const TEAM_TAGS = {
  'justice league': 'Justice League',
  'teen titans': 'Teen Titans',
  'batman family': 'Batman Family',
  'wildcats': 'WildC.A.T.s',
  'stormwatch': 'Stormwatch',
  'the authority': 'The Authority',
  'green lantern corps': 'Green Lantern Corps',
  'x-men': 'X-Men',
  'fantastic four': 'Fantastic Four',
};

// What each trait means, shown when a player taps a category.
const TAG_INFO = {
  'flight': ['Can fly', 'Flies under their own power or with a device.'],
  'anti-hero': ['Anti-Hero', 'A hero who breaks the rules, or a villain with a code.'],
  'orphan': ['Orphan', 'Lost their parents or grew up without them.'],
  'mutation': ['Mutation', 'Powers from a mutation, experiment or change to their body.'],
  'magic': ['Magic', 'Uses magic, curses, chakra, spirit energy or other mystic power.'],
  'divine': ['Divine', 'A god, demigod or someone touched by cosmic or divine power.'],
  'scarred': ['Scarred', 'Has a visible scar.'],
  'swordsman': ['Swordsman', 'Fights with a sword or other blade.'],
  'mentor': ['Mentor', 'Trains or guides other fighters.'],
  'marksman': ['Marksman', 'Fights with guns, bows or thrown weapons.'],
  'caped': ['Caped', 'Wears a cape or cloak.'],
  'masked': ['Masked', 'Wears a mask or hides their face.'],
  'assassin': ['Assassin', 'Trained to kill, or kills for a living.'],
  'tech': ['Tech', 'Uses gadgets, armor or advanced technology.'],
  'alien': ['Alien', 'Not from Earth, or not human in origin.'],
  'royalty': ['Royalty', 'Royal blood, or rules a kingdom or clan.'],
  'fire': ['Fire powers', 'Controls or creates fire.'],
  'ice': ['Ice powers', 'Controls or creates ice.'],
  'lightning': ['Lightning powers', 'Controls or creates lightning or electricity.'],
  'earth': ['Earth powers', 'Controls earth, stone or the ground.'],
  'healer': ['Healer', 'Can heal themselves or others.'],
  'billionaire': ['Billionaire', 'Extremely rich.'],
  'cyborg': ['Cyborg', 'Part machine.'],
  'genius': ['Genius', 'Known for their intelligence.'],
  'leader': ['Leader', 'Leads a team, army or organization.'],
  'brawler': ['Brawler', 'Fights hand to hand.'],
};

let cache = null;

function titleCase(t) {
  return t.replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase());
}

export function categories() {
  if (cache) return cache;
  const list = characters.list.filter((c) => !c.retired);
  const total = list.length;
  const out = [];

  const bySeries = new Map();
  const byTag = new Map();
  for (const c of list) {
    if (!bySeries.has(c.series)) bySeries.set(c.series, new Set());
    bySeries.get(c.series).add(c.id);
    for (const t of c.tags || []) {
      if (!byTag.has(t)) byTag.set(t, new Set());
      byTag.get(t).add(c.id);
    }
  }

  for (const [series, ids] of bySeries) {
    if (ids.size < 4) continue;
    out.push({ id: `series:${series}`, kind: 'series', label: series, info: `Characters from ${series}.`, ids });
  }
  for (const [tag, ids] of byTag) {
    if (TEAM_TAGS[tag]) {
      if (ids.size >= 3) out.push({ id: `team:${tag}`, kind: 'team', label: TEAM_TAGS[tag], info: `Members of ${TEAM_TAGS[tag]}.`, ids });
      continue;
    }
    if (ids.size < 4 || ids.size / total > TOO_COMMON) continue;
    const [label, info] = TAG_INFO[tag] || [titleCase(tag), ''];
    out.push({ id: `tag:${tag}`, kind: 'tag', label, info, ids });
  }

  cache = out;
  return out;
}

export function categoryById(id) {
  return categories().find((c) => c.id === id) || null;
}

function intersect(a, b) {
  const out = [];
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  for (const id of small) if (big.has(id)) out.push(id);
  return out;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Can every square get a different character? (Bipartite matching.)
function solvable(cellAnswers) {
  const owner = new Map();
  const tryCell = (i, seen) => {
    for (const id of cellAnswers[i]) {
      if (seen.has(id)) continue;
      seen.add(id);
      if (!owner.has(id) || tryCell(owner.get(id), seen)) { owner.set(id, i); return true; }
    }
    return false;
  };
  for (let i = 0; i < cellAnswers.length; i++) if (!tryCell(i, new Set())) return false;
  return true;
}

// How many points a square is worth: fewer possible answers = more points.
export function cellPoints(answerCount) {
  return 10 + Math.round(40 / Math.max(1, answerCount));
}

// Difficulty settings. min/max = how many characters must fit each square.
export const DIFFICULTIES = {
  easy:   { label: 'Easy',   multiplier: 1, min: 3, max: 999, rows: ['series'],                cols: ['tag'], rowMinSize: 10 },
  medium: { label: 'Medium', multiplier: 2, min: 2, max: 15,  rows: ['series', 'team'],        cols: ['tag'], rowMinSize: 4 },
  hard:   { label: 'Hard',   multiplier: 4, min: 1, max: 6,   rows: ['series', 'team', 'tag'], cols: ['tag'], rowMinSize: 4 },
  gauntlet: { label: 'Gauntlet', multiplier: 1, min: 1, max: 999, rows: ['series', 'team', 'tag'], cols: ['tag'], rowMinSize: 4 },
};

// Make a size×size grid. Returns { size, difficulty, rows, cols, answers }
// where rows/cols are category IDs and answers[r][c] is a list of character IDs.
export function generateGrid({ size = 3, difficulty = 'medium', avoid = [] } = {}) {
  const cfg = DIFFICULTIES[difficulty];
  const all = categories();
  const avoidSet = new Set(avoid);
  const rowPool = all.filter((c) => cfg.rows.includes(c.kind) && c.ids.size >= cfg.rowMinSize);
  const colPool = all.filter((c) => cfg.cols.includes(c.kind));

  for (let attempt = 0; attempt < 800; attempt++) {
    // Prefer categories not used in the last grid, but allow them if needed.
    const fresh = attempt < 400 ? rowPool.filter((c) => !avoidSet.has(c.id)) : rowPool;
    const rows = shuffle(fresh).slice(0, size);
    if (rows.length < size) continue;
    // Never two of the same trait, and a trait row can't also be a column.
    const rowIds = new Set(rows.map((r) => r.id));

    const fits = (col) => !rowIds.has(col.id) && rows.every((row) => {
      const n = intersect(row.ids, col.ids).length;
      return n >= cfg.min && n <= cfg.max;
    });
    const cols = shuffle(colPool.filter((c) => fits(c) && (attempt >= 400 || !avoidSet.has(c.id)))).slice(0, size);
    if (cols.length < size) continue;

    const answers = rows.map((row) => cols.map((col) => intersect(row.ids, col.ids)));
    if (!solvable(answers.flat())) continue;

    return {
      size,
      difficulty,
      rows: rows.map((r) => r.id),
      cols: cols.map((c) => c.id),
      answers,
    };
  }
  return null;
}

// Does this character fit square (r, c)?
export function fits(grid, r, c, charId) {
  return grid.answers[r][c].includes(Number(charId));
}
