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
import * as CP from './career-phone.js';
import { createPhone } from '../core/phone-ui.js';

const NAME_MAX = 20;
const fmt = (n) => Math.round(n).toLocaleString();
const crestUrl = (t) => `art/afl/crests/${t.crest}.webp`;
const crest = (t, size = 32) => h('img', { class: 'dy-crest', src: crestUrl(t), alt: '', width: size, height: size, style: `width:${size}px;height:${size}px` });
const TROPHY_ICON = { title: '🏆', gpt: '👑', roy: '🌟', role: '🎖️', allafl: '⭐', awakening: '🔥', phoenix: '🐦‍🔥', breakout: '📈', potw: '🏅' };
const ROLE_CLASS = (r) => `role-${(r || '').toLowerCase()}`;

const help = howToPlay('my-career', 'My Career', [
  'You are one fighter in the Anime Fighting League, not the coach. Make a new fighter or bring one in from Forbidden Fusion.',
  'A Fusion fighter starts over as a rookie: a 99 in the Tower comes in around 74 with a high ceiling, and a deep Tower record helps your draft stock.',
  'Draft night: watch the board until a team calls your name. Two rounds; nobody is guaranteed a spot.',
  'Every week: train once (Power, Aura or Clutch), then see if the coach starts you. If you start, pick your approach and fight.',
  'Coach trust: good grades and wins earn more starts. A bad night costs you. Once you are one of the team\'s best five, you start every week. A top-7 pick starts every game of his rookie season.',
  'Talk to the coach every 3 weeks: ask for more starts, ask to lead off (fight first), ask what to work on (that training counts double), or just tell him you\'re all in.',
  'Awards: Player of the Week (league-wide), and at season\'s end the GPT, Rookie of the Year, best at your role, All-AFL First Team and more. They all go in your trophy case (Career tab).',
  'Growth: like every card, you bank skill points every 3 weeks. Above 90, +1 Power costs 2 points.',
  'Awards night: Rookie of the Year, the GPT, breakout jumps. Then the off-season runs and your next season starts.',
  'Contracts: when your deal is up, your team makes an offer (better with more coach trust). Take it, or test free agency and pick from the teams that want you.',
  'Trade requests: once a season, before the Week 8 deadline. Pick a team that wants you; a no costs trust.',
  'Your phone: your coach, your agent and your teammates text you; fans talk about you on Chirp; you post your big nights on Lenz; teammates snap you (snap back for a streak: +1 Aura for your next fight).',
  'Sponsorships: your agent brings brand deals. Up to 3 at once; each pays every season as long as your Hype is at its bar at season\'s end. Bigger brands come with more fame.',
  'Retirement: from season 7 you can retire after any season; after season 14 you have to. Your career is scored for the Hall of Fame, and every retired career is kept in the Hall.',
]);

