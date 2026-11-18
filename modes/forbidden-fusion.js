// FORBIDDEN FUSION — Forge · Tower · Legend.
// Build one fighter in the Gym: any character as its face, a main and second
// role (the role picks the special move), and a point budget spent on Power,
// Aura and Clutch, with Chaos as a free dial. Then climb the Tower: one
// single-round fight per floor, with health carrying from floor to floor
// (20% back after a floor, 25% after a boss). Every 5th floor is a boss; past
// floor 10 the Omega swarms send more cards at once. Each floor cleared pays
// Bounty, more for underdog wins and double on Hard, and Bounty grows the
// Gym budget for good. The Hall of Fame keeps the ten best climbs.
//
// Rules and numbers live in fusion-rules.js (shared with the balance sim).

import { h, fill, toast, avatar, icon, sheet, closeSheet, confirmSheet } from '../core/ui.js';
import { profile } from '../core/profile.js';
import { records } from '../core/records.js';
import { store } from '../core/store.js';
import { characters } from '../core/characters.js';
import { characterCard, roleChips } from '../core/card.js';
import { modeHeader, howToPlay } from '../core/mode-kit.js';
import { go } from '../core/router.js';
import { shareText } from '../core/grid-board.js';
import { ROLES, SPECIALS, BEATS, fighterStats } from '../core/combat.js';
import { playMatch } from '../core/battle-view.js';
import {
  GYM, START_BUDGET, ROLE_CHANGE, roleChangeCost, starterBuild, fighterFrom,
  TREE, TREE_MAX, node, treeCost, tierOf, canBuy, applyTree, treeFromBuild, pointsForFloor, POINTS_PER_BOSS,
  floorFoes, floorPower, swarmSize, isBoss, bountyFor, healAfter, titleFor, HEAL_FLOOR, HEAL_BOSS,
} from './fusion-rules.js';
import * as FP from './fusion-phone.js';
import { sfx } from '../core/sfx.js';
import { createPhone } from '../core/phone-ui.js';
import * as PD from '../core/phone-dating.js';

const OLD_DATA_KEY = 'fusion';                 // before save slots (moved into slot 1)
const OLD_RUN_KEY = 'save:forbidden-fusion';
const SLOTS = 5;
const dataKey = (n) => `fusion:slot${n}`;      // the build, lifetime Bounty, Hall of Fame, phone
const runKey = (n) => `fusion:run:slot${n}`;   // the climb in progress
const NAME_MAX = 20;
const HOF_SIZE = 10;
const fmt = (n) => Math.round(n).toLocaleString();

const help = howToPlay('forbidden-fusion', 'Forbidden Fusion', [
  'Forge one fighter in the Gym. Pick any character as its face, give it a name, and choose a main role and a second role.',
  'Your main role sets your special move: Striker Finisher, Tank Iron Wall, Speedster Blitz, Mystic Hex or Tactician Counterplay. The role wheel still counts in every fight.',
  'The Talent Tree: four branches (Power, Aura, Clutch, Hunter) around a core. Every node has tiers; spend talent points to raise them. You start with 30 points and earn 1 a floor (3 on a boss floor).',
  'Spend points between floors. Anything you buy during a climb is locked in until the climb ends. Between climbs you can respec for free.',
  'Climb the Tower: one fight per floor. A fused fighter has 3.5 times a normal card\'s health, and it carries over. You get 20% back after each floor and 25% after a boss.',
  'Every 5th floor is a boss. Past floor 10 the Omega swarms send two, then three cards at you.',
  'Clearing floors earns Bounty: more as you climb, half again for an underdog win, and double on Hard. Bounty is your score and your Hall of Fame.',
  'Roles lock when you save your fighter. Changing the main role later costs 10 talent points and the second role 5, for good.',
  'Your phone: after floor 1, people text you. Trash talkers you answer hostile become your next opponent (a callout, Bounty ×1.5); answer humble and the climb goes on as normal. Bosses test you or send their crew, sponsors offer deals, and your trainer checks in when you\'re hurt. Open it with the Open phone button or the P key (change the key in the phone\'s Settings).',
  'After you beat someone, they may text you. Gloat for followers, but they come back for a rematch 3 floors later (+3 Power, Bounty ×1.5). Show respect and they send a tip: +4 Aura next floor.',
  'Matchup, the dating app: like profiles, chat, and ask your matches out. A date is +5 Aura for your next floor (one per floor).',
  'Followers stay with you between climbs: every 2,500 is +1 Aura in the Tower, up to +10.',
  'Five save files: each has its own fighter, Bounty, Hall of Fame, followers and phone.',
  'Lose a fight and the climb ends. Your best climbs go into the Hall of Fame.',
]);

let data = null;     // { build, lifetimeBounty, hof }
let run = null;      // the climb in progress, or null
let lastRun = null;  // the climb that just ended (for the result screen)
let view = 'slots';
let slot = null;     // which save slot (1-5)

// The one save from before slots becomes slot 1.
async function migrateOld() {
  const old = await store.get(OLD_DATA_KEY, null);
  if (!old) return;
  if (!(await store.get(dataKey(1), null))) {
    await store.set(dataKey(1), old);
    const oldRun = await store.get(OLD_RUN_KEY, null);
    if (oldRun) await store.set(runKey(1), oldRun);
  }
  await store.remove(OLD_DATA_KEY); await store.remove(OLD_RUN_KEY);
}
async function loadSlot(n) {
  slot = n;
  data = await store.get(dataKey(n), null);
  if (!data) {
    const face = characters.get(profile.value.iconId);
    data = { build: starterBuild(face), lifetimeBounty: 0, hof: [], createdAt: Date.now(), points: 0, rolePaid: 0 };
    await store.set(dataKey(n), data);
  }
  migrateTree(data);
  run = await store.get(runKey(n), null);
  lastRun = null;
  return data;
}
const saveData = () => (slot ? store.set(dataKey(slot), data) : null);
const saveRun = () => (!slot ? null : run ? store.set(runKey(slot), run) : store.remove(runKey(slot)));
const bestFloor = (d) => Math.max(0, ...((d?.hof || []).map((e) => e.floor || 0)), d?.best || 0);

