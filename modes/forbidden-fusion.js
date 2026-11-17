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
  GYM, MAX_BUDGET, BOUNTY_PER_POINT, cost, budgetFor, starterBuild, fighterFrom,
  floorFoes, swarmSize, isBoss, bountyFor, healAfter, titleFor, HEAL_FLOOR, HEAL_BOSS,
} from './fusion-rules.js';

const DATA_KEY = 'fusion';                 // the build, lifetime Bounty, Hall of Fame
const RUN_KEY = 'save:forbidden-fusion';   // the climb in progress
const NAME_MAX = 20;
const HOF_SIZE = 10;
const fmt = (n) => Math.round(n).toLocaleString();

const help = howToPlay('forbidden-fusion', 'Forbidden Fusion', [
  'Forge one fighter in the Gym. Pick any character as its face, give it a name, and choose a main role and a second role.',
  'Your main role sets your special move: Striker Finisher, Tank Iron Wall, Speedster Blitz, Mystic Hex or Tactician Counterplay. The role wheel still counts in every fight.',
  'Spend Gym points: 1 point per Power Level above 50, and 1 point per 10 Aura or Clutch. Chaos is free: it only makes hits swing wider.',
  'Climb the Tower: one fight per floor. A fused fighter has 3.5 times a normal card\'s health, and it carries over. You get 20% back after each floor and 25% after a boss.',
  'Every 5th floor is a boss. Past floor 10 the Omega swarms send two, then three cards at you.',
  'Clearing floors earns Bounty: more as you climb, half again for an underdog win, and double on Hard. Every 100 Bounty adds a Gym point for good.',
  'Lose a fight and the climb ends. Your best climbs go into the Hall of Fame.',
]);

let data = null;     // { build, lifetimeBounty, hof }
let run = null;      // the climb in progress, or null
let lastRun = null;  // the climb that just ended (for the result screen)
let view = 'lab';

async function loadData() {
  if (!data) {
    data = await store.get(DATA_KEY, null);
    if (!data) {
      const face = characters.get(profile.value.iconId);
      data = { build: starterBuild(face), lifetimeBounty: 0, hof: [] };
      await store.set(DATA_KEY, data);
    }
  }
  if (run === null) run = await store.get(RUN_KEY, null);
  return data;
}
const saveData = () => store.set(DATA_KEY, data);
const saveRun = () => (run ? store.set(RUN_KEY, run) : store.remove(RUN_KEY));

const faceOf = (build) => (build.faceId != null ? characters.get(build.faceId) : null);
const fighterOf = (build) => fighterFrom(build, faceOf(build));
const budget = () => budgetFor(data.lifetimeBounty);

function shuffleSeed() { return Math.floor(Math.random() * 2 ** 31); }

function planFloor(r) {
  const floor = r.floor + 1;
  const avoid = new Set(r.recent || []);
  const foes = floorFoes(floor, r.hard, characters.list.filter((c) => !c.retired), Math.random, avoid);
  r.next = { floor, foeIds: foes.map((c) => c.id), seed: shuffleSeed() };
  r.recent = [...foes.map((c) => c.id), ...(r.recent || [])].slice(0, 12);
}

function newRun(hard) {
  const build = structuredClone(data.build);
  const maxHp = fighterStats(fighterOf(build)).maxHp;
  const r = { hard, build, floor: 0, hp: maxHp, maxHp, runBounty: 0, underdogWins: 0, bossWins: 0, startedAt: Date.now(), recent: [] };
  planFloor(r);
  return r;
}

