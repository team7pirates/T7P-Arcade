// The seven modes on the main menu, in menu order. Each mode's code lives in
// modes/<id>.js and is switched on here (ready: true, plus a load function)
// when its wave ships. The loading screen calls load() for each ready mode.

import { registerScreen } from './router.js';

const loader = (id) => () => import(`../modes/${id}.js`)
  .then((m) => registerScreen(id, m.render, { live: true }));

export const MODES = [
  {
    id: 'forbidden-fusion', loadingLine: 'FIRING UP THE FUSION LAB', name: 'Forbidden Fusion', sub: 'Forge · Ladder · Legend',
    flagship: true, wave: 3, ready: false,
    blurb: 'Fuse characters into one fighter, train it in the Gym, and climb the Tower.',
  },
  {
    id: 'dynasty', loadingLine: 'SETTING UP THE FRONT OFFICE', name: 'Dynasty', sub: 'Build · Simulate · Dynasty',
    flagship: true, wave: 4, ready: false,
    blurb: 'Run a franchise for up to 10 seasons: draft, trade, develop and chase the Hall of Fame.',
  },
  {
    id: 'brawl', loadingLine: 'DRAWING UP THE BRACKET', name: 'Brawl', sub: 'Draft · Bracket · Champion',
    flagship: true, wave: 4, ready: false,
    blurb: 'Draft a squad and fight through a bracket to be crowned champion.',
  },
  {
    id: 'grids', loadingLine: 'SHUFFLING THE GRIDS', name: 'Grids', sub: 'Solo deployment',
    flagship: false, wave: 1, ready: true, load: loader('grids'),
    blurb: 'Fill the grid with characters that match both the row and the column.',
  },
  {
    id: 'gauntlet', loadingLine: 'WINDING THE GAUNTLET CLOCK', name: 'Gauntlet', sub: 'Survival time attack',
    flagship: false, wave: 1, ready: true, load: loader('gauntlet'),
    blurb: 'Clear grid after grid against the clock. How far can you get?',
  },
  {
    id: 'tier-target', loadingLine: 'LINING UP TIER TARGETS', name: 'Tier Target', sub: 'Multiply · Splash',
    flagship: false, wave: 2, ready: true, load: loader('tier-target'),
    blurb: 'Hit the target score by picking characters from the right tiers.',
  },
  {
    id: 'blind-tier-list', loadingLine: 'SEALING THE BLIND TIER LIST', name: 'Blind Tier List', sub: 'Rank on instinct',
    flagship: false, wave: 2, ready: true, load: loader('blind-tier-list'),
    blurb: 'Characters arrive one at a time. Place each one before you see the next.',
  },
];

export const modeById = (id) => MODES.find((m) => m.id === id) || null;
