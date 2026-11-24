// The battle screen: plays a match from the Combat core as an animated card
// fight. Two cards face off (yours on the left), trade hits with move names,
// damage numbers and health bars; lineups sit above and below; the turn
// counter, round score and MATCH POINT banner run along the top.
//
//   const view = playMatch(el, { teamA, teamB, onDone })
//   view.setSpeed(2); view.skip();
//
// Squad fights (more than one card a side) start at 2× because they run
// about 90 turns; one-on-one fights start at 1×. Pass { speed } to override.

import { h, avatar } from './ui.js';
import { characters } from './characters.js';
import { tierBadge } from './card.js';
import { runMatch } from './combat.js';
import { FX, elementOf } from './elements.js';
import { settings } from './settings.js';
import { sfx } from './sfx.js';

const STATUS_LABEL = { burn: 'BURN', stun: 'STUN', guard: 'GUARD', fire: '🔥 BURN', frost: '❄️ FROZEN', shock: '⚡ SHOCK', drain: '🩸 DRAIN' };
// v0.34.0: Mystic elements show on the card itself.
const FX_KEYS = ['fire', 'frost', 'shock', 'drain'];
const fmt = (n) => Math.round(n).toLocaleString();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// How long each event shows at 1× speed (ms).
const TIMING = { 'round-start': 1100, enter: 450, turn: 120, attack: 520, damage: 380, clutch: 900, status: 300, 'status-end': 0, heal: 380, stunned: 600, ko: 700, 'round-end': 1200, meter: 0, timeout: 800, assist: 1000 };