export async function render() {
  await profile.update({ lastMode: 'forbidden-fusion' });
  await loadData();
  const root = h('section', { class: 'screen mode fusion' });
  let fightView = null;
  root._cleanup = () => { closeSheet(); if (fightView) fightView.stop(); };

  const header = (sub, onBack) => modeHeader({ title: 'Forbidden Fusion', sub, onHelp: () => help.show(), onBack });

  // ---------- The Lab (home) ----------
  function drawLab() {
    view = 'lab';
    const b = data.build;
    const total = budget();
    const spent = cost(b);
    const unspent = total - spent;
    const rec = records.get('forbidden-fusion');
    const nextAt = total >= MAX_BUDGET ? null : (Math.floor(data.lifetimeBounty / BOUNTY_PER_POINT) + 1) * BOUNTY_PER_POINT;
    const best = Math.max(rec.normal?.bestFloor || 0, rec.hard?.bestFloor || 0);

    fill(root,
      header('FORGE · TOWER · LEGEND'),
      h('div', { class: 'ff-lab' },
        h('div', { class: 'ff-hero' },
          characterCard(fighterOf(b), { size: 'lg', highlight: ['powerLevel'] }),
          h('div', { class: 'ff-hero-side' },
            h('p', { class: 'label-spaced' }, 'SPECIAL MOVE'),
            h('p', { class: 'heading' }, SPECIALS[b.mainRole].name),
            h('p', { class: 'caption muted' }, SPECIALS[b.mainRole].text),
            h('p', { class: 'label-spaced ff-gap' }, 'BEATS'),
            h('p', { class: 'caption' }, BEATS[b.mainRole].join(' · ')),
            h('p', { class: 'label-spaced ff-gap' }, 'GYM POINTS'),
            h('p', {}, h('span', { class: 'stat gold' }, String(spent)), h('span', { class: 'muted' }, ` / ${total}`)),
            unspent > 0 ? h('p', { class: 'ff-unspent' }, `${unspent} point${unspent === 1 ? '' : 's'} to spend`) : null,
          ),
        ),
        h('div', { class: 'ff-bounty panel' },
          h('div', {},
            h('p', { class: 'label-spaced' }, 'LIFETIME BOUNTY'),
            h('p', { class: 'stat' }, fmt(data.lifetimeBounty)),
          ),
          h('p', { class: 'caption muted' }, nextAt
            ? `Next Gym point at ${fmt(nextAt)} Bounty.`
            : 'Your Gym budget is maxed.'),
          best ? h('p', { class: 'caption' }, `Best climb: floor ${best} · ${titleFor(best)}`) : null,
        ),
        run
          ? h('button', { class: 'resume-card', onClick: drawTower },
            h('span', { class: 'label-spaced gold' }, 'CLIMB IN PROGRESS'),
            h('span', { class: 'heading' }, `Continue · Floor ${run.floor + 1}${run.hard ? ' · Hard' : ''}`),
            h('span', { class: 'caption muted' }, `Health ${fmt(run.hp)} / ${fmt(run.maxHp)} · ${fmt(run.runBounty)} Bounty this climb`))
          : h('button', { class: 'btn btn-primary btn-wide ff-climb', onClick: pickDifficulty }, 'Climb the Tower'),
        h('div', { class: 'ff-actions' },
          h('button', {
            class: 'btn btn-secondary',
            onClick: () => (run ? toast('Finish or end your climb to change your build.') : drawGym()),
          }, icon('edit', 18), 'The Gym'),
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
      const left = total - cost(draft);
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
          h('div', { class: 'ff-roles', role: 'radiogroup', 'aria-label': 'Main role' }, ROLES.map((r) => h('button', {
            class: `ff-role role-${r.toLowerCase()}${draft.mainRole === r ? ' is-on' : ''}`,
            role: 'radio', 'aria-checked': draft.mainRole === r ? 'true' : 'false',
            onClick: () => { draft.mainRole = r; if (draft.secondRole === r) draft.secondRole = null; draw(); },
          }, h('span', { class: 'ff-role-name' }, r), h('span', { class: 'ff-role-move' }, SPECIALS[r].name)))),
          h('p', { class: 'caption' }, `${SPECIALS[draft.mainRole].name}: ${SPECIALS[draft.mainRole].text} Beats ${BEATS[draft.mainRole].join(' and ')}.`),
          h('h3', { class: 'label-spaced set-title ff-gap' }, 'SECOND ROLE'),
          h('p', { class: 'caption muted' }, 'Free. Adds +8% damage against the roles it beats.'),
          h('div', { class: 'ff-roles is-second', role: 'radiogroup', 'aria-label': 'Second role' },
            [null, ...ROLES.filter((r) => r !== draft.mainRole)].map((r) => h('button', {
              class: `ff-role${r ? ` role-${r.toLowerCase()}` : ''}${draft.secondRole === r ? ' is-on' : ''}`,
              role: 'radio', 'aria-checked': draft.secondRole === r ? 'true' : 'false',
              onClick: () => { draft.secondRole = r; draw(); },
            }, h('span', { class: 'ff-role-name' }, r || 'None')))),
        ),
        h('section', { class: 'panel ff-sec' },
          h('div', { class: 'ff-points' },
            h('h3', { class: 'label-spaced set-title' }, 'TRAINING'),
            h('span', {}, h('span', { class: 'label-spaced' }, 'POINTS LEFT '), pointsEl, h('span', { class: 'muted' }, ` / ${total}`)),
          ),
          stepper('powerLevel', 'Power Level', GYM.power, '1 point each. Health and attack.', draft, left, draw),
          stepper('aura', 'Aura', GYM.aura, '1 point per 10. Special meter fills faster, more damage.', draft, left, draw),
          stepper('clutch', 'Clutch', GYM.clutch, '1 point per 10. Chance to survive a knockout with 1 health.', draft, left, draw),
          stepper('chaos', 'Chaos', GYM.chaos, 'Free. Higher Chaos makes every hit swing wider.', draft, left, draw),
          h('button', {
            class: 'btn btn-secondary ff-auto',
            onClick: () => {
              const s = starterBuild({ mainRole: draft.mainRole, secondRole: draft.secondRole }, total);
              Object.assign(draft, { powerLevel: s.powerLevel, aura: s.aura, clutch: s.clutch });
              draw();
            },
          }, 'Spend for me'),
        ),
      );
    }

    async function save() {
      draft.name = (draft.name || '').trim().replace(/\s+/g, ' ').slice(0, NAME_MAX) || 'THE FORBIDDEN ONE';
      if (cost(draft) > total) { toast('That build costs more points than you have.'); return; }
      data.build = draft;
      await saveData();
      toast(`${draft.name} is ready.`);
      drawLab();
    }

    fill(root,
      header('THE GYM', () => drawLab()),
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
    const foes = r.next.foeIds.map((id) => characters.get(id)).filter(Boolean);
    const me = fighterOf(r.build);
    const boss = isBoss(fl);
    const swarm = swarmSize(fl) > 1;
    const tags = [boss ? 'BOSS' : null, swarm && !boss ? `OMEGA SWARM ×${foes.length}` : null, boss && foes.length > 1 ? `BOSS SQUAD ×${foes.length}` : null, r.hard ? 'HARD' : null].filter(Boolean);
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
        h('div', { class: 'result-actions' },
          h('button', { class: 'btn btn-primary', onClick: drawFight }, 'Fight'),
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
    const foes = r.next.foeIds.map((id) => characters.get(id)).filter(Boolean);
    const me = fighterOf(r.build);
    view = 'fight';
    const stage = h('div', { class: 'ff-stage' });
    const after = h('div', { class: 'ff-after', hidden: true });
    fill(root, header(`FLOOR ${fl}${r.hard ? ' · HARD' : ''}`, () => drawTower()), stage, after);
    fightView = playMatch(stage, {
      teamA: [me], teamB: foes, seed: r.next.seed, bestOf: 1, startHp: [r.hp],
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
    const { bounty, underdog } = bountyFor(fl, r.hard, me, foes);
    const before = result.endHp[0];
    const hp = healAfter(fl, before, r.maxHp);
    r.floor = fl;
    r.hp = hp;
    r.runBounty += bounty;
    if (underdog) r.underdogWins += 1;
    if (isBoss(fl)) r.bossWins += 1;
    const budgetBefore = budget();
    data.lifetimeBounty += bounty;
    planFloor(r);
    await saveData();
    await saveRun();
    return { floor: fl, bounty, underdog, healed: hp - before, hp, boss: isBoss(fl), gained: budget() - budgetBefore };
  }

  function drawCleared(o) {
    view = 'cleared';
    fill(root,
      header(`FLOOR ${o.floor} CLEARED`, () => drawLab()),
      h('div', { class: 'result-head' },
        h('p', { class: 'label-spaced' }, o.boss ? 'BOSS DOWN' : 'FLOOR CLEARED'),
        h('h2', { class: 'display-lg gold' }, `+${fmt(o.bounty)}`),
        h('p', { class: 'label-spaced' }, 'BOUNTY'),
        o.underdog ? h('p', { class: 'new-best' }, 'UNDERDOG WIN · ×1.5') : null,
        o.gained > 0 ? h('p', { class: 'new-best' }, `+${o.gained} GYM POINT${o.gained === 1 ? '' : 'S'}`) : null,
      ),
      h('div', { class: 'ff-me panel' },
        h('div', { class: 'ff-me-text' },
          h('p', { class: 'caption muted' }, `Recovered ${fmt(o.healed)} health (${Math.round((o.boss ? HEAL_BOSS : HEAL_FLOOR) * 100)}% after ${o.boss ? 'a boss' : 'a floor'}).`),
          hpBar(o.hp, run.maxHp),
        ),
      ),
      h('div', { class: 'result-actions' },
        h('button', { class: 'btn btn-primary', onClick: drawTower }, `On to floor ${o.floor + 1}`),
        h('button', { class: 'btn btn-secondary', onClick: () => drawLab() }, 'Back to the Lab'),
      ),
    );
  }

  // ---------- End of a climb ----------
  async function finishRun(lost) {
    const r = run;
    const key = r.hard ? 'hard' : 'normal';
    let newBest = false;
    await records.update('forbidden-fusion', (rec) => {
      const x = rec[key] || { runs: 0, bestFloor: 0, bestBounty: 0 };
      x.runs += 1;
      if (r.floor > x.bestFloor) { x.bestFloor = r.floor; newBest = r.floor > 0; }
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
      h('p', { class: 'caption muted result-tip' }, budget() < MAX_BUDGET
        ? `Lifetime Bounty ${fmt(data.lifetimeBounty)}: your Gym budget is ${budget()} points.`
        : 'Your Gym budget is maxed. Now it is all about the floor.'),
      h('div', { class: 'result-actions' },
        h('button', { class: 'btn btn-primary', onClick: async () => { lastRun = null; run = newRun(r.hard); await saveRun(); drawTower(); } }, 'Climb again'),
        h('button', { class: 'btn btn-secondary', onClick: () => { lastRun = null; drawGym(); } }, 'The Gym'),
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

  if (view === 'over' && lastRun) drawOver();
  else if (run && (view === 'tower' || view === 'fight' || view === 'cleared')) drawTower();
  else drawLab();
  help.showFirstTime();
  return root;
}
