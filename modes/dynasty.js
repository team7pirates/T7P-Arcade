// DYNASTY: The Anime Fighting League (release 1, "The Season").
// Take over a team that missed last season's playoffs, set a lineup every
// week against the rival coach (who gets one final swap), fight through a
// 12-week season, win your division and chase the Zenith Clash.
// Rules live in dynasty-rules.js.

import { h, fill, toast, avatar, sheet, confirmSheet } from '../core/ui.js';
import { profile } from '../core/profile.js';
import { records } from '../core/records.js';
import { store } from '../core/store.js';
import { characters } from '../core/characters.js';
import { modeHeader, howToPlay } from '../core/mode-kit.js';
import { SPECIALS } from '../core/combat.js';
import { playMatch } from '../core/battle-view.js';
import * as R from './dynasty-rules.js';

const help = howToPlay('dynasty', 'Dynasty', [
  'You are the new head coach of an Anime Fighting League team. Pick any team that missed last season\'s playoffs.',
  'Every week, open the Game Plan. You can see the other team\'s lineup: set your five in order so your roles beat theirs.',
  'When you lock in, the rival coach sees your order and gets one final swap. Think one step ahead.',
  'Cards wear down. Tired cards fight weaker and can get hurt, so rotate your bench.',
  'Win your division to make the playoffs. Win two more and you lift the Celestial Grail at the Zenith Clash.',
  'Hype comes from winning fights. Aura comes from being seen: magazine picks and awards. Both carry over.',
  'Meet the front office\'s expectation or your job security drops. Miss it three seasons running and you\'re fired.',
  'Retirements, the draft, free agency and trades arrive with the off-season update.',
]);

const slotKey = (n) => `dynasty:slot${n}`;
const crestUrl = (t) => `art/afl/crests/${t.crest}.webp`;
const arenaUrl = (t) => `art/afl/arenas/${R.ARENA_ART[t.div]}.webp`;
const DEV_LABEL = ['Normal', 'Star', 'Superstar'];
const ROLE_CLASS = (r) => `role-${(r || '').toLowerCase()}`;
const fmt = (n) => Math.round(n).toLocaleString();

let L = null;       // the league in play
let slot = null;    // which save slot
let tab = 'league';

const save = () => (L ? store.set(slotKey(slot), L) : null);

function crest(t, size = 32) {
  return h('img', { class: 'dy-crest', src: crestUrl(t), alt: '', width: String(size), height: String(size), style: `width:${size}px;height:${size}px` });
}
function pAvatar(p, size = 'sm') {
  return avatar({ id: p.cid, portrait: p.portrait, franchise: p.franchise, name: p.name }, characters, size);
}
function tinted(t1, t2, cls = 'dy-arena') {
  return h('div', { class: cls, 'aria-hidden': 'true' },
    h('img', { src: arenaUrl(t1), alt: '' }),
    h('div', { class: 'dy-tint', style: `background: linear-gradient(90deg, ${t1.c1}, ${t1.c2} 35%, ${t2.c2} 65%, ${t2.c1})` }),
    h('div', { class: 'dy-shade' }));
}
const team = (i) => L.teams[i];
const me = () => L.teams[L.user.team];
const players = (t) => t.roster.map((pid) => L.players[pid]);

