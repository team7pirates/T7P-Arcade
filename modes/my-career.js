// MY CAREER (v0.38.0, phase 1) — be the player, not the coach.
// Create a fighter (or bring one in from Forbidden Fusion), go through draft
// night, then play your career in the Anime Fighting League week by week:
// train, pick your approach, and fight when the coach starts you.
// Rules: career-rules.js (built on Dynasty's league engine).

import { h, fill, toast, avatar, icon, sheet, closeSheet, confirmSheet } from '../core/ui.js';
import { profile } from '../core/profile.js';
import { store } from '../core/store.js';
import { characters } from '../core/characters.js';
import { modeHeader, howToPlay } from '../core/mode-kit.js';
import { ROLES, SECOND_PERKS } from '../core/combat.js';
import { playMatch } from '../core/battle-view.js';
import { sfx } from '../core/sfx.js';
import * as R from './dynasty-rules.js';
import * as O from './dynasty-off.js';
// The league's weekly systems register themselves on import.
import './dynasty-legacy.js';
import './dynasty-waivers.js';
import './dynasty-chamber.js';
import './dynasty-weekly.js';
import './dynasty-media.js';
import * as C from './career-rules.js';

const NAME_MAX = 20;
const fmt = (n) => Math.round(n).toLocaleString();
const crestUrl = (t) => `art/afl/crests/${t.crest}.webp`;
const crest = (t, size = 32) => h('img', { class: 'dy-crest', src: crestUrl(t), alt: '', width: size, height: size, style: `width:${size}px;height:${size}px` });
const ROLE_CLASS = (r) => `role-${(r || '').toLowerCase()}`;

const help = howToPlay('my-career', 'My Career', [
  'You are one fighter in the Anime Fighting League, not the coach. Make a new fighter or bring one in from Forbidden Fusion.',
  'A Fusion fighter starts over as a rookie: a 99 in the Tower comes in around 74 with a high ceiling, and a deep Tower record helps your draft stock.',
  'Draft night: watch the board until a team calls your name. Two rounds; nobody is guaranteed a spot.',
  'Every week: train once (Power, Aura or Clutch), then see if the coach starts you. If you start, pick your approach and fight.',
  'Coach trust: good grades and wins earn more starts. A bad night costs you. Once you are one of the team\'s best five, you start every week.',
  'Growth: like every card, you bank skill points every 3 weeks. Above 90, +1 Power costs 2 points.',
  'Awards night: Rookie of the Year, the GPT, breakout jumps. Then the off-season runs and your next season starts.',
  'Coming in later updates: minutes and coach talks, contracts and free agency, your own phone, endorsements and the Hall of Fame.',
]);

