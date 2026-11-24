// Combat core: every fight in the game (Forbidden Fusion, Brawl, Dynasty,
// the Fight Lab) runs through here. It only does the math and returns a list
// of events; core/battle-view.js turns those events into the animated fight.
//
// A match is best of 3 rounds. In a round the two sides trade hits turn by
// turn until one side has no card left standing. One-on-one fights are just
// teams of one. Knocked-out cards are replaced by the next card in the lineup.
//
// What each rating does:
//   Power Level  → health and attack (+10 Power ≈ a 10% edge overall)
//   Roles        → the role wheel: main role beating the target's main role
//                  = +16% damage, second role beating it = +8%
//                  (main + second together ≈ +10 Power)
//   Aura         → fills the special-move meter faster, and up to +10% damage
//                  (+15% in the deciding round)
//   Clutch       → chance to survive a knockout hit with 1 health: up to 15%
//                  (20% in the deciding round), once per round
//   Chaos        → how much each hit swings: up to ±8% extra
// The deciding round is any round where a side is one win from the match.

import { FX, elementOf } from './elements.js';

export const ROLES = ['Striker', 'Tank', 'Speedster', 'Mystic', 'Tactician'];

// Approved role wheel: each role beats two and loses to two.
export const BEATS = {
  Striker: ['Mystic', 'Tactician'],
  Mystic: ['Tactician', 'Tank'],
  Tactician: ['Tank', 'Speedster'],
  Tank: ['Speedster', 'Striker'],
  Speedster: ['Striker', 'Mystic'],
};
export const beats = (a, b) => !!a && !!b && BEATS[a]?.includes(b);

// One special move per role. Fires when the Aura meter is full.
// v0.36.0: what a second role adds on its own (small on purpose).
export const SECOND_PERKS = {
  Striker: '+1.5% damage',
  Tank: '1.5% less damage taken',
  Speedster: 'dodges 2% of hits',
  Mystic: 'special moves hit 10% harder',
  Tactician: '+3% damage in a bad matchup',
};

export const SPECIALS = {
  Striker: { name: 'Finisher', text: 'A huge hit for 2× damage.' },
  Tank: { name: 'Iron Wall', text: 'Heals 15% health and halves the next hit taken.' },
  Speedster: { name: 'Blitz', text: 'Two fast hits at 0.7× each.' },
  Mystic: { name: 'Hex', text: 'A 1.3× hit that leaves the Mystic\'s element: Burn, Freeze, Shock or Drain, each taking 2-4% health a turn with its own extra effect.' },
  Tactician: { name: 'Counterplay', text: 'A 1.2× hit that often stuns: the target loses its next turn.' },
};

// ---- Tuning (checked with a 10,000-fight simulation; see README) ----
export const TUNING = {
  power: 1.22 ** 0.1,     // +10 Power ≈ a 22% edge: half on health, half on attack
  baseHp: 2400,           // health at Power 50
  baseAtk: 520,           // attack at Power 50 (about 5 hits to knock out an equal card)
  hitSpread: 0.30,        // every hit varies ±30% before Chaos
  critChance: 0.12,       // a critical hit does 1.5×
  critMult: 1.5,
  tankHp: 1.22,           // Tanks have 22% more health
  speedsterFirst: 0.58,   // Speedsters usually strike first
  finisher: 2.0,
  hex: 1.3,               // v0.34.0: Hex hit (its element effects live in core/elements.js)
  blitz: 0.7,
  tacticianStunChance: 0.9, // Counterplay stuns 90% of the time
  chaosSpread: 0.08,      // Chaos 100 adds up to ±8% more
  mainAdv: 0.16,          // full role edge (main + second) ≈ +10 Power
  secondAdv: 0.08,
  auraDmg: 0.10, auraDmgDeciding: 0.15,
  clutch: 0.15, clutchDeciding: 0.20,
  meterPerAttack: 26,     // + Aura × meterAura
  meterAura: 0.08,
  meterPerHit: 8,
  maxTurns: 80,           // safety: after this, the side with more health % wins
  allyMult: 1.6,
  // v0.36.0: a second role also gives a small passive.
  second: { Striker: 0.015, Tank: 0.015, Speedster: 0.02, Mystic: 0.10, Tactician: 0.03 },          // v0.28.0: an ally's assist hits like 1.6 of their normal attacks
};

