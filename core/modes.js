// The seven modes on the main menu, in menu order. Each mode's code will live
// in modes/<id>.js and be switched on here (ready: true) when its wave ships.

export const MODES = [
  {
    id: 'forbidden-fusion', name: 'Forbidden Fusion', sub: 'Forge · Ladder · Legend',
    flagship: true, wave: 3, ready: false,
    blurb: 'Fuse characters into one fighter, train it in the Gym, and climb the Tower.',
  },
  {
    id: 'dynasty', name: 'Dynasty', sub: 'Build · Simulate · Dynasty',
    flagship: true, wave: 4, ready: false,
    blurb: 'Run a franchise for up to 10 seasons: draft, trade, develop and chase the Hall of Fame.',
  },
  {
    id: 'brawl', name: 'Brawl', sub: 'Draft · Bracket · Champion',
    flagship: true, wave: 4, ready: false,
    blurb: 'Draft a squad and fight through a bracket to be crowned champion.',
  },
  {
    id: 'grids', name: 'Grids', sub: 'Solo deployment',
    flagship: false, wave: 1, ready: false,
    blurb: 'Fill the grid with characters that match both the row and the column.',
  },
  {
    id: 'gauntlet', name: 'Gauntlet', sub: 'Survival time attack',
    flagship: false, wave: 1, ready: false,
    blurb: 'Clear grid after grid against the clock. How far can you get?',
  },
  {
    id: 'tier-target', name: 'Tier Target', sub: 'Multiply · Splash',
    flagship: false, wave: 2, ready: false,
    blurb: 'Hit the target score by picking characters from the right tiers.',
  },
  {
    id: 'blind-tier-list', name: 'Blind Tier List', sub: 'Rank on instinct',
    flagship: false, wave: 2, ready: false,
    blurb: 'Characters arrive one at a time. Place each one before you see the next.',
  },
];

export const modeById = (id) => MODES.find((m) => m.id === id) || null;