export async function render() {
  await profile.update({ lastMode: 'my-career' });
  let slot = profile.value.careerSlot || 1;
  let L = await store.get(C.slotKey(slot), null);
  const root = h('section', { class: 'screen mode career dynasty' });
  let fightView = null;
  root._cleanup = () => { closeSheet(); if (fightView) fightView.stop(); };
  const header = (sub, onBack) => modeHeader({ title: 'My Career', sub, onHelp: () => help.show(), onBack });
  const save = () => (L ? store.set(C.slotKey(slot), L) : store.remove(C.slotKey(slot)));
  const team = (i) => L.teams[i];
  const P = () => C.me(L);
  const face = (p, size = 'md') => { const c = p.cid != null ? characters.get(p.cid) : null; return c ? avatar(c, characters, size) : h('span', { class: `avatar avatar-${size} avatar-empty` }, '?'); };
  let tab = 'week';

  function draw() {
    if (!L) return drawFiles();
    if (L.phase === 'offseason' && L.off?.step === 'draft') return drawDraft();
    if (L.career.over) return drawSeasonEnd();
    return drawHub();
  }

  // ---------- Save files ----------
  async function drawFiles() {
    const rows = [];
    for (let n = 1; n <= C.SLOTS; n++) {
      const x = await store.get(C.slotKey(n), null);
      const p = x ? x.players[x.career.pid] : null;
      rows.push(h('li', { class: 'dy-panel mc-file' },
        p ? face(p) : h('span', { class: 'avatar avatar-md avatar-empty' }, String(n)),
        h('span', { class: 'dy-list-text' }, h('span', { class: 'heading' }, p ? p.name : `File ${n}`),
          h('span', { class: 'caption muted' }, !p ? 'Empty' : p.team != null ? `${x.teams[p.team].name} · Season ${p.career} · Power ${p.power}` : 'Draft night')),
        h('span', { class: 'btn-row' },
          h('button', { class: 'btn btn-primary btn-sm', onClick: async () => { slot = n; await profile.update({ careerSlot: n }); L = x; L ? draw() : drawCreate(); } }, p ? 'Continue' : 'New career'),
          p ? h('button', { class: 'btn btn-secondary btn-sm', onClick: async () => {
            if (!(await confirmSheet({ title: 'DELETE THIS CAREER?', message: `${p.name}'s career is gone for good.`, confirmLabel: 'Delete', danger: true }))) return;
            await store.remove(C.slotKey(n)); if (n === slot) L = null; drawFiles();
          } }, 'Delete') : null)));
    }
    fill(root, header('Draft · Grind · Legacy'), h('div', { class: 'dy-content' },
      h('section', { class: 'dy-panel mc-hero' }, h('h2', { class: 'dy-h gold' }, 'BE THE PLAYER, NOT THE COACH'),
        h('p', { class: 'body-text' }, 'Make a fighter (or bring yours from Forbidden Fusion), get drafted into the Anime Fighting League, earn your starts and build a career.')),
      h('ul', { class: 'mc-files' }, rows)));
  }

  // ---------- Create ----------
  async function drawCreate() {
    const icon0 = characters.get(profile.value.iconId);
    const cr = { name: '', faceId: icon0?.portrait ? icon0.id : null, role: null, second: null, path: 'balanced', fusion: null };
    const fusion = [];
    for (let n = 1; n <= 3; n++) {
      const d = await store.get(`fusion:slot${n}`, null);
      if (d?.build) fusion.push({ n, build: d.build, best: Math.max(0, ...((d.hof || []).map((e) => e.floor || 0)), d.best || 0) });
    }
    const go = () => {
      const f = cr.path === 'import' ? cr.fusion : null;
      if (f) { cr.name = cr.name || f.build.name || ''; cr.faceId = f.build.faceId ?? cr.faceId; cr.role = f.build.mainRole; cr.second = f.build.secondRole || null; }
      const c = cr.faceId != null ? characters.get(cr.faceId) : null;
      const base = f ? C.scaleImport(f.build, f.best) : C.BACKGROUNDS[cr.path];
      fill(root, header('New career', () => drawFiles()), h('div', { class: 'dy-content' },
        h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h' }, '1. WHERE YOU COME FROM'),
          h('div', { class: 'mc-paths' },
            Object.entries(C.BACKGROUNDS).map(([k, b]) => h('button', { class: `dy-option${cr.path === k ? ' is-on' : ''}`, onClick: () => { cr.path = k; cr.fusion = null; sfx.play('pick'); go(); } },
              h('b', {}, b.label), h('span', { class: 'caption' }, b.line), h('span', { class: 'caption muted' }, `Power ${b.power} · max ${b.potential}${b.dev ? ' · Star growth' : ''}`))),
            fusion.map((f) => h('button', { class: `dy-option${cr.path === 'import' && cr.fusion?.n === f.n ? ' is-on' : ''}`, onClick: () => { cr.path = 'import'; cr.fusion = f; cr.name = f.build.name || cr.name; sfx.play('pick'); go(); } },
              h('b', {}, `From Fusion: ${f.build.name || `File ${f.n}`}`), h('span', { class: 'caption' }, `Power ${f.build.powerLevel} in the Tower · best floor ${f.best || '—'}`),
              (() => { const s = C.scaleImport(f.build, f.best); return h('span', { class: 'caption muted' }, `Starts at ${s.power} · max ${s.potential}${s.dev ? ' · Star growth' : ''}${s.stock ? ` · Tower record +${s.stock} draft stock` : ''}`); })()))),
          fusion.length ? null : h('p', { class: 'caption muted' }, 'No Forbidden Fusion fighter yet. Make one there and you can bring them in.')),
        h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h' }, '2. YOU'),
          h('div', { class: 'mc-you' },
            h('button', { class: 'mc-face', 'aria-label': 'Pick a face', disabled: cr.path === 'import', onClick: () => pickFace(cr, go) }, c ? avatar(c, characters, 'lg') : h('span', { class: 'avatar avatar-lg avatar-empty' }, icon('plus', 28)), h('span', { class: 'caption muted' }, c ? `Face: ${c.name}` : 'Pick a face')),
            h('label', { class: 'dy-field' }, h('span', { class: 'label-spaced' }, 'NAME'),
              h('input', { class: 'input', maxlength: String(NAME_MAX), value: cr.name, placeholder: 'Your fighter\'s name', disabled: cr.path === 'import', onInput: (e) => { cr.name = e.target.value.slice(0, NAME_MAX); } })))),
        cr.path === 'import' ? null : h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h' }, '3. YOUR ROLES'),
          h('p', { class: 'label-spaced' }, 'MAIN ROLE'),
          h('div', { class: 'ff-cr-chips' }, ROLES.map((r) => h('button', { class: `dy-option dy-option-sm ${ROLE_CLASS(r)}${cr.role === r ? ' is-on' : ''}`, onClick: () => { cr.role = r; if (cr.second === r) cr.second = null; sfx.play('pick'); go(); } }, r))),
          h('p', { class: 'label-spaced' }, 'SECOND ROLE'),
          h('div', { class: 'ff-cr-chips' }, [null, ...ROLES.filter((r) => r !== cr.role)].map((r) => h('button', { class: `dy-option dy-option-sm${cr.second === r ? ' is-on' : ''}`, onClick: () => { cr.second = r; sfx.play('pick'); go(); } }, r || 'None'))),
          cr.second ? h('p', { class: 'caption muted' }, `Second role perk: ${SECOND_PERKS[cr.second]}.`) : null),
        h('section', { class: 'dy-panel' },
          h('p', { class: 'body-text' }, `You start at Power ${base.power} with a max of ${base.potential}. Aura ${base.aura} · Clutch ${base.clutch} · Chaos ${base.chaos}.`),
          h('button', { class: 'btn btn-primary btn-wide', onClick: async (e) => {
            const name = (cr.name || '').trim();
            if (!name) return toast('Give your fighter a name.');
            if (cr.faceId == null) return toast('Pick a face.');
            if (!cr.role) return toast('Pick a main role.');
            e.target.disabled = true; e.target.textContent = 'Setting up the league…';
            await new Promise((r) => setTimeout(r, 30));
            L = C.newCareer(characters.list, { name, faceId: cr.faceId, role: cr.role, second: cr.second, background: cr.path === 'import' ? null : cr.path, import: f ? { build: f.build, bestFloor: f.best } : null }, Date.now());
            await save(); sfx.play('correct'); draw();
          } }, 'Enter the draft'))));
    };
    go();
  }
  function pickFace(cr, redraw) {
    const search = h('input', { class: 'input', type: 'search', autocomplete: 'off', placeholder: 'Search a hero or villain', 'aria-label': 'Search characters' });
    const results = h('ul', { class: 'pick-list', role: 'listbox', 'aria-label': 'Characters' });
    const drawList = () => results.replaceChildren(...characters.search(search.value, 60).filter((c) => c.portrait).map((c) => h('li', {},
      h('button', { class: `pick-row${c.id === cr.faceId ? ' is-chosen' : ''}`, onClick: () => { cr.faceId = c.id; closeSheet(); redraw(); } },
        avatar(c, characters, 'sm'), h('span', { class: 'pick-text' }, h('span', { class: 'pick-name' }, c.name), h('span', { class: 'pick-series' }, c.series))))));
    search.addEventListener('input', drawList);
    drawList();
    sheet({ title: 'PICK A FACE', content: h('div', {}, h('p', { class: 'caption muted' }, 'Just the look. Your name and ratings are your own.'), search, results) });
    setTimeout(() => search.focus(), 50);
  }

  // ---------- Draft night ----------
  function projected() {
    const board = O.draftBoard(L).slice().sort((a, b) => b.aiEye - a.aiEye);
    const k = board.findIndex((x) => x.me);
    return k < 0 ? null : L.off.pick + k + 1;
  }
  function drawDraft() {
    const p = P(); const o = L.off;
    const done = p.team != null;
    const proj = done ? null : projected();
    const last = o.picks.slice(-8).reverse();
    const clock = o.pick < o.order.length ? team(o.order[o.pick]) : null;
    fill(root, header('Draft night', () => drawFiles()), h('div', { class: 'dy-content' },
      done ? h('section', { class: 'dy-panel mc-drafted' },
        crest(team(p.team), 96),
        h('p', { class: 'label-spaced gold' }, `ROUND ${p.draftRound} · PICK ${O.pickInRound(L, p.draftPick - 1)} (No. ${p.draftPick} overall)`),
        h('h2', { class: 'heading' }, `The ${team(p.team).name} select ${p.name}.`),
        h('p', { class: 'body-text' }, `A ${p.role} out of ${L.career.imported ? 'the Tower' : p.series}. Rookie deal: ${R.capHit(p)} a season for ${p.contract.years} seasons.`),
        h('button', { class: 'btn btn-primary btn-wide', onClick: async (e) => { e.target.disabled = true; C.finishPreseason(L); await save(); sfx.play('correct'); tab = 'week'; draw(); } }, 'Start your rookie season'))
        : h('section', { class: 'dy-panel' },
          h('div', { class: 'mc-me-row' }, face(p, 'lg'), h('span', { class: 'dy-list-text' }, h('span', { class: 'heading' }, p.name),
            h('span', { class: 'caption muted' }, `${p.role}${p.second ? ` / ${p.second}` : ''} · Power ${p.power} · max ${p.potential} · ${'★'.repeat(p.stars)}${'☆'.repeat(5 - p.stars)}`),
            h('span', { class: 'caption' }, proj ? `Projected: No. ${proj}${proj > o.order.length ? ' (could go undrafted)' : ` · round ${proj > (o.r1 || 32) ? 2 : 1}`}` : ''))),
          h('p', { class: 'label-spaced' }, clock ? `ON THE CLOCK: ${clock.name.toUpperCase()} · ROUND ${O.roundOfPick(L, o.pick)}, PICK ${O.pickInRound(L, o.pick)}` : 'THE DRAFT IS OVER'),
          h('div', { class: 'btn-row' },
            h('button', { class: 'btn btn-secondary', disabled: !clock, onClick: async () => { const pk = C.draftOne(L); sfx.play(pk?.pid === p.pid ? 'correct' : 'tap'); await save(); drawDraft(); } }, 'Next pick'),
            h('button', { class: 'btn btn-primary', disabled: !clock, onClick: async () => { while (!C.drafted(L) && C.draftOne(L)); sfx.play(C.drafted(L) ? 'correct' : 'wrong'); await save(); drawDraft(); } }, 'Sim to my pick')),
          clock ? null : h('div', {}, h('p', { class: 'body-text' }, 'Nobody called your name. A team with cap room will sign you as an undrafted free agent.'),
            h('button', { class: 'btn btn-primary btn-wide', onClick: async () => { C.finishPreseason(L); await save(); tab = 'week'; draw(); } }, 'Sign and start the season'))),
      h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h' }, 'THE BOARD'),
        last.length ? h('ul', { class: 'dy-list' }, last.map((x) => { const q = L.players[x.pid]; return h('li', { class: q?.me ? 'is-you' : '' },
          h('span', { class: 'dy-num' }, x.round === 2 ? `R2·${x.pick - (o.r1 || 0)}` : `${x.pick}`), crest(team(x.team), 24),
          h('span', { class: 'dy-list-text' }, h('span', {}, q?.name || '—'), h('span', { class: 'caption muted' }, `${team(x.team).abbr} · ${q?.role || ''} · ${q?.power || ''}`))); }))
          : h('p', { class: 'caption muted' }, 'No picks yet. The first team is on the clock.'))));
  }

  // ---------- The hub ----------
  function meCard() {
    const p = P(); const t = C.myTeam(L);
    const trust = C.trustOf(L);
    return h('section', { class: 'dy-panel mc-card' },
      h('div', { class: 'mc-me-row' }, face(p, 'lg'),
        h('span', { class: 'dy-list-text' },
          h('span', { class: 'heading' }, p.name),
          h('span', { class: `caption ${ROLE_CLASS(p.role)}` }, `${p.role}${p.second ? ` / ${p.second}` : ''} · Season ${p.career} · ${['Normal', 'Star', 'Superstar'][p.dev]} growth`),
          h('span', { class: 'caption muted' }, `${t.name} · ${t.w}-${t.l}`)),
        crest(t, 56)),
      h('div', { class: 'mc-stats' },
        stat('POWER', `${p.power}`, `max ${R.maxOf(p)}`), stat('AURA', p.aura), stat('CLUTCH', p.clutch), stat('CHAOS', p.chaos), stat('HYPE', p.hype),
        stat('POINTS', p.sp || 0, p.power >= R.STAR_LINE ? '2 per +1' : '')),
      h('div', { class: 'mc-trust' }, h('span', { class: 'label-spaced' }, `COACH TRUST · ${trust}`), h('span', { class: 'mc-bar' }, h('span', { style: `width:${trust}%` }))),
      p.injury > 0 ? h('p', { class: 'dy-boost' }, `🩹 Injured: out ${p.injury} more week${p.injury > 1 ? 's' : ''}.`) : null);
  }
  const stat = (k, v, sub = '') => h('span', { class: 'mc-stat' }, h('span', { class: 'caption muted' }, k), h('b', {}, String(v)), sub ? h('span', { class: 'caption muted' }, sub) : null);

  function nextPanel() {
    const g = C.myGame(L);
    if (!g) {
      if (L.phase === 'playoffs' && L.playoffs.champion == null && C.myAlive(L)) {
        return h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h' }, 'PLAYOFFS'), h('p', { class: 'body-text' }, 'You have a bye this round.'),
          h('button', { class: 'btn btn-primary btn-wide', onClick: async () => { R.simPlayoffs(L, true, C.myTeam(L).i); await save(); draw(); } }, 'Sim to your next game'));
      }
      return h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h gold' }, 'THE SEASON IS OVER FOR YOU'),
        h('p', { class: 'body-text' }, L.phase === 'playoffs' && C.myAlive(L) === false && L.playoffs?.seeds.includes(C.myTeam(L).i) ? 'Your playoff run is over.' : L.phase === 'playoffs' ? 'Your team missed the playoffs.' : ''),
        h('button', { class: 'btn btn-primary btn-wide', onClick: async (e) => { e.target.disabled = true; const sum = C.closeSeason(L); L.career.over = sum; await save(); draw(); } }, 'Awards night'));
    }
    const t = C.myTeam(L); const opp = team(g.home === t.i ? g.away : g.home);
    const starts = C.isStarter(L); const p = P();
    const when = L.phase === 'playoffs' ? R.roundLabel(L.playoffs, g) : `WEEK ${L.week} OF ${R.WEEKS}`;
    const ap = L.career.approach || 'balanced';
    return h('section', { class: 'dy-panel mc-next' },
      h('h2', { class: 'dy-h gold' }, when),
      h('div', { class: 'mc-vs' }, crest(t, 44), h('b', {}, `${t.abbr} ${t.w}-${t.l}`), h('span', { class: 'caption muted' }, g.home === t.i ? 'vs' : '@'), h('b', {}, `${opp.abbr} ${opp.w}-${opp.l}`), crest(opp, 44)),
      p.injury > 0 ? h('p', { class: 'body-text' }, 'You\'re hurt. Your team plays without you this week.')
        : starts ? h('p', { class: 'body-text' }, '✅ Coach has you in the lineup. Pick your approach.')
          : h('p', { class: 'body-text' }, `🪑 Coach is starting someone else this week. (Your chance to start: about ${Math.round(C.startChance(L) * 100)}%. Good grades raise it.)`),
      starts && p.injury <= 0 ? h('div', { class: 'mc-approach' }, Object.entries(C.APPROACHES).map(([k, a]) => h('button', { class: `dy-option dy-option-sm${ap === k ? ' is-on' : ''}`, onClick: async () => { L.career.approach = k; await save(); drawHub(); } }, h('b', {}, a.label), h('span', { class: 'caption' }, a.line)))) : null,
      starts && p.injury <= 0 ? h('button', { class: 'btn btn-primary btn-wide', onClick: () => fight(g) }, 'Fight') : h('button', { class: 'btn btn-primary btn-wide', onClick: async () => { const e = C.simMyWeek(L); await save(); recap(e, g); } }, 'Sim the week'));
  }
  function trainPanel() {
    if (!C.canTrain(L)) return h('p', { class: 'dy-boost is-train' }, P().injury > 0 ? '🩹 No training while you\'re hurt.' : '🏋️ You trained this week.');
    return h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h' }, 'TRAIN THIS WEEK'),
      h('div', { class: 'mc-train' }, Object.entries(C.TRAIN).map(([k, x]) => h('button', { class: 'dy-option dy-option-sm', onClick: async () => { const r = C.train(L, k); sfx.play('correct'); await save(); toast(`Training: ${r}.`); drawHub(); } }, h('b', {}, x.label), h('span', { class: 'caption' }, x.line)))));
  }
  function logPanel() {
    const gs = L.career.games.filter((x) => x.season === L.season);
    if (!gs.length) return null;
    return h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h' }, 'THIS SEASON'),
      h('ul', { class: 'dy-list' }, gs.map((x) => h('li', {},
        h('span', { class: `dy-num ${x.won ? 'win' : 'loss'}` }, x.won ? 'W' : 'L'), crest(team(x.opp), 22),
        h('span', { class: 'dy-list-text' }, h('span', {}, `${x.round || `Week ${x.week}`} vs ${team(x.opp).abbr} · ${x.score.join('–')}`),
          h('span', { class: 'caption muted' }, x.played ? `Grade ${x.grade} · ${fmt(x.line?.[0] || 0)} dmg · ${x.line?.[1] || 0} KO${x.mvp ? ' · MVP' : ''}` : 'Did not play'))))));
  }
  function teamPanel() {
    const t = C.myTeam(L);
    const ps = t.roster.map((pid) => L.players[pid]).sort((a, b) => b.power - a.power);
    const five = new Set(R.aiStarters(L, t).map((x) => x.pid));
    return h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h' }, `${t.name.toUpperCase()} · ${t.w}-${t.l}`),
      h('p', { class: 'caption muted' }, `Coach ${t.coachName}. ★ = the coach's five right now.`),
      h('ul', { class: 'dy-list' }, ps.map((q) => h('li', { class: q.me ? 'is-you' : '' }, face(q, 'sm'),
        h('span', { class: 'dy-list-text' }, h('span', {}, `${five.has(q.pid) ? '★ ' : ''}${q.name}`), h('span', { class: `caption ${ROLE_CLASS(q.role)}` }, `${q.role} · ${q.power}${q.injury ? ` · OUT ${q.injury} wk` : ''}`))))));
  }
  function leaguePanel() {
    const t = C.myTeam(L);
    const rows = R.standings(L).slice(0, 12);
    return h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h' }, 'STANDINGS'),
      h('ol', { class: 'dy-seeds' }, rows.map((x, k) => h('li', { class: x.i === t.i ? 'is-you' : '' }, h('span', { class: 'dy-seed-n' }, String(k + 1)), crest(x, 24), h('span', { class: 'dy-seed-name' }, x.name, h('span', { class: 'caption muted' }, ` ${x.w}-${x.l}`))))),
      R.standings(L).findIndex((x) => x.i === t.i) >= 12 ? h('p', { class: 'caption muted' }, `${t.name}: ${R.standings(L).findIndex((x) => x.i === t.i) + 1}th`) : null);
  }
  function drawHub() {
    const tabs = [['week', 'THIS WEEK'], ['team', 'MY TEAM'], ['league', 'LEAGUE']];
    fill(root, header(`Season ${P().career}`, () => drawFiles()), h('div', { class: 'dy-content' },
      meCard(),
      h('div', { class: 'dy-tabs', role: 'tablist' }, tabs.map(([k, l]) => h('button', { class: `dy-tab${tab === k ? ' is-on' : ''}`, role: 'tab', 'aria-selected': String(tab === k), onClick: () => { tab = k; drawHub(); } }, l))),
      tab === 'week' ? [trainPanel(), nextPanel(), logPanel()] : tab === 'team' ? teamPanel() : leaguePanel()));
  }

  // ---------- Fight ----------
  function flip(res) {
    const sw = (s) => (s === 'A' ? 'B' : s === 'B' ? 'A' : s);
    return { ...res, winner: sw(res.winner), score: [res.score[1], res.score[0]], events: res.events.map((e) => (e.side ? { ...e, side: sw(e.side) } : e)) };
  }
  function fight(g) {
    const t = C.myTeam(L); const home = g.home === t.i; const opp = team(home ? g.away : g.home);
    const ap = L.career.approach || 'balanced';
    const lu = C.lineupsFor(L, g);
    const cards = C.cardsFor(L, g, lu, ap);
    const stage = h('div', { class: 'ff-stage' });
    const after = h('div', { class: 'ff-after', hidden: true });
    fill(root, header('Fight night'), h('p', { class: 'caption muted mc-fight-note' }, `You: ${P().name} (${C.APPROACHES[ap].label}). Slot ${(home ? lu.home : lu.away).indexOf(P().pid) + 1} of 5.`), stage, after);
    const seed = Math.floor(R.nextRand(L) * 2 ** 31);
    fightView = playMatch(stage, {
      teamA: home ? cards.home : cards.away, teamB: home ? cards.away : cards.home, seed,
      labels: { A: t.abbr, B: opp.abbr }, names: { B: opp.name },
      onDone: async (res) => {
        const r = home ? res : flip(res);
        const e = C.finishGame(L, g, lu, ap, r);
        await save();
        after.hidden = false;
        fill(after, h('button', { class: 'btn btn-primary btn-wide', onClick: () => recap(e, g) }, 'Continue'));
        after.querySelector('button').focus();
      },
    });
  }
  function recap(e, g) {
    fightView = null;
    if (!e) return draw();
    const t = C.myTeam(L);
    fill(root, header('Result', () => draw()), h('div', { class: 'dy-content' },
      h('section', { class: 'dy-panel mc-recap' },
        h('h2', { class: `dy-h ${e.won ? 'gold' : 'loss'}` }, `${e.won ? 'WIN' : 'LOSS'} · ${t.abbr} ${e.score.join('–')} ${team(e.opp).abbr}`),
        e.played ? [
          h('p', { class: 'mc-grade' }, h('span', { class: 'caption muted' }, 'YOUR GRADE'), h('b', {}, e.grade)),
          h('p', { class: 'body-text' }, `${fmt(e.line?.[0] || 0)} damage · ${e.line?.[1] || 0} KO · ${e.line?.[2] || 0} special${(e.line?.[2] || 0) === 1 ? '' : 's'}${e.mvp ? ' · Game MVP 🏅' : ''}`),
          h('p', { class: 'caption muted' }, `Coach trust now ${e.trust} (${C.TRUST_MOVE[e.grade] + (e.won ? 1 : 0) >= 0 ? '+' : ''}${C.TRUST_MOVE[e.grade] + (e.won ? 1 : 0)}).`),
        ] : h('p', { class: 'body-text' }, P().injury > 0 ? 'You sat this one out, hurt.' : 'You watched from the bench.'),
        h('button', { class: 'btn btn-primary btn-wide', onClick: () => draw() }, 'Back to the week'))));
  }

  // ---------- Season's end ----------
  function drawSeasonEnd() {
    const s = L.career.over; const t = team(s.team); const p = P();
    const st = s.stats;
    const lines = [s.champion ? '🏆 Champions: you won the Celestial Grail.' : null, s.gpt ? '👑 You are the GPT, the league\'s best player.' : null, s.roy ? `🌟 Rookie of the Year. Your growth moves up to ${['Normal', 'Star', 'Superstar'][p.dev]}.` : null, s.breakout ? '📈 Breakout jump: +3 Power and +5 to your max.' : null].filter(Boolean);
    fill(root, header(`Season ${p.career} wrap-up`, () => drawFiles()), h('div', { class: 'dy-content' },
      h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h gold' }, `SEASON ${p.career} · ${t.name.toUpperCase()} ${s.w}-${s.l}`),
        h('div', { class: 'mc-stats' }, stat('GAMES', st.gp), stat('RECORD', `${st.w}-${st.l}`), stat('DAMAGE', fmt(st.dmg)), stat('KO', st.ko), stat('SPECIALS', st.sp), stat('POWER', s.power)),
        lines.length ? h('ul', { class: 'mc-awards' }, lines.map((x) => h('li', { class: 'body-text' }, x))) : h('p', { class: 'body-text' }, 'No hardware this year. Back to work.')),
      h('section', { class: 'dy-panel' }, h('p', { class: 'body-text' }, 'The off-season runs on its own for now: retirements, the draft, free agency. Your team keeps you, and if your deal is up you re-sign.'),
        h('button', { class: 'btn btn-primary btn-wide', onClick: async (e) => { e.target.disabled = true; e.target.textContent = 'Running the off-season…'; await new Promise((r) => setTimeout(r, 30)); C.nextSeason(L); L.career.over = null; await save(); tab = 'week'; sfx.play('correct'); draw(); } }, `Start season ${p.career + 1}`))));
  }

  draw();
  return root;
}