export function playMatch(container, { teamA, teamB, seed, speed: startSpeed, bestOf = 3, startHp = null, labels = { A: 'YOU', B: 'THEY' }, names = null, assist = null, onDone }) {
  const result = runMatch(teamA, teamB, { seed: seed ?? Date.now(), bestOf, startHp, assist });
  const need = Math.ceil(bestOf / 2);
  const chars = { A: teamA, B: teamB };
  let speed = startSpeed ?? (teamA.length > 1 || teamB.length > 1 ? 2 : 1);
  let skipping = !!settings.value.skipFightScenes;
  let stopped = false;

  // ---- live state shown on screen ----
  const live = {
    A: { idx: 0, hp: [], max: [], ko: new Set(), status: {}, meter: 0 },
    B: { idx: 0, hp: [], max: [], ko: new Set(), status: {}, meter: 0 },
    round: 1, turn: 0, score: [0, 0], deciding: false,
  };
  for (const s of ['A', 'B']) {
    result.events[0][s === 'A' ? 'teamA' : 'teamB'].forEach((f, i) => { live[s].hp[i] = f.maxHp; live[s].max[i] = f.maxHp; });
  }

  // ---- layout ----
  const turnEl = h('span', { class: 'bt-turn' }, need === 1 ? 'TURN 1' : 'ROUND 1');
  const scoreEl = h('div', { class: 'bt-score', 'aria-live': 'polite' });
  const banner = h('div', { class: 'bt-banner', hidden: true });
  const lineupB = h('div', { class: 'bt-lineup is-foe', 'aria-label': `${labels.B} lineup` });
  const lineupA = h('div', { class: 'bt-lineup', 'aria-label': `${labels.A} lineup` });
  const slotA = h('div', { class: 'bt-slot is-you' });
  const slotB = h('div', { class: 'bt-slot is-foe' });
  const speedBtn = h('button', { class: 'btn btn-secondary bt-speed', onClick: () => setSpeed(speed === 1 ? 2 : 1), 'aria-label': 'Change speed' }, `${speed}×`);
  const skipBtn = h('button', { class: 'btn btn-secondary bt-speed', onClick: () => skip() }, 'Skip');
  const root = h('section', { class: 'battle', 'aria-label': 'Fight' },
    h('div', { class: 'bt-top' }, turnEl, scoreEl, h('div', { class: 'bt-controls' }, speedBtn, skipBtn)),
    lineupB,
    h('div', { class: 'bt-arena' }, slotA, h('span', { class: 'bt-vs', 'aria-hidden': 'true' }, 'VS'), slotB, banner),
    lineupA,
  );
  container.replaceChildren(root);

  const cardEls = { A: null, B: null };

  function drawScore() {
    const pips = (n) => Array.from({ length: need }, (_, i) => h('span', { class: `bt-pip${i < n ? ' on' : ''}` }));
    scoreEl.replaceChildren(
      h('span', { class: 'bt-side' }, labels.A), ...pips(live.score[0]),
      h('span', { class: 'bt-dash' }, '–'),
      ...pips(live.score[1]).reverse(), h('span', { class: 'bt-side' }, labels.B),
    );
  }

  function drawLineup(side) {
    const el = side === 'A' ? lineupA : lineupB;
    if (chars[side].length < 2) { el.replaceChildren(); return; }
    el.replaceChildren(...chars[side].map((c, i) => h('span', {
      class: `bt-mini${i === live[side].idx ? ' is-active' : ''}${live[side].ko.has(i) ? ' is-ko' : ''}`,
      title: c.name,
    }, avatar(c, characters, 'sm'), live[side].ko.has(i) ? h('span', { class: 'bt-skull', 'aria-label': 'knocked out' }, '✕') : null)));
  }

  function drawCard(side) {
    const s = live[side];
    const c = chars[side][s.idx];
    const hp = s.hp[s.idx];
    const max = s.max[s.idx];
    const pct = Math.max(0, (hp / max) * 100);
    const statusList = Object.entries(s.status).filter(([, v]) => v);
    const fx = FX_KEYS.filter((k) => s.status[k]);
    const card = h('div', { class: `bt-card fr-${c.franchise}${fx.map((k) => ` fx-${k}`).join('')}` },
      h('div', { class: 'bt-pic' },
        avatar(c, characters, 'card'),
        fx.length ? h('span', { class: 'bt-fx', 'aria-hidden': 'true' }, fx.map((k) => h('span', { class: `bt-fx-layer is-${k}` }))) : null,
        h('span', { class: 'char-pl' }, h('span', { class: 'char-pl-num' }, String(c.powerLevel)), tierBadge(c)),
        statusList.length ? h('span', { class: 'bt-status' }, statusList.map(([k]) => h('span', { class: `bt-st st-${k}` }, STATUS_LABEL[k]))) : null,
      ),
      h('div', { class: 'bt-name' }, c.name),
      h('div', { class: 'bt-role' }, c.mainRole ? h('span', { class: `chip role-${c.mainRole.toLowerCase()}` }, c.mainRole === 'Mystic' ? `${FX[elementOf(c)].icon} Mystic` : c.mainRole) : null),
      h('div', { class: 'bt-meter', 'aria-label': `Special meter ${s.meter}%` },
        [0, 1, 2, 3, 4].map((i) => h('span', { class: `bt-mpip${s.meter >= (i + 1) * 20 ? ' on' : ''}` }))),
      h('div', { class: `bt-hp${pct < 30 ? ' is-low' : ''}`, role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': max, 'aria-valuenow': hp, 'aria-label': `${c.name} health` },
        h('i', { style: { width: `${pct}%` } }),
        h('span', {}, `${fmt(hp)} / ${fmt(max)}`)),
    );
    cardEls[side] = card;
    (side === 'A' ? slotA : slotB).replaceChildren(card);
  }

  function drawAll() {
    turnEl.textContent = need === 1 ? `TURN ${live.turn || 1}` : live.turn ? `ROUND ${live.round} · TURN ${live.turn}` : `ROUND ${live.round}`;
    drawScore();
    drawLineup('A');
    drawLineup('B');
    drawCard('A');
    drawCard('B');
  }

  function pop(side, text, cls) {
    if (skipping) return;
    const card = cardEls[side];
    if (!card) return;
    const el = h('span', { class: `bt-pop ${cls}` }, text);
    card.append(el);
    setTimeout(() => el.remove(), 1100 / speed);
  }
  function flash(side, cls) {
    if (skipping || settings.reducedMotion()) return;
    const card = cardEls[side];
    if (!card) return;
    card.classList.remove(cls);
    void card.offsetWidth;
    card.classList.add(cls);
  }
  function showBanner(text, cls = '') {
    if (skipping) return;
    banner.textContent = text;
    banner.className = `bt-banner ${cls}`;
    banner.hidden = false;
    setTimeout(() => { banner.hidden = true; }, 1000 / speed);
  }

  // ---- play the events ----
  async function play() {
    drawAll();
    for (const ev of result.events.slice(1)) {
      if (stopped) return;
      apply(ev);
      const ms = TIMING[ev.t] ?? 0;
      if (!skipping && ms) await wait(ms / speed);
    }
    finish();
  }

  function apply(ev) {
    const other = (s) => (s === 'A' ? 'B' : 'A');
    if (!skipping) {
      if (ev.t === 'attack') sfx.play(ev.special ? 'special' : 'swing');
      else if (ev.t === 'damage') sfx.play('hit');
      else if (ev.t === 'ko') sfx.play('ko');
      else if (ev.t === 'round-start') sfx.play('gong');
      else if (ev.t === 'assist') sfx.play('special');
    }
    switch (ev.t) {
      case 'round-start':
        live.round = ev.round;
        live.turn = 0;
        live.deciding = ev.deciding;
        for (const s of ['A', 'B']) {
          live[s].idx = 0; live[s].ko.clear(); live[s].status = {}; live[s].meter = 0;
          live[s].hp = live[s].max.slice();
          // Health carried in from an earlier fight (the Tower)
          if (s === 'A' && ev.round === 1 && startHp) startHp.forEach((v, i) => { if (v != null) live.A.hp[i] = Math.max(1, Math.min(live.A.max[i], Math.round(v))); });
        }
        drawAll();
        if (need === 1) showBanner('FIGHT!', 'is-match');
        else showBanner(ev.deciding ? 'MATCH POINT' : `ROUND ${ev.round}`, ev.deciding ? 'is-match' : '');
        break;
      case 'enter':
        live[ev.side].idx = ev.idx;
        live[ev.side].hp[ev.idx] = ev.hp;
        live[ev.side].status = {};
        live[ev.side].meter = 0;
        drawLineup(ev.side);
        drawCard(ev.side);
        flash(ev.side, 'anim-enter');
        break;
      case 'turn':
        live.turn += 1;
        turnEl.textContent = need === 1 ? `TURN ${live.turn}` : `ROUND ${live.round} · TURN ${live.turn}`;
        break;
      case 'attack':
        flash(ev.side, ev.side === 'A' ? 'anim-lunge-r' : 'anim-lunge-l');
        if (ev.special) pop(ev.side, `${ev.move.toUpperCase()}!`, 'pop-move');
        if (ev.heal) { live[ev.side].hp[live[ev.side].idx] = ev.hp; drawCard(ev.side); pop(ev.side, `+${fmt(ev.heal)}`, 'pop-heal'); }
        if (ev.dodged) { pop(other(ev.side), 'DODGE', 'pop-adv'); break; }
        if (ev.crit) pop(other(ev.side), 'CRIT!', 'pop-crit');
        if (ev.adv && !ev.special) pop(ev.side, 'ADVANTAGE', 'pop-adv');
        break;
      case 'damage': {
        const s = live[ev.side];
        s.hp[s.idx] = ev.hp;
        if (ev.kind === 'burn') s.status.burn = true;
        if (FX_KEYS.includes(ev.kind)) s.status[ev.kind] = true;
        drawCard(ev.side);
        flash(ev.side, 'anim-hit');
        pop(ev.side, `-${fmt(ev.dmg)}`, ev.kind === 'burn' ? 'pop-burn' : FX_KEYS.includes(ev.kind) ? `pop-burn pop-${ev.kind}` : 'pop-dmg');
        break;
      }
      case 'heal': {
        const s = live[ev.side];
        s.hp[s.idx] = ev.hp;
        drawCard(ev.side);
        pop(ev.side, `+${fmt(ev.heal)}`, 'pop-heal');
        break;
      }
      case 'status-end':
        live[ev.side].status[ev.status] = false;
        drawCard(ev.side);
        break;
      case 'assist':
        // v0.28.0: an ally from your phone jumps in.
        showBanner(`${String(ev.name).toUpperCase()} JUMPS IN!`, 'is-assist');
        if (!skipping && ev.cid != null) {
          const c = characters.get(ev.cid); const u = c && characters.portraitUrl(c);
          if (u) { const im = h('img', { class: 'bt-ally', src: u, alt: c.name }); slotA.append(im); setTimeout(() => im.remove(), 1100 / speed); }
        }
        flash('A', 'anim-lunge-r');
        pop('A', 'ASSIST!', 'pop-move');
        break;
      case 'clutch':
        pop(ev.side, ev.unbreakable ? 'UNBREAKABLE!' : 'CLUTCH!', 'pop-clutch');
        break;
      case 'status':
        live[ev.side].status[ev.status] = true;
        drawCard(ev.side);
        if (FX_KEYS.includes(ev.status)) pop(ev.side, STATUS_LABEL[ev.status], `pop-move pop-${ev.status}`);
        break;
      case 'stunned':
        live[ev.side].status.stun = false;
        drawCard(ev.side);
        pop(ev.side, 'STUNNED', 'pop-crit');
        break;
      case 'meter':
        live[ev.side].meter = ev.value;
        if (!skipping) drawCard(ev.side);
        break;
      case 'ko':
        live[ev.side].ko.add(ev.idx);
        flash(ev.side, 'anim-ko');
        pop(ev.side, 'KO', 'pop-ko');
        drawLineup(ev.side);
        break;
      case 'round-end':
        live.score = ev.score;
        drawScore();
        if (need > 1) showBanner(`${ev.winner === 'A' ? labels.A : labels.B} TAKE ROUND ${ev.round}`, ev.winner === 'A' ? 'is-win' : 'is-loss');
        break;
      default:
        break;
    }
  }

  function finish() {
    if (stopped) return;
    stopped = true;
    live.score = result.score;
    drawAll();
    const won = result.winner === 'A';
    sfx.play(won ? 'win' : 'loss');
    const over = h('div', { class: `bt-result ${won ? 'is-win' : 'is-loss'}`, role: 'status' },
      h('p', { class: `display-lg win-text${names && names.B && !won ? ' is-long' : ''}` }, won ? 'YOU WIN' : `${names && names.B ? names.B.toUpperCase() : 'THEY'} WIN`),
      h('p', { class: 'label-spaced' }, need === 1 ? 'ONE-ROUND FIGHT' : `${result.score[0]} – ${result.score[1]} · ${result.rounds} ROUNDS`),
    );
    root.append(over);
    speedBtn.disabled = true;
    skipBtn.disabled = true;
    if (onDone) onDone(result);
  }

  function setSpeed(n) { speed = n; speedBtn.textContent = `${n}×`; }
  function skip() { skipping = true; }

  play();
  return { result, setSpeed, skip, stop: () => { stopped = true; } };
}