// Seeded random numbers, so a fight can be replayed exactly.
export function rng(seed = Date.now()) {
  // mulberry32: good spread even for seeds that are next to each other
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fighterStats(c) {
  const pl = c.powerLevel ?? 50;
  const scale = TUNING.power ** (pl - 50);
  return {
    id: c.id,
    name: c.name,
    powerLevel: pl,
    mainRole: c.mainRole || null,
    secondRole: c.secondRole || null,
    aura: c.aura ?? 50,
    clutch: c.clutch ?? 50,
    chaos: c.chaos ?? 50,
    // hpMult: extra health for special fighters (the Forbidden Fusion fighter)
    maxHp: Math.round(TUNING.baseHp * Math.sqrt(scale) * (c.mainRole === 'Tank' ? TUNING.tankHp : 1) * (c.hpMult || 1)),
    atk: TUNING.baseAtk * Math.sqrt(scale),
    hpMult: c.hpMult || 1,
    // v0.21.0: Forbidden Fusion talents (1 / 0 for everyone else)
    spMult: c.spMult || 1,
    startMeter: c.startMeter || 0,
    // v0.24.0: Forbidden Fusion's second ring
    unbreak: c.unbreak || 0, unbreakHeal: c.unbreakHeal || 0,
    meterMult: c.meterMult || 1, firstSpMult: c.firstSpMult || 1,
    lastStand: c.lastStand || 0,
  };
}

function roleBonus(att, def) {
  let b = 0;
  if (beats(att.mainRole, def.mainRole)) b += TUNING.mainAdv;
  if (beats(att.secondRole, def.mainRole)) b += TUNING.secondAdv;
  return b;
}

// Run a full match. teamA / teamB: arrays of characters (1–5 each).
// Options: bestOf (3 by default; 1 for a single round, used by the Tower),
// startHp (health each of side A's cards starts the first round with, so
// damage can carry from one fight to the next).
// Returns { winner: 'A' | 'B', rounds, events, score: [a, b], endHp }, where
// endHp is side A's health per card when the last round ended.
// v0.28.0: assist = { name, cid, atk, uses } lets an ally jump in for side A
// (Forbidden Fusion allies): one big hit on A's turn, from turn 3, up to `uses` times.
export function runMatch(teamA, teamB, { seed = Date.now(), bestOf = 3, startHp = null, assist = null } = {}) {
  const rand = rng(seed);
  const sides = {
    A: teamA.map(fighterStats),
    B: teamB.map(fighterStats),
  };
  const events = [];
  const score = { A: 0, B: 0 };
  const ally = assist && assist.atk > 0 ? { ...assist, left: assist.uses || 1, last: -99 } : null;
  let round = 0;

  const need = Math.ceil(bestOf / 2);
  events.push({ t: 'match-start', teamA: sides.A, teamB: sides.B, seed, bestOf });

  let endHp = sides.A.map((f) => f.maxHp);
  while (score.A < need && score.B < need) {
    round += 1;
    const deciding = score.A === need - 1 || score.B === need - 1;
    const hp = round === 1 && startHp ? startHp : null;
    const { winner, state } = runRound(sides, round, deciding, rand, events, hp, ally);
    endHp = state.A.lineup.map((f) => f.hp);
    score[winner] += 1;
    events.push({ t: 'round-end', round, winner, score: [score.A, score.B] });
  }
  const winner = score.A === need ? 'A' : 'B';
  events.push({ t: 'match-end', winner, score: [score.A, score.B] });
  return { winner, score: [score.A, score.B], rounds: round, events, endHp };
}

function runRound(sides, round, deciding, rand, events, startHp, ally = null) {
  const state = {};
  for (const s of ['A', 'B']) {
    state[s] = {
      lineup: sides[s].map((f, i) => {
        const hp = s === 'A' && startHp && startHp[i] != null ? Math.max(1, Math.min(f.maxHp, Math.round(startHp[i]))) : f.maxHp;
        return { ...f, hp, meter: f.startMeter || 0, fx: null, guard: false, stunned: false, clutchUsed: false, out: false, saves: f.unbreak || 0, firstSpDone: false };
      }),
      idx: 0,
    };
  }
  const done = (w) => ({ winner: w, state });
  events.push({ t: 'round-start', round, deciding });
  events.push({ t: 'enter', side: 'A', idx: 0, hp: state.A.lineup[0].hp, maxHp: state.A.lineup[0].maxHp });
  events.push({ t: 'enter', side: 'B', idx: 0, hp: state.B.lineup[0].hp, maxHp: state.B.lineup[0].maxHp });

  // Speedsters usually strike first; otherwise a coin flip.
  const aSpeed = state.A.lineup[0].mainRole === 'Speedster';
  const bSpeed = state.B.lineup[0].mainRole === 'Speedster';
  const p = TUNING.speedsterFirst;
  let turnSide = aSpeed && !bSpeed ? (rand() < p ? 'A' : 'B') : bSpeed && !aSpeed ? (rand() < p ? 'B' : 'A') : (rand() < 0.5 ? 'A' : 'B');
  let turn = 0;

  const active = (s) => state[s].lineup[state[s].idx];
  const other = (s) => (s === 'A' ? 'B' : 'A');

  while (true) {
    turn += 1;
    const side = turnSide;
    const foeSide = other(side);
    const me = active(side);
    const foe = active(foeSide);
    events.push({ t: 'turn', turn, side });

    // An ally jumps in (side A only), from turn 3, at least 4 turns apart.
    if (ally && side === 'A' && ally.left > 0 && turn >= 3 && turn - ally.last >= 4 && !foe.out) {
      ally.left -= 1; ally.last = turn;
      const dmg = Math.max(1, Math.round(ally.atk * TUNING.allyMult * (1 + (rand() * 2 - 1) * TUNING.hitSpread)));
      events.push({ t: 'assist', side: 'A', name: ally.name, cid: ally.cid ?? null, dmg });
      if (applyDamage(state, foeSide, foe, dmg, deciding, rand, events, 'hit') && nextCard(state, foeSide, events)) return done(side);
      if (foe.out) { turnSide = foeSide; continue; }
    }

    // v0.34.0: a Mystic's element ticks at the start of the affected card's turn.
    if (me.fx) {
      const d = FX[me.fx.el];
      const dmg = Math.max(1, Math.round((me.maxHp / (me.hpMult || 1)) * d.pct));
      const el = me.fx.el;
      me.fx.turns -= 1;
      const ended = me.fx.turns <= 0;
      if (ended) me.fx = null;
      if (d.meter) { me.meter = Math.max(0, me.meter - d.meter); events.push({ t: 'meter', side, value: Math.round(me.meter) }); }
      const ko = applyDamage(state, side, me, dmg, deciding, rand, events, el);
      // Drain heals whoever is fighting for the Mystic's side.
      if (el === 'drain') {
        const src = active(foeSide);
        const amt = src && !src.out ? Math.min(src.maxHp - src.hp, Math.round(dmg * (d.heal || 1))) : 0;
        if (amt > 0) { src.hp += amt; events.push({ t: 'heal', side: foeSide, heal: amt, hp: src.hp }); }
      }
      if (ko) {
        if (nextCard(state, side, events)) return done(foeSide);
        turnSide = foeSide;
        continue;
      }
      if (ended) events.push({ t: 'status-end', side, status: el });
    }

    if (me.stunned) {
      me.stunned = false;
      events.push({ t: 'stunned', side });
    } else {
      const auraBoost = (deciding ? TUNING.auraDmgDeciding : TUNING.auraDmg) * (me.aura / 100);
      const base = me.atk * (1 + roleBonus(me, foe) + auraBoost) * (me.fx?.el === 'frost' ? 1 - FX.frost.soften : 1);
      const swing = () => {
        const spread = TUNING.hitSpread + TUNING.chaosSpread * (me.chaos / 100);
        return 1 + (rand() * 2 - 1) * spread;
      };
      const special = me.meter >= 100 && me.mainRole ? SPECIALS[me.mainRole] : null;
      if (special) me.meter = 0;
      else me.meter = Math.min(100, me.meter + (TUNING.meterPerAttack + me.aura * TUNING.meterAura) * (me.meterMult || 1));
      const domain = special && !me.firstSpDone && (me.firstSpMult || 1) > 1 ? me.firstSpMult : 1;
      if (special) me.firstSpDone = true;
      const stand = me.lastStand && me.hp < me.maxHp * 0.25 ? 1 + me.lastStand : 1;
      const adv = beats(me.mainRole, foe.mainRole);
      const perk = (me.secondRole === 'Striker' ? 1 + TUNING.second.Striker : 1)
        * (me.secondRole === 'Tactician' && beats(foe.mainRole, me.mainRole) ? 1 + TUNING.second.Tactician : 1)
        * (foe.secondRole === 'Tank' ? 1 - TUNING.second.Tank : 1);

      const hit = (mult, extra = {}) => {
        const crit = rand() < TUNING.critChance;
        let dmg = Math.max(1, Math.round(base * mult * perk * (special ? (me.spMult || 1) * domain * (me.secondRole === 'Mystic' ? 1 + TUNING.second.Mystic : 1) : 1) * stand * swing() * (crit ? TUNING.critMult : 1)));
        if (domain > 1) extra.domain = true;
        if (stand > 1) extra.lastStand = true;
        if (crit) extra.crit = true;
        if (foe.guard) { dmg = Math.round(dmg / 2); foe.guard = false; extra.guarded = true; }
        if (foe.secondRole === 'Speedster' && rand() < TUNING.second.Speedster) { events.push({ t: 'attack', side, move: special ? special.name : 'Strike', special: !!special, role: me.mainRole, adv, dmg: 0, dodged: true, ...extra }); return false; }
        events.push({ t: 'attack', side, move: special ? special.name : 'Strike', special: !!special, role: me.mainRole, adv, dmg, ...extra });
        return applyDamage(state, foeSide, foe, dmg, deciding, rand, events, 'hit');
      };

      let ko = false;
      if (!special) {
        ko = hit(1);
      } else if (me.mainRole === 'Striker') {
        ko = hit(TUNING.finisher);
      } else if (me.mainRole === 'Speedster') {
        ko = hit(TUNING.blitz, { first: true });
        if (!ko) ko = hit(TUNING.blitz, { second: true });
      } else if (me.mainRole === 'Mystic') {
        ko = hit(TUNING.hex);
        if (!ko) {
          const el = elementOf(me);
          const turns = FX[el].turns;
          foe.fx = { el, turns };
          events.push({ t: 'status', side: foeSide, status: el, turns });
        }
      } else if (me.mainRole === 'Tactician') {
        ko = hit(1.2);
        if (!ko && rand() < TUNING.tacticianStunChance) { foe.stunned = true; events.push({ t: 'status', side: foeSide, status: 'stun', turns: 1 }); }
      } else if (me.mainRole === 'Tank') {
        // 15% of a normal card's health (extra health from hpMult doesn't grow the heal)
        const heal = Math.min(me.maxHp - me.hp, Math.round((me.maxHp / (me.hpMult || 1)) * 0.15));
        me.hp += heal;
        me.guard = true;
        events.push({ t: 'attack', side, move: special.name, special: true, role: 'Tank', adv: false, dmg: 0, heal, hp: me.hp });
        events.push({ t: 'status', side, status: 'guard', turns: 1 });
      }
      if (!foe.out) foe.meter = Math.min(100, foe.meter + TUNING.meterPerHit);
      events.push({ t: 'meter', side, value: Math.round(me.meter) });

      if (ko && nextCard(state, foeSide, events)) return done(side);
    }

    if (turn >= TUNING.maxTurns) {
      const pct = (s) => state[s].lineup.reduce((n, f) => n + (f.out ? 0 : f.hp / f.maxHp), 0);
      const w = pct('A') >= pct('B') ? 'A' : 'B';
      events.push({ t: 'timeout', winner: w });
      return done(w);
    }
    turnSide = foeSide;
  }
}

// Returns true if the card was knocked out.
function applyDamage(state, side, f, dmg, deciding, rand, events, kind) {
  // Unbreakable: survive a knockout with 1 health (plus a little back).
  if (dmg >= f.hp && f.saves > 0) {
    f.saves -= 1;
    f.hp = Math.min(f.maxHp, 1 + Math.round(f.maxHp * (f.unbreakHeal || 0)));
    events.push({ t: 'damage', side, dmg, hp: f.hp, kind });
    events.push({ t: 'clutch', side, unbreakable: true });
    return false;
  }
  if (dmg >= f.hp && !f.clutchUsed) {
    const chance = (deciding ? TUNING.clutchDeciding : TUNING.clutch) * (f.clutch / 100);
    if (rand() < chance) {
      f.clutchUsed = true;
      f.hp = 1;
      events.push({ t: 'damage', side, dmg, hp: f.hp, kind });
      events.push({ t: 'clutch', side });
      return false;
    }
  }
  f.hp = Math.max(0, f.hp - dmg);
  events.push({ t: 'damage', side, dmg, hp: f.hp, kind });
  if (f.hp === 0) {
    f.out = true;
    events.push({ t: 'ko', side, idx: state[side].idx });
    return true;
  }
  return false;
}

// Bring in the next card. Returns true if the side has nobody left.
function nextCard(state, side, events) {
  const s = state[side];
  s.idx += 1;
  if (s.idx >= s.lineup.length) return true;
  const f = s.lineup[s.idx];
  events.push({ t: 'enter', side, idx: s.idx, hp: f.hp, maxHp: f.maxHp });
  return false;
}