const faceOf = (build) => (build.faceId != null ? characters.get(build.faceId) : null);
const fighterOf = (build) => fighterFrom(build, faceOf(build));
// v0.21.0: talent points. 30 to start, plus what you earn clearing floors,
// minus what role changes cost.
const budget = () => START_BUDGET + (data.points || 0) - (data.rolePaid || 0);
const pointsLeft = () => budget() - treeCost(data.build.tree);
// Older saves: the Gym build becomes tree tiers, and Bounty becomes points (1 per 100).
function migrateTree(d) {
  if (d.build.tree) { applyTree(d.build); return; }
  d.points = Math.floor((d.lifetimeBounty || 0) / 100);
  d.rolePaid = Math.round((d.spentBounty || 0) / 100);
  d.build.tree = treeFromBuild(d.build);
  applyTree(d.build);
}
const rolesLocked = () => data.locked ?? ((data.lifetimeBounty || 0) > 0 || (data.hof || []).length > 0);

function shuffleSeed() { return Math.floor(Math.random() * 2 ** 31); }

function planFloor(r) {
  const floor = r.floor + 1;
  const avoid = new Set(r.recent || []);
  const roster = characters.list.filter((c) => !c.retired);
  // The phone shapes every floor after the first (callouts, lieutenants, crews, bosses).
  const p = r.phone ? FP.planFor(r, floor) : null;
  let foes; let mod = 0; let mult = 1; let type = null;
  if (p && p.crew) {
    const target = Math.max(20, floorPower(floor, r.hard) - 5);
    foes = roster.filter((c) => c.powerLevel && !avoid.has(c.id) && !p.ids.includes(c.id)).sort((a, b) => Math.abs(a.powerLevel - target) - Math.abs(b.powerLevel - target)).slice(0, 12)
      .sort(() => Math.random() - 0.5).slice(0, 3);
    mult = p.mult; type = 'crew';
  } else if (p && p.ids) {
    foes = p.ids.map((id) => characters.get(id)).filter(Boolean);
    mod = p.mod || 0; mult = p.mult || 1; type = p.type;
  }
  if (!foes || !foes.length) { foes = floorFoes(floor, r.hard, roster, Math.random, avoid); type = null; mod = 0; mult = 1; }
  r.next = { floor, foeIds: foes.map((c) => c.id), seed: shuffleSeed(), mod, mult, type };
  r.recent = [...foes.map((c) => c.id), ...(r.recent || [])].slice(0, 12);
}
// Foe cards with the phone's Power changes (a lieutenant +4, a rattled boss -5).
const foeCards = (r) => r.next.foeIds.map((id) => characters.get(id)).filter(Boolean).map((c) => (r.next.mod ? { ...c, powerLevel: Math.max(20, Math.min(99, c.powerLevel + r.next.mod)) } : c));
const withFollowers = (f, r) => ({ ...f, aura: Math.min(100, (f.aura || 0) + FP.followerAura(r?.phone?.followers ?? data.followers ?? 0) + FP.phoneAura(r)) });

const fmtN = (n) => (n >= 10000 ? `${(n / 1000).toFixed(1)}k` : Math.round(n).toLocaleString());
// Matchup: one date per floor; a date is +5 Aura for the next fight.
const dateCtx = (r) => ({ rand: Math.random, now: r.floor || 0, turn: `f${r.next?.floor ?? r.floor}`, turnLabel: 'floor', where: `floor ${r.floor || 1} of the Tower`, when: 'fight', perk: `+${FP.DATE_AURA} Aura for your next floor` });

function newRun(hard) {
  const build = structuredClone(data.build);
  const maxHp = fighterStats(fighterOf(build)).maxHp;
  const r = { hard, build, floor: 0, hp: maxHp, maxHp, runBounty: 0, underdogWins: 0, bossWins: 0, startedAt: Date.now(), recent: [], phone: FP.newPhone(data.followers || 0), plan: {} };
  planFloor(r);
  return r;
}

