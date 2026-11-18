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
// Roles lock once your fighter is saved. Changing them costs Gym points,
// paid for good out of your Bounty (v0.15.0).
export const ROLE_CHANGE = { main: 10, second: 5 };
export function roleChangeCost(saved, draft, locked) {
  if (!locked || !saved) return 0;
  return (draft.mainRole !== saved.mainRole ? ROLE_CHANGE.main : 0) + ((draft.secondRole || null) !== (saved.secondRole || null) ? ROLE_CHANGE.second : 0);
}
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
  return applyTree({
    tree: { power: 3, aura: 2, clutch: 1 },  // 21 + 4 + 2 = 27 of the 30 starting points
    faceId: face ? face.id : null,
    mainRole: main,
    secondRole: second,
    powerLevel: power,
    aura,
    clutch,
    chaos: 50,
    name: 'THE FORBIDDEN ONE',
  });
}

// ---------- The Talent Tree (v0.21.0, replaces the Gym's training) ----------
// Like The Division 2: four branches around a core. Every node has tiers;
// each tier costs points. You earn points by clearing floors (1 a floor, 3 on
// a boss floor) and can spend them between floors. What you buy during a
// climb is locked in until the climb ends; between climbs you can respec
// for free. The tree is kept per save file.
export const TREE = [
  { id: 'power', name: 'Power Level', branch: 'POWER', icon: '💪', tiers: 7, cost: 7, per: 7, x: 30, y: 30,
    text: (n) => `+${n * 7} Power Level. More health and harder hits.` },
  { id: 'titan', name: 'Titan Frame', branch: 'POWER', icon: '🛡️', tiers: 3, cost: 4, per: 0.25, x: 13, y: 12, req: ['power', 3],
    text: (n) => `+${Math.round(n * 0.25 / FUSION_HP * 100)}% max health.` },
  { id: 'aura', name: 'Aura', branch: 'AURA', icon: '✨', tiers: 5, cost: 2, per: 20, x: 70, y: 30,
    text: (n) => `+${n * 20} Aura. Your special fills faster and hits harder.` },
  { id: 'signature', name: 'Signature Move', branch: 'AURA', icon: '🔥', tiers: 3, cost: 4, per: 0.1, x: 87, y: 12, req: ['aura', 2],
    text: (n) => `+${n * 10}% special move damage.` },
  { id: 'clutch', name: 'Clutch', branch: 'CLUTCH', icon: '🎯', tiers: 5, cost: 2, per: 20, x: 30, y: 70,
    text: (n) => `+${n * 20} Clutch. More chances to survive a knockout with 1 health.` },
  { id: 'secondWind', name: 'Second Wind', branch: 'CLUTCH', icon: '❤️', tiers: 3, cost: 3, per: 0.05, x: 13, y: 88, req: ['clutch', 2],
    text: (n) => `Heal ${n * 5}% more after every floor.` },
  { id: 'bounty', name: 'Bounty Hunter', branch: 'HUNTER', icon: '💰', tiers: 3, cost: 3, per: 0.1, x: 70, y: 70,
    text: (n) => `+${n * 10}% Bounty from every floor.` },
  { id: 'momentum', name: 'Momentum', branch: 'HUNTER', icon: '⚡', tiers: 3, cost: 3, per: 20, x: 87, y: 88, req: ['bounty', 1],
    text: (n) => `Start every fight with your special meter ${n * 20}% full.` },
];
export const node = (id) => TREE.find((n) => n.id === id);
export const TREE_MAX = TREE.reduce((n, x) => n + x.tiers * x.cost, 0); // 117
export const POINTS_PER_FLOOR = 1;
export const POINTS_PER_BOSS = 5;
export const pointsForFloor = (floor) => (isBoss(floor) ? POINTS_PER_BOSS : POINTS_PER_FLOOR);
export const treeCost = (tree = {}) => TREE.reduce((n, x) => n + (tree[x.id] || 0) * x.cost, 0);
export const tierOf = (tree, id) => (tree && tree[id]) || 0;
export function canBuy(tree, id, left) {
  const n = node(id); const t = tierOf(tree, id);
  if (!n || t >= n.tiers) return { ok: false, why: 'Maxed' };
  if (n.req && tierOf(tree, n.req[0]) < n.req[1]) return { ok: false, why: `Needs ${node(n.req[0]).name} tier ${n.req[1]}` };
  if (left < n.cost) return { ok: false, why: `Costs ${n.cost} points` };
  return { ok: true };
}
// Write the tree's stats into the build (Power, Aura, Clutch and the talents).
export function applyTree(build) {
  const t = build.tree || {};
  build.powerLevel = Math.min(99, 50 + tierOf(t, 'power') * 7);
  build.aura = Math.min(100, tierOf(t, 'aura') * 20);
  build.clutch = Math.min(100, tierOf(t, 'clutch') * 20);
  build.talents = { hp: tierOf(t, 'titan') * 0.25, sp: tierOf(t, 'signature') * 0.1, heal: tierOf(t, 'secondWind') * 0.05, bounty: tierOf(t, 'bounty') * 0.1, meter: tierOf(t, 'momentum') * 20 };
  return build;
}
// An old Gym build turned into tree tiers (points that don't fit stay unspent).
export function treeFromBuild(b) {
  return { power: Math.min(7, Math.floor((b.powerLevel - 50) / 7)), aura: Math.min(5, Math.floor((b.aura || 0) / 20)), clutch: Math.min(5, Math.floor((b.clutch || 0) / 20)) };
}

// ---------- The Tower ----------
export const BOSS_EVERY = 10; // v0.23.0 (Khalil): bosses every 10th floor
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

export function healAfter(floor, hp, maxHp, extra = 0) {
  const share = (isBoss(floor) ? HEAL_BOSS : HEAL_FLOOR) + extra;
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
    hpMult: FUSION_HP + (build.talents?.hp || 0),
    spMult: 1 + (build.talents?.sp || 0),
    startMeter: build.talents?.meter || 0,
  };
}