export async function render() {
  await profile.update({ lastMode: 'dynasty' });
  const root = h('section', { class: 'screen mode dynasty' });
  let fightView = null;
  let carouselTimer = null;
  root._cleanup = () => { clearInterval(carouselTimer); if (fightView) fightView.stop(); };
  const header = (sub, onBack) => modeHeader({ title: 'Dynasty', sub, onHelp: () => help.show(), onBack });
  const stopTimers = () => { clearInterval(carouselTimer); carouselTimer = null; };

  // ---------- Save slots ----------
  async function drawSlots() {
    stopTimers();
    L = null; slot = null;
    const saves = await Promise.all([1, 2, 3].map((n) => store.get(slotKey(n), null)));
    fill(root,
      header('THE ANIME FIGHTING LEAGUE'),
      h('div', { class: 'dy-wrap' },
        h('p', { class: 'body-text' }, 'Run an AFL franchise. Three save slots.'),
        h('div', { class: 'dy-slots' }, saves.map((s, k) => {
          const n = k + 1;
          if (!s || !s.user) {
            return h('div', { class: 'dy-slot dy-panel' },
              h('p', { class: 'label-spaced' }, `SLOT ${n}`),
              h('p', { class: 'heading' }, 'Empty'),
              h('button', { class: 'btn btn-primary', onClick: () => startNew(n) }, 'New dynasty'));
          }
          const t = s.teams[s.user.team];
          return h('div', { class: 'dy-slot dy-panel' },
            h('p', { class: 'label-spaced' }, `SLOT ${n}`),
            h('div', { class: 'dy-slot-team' }, crest(t, 48), h('div', {},
              h('p', { class: 'heading' }, t.name),
              h('p', { class: 'caption muted' }, `${s.user.coach} · Season ${s.season} · ${s.phase === 'done' ? 'season complete' : s.phase === 'playoffs' ? 'playoffs' : `week ${s.week}`} · ${t.w}-${t.l}`))),
            h('div', { class: 'btn-row' },
              h('button', { class: 'btn btn-primary', onClick: () => { L = s; slot = n; tab = 'league'; drawHub(); } }, 'Continue'),
              h('button', { class: 'btn btn-secondary', onClick: async () => {
                const ok = await confirmSheet({ title: 'DELETE THIS DYNASTY?', message: `${t.name}, season ${s.season}. This can't be undone.`, confirmLabel: 'Delete', danger: true });
                if (ok) { await store.remove(slotKey(n)); toast('Save deleted.'); }
                drawSlots();
              } }, 'Delete')));
        })),
      ),
    );
  }

  // ---------- New dynasty ----------
  const draft = { name: '', quiz: {} };
  function startNew(n) { slot = n; draft.name = ''; draft.quiz = {}; drawName(); }

  function drawName() {
    const input = h('input', { class: 'input', id: 'dy-name', maxlength: '24', autocomplete: 'off', spellcheck: 'false',
      value: draft.name || (profile.value.codename ? `Coach ${profile.value.codename}` : ''), placeholder: 'Coach name' });
    const go = () => {
      const v = input.value.trim().replace(/\s+/g, ' ').slice(0, 24);
      if (!v) { toast('Give your coach a name.'); input.focus(); return; }
      draft.name = v; drawQuiz(0);
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    fill(root, header('NEW DYNASTY', drawSlots),
      h('div', { class: 'dy-wrap dy-narrow' },
        h('p', { class: 'label-spaced gold' }, 'THE AFL IS HIRING'),
        h('h2', { class: 'display-lg' }, 'WHO\'S THE NEW COACH?'),
        h('label', { class: 'field-label', for: 'dy-name' }, 'Coach name'), input,
        h('button', { class: 'btn btn-primary btn-wide', onClick: go }, 'Next')));
    input.focus();
  }

  function seriesList() {
    const counts = {};
    characters.list.forEach((c) => { if (!c.retired) counts[c.series] = (counts[c.series] || 0) + 1; });
    return Object.keys(counts).sort((a, b) => a.localeCompare(b));
  }

  function drawQuiz(i) {
    const q = R.QUIZ[i];
    const choose = (val) => { draft.quiz[q.key] = val; if (i + 1 < R.QUIZ.length) drawQuiz(i + 1); else drawSim(); };
    let body;
    if (q.series) {
      body = h('div', { class: 'dy-series' }, seriesList().map((s) => h('button', { class: 'dy-option dy-option-sm', onClick: () => choose(s) }, s)));
    } else {
      body = h('div', { class: 'dy-options' }, q.options.map((o) => h('button', { class: 'dy-option', onClick: () => choose(o.id) },
        h('span', { class: 'heading' }, o.label), o.perk ? h('span', { class: 'caption muted' }, o.perk) : null)));
    }
    fill(root, header(`COACH QUIZ · ${i + 1} OF ${R.QUIZ.length}`, () => (i ? drawQuiz(i - 1) : drawName())),
      h('div', { class: 'dy-wrap dy-narrow' },
        h('p', { class: 'label-spaced gold' }, draft.name.toUpperCase()),
        h('h2', { class: 'display-lg' }, q.q.toUpperCase()),
        q.series ? h('p', { class: 'caption muted' }, 'Every card on your roster from this series gets +1 Power.') : null,
        body));
  }

  function drawSim() {
    fill(root, header('NEW DYNASTY'),
      h('div', { class: 'dy-wrap dy-narrow dy-center' },
        h('p', { class: 'label-spaced gold' }, 'BUILDING THE AFL'),
        h('h2', { class: 'display-lg' }, 'SIMULATING LAST SEASON'),
        h('p', { class: 'body-text' }, '32 teams, 320 characters, 12 weeks and a Zenith Clash.')));
    setTimeout(() => {
      L = R.newLeague(characters.list, Date.now() & 0x7fffffff);
      R.simulateFullSeason(L);
      drawPick();
    }, 60);
  }

  function drawPick() {
    const last = L.history[0];
    const jobs = R.openJobs(L);
    const champ = team(last.champion);
    fill(root, header('PICK YOUR TEAM', drawSlots),
      h('div', { class: 'dy-wrap' },
        h('div', { class: 'dy-lastseason dy-panel' },
          crest(champ, 56),
          h('div', {},
            h('p', { class: 'label-spaced gold' }, 'LAST SEASON'),
            h('p', { class: 'heading' }, `${champ.name} won the Celestial Grail, ${last.score[0]}–${last.score[1]} over ${team(last.runnerUp).name}.`),
            h('p', { class: 'caption muted' }, `The four playoff teams aren't hiring. These ${jobs.length} are.`))),
        h('div', { class: 'dy-jobs' }, jobs.map((ti) => {
          const t = team(ti); const s = last.standings.find((x) => x.i === ti);
          const star = players(t).sort((a, b) => b.power - a.power)[0];
          return h('button', { class: 'dy-job', onClick: () => confirmJob(ti) },
            crest(t, 52),
            h('span', { class: 'dy-job-text' },
              h('span', { class: 'dy-job-name' }, t.name),
              h('span', { class: 'caption muted' }, `${s.w}-${s.l} · ${R.DIVISIONS[t.div]} · ${R.STAGE_LABEL[t.stage]}`),
              h('span', { class: 'caption' }, `Star: ${star.name} (${star.power})`)));
        }))));
  }

  function confirmJob(ti) {
    const t = team(ti);
    const ps = players(t).sort((a, b) => b.power - a.power);
    const rv = R.rival(L, ti);
    const s = sheet({
      title: t.name.toUpperCase(),
      wide: true,
      content: h('div', { class: 'dy-jobsheet' },
        tinted(t, t, 'dy-arena dy-arena-sm'),
        h('p', { class: 'caption muted' }, `${R.DIVISIONS[t.div]} Division · ${t.arena} · Payroll ${R.payroll(L, t)} of ${R.CAP}`),
        h('p', { class: 'body-text' }, `The front office expects: ${R.EXPECT_LABEL[t.stage]}.${rv ? ` Rivalry: ${rv.trophy} vs ${team(rv.team).name}.` : ''}`),
        h('ul', { class: 'dy-mini-roster' }, ps.map((p) => h('li', {}, pAvatar(p), h('span', {}, p.name), h('span', { class: `caption ${ROLE_CLASS(p.role)}` }, p.role), h('span', { class: 'dy-num' }, String(p.power))))),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn btn-secondary', onClick: () => s.close() }, 'Keep looking'),
          h('button', { class: 'btn btn-primary', onClick: async () => { s.close(); await takeJob(ti); } }, 'Take the job'))),
    });
  }

  async function takeJob(ti) {
    const article = R.hire(L, ti, draft.name, draft.quiz);
    R.resetForSeason(L);
    L.user.expect = team(ti).stage;
    L.hireArticle = article;
    L.news.unshift({ week: 0, kind: 'YOUR HIRE', team: ti, title: article.title, text: article.text });
    await save();
    fill(root, header('BREAKING NEWS'),
      h('div', { class: 'dy-wrap dy-narrow' },
        h('article', { class: 'dy-article' },
          crest(team(ti), 72),
          h('p', { class: 'label-spaced' }, 'AROUND THE LEAGUE · YOUR HIRE'),
          h('h2', { class: 'dy-article-title' }, article.title),
          h('p', { class: 'dy-article-body' }, article.text)),
        h('button', { class: 'btn btn-primary btn-wide', onClick: () => { tab = 'league'; drawHub(); } }, 'Go to the office')));
  }

  // ---------- The hub ----------
  const TABS = [['coach', 'COACH'], ['league', 'LEAGUE'], ['roster', 'ROSTER'], ['schedule', 'SCHEDULE'], ['standings', 'STANDINGS']];

  function shell(content) {
    const t = me();
    const nav = h('nav', { class: 'dy-tabs', 'aria-label': 'Dynasty sections' }, TABS.map(([id, label]) => h('button', {
      class: `dy-tab${tab === id ? ' is-on' : ''}`, 'aria-current': tab === id ? 'page' : null, onClick: () => { tab = id; drawHub(); },
    }, label)));
    const status = L.phase === 'done' ? 'SEASON COMPLETE' : L.phase === 'playoffs' ? 'PLAYOFFS' : `WEEK ${L.week} OF ${R.WEEKS}`;
    fill(root,
      header(`SEASON ${L.season} · ${status}`, () => { save(); drawSlots(); }),
      h('div', { class: 'dy-bar', style: `--c1:${t.c1};--c2:${t.c2}` },
        crest(t, 56),
        h('div', { class: 'dy-bar-text' },
          h('p', { class: 'dy-bar-name' }, t.name.toUpperCase()),
          h('p', { class: 'caption' }, `${L.user.coach} · ${t.w}-${t.l} · No. ${t.rank || '–'} · ${L.user.security}`))),
      nav, content);
  }

  function drawHub() {
    stopTimers();
    ({ coach: drawCoach, league: drawLeague, roster: drawRoster, schedule: drawSchedule, standings: drawStandings }[tab] || drawLeague)();
  }

  function nextAction() {
    if (L.phase === 'season') {
      const g = R.userGame(L);
      const opp = team(g.home === L.user.team ? g.away : g.home);
      const rv = R.isRivalry(g.home, g.away, L);
      return h('section', { class: 'dy-next dy-panel' },
        h('p', { class: 'label-spaced gold' }, `NEXT GAME · WEEK ${L.week}`),
        h('div', { class: 'dy-next-row' }, crest(opp, 56), h('div', {},
          h('p', { class: 'caption muted' }, g.home === L.user.team ? 'VS' : 'AT'),
          h('p', { class: 'heading' }, `${opp.rank ? `#${opp.rank} ` : ''}${opp.name}`),
          h('p', { class: 'caption muted' }, `${opp.w}-${opp.l} · ${team(g.home).arena}`))),
        rv ? h('p', { class: 'dy-trophy-line' }, `RIVALRY · ${rv[2].toUpperCase()} IS ON THE LINE`) : null,
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn btn-primary', onClick: () => openGamePlan() }, 'Game Plan'),
          h('button', { class: 'btn btn-secondary', onClick: autoWeek }, 'Auto-play week')));
    }
    if (L.phase === 'playoffs') {
      const g = R.playoffGameForUser(L);
      if (g) {
        const opp = team(g.home === L.user.team ? g.away : g.home);
        return h('section', { class: 'dy-next dy-panel' },
          h('p', { class: 'label-spaced gold' }, L.playoffs.final === g ? 'THE ZENITH CLASH' : 'PLAYOFF SEMIFINAL'),
          h('div', { class: 'dy-next-row' }, crest(opp, 56), h('p', { class: 'heading' }, opp.name)),
          h('button', { class: 'btn btn-primary btn-wide', onClick: () => openGamePlan() }, 'Game Plan'));
      }
      return h('section', { class: 'dy-next dy-panel' },
        h('p', { class: 'label-spaced gold' }, 'THE PLAYOFFS'),
        h('p', { class: 'body-text' }, L.playoffs.seeds.includes(L.user.team) ? 'Your run is over. The rest of the playoffs are on.' : 'You missed the playoffs. The division winners play on.'),
        h('button', { class: 'btn btn-primary btn-wide', onClick: finishPlayoffs }, 'Play out the playoffs'));
    }
    const last = L.history[0];
    return h('section', { class: 'dy-next dy-panel' },
      h('p', { class: 'label-spaced gold' }, `SEASON ${last.season} COMPLETE`),
      h('p', { class: 'heading' }, `${team(last.champion).name} won the Celestial Grail.`),
      h('p', { class: 'body-text' }, 'Retirements, the draft, free agency and trades arrive with the off-season update. Your save is kept and will pick up right here.'),
      h('button', { class: 'btn btn-secondary btn-wide', onClick: () => drawSeasonEnd(last) }, 'Season summary'));
  }

  function drawLeague() {
    const scores = L.lastWeekScores || [];
    const ticker = scores.length ? h('div', { class: 'dy-ticker', 'aria-label': 'Last week\'s scores' },
      h('span', { class: 'dy-ticker-tag' }, `WEEK ${L.week - 1}`),
      h('div', { class: 'dy-ticker-window' }, h('div', { class: 'dy-ticker-track' }, [...scores, ...scores].map((s) => {
        const a = team(s.home); const b = team(s.away); const aw = s.winner === s.home;
        return h('span', { class: 'dy-score' },
          h('span', { class: aw ? 'is-w' : '' }, crest(a, 18), ` ${a.abbr} ${s.score[0]}`),
          h('span', { class: aw ? '' : 'is-w' }, crest(b, 18), ` ${b.abbr} ${s.score[1]}`));
      })))) : null;

    // Games of the Week: the three biggest games next week.
    let slides = [];
    if (L.phase === 'season') {
      const games = L.schedule[L.week - 1];
      const val = (g) => 60 - (team(g.home).rank || 32) - (team(g.away).rank || 32) + (R.isRivalry(g.home, g.away, L) ? 30 : 0) + ((g.home === L.user.team || g.away === L.user.team) ? 10 : 0);
      slides = games.slice().sort((a, b) => val(b) - val(a)).slice(0, 3);
    }
    let idx = 0;
    const track = h('div', { class: 'dy-car-track' }, slides.map((g, k) => {
      const a = team(g.home); const b = team(g.away);
      const sa = players(a).sort((x, y) => y.hype - x.hype)[0]; const sb = players(b).sort((x, y) => y.hype - x.hype)[0];
      const rv = R.isRivalry(g.home, g.away, L);
      return h('div', { class: 'dy-slide' },
        tinted(a, b),
        h('div', { class: 'dy-slide-star is-a' }, pAvatar(sa, 'card')),
        h('div', { class: 'dy-slide-star is-b' }, pAvatar(sb, 'card')),
        h('div', { class: 'dy-slide-mid' },
          h('p', { class: 'dy-dojo' }, 'THE FIGHT NIGHT DOJO'),
          h('p', { class: 'dy-slide-tag' }, rv ? `RIVALRY · ${rv[2].toUpperCase()}` : k === 0 ? 'GAME OF THE WEEK' : 'RANKED SHOWDOWN'),
          crest(a, 48), h('p', { class: 'dy-slide-team' }, `${a.rank ? `#${a.rank} ` : ''}${a.name}`),
          h('p', { class: 'dy-vs' }, 'VS'),
          h('p', { class: 'dy-slide-team' }, `${b.rank ? `#${b.rank} ` : ''}${b.name}`), crest(b, 48),
          h('p', { class: 'caption' }, `${a.arena} · ${k === 0 ? 'SBN PRIME' : 'AGN'}`)));
    }));
    const dots = h('div', { class: 'dy-dots' });
    const go = (i) => { idx = (i + slides.length) % slides.length; track.style.transform = `translateX(-${idx * 100}%)`; dots.querySelectorAll('button').forEach((d, j) => d.classList.toggle('is-on', j === idx)); };
    slides.forEach((_, i) => dots.append(h('button', { class: `dy-dot${i === 0 ? ' is-on' : ''}`, 'aria-label': `Show game ${i + 1}`, onClick: () => { go(i); restart(); } })));
    const restart = () => {
      clearInterval(carouselTimer);
      if (slides.length > 1 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) carouselTimer = setInterval(() => go(idx + 1), 6000);
    };
    const carousel = slides.length ? h('section', { class: 'dy-carousel', 'aria-label': 'Games of the week', 'aria-roledescription': 'carousel' }, track, dots) : null;

    const power = L.teams.slice().sort((a, b) => (a.rank || 99) - (b.rank || 99)).slice(0, 25);
    const race = R.awardRace(L).slice(0, 4);
    const leaders = Object.values(L.players).filter((p) => p.team != null && p.stats.gp).sort((a, b) => b.stats.dmg - a.stats.dmg).slice(0, 5);
    const fa = players(me()).filter((p) => p.contract && p.contract.left <= 1).sort((a, b) => b.power - a.power);

    shell(h('div', { class: 'dy-content dy-grid' },
      ticker,
      h('div', { class: 'dy-col-main' },
        nextAction(),
        carousel,
        h('section', { class: 'dy-panel' },
          h('h2', { class: 'dy-h' }, 'AROUND THE LEAGUE'),
          L.news.length ? h('ul', { class: 'dy-news' }, L.news.slice(0, 8).map((n) => h('li', {},
            crest(team(n.team), 36),
            h('div', {}, h('p', { class: 'dy-news-kind' }, `${n.kind}${n.week ? ` · WEEK ${n.week}` : ''}`), h('p', { class: 'dy-news-title' }, n.title), h('p', { class: 'caption muted' }, n.text))))) : h('p', { class: 'caption muted' }, 'Nothing yet. Play a week.'))),
      h('div', { class: 'dy-col-side' },
        h('section', { class: 'dy-panel' },
          h('h2', { class: 'dy-h' }, 'POWER 25'),
          h('ol', { class: 'dy-power' }, power.map((t) => {
            const mv = t.prevRank ? t.prevRank - t.rank : 0;
            return h('li', { class: t.i === L.user.team ? 'is-you' : '' },
              h('span', { class: 'dy-num' }, String(t.rank || '–')),
              h('span', { class: `dy-move ${mv > 0 ? 'up' : mv < 0 ? 'down' : ''}` }, mv > 0 ? `▲${mv}` : mv < 0 ? `▼${-mv}` : '–'),
              crest(t, 26), h('span', { class: 'dy-power-name' }, t.name), h('span', { class: 'dy-num' }, `${t.w}-${t.l}`));
          }))),
        h('section', { class: 'dy-panel dy-race' },
          h('h2', { class: 'dy-h gold' }, 'GENERATIONAL PRODIGY RACE'),
          race.length ? h('ol', { class: 'dy-list' }, race.map(({ p, s }, i) => h('li', {}, pAvatar(p), h('span', { class: 'dy-list-text' }, h('span', {}, p.name), h('span', { class: 'caption muted' }, team(p.team).name)), h('span', { class: 'dy-num' }, R.oddsFor(i, s, race[0].s))))) : h('p', { class: 'caption muted' }, 'The race starts after Week 1.')),
        h('section', { class: 'dy-panel' },
          h('h2', { class: 'dy-h' }, 'DAMAGE LEADERS'),
          leaders.length ? h('ol', { class: 'dy-list' }, leaders.map((p) => h('li', {}, pAvatar(p), h('span', { class: 'dy-list-text' }, h('span', {}, p.name), h('span', { class: 'caption muted' }, team(p.team).abbr)), h('span', { class: 'dy-num' }, fmt(p.stats.dmg))))) : h('p', { class: 'caption muted' }, 'No fights yet.')),
        h('section', { class: 'dy-panel' },
          h('h2', { class: 'dy-h' }, 'YOUR UPCOMING FREE AGENTS'),
          fa.length ? h('ul', { class: 'dy-list' }, fa.map((p) => h('li', {}, pAvatar(p), h('span', { class: 'dy-list-text' }, h('span', {}, p.name), h('span', { class: 'caption muted' }, `${p.role} · contract ends this season`)), h('span', { class: 'dy-num' }, String(p.power))))) : h('p', { class: 'caption muted' }, 'Nobody on your roster is in the last year of a contract.')))));
    restart();
  }

  // ---------- Coach ----------
  function drawCoach() {
    const u = L.user; const t = me();
    const qbio = (key) => {
      const q = R.QUIZ.find((x) => x.key === key);
      if (q.series) return u.quiz.anime;
      return q.options.find((o) => o.id === u.quiz[key])?.bio || '–';
    };
    const perks = [];
    const st = R.QUIZ[1].options.find((o) => o.id === u.quiz.style); if (st?.perk) perks.push(st.perk);
    const ca = R.QUIZ[2].options.find((o) => o.id === u.quiz.career); if (ca?.perk) perks.push(ca.perk);
    perks.push(`${u.quiz.anime} cards +1 Power`);
    const rv = R.rival(L, u.team);
    const rivalLine = rv ? `${team(rv.team).coachName} (${team(rv.team).abbr}) · ${rv.trophy}` : 'None yet';
    shell(h('div', { class: 'dy-content dy-coach' },
      h('section', { class: 'dy-panel' },
        h('p', { class: 'label-spaced gold' }, 'HEAD COACH'),
        h('h2', { class: 'display-lg' }, u.coach.toUpperCase()),
        h('dl', { class: 'dy-bio' }, [
          ['Origin', qbio('origin')], ['Style', qbio('style')], ['Old career', qbio('career')], ['Favorite anime', qbio('anime')], ['Chasing', qbio('chasing')],
          ['Rival', rivalLine], ['Expectation', R.EXPECT_LABEL[u.expect]], ['Job security', u.security],
        ].map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v)))),
        h('h3', { class: 'dy-h' }, 'PERKS'),
        h('ul', { class: 'dy-perks' }, perks.map((p) => h('li', {}, p)))),
      h('section', { class: 'dy-panel' },
        h('h2', { class: 'dy-h' }, 'CAREER'),
        u.career.length ? h('table', { class: 'rec-table' },
          h('thead', {}, h('tr', {}, ['Season', 'Team', 'Record', 'Result', 'Expectation'].map((x) => h('th', { scope: 'col' }, x)))),
          h('tbody', {}, u.career.map((c) => h('tr', {}, h('td', {}, String(c.season)), h('td', {}, team(c.team).abbr), h('td', {}, `${c.w}-${c.l}`),
            h('td', {}, c.champion ? 'Champion' : c.playoffs ? 'Playoffs' : 'Missed playoffs'), h('td', {}, c.met ? 'Met' : 'Missed')))))
          : h('p', { class: 'caption muted' }, `First season with ${t.name}.`),
        L.hireArticle ? h('article', { class: 'dy-article dy-article-sm' },
          h('p', { class: 'label-spaced' }, 'THE DAY YOU WERE HIRED'),
          h('p', { class: 'dy-article-title' }, L.hireArticle.title),
          h('p', { class: 'dy-article-body' }, L.hireArticle.text)) : null)));
  }

  // ---------- Roster ----------
  function drawRoster() {
    const t = me();
    const ps = players(t).sort((a, b) => b.power - a.power);
    const pay = R.payroll(L, t);
    shell(h('div', { class: 'dy-content' },
      h('div', { class: 'dy-cap dy-panel' },
        h('div', {}, h('p', { class: 'label-spaced' }, 'PAYROLL'), h('p', { class: 'stat' }, String(pay))),
        h('div', {}, h('p', { class: 'label-spaced' }, 'SOFT CAP'), h('p', { class: 'stat' }, String(R.CAP))),
        h('div', {}, h('p', { class: 'label-spaced' }, pay > R.CAP ? 'OVER BY' : 'CAP SPACE'), h('p', { class: `stat ${pay > R.CAP ? 'loss' : 'win'}` }, String(Math.abs(Math.round((R.CAP - pay) * 10) / 10))))),
      h('p', { class: 'caption muted' }, 'Contracts are a total over seasons, split evenly: that split is the cap hit. Tap a card for details.'),
      h('ul', { class: 'dy-roster' }, ps.map((p) => {
        const eff = R.effPower(L, p);
        return h('li', {}, h('button', { class: 'dy-rcard', onClick: () => playerSheet(p) },
          pAvatar(p, 'md'),
          h('span', { class: 'dy-rtext' },
            h('span', { class: 'dy-rname' }, p.name, p.series === L.user.quiz.anime ? h('span', { class: 'dy-fav', title: 'Favorite anime: +1 Power' }, ' ♥') : null),
            h('span', { class: `caption ${ROLE_CLASS(p.role)}` }, `${p.role}${p.second ? ` / ${p.second}` : ''} · ${DEV_LABEL[p.dev]}`),
            h('span', { class: 'caption muted' }, `${p.contract.total} over ${p.contract.years} · cap hit ${R.capHit(p)} · ${p.contract.left} season${p.contract.left > 1 ? 's' : ''} left`)),
          h('span', { class: 'dy-rstats' },
            h('span', { class: 'dy-num dy-big' }, String(eff)),
            eff !== p.power ? h('span', { class: 'caption muted' }, `base ${p.power}`) : null,
            fatigueBar(p),
            p.injury > 0 ? h('span', { class: 'dy-inj' }, `OUT ${p.injury} WK`) : null)));
      }))));
  }

  function fatigueBar(p) {
    const color = p.fatigue > 70 ? 'var(--loss)' : p.fatigue > 30 ? 'var(--brand-gold)' : 'var(--win)';
    return h('span', { class: 'dy-fat', title: `Fatigue ${Math.round(p.fatigue)}`, 'aria-label': `Fatigue ${Math.round(p.fatigue)} of 100` },
      h('span', { style: `width:${Math.round(p.fatigue)}%;background:${color}` }));
  }

  function playerSheet(p) {
    const own = p.team === L.user.team;
    const potLow = Math.max(p.power, p.potential - 3); const potHigh = p.potential + 2;
    sheet({
      title: p.name.toUpperCase(),
      content: h('div', { class: 'dy-psheet' },
        h('div', { class: 'dy-psheet-top' }, pAvatar(p, 'card'),
          h('dl', { class: 'dy-bio' }, [
            ['Team', team(p.team).name], ['Role', `${p.role}${p.second ? ` / ${p.second}` : ''}`], ['Series', p.series],
            ['Power', `${R.effPower(L, p)} (base ${p.power})`], own ? ['Potential', `about ${potLow}–${potHigh}`] : null,
            ['Dev trait', DEV_LABEL[p.dev]], ['Career', `Season ${p.career}`],
            ['Hype', String(Math.round(p.hype))], ['Aura', String(p.aura)], ['Clutch', String(p.clutch)],
            ['Fatigue', `${Math.round(p.fatigue)}${p.injury ? ` · injured ${p.injury} wk` : ''}`],
            ['Contract', `${p.contract.total} over ${p.contract.years} (cap hit ${R.capHit(p)})`],
            p.lowKey ? ['Personality', 'Low-key: doesn\'t chase the spotlight'] : null,
          ].filter(Boolean).map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v))))),
        h('p', { class: 'caption muted' }, `This season: ${p.stats.gp} games · ${fmt(p.stats.dmg)} damage · ${p.stats.ko} KOs · ${p.stats.sp} specials. Special move: ${SPECIALS[p.role].name}.`)),
    });
  }

  // ---------- Schedule ----------
  function drawSchedule() {
    const u = L.user.team;
    shell(h('div', { class: 'dy-content' },
      h('ol', { class: 'dy-sched' }, L.schedule.map((games, w) => {
        const g = games.find((x) => x.home === u || x.away === u);
        const home = g.home === u; const opp = team(home ? g.away : g.home);
        const r = g.result; const won = r && r.winner === u;
        const rv = R.isRivalry(g.home, g.away, L);
        return h('li', { class: w + 1 === L.week && L.phase === 'season' ? 'is-now' : '' },
          h('span', { class: 'dy-num' }, `WK ${w + 1}`),
          h('span', { class: 'caption muted' }, home ? 'VS' : 'AT'),
          crest(opp, 30), h('span', { class: 'dy-sched-name' }, opp.name, rv ? h('span', { class: 'caption gold' }, ` · ${rv[2]}`) : null),
          r ? h('span', { class: `dy-res ${won ? 'win' : 'loss'}` }, `${won ? 'W' : 'L'} ${home ? r.score[0] : r.score[1]}–${home ? r.score[1] : r.score[0]}`) : h('span', { class: 'caption muted' }, '—'));
      }))));
  }

  // ---------- Standings ----------
  function drawStandings() {
    const po = L.playoffs;
    shell(h('div', { class: 'dy-content dy-standings' },
      po ? h('section', { class: 'dy-panel' },
        h('h2', { class: 'dy-h gold' }, 'PLAYOFFS'),
        h('div', { class: 'dy-bracket' },
          ...po.semis.map((g) => bracketMatch('Semifinal', g)),
          po.final ? bracketMatch('The Zenith Clash', po.final) : h('div', { class: 'dy-bk' }, h('p', { class: 'label-spaced' }, 'THE ZENITH CLASH'), h('p', { class: 'caption muted' }, 'Waiting on the semifinals'))),
        po.champion != null ? h('p', { class: 'heading gold' }, `${team(po.champion).name} won the Celestial Grail.`) : null) : null,
      R.DIVISIONS.map((d, di) => h('section', { class: 'dy-panel' },
        h('h2', { class: 'dy-h' }, `${d.toUpperCase()} DIVISION`),
        h('p', { class: 'caption muted' }, `${R.CONFERENCES[di < 2 ? 0 : 1]} Conference · winner takes the ${R.DIV_TROPHY[di]} and a playoff spot`),
        h('table', { class: 'dy-table' },
          h('thead', {}, h('tr', {}, ['', 'Team', 'W', 'L', 'Rounds', 'Streak'].map((x) => h('th', { scope: 'col' }, x)))),
          h('tbody', {}, R.divisionTable(L, di).map((t, k) => h('tr', { class: t.i === L.user.team ? 'is-you' : '' },
            h('td', {}, String(k + 1)),
            h('td', {}, h('span', { class: 'dy-tteam' }, crest(t, 24), t.name)),
            h('td', {}, String(t.w)), h('td', {}, String(t.l)),
            h('td', {}, `${t.rw}-${t.rl}`), h('td', {}, t.streak > 0 ? `W${t.streak}` : t.streak < 0 ? `L${-t.streak}` : '–')))))))));
  }
  function bracketMatch(label, g) {
    const line = (ti) => {
      const t = team(ti); const won = g.result && g.result.winner === ti;
      return h('p', { class: `dy-bk-team${won ? ' is-win' : g.result ? ' is-out' : ''}${ti === L.user.team ? ' is-you' : ''}` }, crest(t, 22), ` ${t.name}`);
    };
    return h('div', { class: 'dy-bk' }, h('p', { class: 'label-spaced' }, label.toUpperCase()), line(g.home), line(g.away),
      g.result ? h('p', { class: 'caption muted' }, `${g.result.score[0]}–${g.result.score[1]}`) : null);
  }

  // ---------- Game Plan ----------
  function currentGame() {
    return L.phase === 'playoffs' ? R.playoffGameForUser(L) : R.userGame(L);
  }

  function ensurePending(g) {
    const key = L.phase === 'playoffs' ? `po-${L.playoffs.final === g ? 'f' : 's'}` : `w${L.week}`;
    if (L.pending && L.pending.key === key) return L.pending;
    const oppI = g.home === L.user.team ? g.away : g.home;
    const rand = () => R.nextRand(L);
    const theirs = R.aiOrder(L, team(oppI), rand);
    const mine = R.aiStarters(L, me()).sort((a, b) => b.power - a.power).map((p) => p.pid);
    L.pending = { key, opp: oppI, theirs, mine, locked: false, swap: null, final: null };
    return L.pending;
  }

  function openGamePlan() {
    stopTimers();
    const g = currentGame();
    if (!g) { drawHub(); return; }
    ensurePending(g);
    drawGamePlan(g);
  }

  function keysFor(pd) {
    const theirs = pd.theirs.map((pid) => L.players[pid]);
    const mine = players(me());
    const beaters = (role) => R.ROLES.filter((r) => R.beats(r, role));
    const keys = [];
    const lead = theirs[0];
    keys.push(`They're leading with ${lead.name} (${lead.role}). ${beaters(lead.role).join(' and ')} beat ${lead.role}s.`);
    const ace = theirs.slice().sort((a, b) => b.power - a.power)[0];
    if (ace !== lead) keys.push(`Their ace is ${ace.name} (${ace.role}, ${R.effPower(L, ace)}) in slot ${pd.theirs.indexOf(ace.pid) + 1}. Put a ${beaters(ace.role)[0]} across from them.`);
    const tired = mine.filter((p) => p.fatigue > 45 && p.injury <= 0).sort((a, b) => b.fatigue - a.fatigue)[0];
    if (tired) keys.push(`${tired.name} is worn down (fatigue ${Math.round(tired.fatigue)}, ${R.effPower(L, tired) - tired.power} Power). Consider the bench.`);
    keys.push('After you lock in, their coach can swap two of his cards. Don\'t leave a slot that one swap can flip.');
    if (L.user.quiz.career === 'analyst') {
      const weak = theirs.slice().sort((a, b) => R.effPower(L, a) - R.effPower(L, b))[0];
      keys.push(`Film study: ${weak.name} is their weakest starter at ${R.effPower(L, weak)} Power.`);
    }
    return keys;
  }

  function drawGamePlan(g) {
    const pd = L.pending;
    const opp = team(pd.opp); const t = me();
    const home = team(g.home);
    const rv = R.isRivalry(g.home, g.away, L);
    const label = L.phase === 'playoffs' ? (L.playoffs.final === g ? 'THE ZENITH CLASH' : 'PLAYOFF SEMIFINAL') : `WEEK ${L.week}`;
    const mine = pd.mine.map((pid) => L.players[pid]);
    const theirs = (pd.final || pd.theirs).map((pid) => L.players[pid]);
    const swapped = pd.swap || [];
    let edges = 0; let weak = 0;
    const rows = mine.map((p, i) => {
      const q = theirs[i];
      const m = R.matchup({ mainRole: p.role }, { mainRole: q.role });
      if (m > 0) edges++; if (m < 0) weak++;
      const isSw = swapped.includes(i);
      return h('li', { class: `dy-lu${isSw ? ' is-swapped' : ''}` },
        h('span', { class: 'dy-num' }, String(i + 1)),
        h('button', { class: 'dy-lu-card', disabled: pd.locked, onClick: () => benchSheet(i, g), 'aria-label': `${p.name}, tap to swap with a bench card` },
          pAvatar(p), h('span', { class: 'dy-lu-text' }, h('span', {}, p.name), h('span', { class: `caption ${ROLE_CLASS(p.role)}` }, `${p.role} · ${R.effPower(L, p)}`), p.fatigue > 30 ? fatigueBar(p) : null)),
        pd.locked ? h('span', { class: 'dy-lu-move' }) : h('span', { class: 'dy-lu-move' },
          h('button', { class: 'icon-btn', 'aria-label': `Move ${p.name} up`, disabled: i === 0, onClick: () => move(i, -1, g) }, '▲'),
          h('button', { class: 'icon-btn', 'aria-label': `Move ${p.name} down`, disabled: i === 4, onClick: () => move(i, 1, g) }, '▼')),
        h('span', { class: `dy-mu ${m > 0 ? 'win' : m < 0 ? 'loss' : ''}` }, m > 0 ? '▲ EDGE' : m < 0 ? '▼ WEAK' : '= EVEN'),
        h('span', { class: 'dy-lu-card is-foe' }, pAvatar(q), h('span', { class: 'dy-lu-text' }, h('span', {}, q.name), h('span', { class: `caption ${ROLE_CLASS(q.role)}` }, `${q.role} · ${R.effPower(L, q)}`))));
    });
    const avail = [...players(t), ...players(opp)].filter((p) => p.injury > 0 || p.fatigue > 50).sort((a, b) => b.fatigue - a.fatigue).slice(0, 8);
    const ta = R.seasonTotals(L, t); const tb = R.seasonTotals(L, opp);
    const focus = L.user.focus;

    shell(h('div', { class: 'dy-content dy-plan' },
      h('header', { class: 'dy-plan-head' }, tinted(home, home === t ? opp : t),
        h('div', { class: 'dy-plan-vs' },
          h('div', { class: 'dy-plan-side' }, crest(t, 72), h('p', { class: 'dy-slide-team' }, t.name), h('p', { class: 'caption' }, `${t.w}-${t.l}`)),
          h('div', { class: 'dy-plan-mid' }, h('p', { class: 'dy-dojo' }, `GAME PLAN · ${label}`), h('p', { class: 'dy-vs' }, g.home === t.i ? 'VS' : 'AT'),
            rv ? h('p', { class: 'dy-trophy-line' }, rv[2].toUpperCase()) : null, h('p', { class: 'caption' }, home.arena)),
          h('div', { class: 'dy-plan-side' }, crest(opp, 72), h('p', { class: 'dy-slide-team' }, opp.name), h('p', { class: 'caption' }, `${opp.w}-${opp.l} · ${opp.coachName}`)))),
      h('div', { class: 'dy-plan-grid' },
        h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h' }, 'KEYS TO THE GAME'),
          h('ol', { class: 'dy-keys' }, keysFor(pd).map((k) => h('li', {}, k)))),
        h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h' }, 'AVAILABILITY'),
          avail.length ? h('ul', { class: 'dy-list' }, avail.map((p) => h('li', {}, crest(team(p.team), 22), h('span', { class: 'dy-list-text' }, h('span', {}, p.name), h('span', { class: 'caption muted' }, p.injury ? `Injured · ${p.injury} wk` : `Fatigue ${Math.round(p.fatigue)}`)), fatigueBar(p)))) : h('p', { class: 'caption muted' }, 'Everyone is fresh.')),
        h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h' }, 'TALE OF THE TAPE'),
          h('table', { class: 'dy-table dy-tape' }, h('tbody', {}, [
            ['Damage per game', fmt(ta.dmg), fmt(tb.dmg)], ['KOs per game', ta.ko, tb.ko], ['Rounds won', `${ta.rounds}%`, `${tb.rounds}%`],
            ['Average Power', ta.power, tb.power], ['Average fatigue', ta.fatigue, tb.fatigue],
          ].map(([k, a, b]) => h('tr', {}, h('td', { class: 'dy-num' }, String(a)), h('th', { scope: 'row' }, k), h('td', { class: 'dy-num' }, String(b)))))))),
      h('section', { class: 'dy-panel', id: 'dy-field' },
        h('h2', { class: 'dy-h' }, 'ON THE FIELD'),
        pd.locked && pd.final ? h('div', { class: 'dy-swap' },
          h('p', { class: 'label-spaced' }, `${opp.coachName.toUpperCase()} ANSWERS`),
          h('p', { class: 'dy-swap-title' }, pd.swap ? 'RIVAL SWAPS!' : pd.mind ? 'MIND GAMES: NO SWAP' : 'RIVAL HOLDS'),
          h('p', { class: 'body-text' }, pd.swap ? `${theirs[pd.swap[0]].name} and ${theirs[pd.swap[1]].name} trade spots (${pd.swap[0] + 1} ↔ ${pd.swap[1] + 1}).` : pd.mind ? 'Your mind games worked. He kept his order.' : 'He keeps his order. Your read held up.')) : null,
        h('p', { class: 'caption muted' }, pd.locked ? 'Locked in.' : 'Tap one of your cards to swap in a bench card. Cards fight top to bottom; the next one tags in after a KO.'),
        h('div', { class: 'dy-lu-head' }, h('span', { class: 'label-spaced' }, `YOU · ${t.abbr}`), h('span', { class: 'label-spaced' }, `${opp.abbr} · ${pd.locked ? 'FINAL' : 'THEIR ORDER'}`)),
        h('ol', { class: 'dy-lineup' }, rows),
        h('p', { class: 'dy-edges' }, `Edges: `, h('span', { class: 'win' }, `${edges} ▲`), ' · ', h('span', { class: 'loss' }, `${weak} ▼`)),
        pd.locked ? null : h('fieldset', { class: 'dy-focus' },
          h('legend', { class: 'label-spaced' }, 'TRAINING FOCUS THIS WEEK'),
          [['power', 'Push Power', 'Faster growth'], ['clutch', 'Sharpen Clutch', 'Clutch can rise'], ['rest', 'Rest the team', 'Recover 8 more fatigue']].map(([id, lab, sub]) => h('label', { class: `dy-focus-opt${focus === id ? ' is-on' : ''}` },
            h('input', { type: 'radio', name: 'dy-focus', value: id, checked: focus === id, onChange: () => { L.user.focus = id; save(); drawGamePlan(g); } }),
            h('span', {}, h('span', { class: 'heading' }, lab), h('span', { class: 'caption muted' }, sub))))),
        h('div', { class: 'result-actions' },
          pd.locked
            ? h('button', { class: 'btn btn-primary', onClick: () => fight(g) }, 'Fight')
            : h('button', { class: 'btn btn-primary', onClick: () => lockIn(g) }, 'Lock in lineup'),
          h('button', { class: 'btn btn-secondary', onClick: () => { tab = 'league'; drawHub(); } }, 'Back to the hub')))));
  }

  async function move(i, d, g) {
    const pd = L.pending; const j = i + d;
    [pd.mine[i], pd.mine[j]] = [pd.mine[j], pd.mine[i]];
    await save(); drawGamePlan(g);
    root.querySelectorAll('.dy-lu')[j]?.querySelector(`[aria-label^="Move"][aria-label$="${d < 0 ? 'up' : 'down'}"]`)?.focus();
  }

  function benchSheet(i, g) {
    const pd = L.pending;
    const bench = players(me()).filter((p) => !pd.mine.includes(p.pid));
    const s = sheet({
      title: `SWAP OUT ${L.players[pd.mine[i]].name.toUpperCase()}`,
      content: h('ul', { class: 'dy-list dy-bench' }, bench.map((p) => h('li', {}, h('button', {
        class: 'dy-bench-btn', disabled: p.injury > 0,
        onClick: async () => { pd.mine[i] = p.pid; s.close(); await save(); drawGamePlan(g); },
      }, pAvatar(p), h('span', { class: 'dy-list-text' }, h('span', {}, p.name), h('span', { class: `caption ${ROLE_CLASS(p.role)}` }, `${p.role} · ${R.effPower(L, p)}${p.injury ? ` · injured ${p.injury} wk` : ''}`)), fatigueBar(p))))),
    });
  }

  async function lockIn(g) {
    const pd = L.pending;
    const rand = () => R.nextRand(L);
    const ans = R.rivalAnswer(L, pd.theirs, pd.mine, rand);
    pd.final = ans.lineup; pd.swap = ans.swapped; pd.mind = !!ans.mind; pd.locked = true;
    await save();
    drawGamePlan(g);
    root.querySelector('#dy-field')?.scrollIntoView({ block: 'start' });
  }

  function flip(res) {
    const sw = (s) => (s === 'A' ? 'B' : s === 'B' ? 'A' : s);
    return { ...res, winner: sw(res.winner), score: [res.score[1], res.score[0]], events: res.events.map((e) => (e.side ? { ...e, side: sw(e.side) } : e)) };
  }

  function fight(g) {
    const pd = L.pending;
    const userHome = g.home === L.user.team;
    const big = !!R.isRivalry(g.home, g.away, L) || L.phase === 'playoffs';
    const mineCards = pd.mine.map((pid) => R.fightCard(L, L.players[pid], { big }));
    const theirCards = pd.final.map((pid) => R.fightCard(L, L.players[pid], { big }));
    const stage = h('div', { class: 'ff-stage' });
    const after = h('div', { class: 'ff-after', hidden: true });
    fill(root, header('FIGHT NIGHT'), stage, after);
    const seed = Math.floor(R.nextRand(L) * 2 ** 31);
    fightView = playMatch(stage, {
      teamA: mineCards, teamB: theirCards, seed, labels: { A: me().abbr, B: team(pd.opp).abbr },
      onDone: async (res) => {
        const r = userHome ? res : flip(res);
        const lineups = userHome ? { home: pd.mine, away: pd.final } : { home: pd.final, away: pd.mine };
        const before = Object.fromEntries(players(me()).map((p) => [p.pid, p.hype]));
        R.playGame(L, g, lineups, { result: r, events: r.events });
        L.pending = null;
        const won = g.result.winner === L.user.team;
        let recap;
        if (L.phase === 'season') {
          R.simWeek(L, true);
          const week = L.week;
          R.endWeek(L);
          recap = { kind: 'week', week, g, won, before };
        } else {
          R.simPlayoffs(L, true);
          recap = { kind: 'playoff', g, won, before };
        }
        await save();
        after.hidden = false;
        fill(after, h('button', { class: 'btn btn-primary btn-wide', onClick: () => drawRecap(recap) }, 'Continue'));
        after.querySelector('button').focus();
      },
    });
  }

  async function autoWeek() {
    const g = R.userGame(L);
    const ok = await confirmSheet({ title: 'AUTO-PLAY THIS WEEK?', message: 'Your staff sets the lineup and the fight is simulated. The rival coach still gets his swap.', confirmLabel: 'Auto-play' });
    if (!ok) return;
    const pd = ensurePending(g);
    const mine = R.aiOrder(L, me(), () => R.nextRand(L));
    const ans = R.rivalAnswer(L, pd.theirs, mine, () => R.nextRand(L));
    const lineups = g.home === L.user.team ? { home: mine, away: ans.lineup } : { home: ans.lineup, away: mine };
    const before = Object.fromEntries(players(me()).map((p) => [p.pid, p.hype]));
    R.playGame(L, g, lineups);
    L.pending = null;
    R.simWeek(L, true);
    const week = L.week;
    R.endWeek(L);
    await save();
    drawRecap({ kind: 'week', week, g, won: g.result.winner === L.user.team, before });
  }

  function drawRecap(rc) {
    fightView = null;
    const g = rc.g; const r = g.result; const userHome = g.home === L.user.team;
    const opp = team(userHome ? g.away : g.home);
    const s = userHome ? r.score : [r.score[1], r.score[0]];
    const mvp = L.players[r.mvp];
    const t = me();
    const hypeMoves = players(t).map((p) => ({ p, d: Math.round(p.hype - (rc.before[p.pid] ?? p.hype)) })).filter((x) => x.d).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 4);
    const hurt = players(t).filter((p) => p.injury > 0);
    const rv = R.isRivalry(g.home, g.away, L);
    let next;
    if (rc.kind === 'playoff') {
      const po = L.playoffs;
      if (po.champion != null) {
        next = h('button', { class: 'btn btn-primary btn-wide', onClick: () => { const row = R.endSeason(L); recordSeason(row); save(); drawSeasonEnd(row); } }, 'To the trophy ceremony');
      } else if (!rc.won) {
        next = h('button', { class: 'btn btn-primary btn-wide', onClick: finishPlayoffs }, 'Play out the playoffs');
      } else {
        next = h('button', { class: 'btn btn-primary btn-wide', onClick: () => { tab = 'league'; drawHub(); } }, 'On to the Zenith Clash');
      }
    } else {
      next = h('button', { class: 'btn btn-primary btn-wide', onClick: () => { tab = 'league'; drawHub(); } }, L.phase === 'playoffs' ? 'The regular season is over' : `On to week ${L.week}`);
    }
    fill(root, header(rc.kind === 'week' ? `WEEK ${rc.week} · FINAL` : 'PLAYOFFS · FINAL'),
      h('div', { class: 'dy-wrap dy-narrow' },
        h('div', { class: 'result-head' },
          h('p', { class: 'label-spaced' }, `${t.name} ${userHome ? 'vs' : 'at'} ${opp.name}`),
          h('h2', { class: `display-lg ${rc.won ? 'gold' : ''}` }, rc.won ? 'YOU WIN' : 'THEY WIN'),
          h('p', { class: 'stat' }, `${s[0]} – ${s[1]}`),
          rv ? h('p', { class: 'dy-trophy-line' }, rc.won ? `${rv[2].toUpperCase()} IS YOURS` : `${opp.name.toUpperCase()} TAKE ${rv[2].toUpperCase()}`) : null),
        mvp ? h('div', { class: 'br-mvp panel' }, pAvatar(mvp, 'md'), h('div', {}, h('p', { class: 'label-spaced gold' }, 'GAME MVP'), h('p', { class: 'heading' }, mvp.name), h('p', { class: 'caption muted' }, team(mvp.team).name))) : null,
        hypeMoves.length ? h('section', { class: 'dy-panel' }, h('h3', { class: 'dy-h' }, 'HYPE'), h('ul', { class: 'dy-list' }, hypeMoves.map(({ p, d }) => h('li', {}, pAvatar(p), h('span', { class: 'dy-list-text' }, p.name), h('span', { class: `dy-num ${d > 0 ? 'win' : 'loss'}` }, `${d > 0 ? '+' : ''}${d}`))))) : null,
        hurt.length ? h('p', { class: 'caption loss' }, `Injured: ${hurt.map((p) => `${p.name} (${p.injury} wk)`).join(', ')}`) : null,
        rc.kind === 'week' && L.lastWeekScores ? h('section', { class: 'dy-panel' }, h('h3', { class: 'dy-h' }, 'AROUND THE AFL'),
          h('ul', { class: 'dy-scores' }, L.lastWeekScores.filter((x) => x.home !== L.user.team && x.away !== L.user.team).map((x) => h('li', {},
            h('span', { class: x.winner === x.home ? 'is-w' : '' }, crest(team(x.home), 18), ` ${team(x.home).abbr}`), h('span', { class: 'dy-num' }, `${x.score[0]}–${x.score[1]}`),
            h('span', { class: x.winner === x.away ? 'is-w' : '' }, `${team(x.away).abbr} `, crest(team(x.away), 18)))))) : null,
        next));
  }

  async function finishPlayoffs() {
    R.simPlayoffs(L, false);
    const row = R.endSeason(L);
    recordSeason(row);
    await save();
    drawSeasonEnd(row);
  }

  function recordSeason(row) {
    const t = me(); const champ = row.champion === t.i; const made = L.playoffs.seeds.includes(t.i);
    records.update('dynasty', (r) => {
      r.seasons = (r.seasons || 0) + 1; r.titles = (r.titles || 0) + (champ ? 1 : 0); r.playoffs = (r.playoffs || 0) + (made ? 1 : 0);
      r.wins = (r.wins || 0) + t.w; r.losses = (r.losses || 0) + t.l;
      if (!r.bestWins || t.w > r.bestWins) r.bestWins = t.w;
      return r;
    });
  }

  function drawSeasonEnd(row) {
    const t = me(); const champ = team(row.champion);
    const mine = row.champion === t.i;
    const u = L.user; const last = u.career[u.career.length - 1];
    const award = (pid) => (pid ? L.players[pid] : null);
    fill(root, header(`SEASON ${row.season} · AWARDS`, () => { tab = 'league'; drawHub(); }),
      h('div', { class: 'dy-wrap' },
        h('div', { class: 'dy-champ' }, tinted(champ, team(row.runnerUp)),
          h('div', { class: 'dy-champ-text' },
            crest(champ, 96),
            h('p', { class: 'label-spaced gold' }, 'THE CELESTIAL GRAIL'),
            h('h2', { class: 'display-lg' }, mine ? 'CHAMPIONS!' : champ.name.toUpperCase()),
            h('p', { class: 'body-text' }, `${champ.name} beat ${team(row.runnerUp).name} ${row.score[0]}–${row.score[1]} in the Zenith Clash. Coach ${row.coach}.`))),
        h('section', { class: 'dy-panel' },
          h('h2', { class: 'dy-h gold' }, R.AWARDS.prodigy.toUpperCase()),
          h('div', { class: 'br-mvp' }, pAvatar(award(row.prodigy), 'md'), h('div', {}, h('p', { class: 'heading' }, row.prodigyName), h('p', { class: 'caption muted' }, team(row.prodigyTeam).name))),
          h('ul', { class: 'dy-list' }, R.ROLES.map((r) => { const p = award(row.roleAwards[r]); return p ? h('li', {}, pAvatar(p), h('span', { class: 'dy-list-text' }, h('span', {}, p.name), h('span', { class: 'caption muted' }, `${R.AWARDS[r]} · best ${r}`))) : null; })),
          h('p', { class: 'caption' }, `${R.AWARDS.coach}: ${team(row.coachOfYear).coachName} (${team(row.coachOfYear).name})`)),
        h('section', { class: 'dy-panel' },
          h('h2', { class: 'dy-h' }, 'THE FRONT OFFICE'),
          h('p', { class: 'heading' }, `${t.name}: ${t.w}-${t.l}${last?.playoffs ? ', made the playoffs' : ''}.`),
          h('p', { class: 'body-text' }, `Expectation: ${R.EXPECT_LABEL[u.expect]}. ${last?.met ? 'You met it.' : 'You missed it.'} Job security: ${u.security}.`),
          u.security === 'Fired' ? h('p', { class: 'body-text loss' }, 'You\'ve been fired. Finding a new job arrives with the off-season update.') : null),
        h('p', { class: 'caption muted' }, 'The off-season (retirements, the draft, free agency and trades) arrives in the next update. Your save is kept.'),
        h('button', { class: 'btn btn-primary btn-wide', onClick: () => { tab = 'league'; drawHub(); } }, 'Back to the office')));
  }

  await drawSlots();
  help.showFirstTime();
  return root;
}