export async function render() {
  await profile.update({ lastMode: 'my-career' });
  let slot = profile.value.careerSlot || 1;
  let L = await store.get(C.slotKey(slot), null);
  const root = h('section', { class: 'screen mode career dynasty' });
  let fightView = null;
  const live = () => !!(L && L.career && !L.career.retired && C.me(L).team != null);
  const phone = createPhone({
    apps: ['messages', 'chirp', 'lenz', 'boo', 'news', 'calendar', 'wallet', 'photos', 'settings'],
    shortcutWhere: 'My Career',
    mode: 'dynasty',
    me: () => ({ name: L ? C.me(L).name : 'You', cid: L ? C.me(L).cid : null }),
    news: () => (L?.news || []).slice(0, 30).map((n) => ({ src: `${n.kind || 'AFL'} · ${n.week ? `WEEK ${n.week}` : `SEASON ${L.season}`}`, title: n.title, text: n.text })),
    calendar: () => careerCalendar(),
    aiSetting: () => (live() ? `The player is ${C.me(L).name}, a ${C.me(L).role} on ${C.myTeam(L).name} in the Anime Fighting League (season ${C.me(L).career} of their career, ${L.phase === 'season' ? `week ${L.week}` : L.phase}). They are a fighter, not a coach.` : ''),
    contacts: () => (live() ? C.myTeam(L).roster.map((pid) => L.players[pid]).filter((x) => x && !x.me).map((x) => ({ key: `p-${x.pid}`, name: x.name, cid: x.cid ?? null, kind: 'player' })) : []),
    wallet: () => careerWallet(),
    getPhone: () => (live() ? CP.phoneOf(L) : null),
    save: () => save(),
    getKey: () => L?.career?.phoneKey || 'p',
    setKey: (k) => { if (L?.career) { L.career.phoneKey = k; save(); } },
    widgets: () => (live() ? [[`${C.me(L).power}`, 'POWER'], [`${C.myTeam(L).w}-${C.myTeam(L).l}`, C.myTeam(L).abbr], [(CP.phoneOf(L).followers || 0).toLocaleString(), 'FANS']] : []),
    empty: () => 'Your coach, your agent and your teammates text you here.',
    dateCtx: () => null,
    streakPerk: `gives +${CP.SNAP_AURA} Aura for your next fight (up to +3)`,
    onSnapStreak: () => { if (!live()) return null; const t = CP.onSnapStreak(L); save(); return t; },
    onReply: (key, optionId) => { if (!L) return null; const t = CP.reply(L, key, optionId); save(); if (root.querySelector('.mc-card')) drawHub(); return t; },
  });
  phone.show(false);
  root._cleanup = () => { closeSheet(); if (fightView) fightView.stop(); phone.destroy(); };
  function careerCalendar() {
    if (!live()) return [];
    const t = C.myTeam(L); const out = [];
    if (L.phase === 'season') {
      for (let w = L.week; w <= Math.min(R.WEEKS, L.week + 5); w += 1) {
        const g = L.schedule[w - 1]?.find((x) => x.home === t.i || x.away === t.i);
        if (!g) continue;
        const opp = L.teams[g.home === t.i ? g.away : g.home];
        out.push({ when: `WEEK ${w}`, title: `${g.home === t.i ? 'vs' : 'at'} ${opp.name}`, text: `${opp.w}-${opp.l}${w === L.week ? ' · next up' : ''}`, tag: w === L.week ? 'callout' : '' });
        if (w === R.TRADE_DEADLINE) out.push({ when: `WEEK ${w}`, title: 'Trade deadline', text: 'Last week to ask for a trade', tag: 'deal' });
      }
      out.push({ when: `AFTER WK ${R.WEEKS}`, title: 'Playoffs', text: '10 teams, play-in first', tag: 'boss' });
    } else if (L.phase === 'playoffs') out.push({ when: 'NOW', title: 'Playoffs', text: 'One and done', tag: 'boss' });
    return out;
  }
  function careerWallet() {
    if (!live()) return null;
    const p = C.me(L); const c = L.career;
    const deals = (c.deals || []).reduce((n, d) => n + d.per, 0);
    return {
      big: ['CAREER EARNINGS', (c.earnings || 0).toFixed(1)],
      note: `${p.name} · ${C.myTeam(L).name}`,
      rows: [['Salary', `${R.capHit(p)} a season`], ['Contract', C.contractLine(p)], ['Sponsors', `${(c.deals || []).length}/${CP.MAX_DEALS} · ${deals.toFixed(1)} a season`],
        ...(c.deals || []).map((d) => [d.name, `${d.per} · Hype ${d.bar}+ · ${d.left} left`]), ['From sponsors so far', (c.dealEarnings || 0).toFixed(1)], ['Fans', (CP.phoneOf(L).followers || 0).toLocaleString()]],
    };
  }
  const header = (sub, onBack) => modeHeader({ title: 'My Career', sub, onHelp: () => help.show(), onBack });
  const save = () => (L ? store.set(C.slotKey(slot), L) : store.remove(C.slotKey(slot)));
  const team = (i) => L.teams[i];
  const P = () => C.me(L);
  const face = (p, size = 'md') => { const c = p.cid != null ? characters.get(p.cid) : null; return c ? avatar(c, characters, size) : h('span', { class: `avatar avatar-${size} avatar-empty` }, '?'); };
  let tab = 'week';

  function draw() {
    phone.show(live());
    if (live() && L.phase === 'season' && L.career.phonedSeason !== L.season) { L.career.phonedSeason = L.season; CP.seasonStart(L); save(); }
    if (L?.career?.retired) return drawRetired();
    if (!L) return drawFiles();
    if (L.career.off?.stage === 'resign') return drawResign();
    if (L.career.off?.stage === 'fa') return drawMarket();
    if (L.phase === 'offseason' && L.off?.step === 'draft') return drawDraft();
    if (L.career.over) return drawSeasonEnd();
    return drawHub();
  }

  // ---------- Save files ----------
  async function drawFiles() {
    phone.show(false);
    const rows = [];
    for (let n = 1; n <= C.SLOTS; n++) {
      const x = await store.get(C.slotKey(n), null);
      const p = x ? x.players[x.career.pid] : null;
      rows.push(h('li', { class: 'dy-panel mc-file' },
        p ? face(p) : h('span', { class: 'avatar avatar-md avatar-empty' }, String(n)),
        h('span', { class: 'dy-list-text' }, h('span', { class: 'heading' }, p ? p.name : `File ${n}`),
          h('span', { class: 'caption muted' }, !p ? 'Empty' : x.career.retired ? `Retired${x.career.retired.hof ? ' · Hall of Famer' : ''} · ${x.career.retired.seasons} seasons` : p.team != null ? `${x.teams[p.team].name} · Season ${p.career} · Power ${p.power}` : 'Draft night')),
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
      h('ul', { class: 'mc-files' }, rows),
      h('button', { class: 'btn btn-secondary', onClick: () => drawHall() }, '🏛️ The Hall')));
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
        p.draftPick <= C.TOP_PICK ? h('p', { class: 'dy-boost gold' }, `Top-${C.TOP_PICK} pick: they need you now. You start every game of your rookie season.`) : h('p', { class: 'caption muted' }, 'You\'ll have to earn your starts. Good grades build coach trust.'),
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
          h('span', { class: 'caption muted' }, `${t.name} · ${t.w}-${t.l}`),
          h('span', { class: 'caption muted' }, `💰 ${C.contractLine(p)}${p.contract?.left === 1 ? ' · CONTRACT YEAR' : ''}`)),
        crest(t, 56)),
      h('div', { class: 'mc-stats' },
        stat('POWER', `${p.power}`, `max ${R.maxOf(p)}`), stat('AURA', p.aura), stat('CLUTCH', p.clutch), stat('CHAOS', p.chaos), stat('HYPE', p.hype),
        stat('POINTS', p.sp || 0, p.power >= R.STAR_LINE ? '2 per +1' : '')),
      h('div', { class: 'mc-trust' }, h('span', { class: 'label-spaced' }, `${C.standing(L).toUpperCase()} · COACH TRUST ${trust} (${C.trustLabel(L)})`), h('span', { class: 'mc-bar' }, h('span', { style: `width:${trust}%` }))),
      C.topPickRookie(L) ? h('p', { class: 'caption gold' }, `Top-${C.TOP_PICK} pick: you start every game of your rookie season.`) : null,
      activeNotes(),
      p.injury > 0 ? h('p', { class: 'dy-boost' }, `🩹 Injured: out ${p.injury} more week${p.injury > 1 ? 's' : ''}.`) : null);
  }
  function activeNotes() {
    const xs = [C.promiseBoost(L) ? '🤝 Coach promised more starts' : null, C.leadsOff(L) ? '🥇 You lead off' : null, C.focusStat(L) ? `🎯 Coach's focus: ${C.TRAIN[C.focusStat(L)].label} counts double` : null].filter(Boolean);
    return xs.length ? h('p', { class: 'caption mc-notes' }, xs.join(' · ')) : null;
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
        h('button', { class: 'btn btn-primary btn-wide', onClick: async (e) => { e.target.disabled = true; const sum = C.closeSeason(L); sum.pay = CP.seasonPayday(L); L.career.over = sum; await save(); draw(); } }, 'Awards night'));
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
      starts && p.injury <= 0 ? h('button', { class: 'btn btn-primary btn-wide', onClick: () => fight(g) }, 'Fight') : h('button', { class: 'btn btn-primary btn-wide', onClick: async () => { const e = C.simMyWeek(L); if (e) CP.afterGame(L, e); await save(); recap(e, g); } }, 'Sim the week'));
  }
  function trainPanel() {
    if (!C.canTrain(L)) return h('p', { class: 'dy-boost is-train' }, P().injury > 0 ? '🩹 No training while you\'re hurt.' : '🏋️ You trained this week.');
    return h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h' }, 'TRAIN THIS WEEK'),
      h('div', { class: 'mc-train' }, Object.entries(C.TRAIN).map(([k, x]) => h('button', { class: 'dy-option dy-option-sm', onClick: async () => { const r = C.train(L, k); sfx.play('correct'); await save(); toast(`Training: ${r}.`); drawHub(); } }, h('b', {}, x.label), h('span', { class: 'caption' }, x.line)))));
  }
  function talkPanel() {
    const t = C.myTeam(L);
    const last = L.career.talk && L.career.talk.season === L.season ? L.career.talk : null;
    const lastBox = last ? h('div', { class: `mc-talk-last${last.ok ? '' : ' is-no'}` }, h('span', { class: 'caption muted' }, `Coach ${last.coach}:`), h('span', { class: 'body-text' }, `"${last.line}"`), h('span', { class: 'caption' }, last.effect)) : null;
    if (!C.canTalk(L)) return h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h' }, 'TALK TO THE COACH'), lastBox, h('p', { class: 'caption muted' }, `You can talk to him again in ${Math.max(1, C.nextTalkWeek(L) - R.gameWeek(L))} week${C.nextTalkWeek(L) - R.gameWeek(L) === 1 ? '' : 's'}.`));
    return h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h' }, `TALK TO COACH ${t.coachName.toUpperCase()}`),
      h('p', { class: 'caption muted' }, 'One talk every 3 weeks. Pick what you want from him.'),
      h('div', { class: 'mc-train' }, Object.entries(C.TALKS).map(([k, x]) => h('button', { class: 'dy-option dy-option-sm', onClick: async () => { const r = C.talk(L, k); sfx.play(r?.ok ? 'correct' : 'wrong'); await save(); drawHub(); } }, h('b', {}, x.label), h('span', { class: 'caption' }, x.line)))),
      lastBox);
  }
  function tradePanel() {
    if (!C.canAskTrade(L)) return null;
    return h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h' }, 'REQUEST A TRADE'),
      h('p', { class: 'caption muted' }, `Once a season, before the Week ${R.TRADE_DEADLINE} deadline. The front office says yes more often when you aren't starting or the coach doesn't trust you. A no costs 8 trust. Chance right now: about ${Math.round(C.tradeOdds(L) * 100)}%.`),
      h('button', { class: 'btn btn-secondary', onClick: () => openTrade() }, 'See who wants you'));
  }
  function openTrade() {
    const list = C.tradeSuitors(L);
    sheet({ title: 'WHO WANTS YOU', content: h('div', {},
      list.length ? h('ul', { class: 'dy-list' }, list.map((x) => { const t = team(x.team); const b = L.players[x.back]; return h('li', {}, crest(t, 32),
        h('span', { class: 'dy-list-text' }, h('span', {}, `${t.name} · ${t.w}-${t.l}`), h('span', { class: 'caption muted' }, `${R.STAGE_LABEL[x.stage]} · you'd be: ${x.role} · they send ${b.name} (${b.role}, ${b.power})`)),
        h('button', { class: 'btn btn-primary btn-sm', onClick: async () => {
          closeSheet();
          const r = C.askTrade(L, x); await save();
          if (r.ok) { sfx.play('correct'); toast(`Traded! You're a ${team(r.team).name} now.`); } else { sfx.play('wrong'); toast('The front office said no. Coach heard about it (trust −8).'); }
          drawHub();
        } }, 'Ask for this')); }))
        : h('p', { class: 'body-text' }, 'Nobody has the cap room or the need for you right now. Try again next season.')) });
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
  function potwLine() {
    const x = L.career.lastPotw;
    if (!x || L.phase !== 'season' || x.week !== L.week - 1) return null;
    return h('p', { class: `dy-boost${x.me ? ' gold' : ''}` }, x.me ? `🏅 You're the AFL Player of the Week (Week ${x.week})!` : `🏅 Player of the Week ${x.week}: ${x.name} (${team(x.team)?.abbr || ''})`);
  }
  function careerPanel() {
    const p = P(); const tot = C.careerTotals(L); const ss = L.career.seasons || []; const tr = L.career.trophies || [];
    return [
      h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h' }, 'CAREER TOTALS'),
        h('div', { class: 'mc-stats' }, stat('SEASONS', ss.length + (L.career.over ? 0 : 1)), stat('GAMES', tot.gp), stat('RECORD', `${tot.w}-${tot.l}`), stat('DAMAGE', fmt(tot.dmg)), stat('KO', tot.ko), stat('PLAYER OF THE WEEK', L.career.potw || 0))),
      h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h gold' }, `TROPHY CASE · ${tr.length}`),
        tr.length ? h('ul', { class: 'dy-list' }, tr.map((x) => h('li', {}, h('span', { class: 'dy-num' }, `S${x.season}`), h('span', { class: 'dy-list-text' }, h('span', {}, `${TROPHY_ICON[x.kind] || '🏅'} ${x.name}`))))) : h('p', { class: 'caption muted' }, 'Empty for now. Go win something.')),
      ss.length ? h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h' }, 'SEASON BY SEASON'),
        h('ul', { class: 'dy-list' }, ss.map((x) => h('li', {}, crest(team(x.team), 22), h('span', { class: 'dy-list-text' }, h('span', {}, `Season ${x.career ?? '?'} · ${team(x.team).abbr} ${x.w}-${x.l}${x.champion ? ' 🏆' : ''}`),
          h('span', { class: 'caption muted' }, `${x.stats.gp} games · ${fmt(x.stats.dmg)} dmg · ${x.stats.ko} KO · Power ${x.power}${x.standing ? ` · ${x.standing}` : ''}`)))))) : null,
      h('p', { class: 'caption muted' }, `Drafted ${p.draftPick ? `No. ${p.draftPick} (round ${p.draftRound})` : 'undrafted'}${L.career.imported ? ' · came up from the Tower' : ''}.${(L.career.moves || []).map((m) => (m.kind === 'traded' ? ` Traded to ${team(m.team).abbr} (season ${m.season}).` : ` Signed with ${team(m.team).abbr} (before season ${m.season + 1}).`)).join('')}`),
    ];
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
    const tabs = [['week', 'THIS WEEK'], ['team', 'MY TEAM'], ['league', 'LEAGUE'], ['career', 'CAREER']];
    fill(root, header(`Season ${P().career}`, () => drawFiles()), h('div', { class: 'dy-content' },
      meCard(),
      h('div', { class: 'dy-tabs', role: 'tablist' }, tabs.map(([k, l]) => h('button', { class: `dy-tab${tab === k ? ' is-on' : ''}`, role: 'tab', 'aria-selected': String(tab === k), onClick: () => { tab = k; drawHub(); } }, l))),
      tab === 'week' ? [potwLine(), trainPanel(), nextPanel(), talkPanel(), tradePanel(), logPanel()] : tab === 'team' ? teamPanel() : tab === 'career' ? careerPanel() : leaguePanel()));
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
        CP.afterGame(L, e);
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
          (() => { const q = C.coachReact(L, e); return q ? h('p', { class: 'mc-talk-last' }, h('span', { class: 'caption muted' }, `Coach ${C.myTeam(L).coachName}:`), h('span', { class: 'body-text' }, `"${q}"`)) : null; })(),
        ] : h('p', { class: 'body-text' }, P().injury > 0 ? 'You sat this one out, hurt.' : 'You watched from the bench.'),
        e.potw ? h('p', { class: `dy-boost${e.potw.me ? ' gold' : ''}` }, e.potw.me ? '🏅 You\'re the AFL Player of the Week!' : `🏅 Player of the Week: ${e.potw.name} (${team(e.potw.team)?.abbr || ''})`) : null,
        h('button', { class: 'btn btn-primary btn-wide', onClick: () => draw() }, 'Back to the week'))));
  }

  // ---------- Contract time (v0.40.0) ----------
  function offerRow(o, onPick, label = 'Sign') {
    const t = team(o.team);
    return h('li', { class: o.former ? 'is-you' : '' }, crest(t, 36),
      h('span', { class: 'dy-list-text' }, h('span', { class: 'heading' }, `${t.name}${o.former ? ' (your team)' : ''}`),
        h('span', { class: 'caption' }, `${o.per} a season × ${o.years} = ${Math.round(o.per * o.years * 10) / 10}`),
        h('span', { class: 'caption muted' }, `${R.STAGE_LABEL[o.stage || t.stage]} · last season ${t.lastW ?? t.w}-${t.lastL ?? t.l} · you'd be: ${o.role}`)),
      h('button', { class: 'btn btn-primary btn-sm', onClick: onPick }, label));
  }
  function drawResign() {
    const p = P(); const o = L.career.off.offer; const t = team(o.team);
    fill(root, header('Contract time', () => drawFiles()), h('div', { class: 'dy-content' },
      h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h gold' }, 'YOUR CONTRACT IS UP'),
        h('div', { class: 'mc-me-row' }, face(p, 'lg'), h('span', { class: 'dy-list-text' }, h('span', { class: 'heading' }, p.name), h('span', { class: 'caption muted' }, `Power ${p.power} · Hype ${p.hype} · you're asking about ${o.ask} a season`))),
        h('p', { class: 'body-text' }, `${t.name} want you back. Coach trust (${C.trustOf(L)}) shapes their number: higher trust, better offer.`),
        h('ul', { class: 'dy-list' }, offerRow({ ...o, stage: t.stage, former: true }, async () => { C.acceptResign(L); await save(); sfx.play('correct'); toast(`Re-signed with ${t.name}.`); draw(); }, 'Re-sign'))),
      h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h' }, 'OR TEST FREE AGENCY'),
        h('p', { class: 'body-text' }, `Walk away and hear what the other teams offer after the draft. ${t.name} can still bid, but only if they have room left.`),
        h('button', { class: 'btn btn-secondary btn-wide', onClick: async () => {
          if (!(await confirmSheet({ title: 'TEST FREE AGENCY?', message: `You leave ${t.name}'s offer on the table. They may not have room for you later.`, confirmLabel: 'Test the market' }))) return;
          C.testMarket(L); await save(); draw();
        } }, 'Test the market'))));
  }
  function drawMarket() {
    const p = P(); const offers = L.career.off.offers;
    fill(root, header('Free agency', () => drawFiles()), h('div', { class: 'dy-content' },
      h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h gold' }, 'YOUR OFFERS'),
        h('p', { class: 'body-text' }, `${p.name} · Power ${p.power} · ${p.role}. Pick where you play next. "You'd be" is where you'd rank on that roster right now.`),
        h('ul', { class: 'dy-list mc-offers' }, offers.map((o, k) => offerRow(o, async () => {
          if (!(await confirmSheet({ title: `SIGN WITH ${team(o.team).name.toUpperCase()}?`, message: `${o.per} a season for ${o.years} season${o.years === 1 ? '' : 's'}.${o.former ? '' : ' New team, new coach: trust starts at 50.'}`, confirmLabel: 'Sign' }))) return;
          C.signWith(L, k); await save(); sfx.play('correct'); toast(`You're a ${team(o.team).name} now.`); tab = 'week'; draw();
        }))))));
  }

  // ---------- Retired / Hall of Fame (v0.41.0) ----------
  function drawRetired() {
    const r = L.career.retired; const p = P(); const tr = L.career.trophies || [];
    phone.show(false);
    fill(root, header('Retired', () => drawFiles()), h('div', { class: 'dy-content' },
      h('section', { class: `dy-panel mc-retired${r.hof ? ' is-hof' : ''}` }, face(p, 'lg'),
        h('p', { class: 'label-spaced gold' }, r.pantheon ? 'THE GENERATIONAL PANTHEON' : r.hof ? 'HALL OF FAME' : 'RETIRED'),
        h('h2', { class: 'heading' }, r.pantheon ? `${p.name} is one of the all-time greats.` : r.hof ? `${p.name} is a Hall of Famer.` : `${p.name} hangs them up.`),
        h('p', { class: 'body-text' }, `${r.seasons} seasons · ${r.teams.join(' → ')} · peak Power ${r.peak}. Hall of Fame score ${r.score} (the line is ${CP.HOF_LINE}).`),
        h('div', { class: 'mc-stats' }, stat('GAMES', r.totals.gp), stat('RECORD', `${r.totals.w}-${r.totals.l}`), stat('DAMAGE', fmt(r.totals.dmg)), stat('KO', r.totals.ko), stat('TITLES', r.titles), stat('EARNINGS', r.earnings.toFixed(1)))),
      tr.length ? h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h gold' }, `TROPHY CASE · ${tr.length}`),
        h('ul', { class: 'dy-list' }, tr.map((x) => h('li', {}, h('span', { class: 'dy-num' }, `S${x.season}`), h('span', { class: 'dy-list-text' }, h('span', {}, `${TROPHY_ICON[x.kind] || '🏅'} ${x.name}`)))))) : null,
      h('button', { class: 'btn btn-secondary btn-wide', onClick: () => drawHall() }, 'The Hall'),
      h('button', { class: 'btn btn-primary btn-wide', onClick: () => drawFiles() }, 'Back to your files')));
  }
  async function drawHall() {
    phone.show(false);
    const hall = await CP.hallList();
    fill(root, header('The Hall', () => (L ? draw() : drawFiles())), h('div', { class: 'dy-content' },
      h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h gold' }, 'EVERY CAREER YOU FINISHED'),
        h('p', { class: 'caption muted' }, `Hall of Fame line: a score of ${CP.HOF_LINE}. Titles, the GPT, awards, Player of the Week, seasons, knockouts and peak Power all count.`),
        hall.length ? h('ul', { class: 'dy-list' }, hall.map((x) => { const c = x.cid != null ? characters.get(x.cid) : null; return h('li', { class: x.hof ? 'is-you' : '' }, c ? avatar(c, characters, 'sm') : null,
          h('span', { class: 'dy-list-text' }, h('span', {}, `${x.pantheon ? '🌌 ' : x.hof ? '🏛️ ' : ''}${x.name}`), h('span', { class: 'caption muted' }, `${x.seasons} seasons · ${x.teams.join(' → ')} · ${x.titles} title${x.titles === 1 ? '' : 's'} · ${x.trophies} trophies · score ${x.score}`))); }))
          : h('p', { class: 'body-text' }, 'Nobody yet. Finish a career and it lands here.'))));
  }

  // ---------- Season's end ----------
  function drawSeasonEnd() {
    const s = L.career.over; const t = team(s.team); const p = P();
    const st = s.stats;
    const lines = [s.champion ? '🏆 Champions: you won the Celestial Grail.' : null, s.gpt ? '👑 You are the GPT, the league\'s best player.' : null, s.roy ? `🌟 Rookie of the Year. Your growth moves up to ${['Normal', 'Star', 'Superstar'][p.dev]}.` : null,
      s.role ? `🎖️ ${s.role}: the best ${p.role} in the league.` : null, s.allAfl ? '⭐ All-AFL First Team.' : null, s.awakening ? `🔥 ${R.AWARDS.awakening}: the biggest jump of any young card.` : null, s.phoenix ? `🐦‍🔥 ${R.AWARDS.phoenix}.` : null,
      s.breakout ? '📈 Breakout jump: +3 Power and +5 to your max.' : null, s.potw ? `🏅 Player of the Week ${s.potw} time${s.potw > 1 ? 's' : ''}.` : null].filter(Boolean);
    fill(root, header(`Season ${p.career} wrap-up`, () => drawFiles()), h('div', { class: 'dy-content' },
      h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h gold' }, `SEASON ${p.career} · ${t.name.toUpperCase()} ${s.w}-${s.l}`),
        h('div', { class: 'mc-stats' }, stat('GAMES', st.gp), stat('RECORD', `${st.w}-${st.l}`), stat('DAMAGE', fmt(st.dmg)), stat('KO', st.ko), stat('SPECIALS', st.sp), stat('POWER', s.power)),
        lines.length ? h('ul', { class: 'mc-awards' }, lines.map((x) => h('li', { class: 'body-text' }, x))) : h('p', { class: 'body-text' }, 'No hardware this year. Back to work.')),
      s.pay ? h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h' }, 'PAYDAY'),
        h('p', { class: 'body-text' }, `Salary ${s.pay.salary} + sponsors ${Math.round(s.pay.deals * 10) / 10}. Career earnings: ${(L.career.earnings || 0).toFixed(1)}.`),
        s.pay.dropped.length ? h('p', { class: 'caption loss' }, `Dropped by ${s.pay.dropped.join(', ')} (Hype under their bar).`) : null) : null,
      CP.canRetire(L) ? h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h' }, CP.mustRetire(L) ? 'TIME TO HANG THEM UP' : 'RETIREMENT'),
        h('p', { class: 'body-text' }, CP.mustRetire(L) ? `Season ${p.career}. Your body is done. It's time.` : `Season ${p.career}. You can keep going (cards start to decline after season 5) or walk away now. Hall of Fame score so far: ${CP.hofScore(L)} (the line is ${CP.HOF_LINE}).`),
        h('button', { class: `btn ${CP.mustRetire(L) ? 'btn-primary' : 'btn-secondary'} btn-wide`, onClick: async () => {
          if (!CP.mustRetire(L) && !(await confirmSheet({ title: 'RETIRE?', message: `${p.name}'s career ends here. This can't be undone.`, confirmLabel: 'Retire' }))) return;
          await CP.retire(L); await save(); sfx.play('correct'); draw();
        } }, 'Retire')) : null,
      CP.mustRetire(L) ? null : h('section', { class: 'dy-panel' }, h('p', { class: 'body-text' }, p.contract && p.contract.left <= 1 ? `Your contract is up. ${team(s.team).name} will make you an offer, or you can test free agency.` : `Retirements, the draft and free agency run on their own. You're signed through ${p.contract ? `${p.contract.left - 1} more season${p.contract.left - 1 === 1 ? '' : 's'}` : 'next season'}.`),
        h('button', { class: 'btn btn-primary btn-wide', onClick: async (e) => { e.target.disabled = true; e.target.textContent = 'Running the off-season…'; await new Promise((r) => setTimeout(r, 30)); C.beginOffseason(L); L.career.over = null; await save(); tab = 'week'; sfx.play('correct'); draw(); } }, p.contract && p.contract.left <= 1 ? 'Start the off-season (your contract is up)' : `Start season ${p.career + 1}`))));
  }

  draw();
  return root;
}
