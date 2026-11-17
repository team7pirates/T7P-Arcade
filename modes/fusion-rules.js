// Forbidden Fusion rules: the Gym build, the Tower's floors, healing and
// Bounty. Pure functions with no screen code, so the balance simulation in
// sim/ can run the same rules the game does.

import { ROLES } from '../core/combat.js';

// ---------- The Gym ----------
// Power Level costs 1 point per level above 50. Aura and Clutch cost 1 point
// per 10 (simulated: 10 Aura or Clutch is worth a bit less than 1 Power in the
// Tower, so Power stays the safe pick and the others are a style). Chaos is free: it only changes how wild each hit is, not how strong
// the fighter is. Second role is free (it adds a smaller role edge).
export const GYM = {
  power: { min: 50, max: 99, step: 1, per: 1 },
  aura: { min: 0, max: 100, step: 10, per: 1 },
  clutch: { min: 0, max: 100, step: 10, per: 1 },
  chaos: { min: 0, max: 100, step: 5, per: 0 },
};
export const START_BUDGET = 30;
export const BOUNTY_PER_POINT = 100;  // every 100 Bounty earned adds 1 budget point
export const MAX_BUDGET = cost({ powerLevel: 99, aura: 100, clutch: 100 }); // 69

export function cost(b) {
  return (b.powerLevel - GYM.power.min) * GYM.power.per
    + Math.round(b.aura / GYM.aura.step) * GYM.aura.per
    + Math.round(b.clutch / GYM.clutch.step) * GYM.clutch.per;
}

export function budgetFor(lifetimeBounty) {
  return Math.min(MAX_BUDGET, START_BUDGET + Math.floor((lifetimeBounty || 0) / BOUNTY_PER_POINT));
}

export function starterBuild(face, budget = START_BUDGET) {
  const main = face?.mainRole && ROLES.includes(face.mainRole) ? face.mainRole : 'Striker';
  const second = face?.secondRole && face.secondRole !== main && ROLES.includes(face.secondRole) ? face.secondRole : null;
  // Spend most of the budget on Power, the rest on Aura then Clutch.
  const power = Math.min(99, 50 + Math.max(0, budget - 6));
  let left = budget - (power - 50);
  const aura = Math.min(100, Math.max(0, Math.floor(left / 2)) * GYM.aura.step);
  left -= aura / GYM.aura.step;
  const clutch = Math.min(100, Math.max(0, left) * GYM.clutch.step);
  return {
    name: 'THE FORBIDDEN ONE',
    faceId: face ? face.id : null,
    mainRole: main,
    secondRole: second,
    powerLevel: power,
    aura,
    clutch,
    chaos: 50,
  };
}

// ---------- The Tower ----------
export const BOSS_EVERY = 5;
export const FUSION_HP = 3.5;     // a fused fighter has 3.5× a normal card's health
export const HEAL_FLOOR = 0.20;   // after a normal floor
export const HEAL_BOSS = 0.25;    // after a boss floor
export const HARD_PL = 6;         // Hard Mode opponents are this much stronger

// Target Power Level for a floor's opponent (one card).
export function floorPower(floor, hard) {
  return Math.min(99, 42 + Math.round(floor * 1.8) + (hard ? HARD_PL : 0));
}

// How many cards the floor sends: past floor 10 the Omega swarms grow.
export function swarmSize(floor) {
  if (floor <= 10) return 1;
  return Math.min(5, 1 + Math.ceil((floor - 10) / 10));
}

export const isBoss = (floor) => floor % BOSS_EVERY === 0;

// Pick the floor's opponents from the roster. rand: a 0–1 random function.
export function floorFoes(floor, hard, roster, rand = Math.random, avoid = new Set()) {
  const size = swarmSize(floor);
  const boss = isBoss(floor);
  // Swarm cards are weaker one by one; bosses are one big card ahead of the curve.
  const target = boss
    ? Math.min(99, floorPower(floor, hard) + 8)
    : Math.max(20, floorPower(floor, hard) - (size - 1) * 9);
  const count = boss ? Math.max(1, size - 1) : size;
  const pool = roster.filter((c) => c.powerLevel && !avoid.has(c.id));
  const near = (w) => pool.filter((c) => Math.abs(c.powerLevel - target) <= w);
  let candidates = near(3);
  if (candidates.length < count * 3) candidates = near(6);
  if (candidates.length < count * 3) candidates = near(12);
  if (candidates.length < count) candidates = pool.slice().sort((a, b) => Math.abs(a.powerLevel - target) - Math.abs(b.powerLevel - target)).slice(0, count * 4);
  const picks = [];
  const bag = candidates.slice();
  while (picks.length < count && bag.length) {
    const i = Math.floor(rand() * bag.length);
    picks.push(bag.splice(i, 1)[0]);
  }
  if (boss) picks.sort((a, b) => b.powerLevel - a.powerLevel);
  return picks;
}

// Bounty for clearing a floor: grows with the floor, doubled on Hard, and half
// again when the opponents' total Power beat yours (an underdog win).
export function bountyFor(floor, hard, fighter, foes) {
  let b = 10 + floor;
  if (isBoss(floor)) b += 15;
  const foePower = foes.reduce((n, c) => n + c.powerLevel, 0);
  const underdog = foePower > fighter.powerLevel;
  if (underdog) b = Math.round(b * 1.5);
  if (hard) b *= 2;
  return { bounty: b, underdog };
}

export function healAfter(floor, hp, maxHp) {
  const share = isBoss(floor) ? HEAL_BOSS : HEAL_FLOOR;
  return Math.min(maxHp, hp + Math.round(maxHp * share));
}

// Titles by best floor, shown on the result and in My Records.
// Simulated medians (Normal): starter build ≈ floor 11, half-maxed ≈ 16,
// maxed ≈ 20; Hard is about 2 floors less.
export const TITLES = [[25, 'IMMORTAL'], [20, 'APEX FUSION'], [15, 'TOWER LORD'], [10, 'ASCENDANT'], [5, 'CONTENDER'], [0, 'RECRUIT']];
export const titleFor = (floor) => TITLES.find(([min]) => floor >= min)[1];

// The fighter as the combat core sees it.
export function fighterFrom(build, face) {
  return {
    id: build.faceId ?? -1,
    name: build.name,
    franchise: face?.franchise || 'anime',
    portrait: !!face?.portrait,
    tags: [],
    series: 'Forbidden Fusion',
    powerLevel: build.powerLevel,
    mainRole: build.mainRole,
    secondRole: build.secondRole,
    aura: build.aura,
    clutch: build.clutch,
    chaos: build.chaos,
    hpMult: FUSION_HP,
  };
}