export async function render() {
  await profile.update({ lastMode: 'forbidden-fusion' });
  await migrateOld();
  const root = h('section', { class: 'screen mode fusion' });
  let fightView = null;
  const phone = createPhone({
    apps: ['messages', 'dating', 'buzz', 'news', 'deals', 'settings'],
    shortcutWhere: 'Forbidden Fusion',
    getPhone: () => (!data ? null : run?.phone || data.lastPhone || null),
    save: () => { if (run) saveRun(); else if (data) saveData(); },
    widgets: (ph) => [[run ? `F${run.next?.floor ?? run.floor}` : '—', 'FLOOR'], [fmtN(ph?.followers || 0), 'FOLLOWERS'], [`+${FP.followerAura(ph?.followers || 0) + (run ? FP.phoneAura(run) : 0)}`, 'AURA']],
    empty: () => (!data ? 'Pick a save file first.' : run ? 'Clear a floor and your phone lights up.' : 'Start a climb. People will be watching.'),
    dateCtx: () => (run ? dateCtx(run) : null),
    onDate: () => { if (run) { run.dateBoost = { floor: run.next.floor }; saveRun(); if (view === 'tower') drawTower(); } },
    getKey: () => data?.phoneKey || 'p',
    setKey: (k) => { if (data) { data.phoneKey = k; saveData(); } },
    onReply: (key, optionId) => {
      if (!run) return null;
      const line = FP.reply(run, key, optionId, { rand: Math.random, me: run.build.name });
      // A reply can change the very next floor: plan it again.
      if (FP.planFor(run, run.floor + 1) || run.next.type) planFloor(run);
      data.followers = run.phone.followers;
      saveRun(); saveData();
      if (view === 'tower') drawTower();
      return line;
    },
  });
  root._cleanup = () => { closeSheet(); if (fightView) fightView.stop(); phone.destroy(); };

  const header = (sub, onBack) => modeHeader({ title: 'Forbidden Fusion', sub, onHelp: () => help.show(), onBack });

  // ---------- Save slots ----------
  async function drawSlots() {
    view = 'slots';
    data = null; run = null; slot = null; lastRun = null;
    phone.show(false);
    const saves = await Promise.all(Array.from({ length: SLOTS }, (_, k) => Promise.all([store.get(dataKey(k + 1), null), store.get(runKey(k + 1), null)])));
    fill(root,
      header('FORGE · TOWER · LEGEND'),
      h('div', { class: 'ff-slots-wrap' },
        h('p', { class: 'body-text muted' }, `Five save files. Each one has its own fighter, Bounty, Hall of Fame, followers and phone.`),
        h('div', { class: 'dy-slots' }, saves.map(([d, r], k) => {
          const n = k + 1;
          if (!d) {
            return h('div', { class: 'dy-slot dy-panel ff-slot' },
              h('p', { class: 'label-spaced' }, `FILE ${n}`),
              h('p', { class: 'heading' }, 'Empty'),
              h('button', { class: 'btn btn-primary', onClick: async () => { await loadSlot(n); drawLab(); } }, 'New fighter'));
          }
          const f = fighterOf(d.build);
          const best = bestFloor(d);
          return h('div', { class: 'dy-slot dy-panel ff-slot' },
            h('p', { class: 'label-spaced' }, `FILE ${n}`),
            h('div', { class: 'dy-slot-team' }, avatar(f, characters, 'md'), h('div', {},
              h('p', { class: 'heading' }, f.name),
              h('p', { class: 'caption muted' }, `${d.build.mainRole}${d.build.secondRole ? ` / ${d.build.secondRole}` : ''} · ${fmt(d.lifetimeBounty || 0)} Bounty`),
              h('p', { class: 'caption muted' }, `${best ? `Best floor ${best}` : 'No climbs yet'} · ${fmt(d.followers || 0)} followers`),
              r ? h('p', { class: 'caption gold' }, `CLIMB IN PROGRESS · FLOOR ${r.floor + 1}${r.hard ? ' · HARD' : ''}`) : null)),
            h('div', { class: 'btn-row' },
              h('button', { class: 'btn btn-primary', onClick: async () => { await loadSlot(n); drawLab(); } }, 'Continue'),
              h('button', { class: 'btn btn-secondary', onClick: async () => {
                const ok = await confirmSheet({ title: 'DELETE THIS FILE?', message: `${f.name}, ${fmt(d.lifetimeBounty || 0)} Bounty. This can't be undone.`, confirmLabel: 'Delete', danger: true });
                if (ok) { await store.remove(dataKey(n)); await store.remove(runKey(n)); toast('File deleted.'); }
                drawSlots();
              } }, 'Delete')));
        })),
      ),
    );
  }

  // ---------- The Lab (home) ----------
  function drawLab() {
    view = 'lab';
    phone.show(true); phone.refresh();
    const b = data.build;
    const total = budget();
    const spent = treeCost(b.tree);
    const unspent = total - spent;

    const best = bestFloor(data);

    fill(root,
      header(`FILE ${slot} · FORGE · TOWER · LEGEND`, drawSlots),
      h('div', { class: 'ff-lab' },
        h('div', { class: 'ff-hero' },
          characterCard(fighterOf(b), { size: 'lg', highlight: ['powerLevel'] }),
          h('div', { class: 'ff-hero-side' },
            h('p', { class: 'label-spaced' }, 'SPECIAL MOVE'),
            h('p', { class: 'heading' }, SPECIALS[b.mainRole].name),
            h('p', { class: 'caption muted' }, SPECIALS[b.mainRole].text),
            h('p', { class: 'label-spaced ff-gap' }, 'BEATS'),
            h('p', { class: 'caption' }, BEATS[b.mainRole].join(' · ')),
            h('p', { class: 'label-spaced ff-gap' }, 'TALENT POINTS'),
            h('p', {}, h('span', { class: 'stat gold' }, String(spent)), h('span', { class: 'muted' }, ` / ${total}`)),
            unspent > 0 ? h('p', { class: 'ff-unspent' }, `${unspent} point${unspent === 1 ? '' : 's'} to spend`) : null,
          ),
        ),
        h('div', { class: 'ff-bounty panel' },
          h('div', {},
            h('p', { class: 'label-spaced' }, 'LIFETIME BOUNTY'),
            h('p', { class: 'stat' }, fmt(data.lifetimeBounty)),
          ),
          h('p', { class: 'caption muted' }, `Earn 1 talent point a floor and ${POINTS_PER_BOSS} on a boss floor.`),
          best ? h('p', { class: 'caption' }, `Best climb: floor ${best} · ${titleFor(best)}`) : null,
        ),
        run
          ? h('button', { class: 'resume-card', onClick: drawTower },
            h('span', { class: 'label-spaced gold' }, 'CLIMB IN PROGRESS'),
            h('span', { class: 'heading' }, `Continue · Floor ${run.floor + 1}${run.hard ? ' · Hard' : ''}`),
            h('span', { class: 'caption muted' }, `Health ${fmt(run.hp)} / ${fmt(run.maxHp)} · ${fmt(run.runBounty)} Bounty this climb`))
          : h('button', { class: 'btn btn-primary btn-wide ff-climb', onClick: pickDifficulty }, 'Climb the Tower'),
        h('div', { class: 'ff-actions' },
          h('button', { class: `btn ${unspent > 0 ? 'btn-primary' : 'btn-secondary'}`, onClick: () => drawTree() }, `Talent tree${unspent > 0 ? ` · ${unspent}` : ''}`),
          h('button', {
            class: 'btn btn-secondary',
            onClick: () => (run ? toast('Finish or end your climb to change your fighter.') : drawGym()),
          }, icon('edit', 18), 'Fighter'),
          h('button', { class: 'btn btn-secondary', onClick: openHallOfFame }, 'Hall of Fame'),
        ),
      ),
    );
  }

  function pickDifficulty() {
    const choose = async (hard) => {
      closeSheet();
      run = newRun(hard);
      await saveRun();
      drawTower();
    };
    sheet({
      title: 'CLIMB THE TOWER',
      content: h('div', { class: 'diff-list' },
        h('button', { class: 'diff-card', onClick: () => choose(false) },
          h('span', { class: 'diff-top' }, h('span', { class: 'diff-name' }, 'Normal'), h('span', { class: 'diff-mult' }, '1×')),
          h('span', { class: 'diff-text' }, 'The standard climb.')),
        h('button', { class: 'diff-card', onClick: () => choose(true) },
          h('span', { class: 'diff-top' }, h('span', { class: 'diff-name' }, 'Hard'), h('span', { class: 'diff-mult' }, '2×')),
          h('span', { class: 'diff-text' }, 'Every opponent is 6 Power stronger. Double Bounty.')),
      ),
    });
  }

  // ---------- The Talent Tree (v0.21.0) ----------
  let treePick = 'power';
  function drawTree() {
    view = 'tree';
    const b = data.build; const t = b.tree || (b.tree = {});
    const inRun = !!run;
    const total = budget(); const spent = treeCost(t); const left = total - spent;
    const n = node(treePick); const tier = tierOf(t, n.id);
    const chk = canBuy(t, n.id, left);
    const buy = async () => {
      if (!canBuy(t, n.id, pointsLeft()).ok) return;
      t[n.id] = tier + 1;
      applyTree(b);
      if (run) {
        const oldMax = run.maxHp;
        run.build.tree = { ...t }; applyTree(run.build);
        const newMax = fighterStats(fighterOf(run.build)).maxHp;
        if (newMax !== oldMax) { run.maxHp = newMax; run.hp = Math.min(newMax, run.hp + (newMax - oldMax)); }
        await saveRun();
      }
      await saveData();
      sfx.play('correct');
      drawTree();
    };
    const respec = async (all) => {
      if (inRun) { toast('Locked until this climb ends.'); return; }
      if (all) {
        const ok = await confirmSheet({ title: 'RESPEC THE WHOLE TREE?', message: `All ${spent} points come back to spend again. It's free between climbs.`, confirmLabel: 'Respec' });
        if (!ok) return;
        b.tree = {};
      } else {
        // Refund one tier, and anything that needed it.
        t[n.id] = Math.max(0, tier - 1);
        for (const x of TREE) if (x.req && x.req[0] === n.id && (t[n.id] || 0) < x.req[1]) t[x.id] = 0;
      }
      applyTree(b); await saveData(); drawTree();
    };
    const W = 100;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${W}`); svg.setAttribute('class', 'ff-tree-lines'); svg.setAttribute('aria-hidden', 'true');
    for (const x of TREE) {
      const from = x.req ? node(x.req[0]) : { x: 50, y: 50 };
      const on = x.req ? tierOf(t, x.req[0]) >= x.req[1] : true;
      const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      Object.entries({ x1: from.x, y1: from.y, x2: x.x, y2: x.y }).forEach(([k, v]) => l.setAttribute(k, v));
      l.setAttribute('class', `ff-tline${on ? ' is-on' : ''}${tierOf(t, x.id) ? ' is-bought' : ''}`);
      svg.append(l);
    }
    const nodeEl = (x) => {
      const tr = tierOf(t, x.id); const locked = x.req && tierOf(t, x.req[0]) < x.req[1];
      const can = canBuy(t, x.id, left).ok;
      return h('button', {
        class: `ff-tnode br-${x.branch.toLowerCase()}${tr ? ' is-bought' : ''}${tr >= x.tiers ? ' is-max' : ''}${locked ? ' is-locked' : ''}${can ? ' is-can' : ''}${treePick === x.id ? ' is-pick' : ''}`,
        style: `left:${x.x}%;top:${x.y}%`, 'aria-label': `${x.name}, tier ${tr} of ${x.tiers}${locked ? ', locked' : ''}`,
        onClick: () => { treePick = x.id; drawTree(); },
      },
        h('span', { class: 'ff-tpips', 'aria-hidden': 'true' }, Array.from({ length: x.tiers }, (_, i) => h('i', { class: i < tr ? 'on' : '' }))),
        h('span', { class: 'ff-thex' }, h('span', { class: 'ff-ticon' }, locked ? '🔒' : x.icon)),
        h('span', { class: 'ff-tname' }, x.name));
    };
    fill(root,
      header(inRun ? `TALENT TREE · FLOOR ${run.floor}` : 'TALENT TREE', () => (inRun ? drawTower() : drawLab())),
      h('div', { class: 'ff-tree-wrap' },
        h('div', { class: 'ff-tree-board' }, svg,
          h('div', { class: 'ff-tcore' }, (() => { const f = fighterOf(b); const face = faceOf(b); return face ? avatar(face, characters, 'md') : h('span', { class: 'avatar avatar-md fr-anime' }, 'FF'); })(), h('p', { class: 'ff-tcore-name' }, b.name), h('p', { class: 'ff-tcore-n' }, `${spent}/${TREE_MAX}`), h('p', { class: 'caption muted' }, `PL ${b.powerLevel} · AURA ${b.aura} · CLUTCH ${b.clutch}`)),
          ...TREE.map(nodeEl),
          ['POWER', 'AURA', 'CLUTCH', 'HUNTER'].map((br, i) => h('span', { class: `ff-tbranch br-${br.toLowerCase()}`, style: `left:${[22, 78, 22, 78][i]}%;top:${[45, 45, 55, 55][i]}%` }, br))),
        h('aside', { class: 'ff-tdetail panel' },
          h('div', { class: 'ff-tdetail-head' }, h('span', { class: `ff-thex is-sm br-${n.branch.toLowerCase()}` }, h('span', { class: 'ff-ticon' }, n.icon)),
            h('div', {}, h('p', { class: 'heading' }, `${n.name} · Tier ${tier}/${n.tiers}`), h('p', { class: 'caption muted' }, `${n.branch} branch`))),
          h('p', { class: 'label-spaced' }, 'NOW'),
          h('p', { class: 'body-text' }, tier ? n.text(tier) : 'Nothing yet.'),
          tier < n.tiers ? h('p', { class: 'label-spaced' }, 'NEXT TIER') : null,
          tier < n.tiers ? h('p', { class: 'body-text' }, n.text(tier + 1)) : h('p', { class: 'caption gold' }, 'MAXED'),
          n.req ? h('p', { class: `caption ${tierOf(t, n.req[0]) >= n.req[1] ? 'win' : 'loss'}` }, `Needs ${node(n.req[0]).name} tier ${n.req[1]}`) : null,
          tier < n.tiers ? h('p', { class: 'ff-tcost' }, 'Cost to upgrade ', h('b', { class: 'gold' }, String(n.cost))) : null,
          h('div', { class: 'ff-tpoints' }, h('span', { class: 'label-spaced' }, 'AVAILABLE POINTS'), h('span', { class: 'stat gold' }, String(left))),
          h('button', { class: 'btn btn-primary btn-wide', disabled: !chk.ok, onClick: buy }, chk.ok ? `Upgrade · ${n.cost}` : chk.why),
          inRun ? h('p', { class: 'caption muted' }, '🔒 You are mid-climb: upgrades are locked in until the climb ends.') : h('div', { class: 'btn-row' },
            h('button', { class: 'btn btn-secondary btn-sm', disabled: !tier, onClick: () => respec(false) }, 'Respec this node'),
            h('button', { class: 'btn btn-secondary btn-sm', disabled: !spent, onClick: () => respec(true) }, 'Respec all')),
          h('p', { class: 'caption muted' }, `Earn 1 point a floor, ${POINTS_PER_BOSS} on a boss floor. ${budget()} earned on this file.`),
          inRun ? h('button', { class: 'btn btn-secondary btn-wide', onClick: drawTower }, 'Back to the Tower') : null)),
    );
  }

  // ---------- The Gym ----------
  function drawGym() {
    view = 'gym';
    const draft = structuredClone(data.build);
    const total = budget();

    const nameInput = h('input', {
      class: 'input', id: 'ff-name', maxlength: String(NAME_MAX), autocomplete: 'off', spellcheck: 'false',
      value: draft.name, 'aria-label': 'Fighter name',
    });
    nameInput.addEventListener('input', () => { draft.name = nameInput.value.toUpperCase().slice(0, NAME_MAX); });

    const body = h('div', { class: 'ff-gym' });
    const pointsEl = h('span', { class: 'stat gold' });
    const preview = h('div', { class: 'ff-preview' });

    function draw() {
      if (document.activeElement !== nameInput) nameInput.value = draft.name;
      const charge = roleChangeCost(data.build, draft, rolesLocked());
      const left = total - treeCost(draft.tree) - charge;
      pointsEl.textContent = String(left);
      preview.replaceChildren(characterCard(fighterOf(draft), { size: 'md' }));
      const face = faceOf(draft);

      fill(body,
        h('section', { class: 'panel ff-sec' },
          h('h3', { class: 'label-spaced set-title' }, 'NAME & FACE'),
          h('label', { class: 'field-label', for: 'ff-name' }, 'Fighter name'),
          nameInput,
          h('div', { class: 'ff-face' },
            face ? avatar(face, characters, 'md') : h('span', { class: 'avatar avatar-md fr-anime' }, 'TF'),
            h('span', { class: 'pick-text' },
              h('span', { class: 'pick-name' }, face ? face.name : 'No face yet'),
              h('span', { class: 'pick-series' }, face ? `Face only: ${face.series}. Stats come from your build.` : 'Any character can be the face.'),
            ),
            h('button', { class: 'btn btn-secondary', onClick: () => pickFace(draft, draw) }, face ? 'Change' : 'Pick'),
          ),
        ),
        h('section', { class: 'panel ff-sec' },
          h('h3', { class: 'label-spaced set-title' }, 'MAIN ROLE'),
          h('p', { class: 'caption muted' }, 'Sets your special move. The role wheel gives +16% damage against the roles yours beats.'),
          rolesLocked() ? h('p', { class: 'ff-lock' }, `🔒 Roles are locked. Changing your main role costs ${ROLE_CHANGE.main} talent points and your second role ${ROLE_CHANGE.second}, for good.${charge ? ` This change: ${charge} points.` : ''}`)
            : h('p', { class: 'ff-lock' }, `Pick carefully: roles lock when you save. After that, changes cost ${ROLE_CHANGE.main} points (main) and ${ROLE_CHANGE.second} (second).`),
          h('div', { class: 'ff-roles', role: 'radiogroup', 'aria-label': 'Main role' }, ROLES.map((r) => h('button', {
            class: `ff-role role-${r.toLowerCase()}${draft.mainRole === r ? ' is-on' : ''}`,
            role: 'radio', 'aria-checked': draft.mainRole === r ? 'true' : 'false',
            onClick: () => { draft.mainRole = r; if (draft.secondRole === r) draft.secondRole = null; draw(); },
          }, h('span', { class: 'ff-role-name' }, r), h('span', { class: 'ff-role-move' }, SPECIALS[r].name)))),
          h('p', { class: 'caption' }, `${SPECIALS[draft.mainRole].name}: ${SPECIALS[draft.mainRole].text} Beats ${BEATS[draft.mainRole].join(' and ')}.`),
          h('h3', { class: 'label-spaced set-title ff-gap' }, 'SECOND ROLE'),
          h('p', { class: 'caption muted' }, 'Adds +8% damage against the roles it beats.'),
          h('div', { class: 'ff-roles is-second', role: 'radiogroup', 'aria-label': 'Second role' },
            [null, ...ROLES.filter((r) => r !== draft.mainRole)].map((r) => h('button', {
              class: `ff-role${r ? ` role-${r.toLowerCase()}` : ''}${draft.secondRole === r ? ' is-on' : ''}`,
              role: 'radio', 'aria-checked': draft.secondRole === r ? 'true' : 'false',
              onClick: () => { draft.secondRole = r; draw(); },
            }, h('span', { class: 'ff-role-name' }, r || 'None')))),
        ),
        h('section', { class: 'panel ff-sec' },
          h('div', { class: 'ff-points' },
            h('h3', { class: 'label-spaced set-title' }, 'STYLE'),
            h('span', {}, h('span', { class: 'label-spaced' }, 'TALENT POINTS LEFT '), pointsEl),
          ),
          h('p', { class: 'caption muted' }, 'Power, Aura and Clutch now come from the Talent Tree.'),
          stepper('chaos', 'Chaos', GYM.chaos, 'Free. Higher Chaos makes every hit swing wider.', draft, left, draw),
        ),
      );
    }

    async function save() {
      draft.name = (draft.name || '').trim().replace(/\s+/g, ' ').slice(0, NAME_MAX) || 'THE FORBIDDEN ONE';
      const charge = roleChangeCost(data.build, draft, rolesLocked());
      if (treeCost(draft.tree) + charge > total) { toast(`The ${charge}-point role change costs more talent points than you have free. Respec your tree first.`); return; }
      if (charge) {
        const ok = await confirmSheet({ title: 'CHANGE ROLES?', message: `This costs ${charge} talent points for good. Your total drops from ${total} to ${total - charge}.`, confirmLabel: `Pay ${charge} points` });
        if (!ok) return;
        data.rolePaid = (data.rolePaid || 0) + charge;
      }
      data.locked = true;
      data.build = draft;
      await saveData();
      toast(`${draft.name} is ready.`);
      drawLab();
    }

    fill(root,
      header('YOUR FIGHTER', () => drawLab()),
      h('div', { class: 'ff-gym-wrap' }, preview, body),
      h('div', { class: 'ff-gym-bar' },
        h('button', { class: 'btn btn-secondary', onClick: () => drawLab() }, 'Cancel'),
        h('button', { class: 'btn btn-primary', onClick: save }, 'Save fighter'),
      ),
    );
    draw();
  }

  function stepper(key, label, rule, hint, draft, left, redraw) {
    const v = draft[key];
    const canUp = v + rule.step <= rule.max && rule.per <= left;
    const canDown = v - rule.step >= rule.min;
    const change = (d) => { draft[key] = Math.max(rule.min, Math.min(rule.max, v + d * rule.step)); redraw(); };
    return h('div', { class: 'ff-step' },
      h('span', { class: 'ff-step-text' }, h('span', { class: 'heading' }, label), h('span', { class: 'caption muted' }, hint)),
      h('span', { class: 'ff-step-ctrl' },
        h('button', { class: 'icon-btn ff-step-btn', 'aria-label': `Lower ${label}`, disabled: !canDown, onClick: () => change(-1) }, icon('minus', 18)),
        h('span', { class: 'ff-step-val', 'aria-live': 'polite' }, String(v)),
        h('button', { class: 'icon-btn ff-step-btn', 'aria-label': `Raise ${label}`, disabled: !canUp, onClick: () => change(1) }, icon('plus', 18)),
      ),
    );
  }

  function pickFace(draft, redraw) {
    const search = h('input', {
      class: 'input', type: 'search', autocomplete: 'off', spellcheck: 'false',
      placeholder: 'Search a hero or villain', 'aria-label': 'Search characters',
    });
    const results = h('ul', { class: 'pick-list', role: 'listbox', 'aria-label': 'Characters' });
    const count = h('p', { class: 'caption muted', 'aria-live': 'polite' });
    const draw = () => {
      const list = characters.search(search.value, 60);
      results.replaceChildren(...list.map((c) => h('li', {},
        h('button', {
          class: `pick-row${c.id === draft.faceId ? ' is-chosen' : ''}`,
          role: 'option', 'aria-selected': c.id === draft.faceId ? 'true' : 'false',
          onClick: () => {
            const wasDefault = !draft.name || draft.name === 'THE FORBIDDEN ONE' || (faceOf(draft) && draft.name === faceOf(draft).name.toUpperCase());
            draft.faceId = c.id;
            if (wasDefault) draft.name = c.name.toUpperCase().slice(0, NAME_MAX);
            closeSheet();
            redraw();
          },
        },
          avatar(c, characters, 'sm'),
          h('span', { class: 'pick-text' },
            h('span', { class: 'pick-name' }, c.name, c.label ? h('span', { class: 'pick-label' }, ` · ${c.label}`) : null),
            h('span', { class: 'pick-series' }, c.series),
          ),
          c.id === draft.faceId ? h('span', { class: 'pick-check' }, icon('check', 18)) : null,
        ),
      )));
      count.textContent = list.length ? '' : 'No characters match that search.';
    };
    search.addEventListener('input', draw);
    sheet({
      title: 'PICK A FACE',
      wide: true,
      content: h('div', { class: 'picker' },
        h('p', { class: 'caption muted' }, 'The face is the look and the name tag. Your stats come from the Gym.'),
        h('div', { class: 'search-wrap' }, icon('search', 18), search),
        count,
        results,
      ),
    });
    draw();
    search.focus();
  }

  // ---------- The Tower ----------
  function hpBar(hp, max) {
    const pct = Math.max(0, Math.min(100, (hp / max) * 100));
    return h('div', { class: `bt-hp${pct < 30 ? ' is-low' : ''}`, role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': max, 'aria-valuenow': Math.round(hp), 'aria-label': 'Your health' },
      h('i', { style: { width: `${pct}%` } }),
      h('span', {}, `${fmt(hp)} / ${fmt(max)}`));
  }

  function drawTower() {
    if (!run) { drawLab(); return; }
    view = 'tower';
    const r = run;
    const fl = r.next.floor;
    const foes = foeCards(r);
    const me = withFollowers(fighterOf(r.build), r);
    const boss = isBoss(fl);
    const story = { callout: 'CALLOUT', revenge: 'REMATCH (+3 POWER)', lieutenant: 'THE BOSS\'S TEST (+4 POWER)', crew: 'THE BOSS\'S CREW', boss: r.next.mod < 0 ? 'BOSS · RATTLED (−5 POWER)' : null }[r.next.type] || null;
    const waitingNow = r.phone ? FP.waiting(r) : [];
    const swarm = swarmSize(fl) > 1;
    const tags = [story, boss && r.next.type !== 'crew' ? 'BOSS' : null, swarm && !boss ? `OMEGA SWARM ×${foes.length}` : null, boss && foes.length > 1 ? `BOSS SQUAD ×${foes.length}` : null, FP.phoneAura(r) ? `+${FP.phoneAura(r)} AURA FROM YOUR PHONE` : null, r.hard ? 'HARD' : null].filter(Boolean);
    const foePower = foes.reduce((n, c) => n + c.powerLevel, 0);

    fill(root,
      header(`FLOOR ${fl}${r.hard ? ' · HARD' : ''}`, () => drawLab()),
      h('div', { class: 'ff-tower' },
        h('div', { class: `ff-floor${boss ? ' is-boss' : ''}` },
          h('p', { class: 'label-spaced' }, 'THE TOWER'),
          h('h2', { class: 'display-lg' }, `FLOOR ${fl}`),
          tags.length ? h('ul', { class: 'rule-chips' }, tags.map((t) => h('li', { class: t === 'HARD' || t.startsWith('BOSS') ? 'bad' : '' }, t))) : null,
        ),
        h('div', { class: 'ff-me panel' },
          avatar(me, characters, 'md'),
          h('div', { class: 'ff-me-text' },
            h('p', { class: 'heading' }, me.name),
            roleChips(me),
            hpBar(r.hp, r.maxHp),
          ),
        ),
        h('p', { class: 'label-spaced ff-vs' }, foes.length > 1 ? `THEY SEND ${foes.length}` : 'YOUR OPPONENT'),
        h('div', { class: `ff-foes n-${foes.length}` }, foes.map((c) => characterCard(c, { size: foes.length > 1 ? 'sm' : 'md', stats: foes.length === 1 }))),
        h('p', { class: 'caption muted ff-center' },
          foePower > me.powerLevel ? 'Underdog fight: Bounty is worth half again if you win.' : `Clear it for ${fmt(bountyFor(fl, r.hard, me, foes).bounty)} Bounty.`),
        waitingNow.length ? h('button', { class: 'ff-phone-alert', onClick: () => phone.openThread(waitingNow[0].key) },
          h('span', { class: 'ff-phone-alert-icon' }, '📱'),
          h('span', {}, h('strong', {}, `${waitingNow[0].name} is waiting on your reply.`), ' How you answer can change who you fight.')) : null,
        r.next.mult && r.next.mult !== 1 ? h('p', { class: 'caption gold ff-center' }, `Bounty ×${r.next.mult} on this floor.`) : null,
        r.restPenalty ? h('p', { class: 'caption muted ff-center' }, 'You rested: this floor pays 20% less Bounty.') : null,
        h('div', { class: 'result-actions' },
          h('button', { class: 'btn btn-primary', onClick: async () => {
            if (waitingNow.length) {
              const ok = await confirmSheet({ title: 'LEAVE THEM ON READ?', message: `${waitingNow.map((t) => t.name).join(' and ')} ${waitingNow.length > 1 ? 'are' : 'is'} waiting on a reply. Fight now and nothing changes.`, confirmLabel: 'Fight anyway' });
              if (!ok) return;
              waitingNow.forEach((t) => { t.pending = null; t.msgs.push({ from: 'sys', text: 'Left on read.' }); });
              await saveRun();
            }
            drawFight();
          } }, 'Fight'),
          h('button', { class: 'btn btn-secondary', onClick: () => drawTree() }, `Talent tree${pointsLeft() > 0 ? ` · ${pointsLeft()}` : ''}`),
          h('button', { class: 'btn btn-secondary', onClick: endRunEarly }, 'End climb'),
        ),
        h('p', { class: 'caption muted ff-center' }, `${fmt(r.runBounty)} Bounty this climb · floors cleared ${r.floor}`),
      ),
    );
  }

  async function endRunEarly() {
    const ok = await confirmSheet({
      title: 'END THIS CLIMB?',
      message: `Your climb ends with ${run.floor} floor${run.floor === 1 ? '' : 's'} cleared. You keep every bit of Bounty you've earned.`,
      confirmLabel: 'End climb',
      danger: true,
    });
    if (ok) await finishRun(false);
  }

  function drawFight() {
    const r = run;
    const fl = r.next.floor;
    const foes = foeCards(r);
    const me = withFollowers(fighterOf(r.build), r);
    view = 'fight';
    const stage = h('div', { class: 'ff-stage' });
    const after = h('div', { class: 'ff-after', hidden: true });
    fill(root, header(`FLOOR ${fl}${r.hard ? ' · HARD' : ''}`, () => drawTower()), stage, after);
    fightView = playMatch(stage, {
      teamA: [me], teamB: foes, seed: r.next.seed, bestOf: 1, startHp: [r.hp], speed: 2,
      names: { B: foes.length === 1 ? foes[0].name : r.next.type === 'crew' ? 'THE CREW' : isBoss(fl) ? 'THE BOSS SQUAD' : 'THE SWARM' },
      labels: { A: 'YOU', B: isBoss(fl) ? 'BOSS' : `FLOOR ${fl}` },
      onDone: async (result) => {
        const won = result.winner === 'A';
        const outcome = won ? await clearFloor(result, foes) : null;
        after.hidden = false;
        fill(after,
          won
            ? h('button', { class: 'btn btn-primary btn-wide', onClick: () => drawCleared(outcome) }, 'Continue')
            : h('button', { class: 'btn btn-primary btn-wide', onClick: () => finishRun(true) }, 'See your climb'),
        );
        after.querySelector('button').focus();
      },
    });
  }

  async function clearFloor(result, foes) {
    const r = run;
    const fl = r.next.floor;
    const me = fighterOf(r.build);
    const base = bountyFor(fl, r.hard, me, foes);
    const underdog = base.underdog;
    const bounty = Math.round(base.bounty * (r.next.mult || 1) * (r.restPenalty ? FP.REST_PENALTY : 1) * (1 + (r.build.talents?.bounty || 0)));
    r.restPenalty = false;
    const before = result.endHp[0];
    const hp = healAfter(fl, before, r.maxHp, r.build.talents?.heal || 0);
    r.floor = fl;
    r.hp = hp;
    r.runBounty += bounty;
    const type = r.next.type;
    if (underdog) r.underdogWins += 1;
    if (isBoss(fl)) r.bossWins += 1;
    const budgetBefore = budget();
    data.lifetimeBounty += bounty;
    data.points = (data.points || 0) + pointsForFloor(fl);
    // The phone reacts to the floor and sets up the next one.
    if (r.phone) {
      FP.onCleared(r, fl);
      const runBefore = r.runBounty;
      FP.afterFloor(r, { floor: fl, hp, hpBefore: before, maxHp: r.maxHp, foes, roster: characters.list.filter((c) => !c.retired), rand: Math.random, me: me.name, hard: r.hard, underdog, callout: type === 'callout' || type === 'revenge', type, boss: isBoss(fl) && type !== 'lieutenant' });
      if (PD.dating(r.phone).matches.length) PD.refreshPrompts(r.phone, dateCtx(r));
      data.lifetimeBounty += r.runBounty - runBefore;
      data.followers = r.phone.followers;
    }
    planFloor(r);
    await saveData();
    await saveRun();
    return { floor: fl, bounty, underdog, healed: hp - before, hp, boss: isBoss(fl), gained: budget() - budgetBefore };
  }

  function drawCleared(o) {
    view = 'cleared';
    setTimeout(() => phone.ping(), 400);
    fill(root,
      header(`FLOOR ${o.floor} CLEARED`, () => drawLab()),
      h('div', { class: 'result-head' },
        h('p', { class: 'label-spaced' }, o.boss ? 'BOSS DOWN' : 'FLOOR CLEARED'),
        h('h2', { class: 'display-lg gold' }, `+${fmt(o.bounty)}`),
        h('p', { class: 'label-spaced' }, 'BOUNTY'),
        o.underdog ? h('p', { class: 'new-best' }, 'UNDERDOG WIN · ×1.5') : null,
        o.gained > 0 ? h('p', { class: 'new-best' }, `+${o.gained} TALENT POINT${o.gained === 1 ? '' : 'S'}`) : null,
      ),
      h('div', { class: 'ff-me panel' },
        h('div', { class: 'ff-me-text' },
          h('p', { class: 'caption muted' }, `Recovered ${fmt(o.healed)} health (${Math.round(((o.boss ? HEAL_BOSS : HEAL_FLOOR) + (run.build.talents?.heal || 0)) * 100)}% after ${o.boss ? 'a boss' : 'a floor'}).`),
          hpBar(o.hp, run.maxHp),
        ),
      ),
      pointsLeft() > 0 ? h('button', { class: 'ff-tree-cta', onClick: () => drawTree() }, h('span', { class: 'label-spaced gold' }, 'TALENT TREE'), h('span', { class: 'heading' }, `${pointsLeft()} point${pointsLeft() === 1 ? '' : 's'} to spend`), h('span', { class: 'caption muted' }, 'Upgrades bought during a climb are locked in until it ends.')) : null,
      h('div', { class: 'result-actions' },
        h('button', { class: 'btn btn-primary', onClick: drawTower }, `On to floor ${o.floor + 1}`),
        h('button', { class: 'btn btn-secondary', onClick: () => drawLab() }, 'Back to the Lab'),
      ),
    );
  }

  // ---------- End of a climb ----------
  async function finishRun(lost) {
    const r = run;
    if (r.phone) { data.lastPhone = r.phone; data.followers = r.phone.followers; }
    const key = r.hard ? 'hard' : 'normal';
    const prevBest = bestFloor(data);
    const newBest = r.floor > 0 && r.floor > prevBest;
    data.best = Math.max(prevBest, r.floor);
    await records.update('forbidden-fusion', (rec) => {
      const x = rec[key] || { runs: 0, bestFloor: 0, bestBounty: 0 };
      x.runs += 1;
      if (r.floor > x.bestFloor) x.bestFloor = r.floor;
      x.bestBounty = Math.max(x.bestBounty || 0, r.runBounty);
      rec[key] = x;
      rec.lifetimeBounty = data.lifetimeBounty;
      return rec;
    });
    const entry = {
      floor: r.floor, hard: r.hard, bounty: r.runBounty, date: new Date().toISOString().slice(0, 10),
      ...r.build,
    };
    data.hof = [...(data.hof || []), entry]
      .sort((a, b) => b.floor - a.floor || b.bounty - a.bounty)
      .slice(0, HOF_SIZE);
    const place = data.hof.indexOf(entry);
    await saveData();
    lastRun = { ...r, lost, newBest, place: place >= 0 && r.floor > 0 ? place + 1 : null };
    run = null;
    await saveRun();
    drawOver();
  }

  function drawOver() {
    const r = lastRun;
    if (!r) { drawLab(); return; }
    view = 'over';
    const me = fighterOf(r.build);
    const share = async () => {
      const how = await shareText(`T7P Arcade · Forbidden Fusion${r.hard ? ' (Hard)' : ''}\n${me.name}: floor ${r.floor} · ${titleFor(r.floor)} · ${fmt(r.runBounty)} Bounty`);
      if (how === 'copied') toast('Result copied. Paste it anywhere.');
      else if (how === 'failed') toast('Sharing is not available here.');
    };
    fill(root,
      header('THE CLIMB ENDS', () => { lastRun = null; drawLab(); }),
      h('div', { class: 'result-head' },
        avatar(me, characters, 'lg'),
        h('p', { class: 'label-spaced' }, `${me.name}${r.hard ? ' · HARD' : ''}`),
        h('h2', { class: 'display-lg gold' }, `FLOOR ${r.floor}`),
        h('p', { class: 'heading' }, titleFor(r.floor)),
        r.newBest ? h('p', { class: 'new-best' }, 'NEW PERSONAL BEST') : null,
        r.place ? h('p', { class: 'caption' }, `Hall of Fame: #${r.place}`) : null,
      ),
      h('div', { class: 'result-stats' },
        stat('Bounty', fmt(r.runBounty)), stat('Bosses', r.bossWins), stat('Underdog wins', r.underdogWins),
      ),
      h('p', { class: 'caption muted result-tip' }, treeCost(data.build.tree) < TREE_MAX
        ? `${budget()} talent points earned on this file. The climb is over, so you can respec your tree for free.`
        : 'Your talent tree is maxed. Now it is all about the floor.'),
      h('div', { class: 'result-actions' },
        h('button', { class: 'btn btn-primary', onClick: async () => { lastRun = null; run = newRun(r.hard); await saveRun(); drawTower(); } }, 'Climb again'),
        h('button', { class: 'btn btn-secondary', onClick: () => { lastRun = null; drawTree(); } }, 'Talent tree'),
        h('button', { class: 'btn btn-secondary', onClick: share }, 'Share'),
      ),
    );
  }

  function stat(label, value) {
    return h('div', { class: 'result-stat' }, h('span', { class: 'stat' }, String(value)), h('span', { class: 'label-spaced' }, label));
  }

  function openHallOfFame() {
    const list = data.hof || [];
    sheet({
      title: 'HALL OF FAME',
      wide: true,
      content: list.length
        ? h('ol', { class: 'ff-hof' }, list.map((e, i) => {
          const f = fighterOf(e);
          return h('li', { class: 'ff-hof-row' },
            h('span', { class: 'ff-hof-rank' }, String(i + 1)),
            avatar(f, characters, 'sm'),
            h('span', { class: 'pick-text' },
              h('span', { class: 'pick-name' }, f.name),
              h('span', { class: 'pick-series' }, `${e.mainRole}${e.secondRole ? ` / ${e.secondRole}` : ''} · Power ${e.powerLevel} · ${e.date}${e.hard ? ' · Hard' : ''}`),
            ),
            h('span', { class: 'ff-hof-floor' }, h('span', { class: 'stat gold' }, String(e.floor)), h('span', { class: 'label-spaced' }, 'FLOOR')),
          );
        }))
        : h('p', { class: 'body-text muted' }, 'No climbs yet. Your ten best climbs will be kept here.'),
    });
  }

  if (slot && data && view === 'over' && lastRun) drawOver();
  else if (slot && data && run && (view === 'tower' || view === 'fight' || view === 'cleared')) drawTower();
  else if (slot && data && view !== 'slots') drawLab();
  else await drawSlots();
  help.showFirstTime();
  return root;
}
