// DYNASTY: The Anime Fighting League (release 1 "The Season", release 2 "The Off-season").
// Take over a team that missed last season's playoffs, set a lineup every
// week against the rival coach (who gets one final swap), fight through a
// 12-week season, win your division and chase the Zenith Clash.
// Rules live in dynasty-rules.js; the off-season, trades and the draft in dynasty-off.js.

import { h, fill, toast, avatar, sheet, confirmSheet } from '../core/ui.js';
import { profile } from '../core/profile.js';
import { records } from '../core/records.js';
import { store } from '../core/store.js';
import { characters } from '../core/characters.js';
import { modeHeader, howToPlay } from '../core/mode-kit.js';
import { SPECIALS } from '../core/combat.js';
import { playMatch } from '../core/battle-view.js';
import * as R from './dynasty-rules.js';
import * as O from './dynasty-off.js';
import * as MD from './dynasty-media.js';
import * as LG from './dynasty-legacy.js';
import * as WK from './dynasty-weekly.js';
import * as MAP from './dynasty-map.js';
import { sfx } from '../core/sfx.js';
import * as DP from './dynasty-phone.js';
import { createPhone } from '../core/phone-ui.js';

const help = howToPlay('dynasty', 'Dynasty', [
  'You are the new head coach of an Anime Fighting League team. Pick any team that missed last season\'s playoffs.',
  'Every week, open the Game Plan. You can see the other team\'s lineup: set your five in order so your roles beat theirs.',
  'When you lock in, the rival coach sees your order and gets one final swap. Think one step ahead.',
  'Your phone (Open phone button, or P): GMs call with trade offers until the deadline, some with draft picks. Text your squad before each game for +3 Aura, Clutch or Chaos. After a win the other coach texts you. Matchup is the dating app: a date is +2 Aura next game. Phone boosts last one game and stack to +5.',
  'Cards wear down. Tired cards fight weaker and can get hurt, so rotate your bench.',
  'Win your division to make the playoffs. Win two more and you lift the Celestial Grail at the Zenith Clash.',
  'Hype comes from winning fights. Aura comes from being seen: magazine picks and awards. Both carry over.',
  'Meet the front office\'s expectation or your job security drops. Miss it three seasons running and you\'re fired.',
  'Front Office: trade until the Week 8 deadline (and again after the season until draft day), sign emergency pickups, and stay under the hard salary cap (160 in season 1, up 5% every off-season). A max deal is 35 a season; deals near the max are supermax, and a team can carry 3.',
  'Each time you open a save you get the Weekly Recap, then the Weekly Preview. Tick "Don\'t show again this week" to skip them; both are also on the Next Game card.',
  'Draft: you earn 8 scouting points a week. 6 points reveals a prospect\'s potential; a deep scout shows 💎 (a gem: Star or Superstar, 2x growth or more), nothing (solid: could be any of the three) or 💔 a broken diamond (a bust: Normal, 1x). Power stays hidden until they are drafted.',
  'Off-season: retirements, awards night, re-sign (one Franchise Tag), up to 2 development upgrades, a one-round draft, then 3 rounds of free agency.',
  'Media: OSM prints an issue every 3 weeks. The cover star and your spotlight player gain Aura. The Fight Night Dojo picks the big games every week.',
  'Museum: every champion, award winner, rivalry trophy and Pantheon member. Your office wall and trophy shelf live on the Coach tab.',
  'The end of an era: when the last original character retires (around season 10), your dynasty is complete. It goes into the Hall of Coaches, and the save carries on into the New Era with made-up characters only.',
  'Your legacy carries into new saves: you can take any job, free agents like you more, and with 2+ Grails you get an extra season before the hot seat.',
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
// A trophy picture, or null when we have no art for that trophy.
function trophy(name, size = 40, cls = 'dy-trophy') {
  const src = R.trophyFile(name);
  return src ? h('img', { class: cls, src, alt: name, title: name, style: `height:${size}px` }) : null;
}
// News items: rivalry stories show the rivalry trophy, everything else the team crest.
function newsIcon(n) {
  let name = n.trophy;
  if (!name && n.kind === 'RIVALRY') name = (R.RIVALRIES.find((r) => n.title.includes(r[2])) || [])[2];
  return (name && trophy(name, 40, 'dy-trophy dy-news-trophy')) || crest(team(n.team), 36);
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
  // v0.18.0: the phone (GM trade calls, team chat, Matchup).
  const phone = createPhone({
    apps: ['messages', 'dating', 'settings'],
    shortcutWhere: 'Dynasty',
    getPhone: () => (L && L.user ? DP.ensure(L) : null),
    save: () => save(),
    getKey: () => L?.user?.phoneKey || 'p',
    setKey: (k) => { if (L?.user) { L.user.phoneKey = k; save(); } },
    widgets: () => (L?.user ? [[`${me().w}-${me().l}`, 'RECORD'], [L.phase === 'season' ? `WK ${L.week}` : L.phase === 'playoffs' ? 'PLAYOFFS' : 'OFF', 'SEASON ' + L.season], [String(O.picksOwnedBy(L, L.user.team).length), 'DRAFT PICKS']] : []),
    empty: () => (L ? 'GMs, your squad and the league office text you here every week.' : 'Pick a save first.'),
    dateCtx: () => (L?.user && (L.phase === 'season' || L.phase === 'playoffs') ? DP.dateCtx(L) : null),
    onDate: () => { DP.onDate(L); save(); if (tab === 'coach' || tab === 'league') drawHub(); },
    onReply: (key, optionId) => {
      if (!L) return null;
      const line = DP.reply(L, key, optionId);
      save();
      if (document.querySelector('.dy-hub3, .dy-next')) drawHub();
      return line;
    },
  });
  phone.show(false);
  root._cleanup = () => { clearInterval(carouselTimer); if (fightView) fightView.stop(); phone.destroy(); };
  const header = (sub, onBack) => modeHeader({ title: 'Dynasty', sub, onHelp: () => help.show(), onBack });
  const stopTimers = () => { clearInterval(carouselTimer); carouselTimer = null; };

  // ---------- Save slots ----------
  async function drawSlots() {
    stopTimers();
    L = null; slot = null;
    phone.show(false);
    const saves = await Promise.all([1, 2, 3].map((n) => store.get(slotKey(n), null)));
    const hallCount = ((await store.get(LG.ARCHIVE_KEY, null)) || []).length;
    fill(root,
      header('THE ANIME FIGHTING LEAGUE'),
      h('div', { class: 'dy-wrap' },
        h('div', { class: 'dy-slots-head' }, h('p', { class: 'body-text' }, 'Run an AFL franchise. Three save slots.'),
          hallCount ? h('button', { class: 'btn btn-secondary', onClick: drawHall }, `Hall of Coaches (${hallCount})`) : null),
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
              s.complete ? h('p', { class: 'caption gold' }, '★ LEGACY COMPLETE · THE NEW ERA') : null,
              h('p', { class: 'caption muted' }, `${s.user.coach} · Season ${s.season} · ${s.phase === 'done' ? 'season complete' : s.phase === 'offseason' ? 'off-season' : s.phase === 'playoffs' ? 'playoffs' : `week ${s.week}`} · ${t.w}-${t.l}`))),
            h('div', { class: 'btn-row' },
              h('button', { class: 'btn btn-primary', onClick: () => { L = LG.migrate(MD.migrate(O.migrate(s))); slot = n; enterDynasty(); } }, 'Continue'),
              h('button', { class: 'btn btn-secondary', onClick: async () => {
                const ok = await confirmSheet({ title: 'DELETE THIS DYNASTY?', message: `${t.name}, season ${s.season}. This can't be undone.`, confirmLabel: 'Delete', danger: true });
                if (ok) { await store.remove(slotKey(n)); await store.remove(`dynasty:photos:slot${n}`); toast('Save deleted.'); }
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
    setTimeout(async () => {
      draft.rep = LG.reputation(await store.get(LG.ARCHIVE_KEY, null));
      L = R.newLeague(characters.list, Date.now() & 0x7fffffff);
      R.simulateFullSeason(L);
      drawPick();
    }, 60);
  }

  function drawPick() {
    const last = L.history[0];
    const big = draft.rep && draft.rep.dynasties > 0;
    const jobs = big ? last.standings.map((x) => x.i) : R.openJobs(L);
    const champ = team(last.champion);
    fill(root, header('PICK YOUR TEAM', drawSlots),
      h('div', { class: 'dy-wrap' },
        h('div', { class: 'dy-lastseason dy-panel' },
          crest(champ, 56),
          h('div', {},
            h('p', { class: 'label-spaced gold' }, 'LAST SEASON'),
            h('p', { class: 'heading' }, `${champ.name} won the Celestial Grail, ${last.score[0]}–${last.score[1]} over ${team(last.runnerUp).name}.`),
            h('p', { class: 'caption muted' }, big ? `Your legacy opens every door: all ${jobs.length} teams will take your call.` : `The four playoff teams aren't hiring. These ${jobs.length} are.`))),
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
        h('p', { class: 'caption muted' }, `${R.DIVISIONS[t.div]} Division · ${t.arena} · Payroll ${R.payroll(L, t)} of ${R.capOf(t)}`),
        h('p', { class: 'body-text' }, `The front office expects: ${R.EXPECT_LABEL[t.stage]}.${rv ? ` Rivalry: ${rv.trophy} vs ${team(rv.team).name}.` : ''}`),
        h('ul', { class: 'dy-mini-roster' }, ps.map((p) => h('li', {}, pAvatar(p), h('span', {}, p.name), h('span', { class: `caption ${ROLE_CLASS(p.role)}` }, p.role), h('span', { class: 'dy-num' }, String(p.power))))),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn btn-secondary', onClick: () => s.close() }, 'Keep looking'),
          h('button', { class: 'btn btn-primary', onClick: async () => { s.close(); await takeJob(ti); } }, 'Take the job'))),
    });
  }

  async function takeJob(ti) {
    let article = R.hire(L, ti, draft.name, draft.quiz, draft.rep);
    if (L.user.rep) article = LG.bigNameArticle(L, ti, L.user.rep);
    R.resetForSeason(L);
    L.user.expect = team(ti).stage;
    L.hireArticle = article;
    L.news.unshift({ week: 0, kind: 'YOUR HIRE', team: ti, title: article.title, text: article.text });
    (L.mags || []).forEach((m) => { m.read = true; });
    MD.makePreseason(L);
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
  const TABS = [['coach', 'COACH'], ['league', 'LEAGUE'], ['roster', 'ROSTER'], ['office', 'FRONT OFFICE'], ['draft', 'DRAFT'], ['media', 'MEDIA'], ['museum', 'MUSEUM'], ['schedule', 'SCHEDULE'], ['standings', 'STANDINGS']];

  function shell(content) {
    const t = me();
    const nav = h('nav', { class: 'dy-tabs', 'aria-label': 'Dynasty sections' }, TABS.map(([id, label]) => h('button', {
      class: `dy-tab${tab === id ? ' is-on' : ''}`, 'aria-current': tab === id ? 'page' : null, onClick: () => { tab = id; drawHub(); },
    }, label, id === 'media' && unreadMag() ? h('span', { class: 'dy-tab-dot', 'aria-label': 'new issue' }) : null)));
    const status = (L.era === 2 && L.phase === 'season' ? 'THE NEW ERA · ' : '') + (L.phase === 'done' ? 'SEASON COMPLETE' : L.phase === 'offseason' ? 'OFF-SEASON' : L.phase === 'playoffs' ? 'PLAYOFFS' : `WEEK ${L.week} OF ${R.WEEKS}`);
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
    if (L?.user) phone.show(true);
    stopTimers();
    ({ coach: drawCoach, league: drawLeague, roster: drawRoster, office: drawOffice, draft: drawDraftTab, media: drawMedia, museum: drawMuseum, schedule: drawSchedule, standings: drawStandings }[tab] || drawLeague)();
  }

  function nextAction() {
    if (L.phase === 'season') {
      const g = R.userGame(L);
      const opp = team(g.home === L.user.team ? g.away : g.home);
      const rv = R.isRivalry(g.home, g.away, L);
      return h('section', { class: 'dy-next dy-panel dy-next2' },
        h('div', { class: 'dy-panel-head' }, h('h2', { class: 'dy-h' }, 'NEXT GAME'), h('p', { class: 'caption muted' }, `WEEK ${L.week}`)),
        h('div', { class: 'dy-next-row' }, rv ? trophy(rv[2], 64) : crest(opp, 64), h('div', {},
          h('p', { class: 'caption muted' }, g.home === L.user.team ? 'VS' : 'AT'),
          h('p', { class: 'dy-next-name' }, `${opp.rank && opp.rank <= 25 ? `#${opp.rank} ` : ''}${opp.name}`.toUpperCase()),
          h('p', { class: 'caption muted' }, `${opp.w}-${opp.l} · ${team(g.home).arena}`))),
        rv ? h('p', { class: 'dy-trophy-line' }, `RIVALRY · ${rv[2].toUpperCase()} IS ON THE LINE`) : null,
        (() => { const b = MD.boostNow(L); return b ? h('p', { class: `dy-boost is-${b.stat}` }, `OSM QUOTE: +${MD.QUOTE_BOOST} ${b.stat.toUpperCase()} · THROUGH WEEK ${Math.min(b.to, R.WEEKS)}`) : null; })(),
        (() => { const b = DP.boostText(L); return b ? h('p', { class: 'dy-boost is-phone' }, `📱 FROM YOUR PHONE: ${b} · THIS GAME`) : null; })(),
        (() => { const n = !L.user.autoSpend ? R.teamPoints(L, me()) : 0; return n ? h('button', { class: 'dy-boost is-phone dy-sp-alert', onClick: () => { tab = 'roster'; drawHub(); } }, `⬆ ${n} SKILL POINT${n > 1 ? 'S' : ''} TO SPEND · ROSTER ›`) : null; })(),
        h('button', { class: 'btn btn-primary btn-wide', onClick: () => openGamePlan() }, '📋 Game Plan'),
        h('div', { class: 'btn-row dy-next-links' },
          h('button', { class: 'btn btn-secondary btn-sm', onClick: autoWeek }, 'Auto-play week'),
          L.week > 1 ? h('button', { class: 'btn btn-secondary btn-sm', onClick: () => showRecap(L.week - 1, () => { tab = 'league'; drawHub(); }) }, 'Weekly recap') : null,
          h('button', { class: 'btn btn-secondary btn-sm', onClick: () => showPreview(() => { tab = 'league'; drawHub(); }) }, 'Weekly preview')));
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
    if (L.phase === 'offseason') {
      return h('section', { class: 'dy-next dy-panel' },
        h('p', { class: 'label-spaced gold' }, `THE OFF-SEASON · ${O.OFF_LABEL[L.off.step].toUpperCase()}`),
        h('p', { class: 'heading' }, `${team(last.champion).name} hold the Celestial Grail.`),
        offSteps(),
        h('button', { class: 'btn btn-primary btn-wide', onClick: drawOff }, 'Continue the off-season'));
    }
    return h('section', { class: 'dy-next dy-panel' },
      h('p', { class: 'label-spaced gold' }, `SEASON ${last.season} COMPLETE`),
      h('p', { class: 'heading' }, `${team(last.champion).name} won the Celestial Grail.`),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn btn-primary', onClick: beginOffseason }, 'Start the off-season'),
        h('button', { class: 'btn btn-secondary', onClick: () => drawSeasonEnd(last) }, 'Season summary')));
  }

  // ---------- The League hub (v0.14.0 layout) ----------
  const hubTab = { power: 'p25', news: 'league', draft: 'top', lead: 'dmg' };
  // A row of tabs that swaps its body in place (no full redraw).
  function tabbed(key, tabs, body, extra = null) {
    const box = h('div', { class: 'dy-tabbed-body' }, body(hubTab[key]));
    const bar = h('div', { class: 'dy-subtabs', role: 'tablist' }, tabs.map(([id, label]) => h('button', {
      class: `dy-subtab${hubTab[key] === id ? ' is-on' : ''}`, role: 'tab', 'aria-selected': hubTab[key] === id ? 'true' : 'false',
      onClick: (e) => { hubTab[key] = id; bar.querySelectorAll('button').forEach((b) => { const on = b === e.currentTarget; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); }); fill(box, body(id)); },
    }, label)));
    return [bar, extra, box];
  }
  const kfmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : String(Math.round(n)));
  const confOf = (t) => (t.div < 2 ? 0 : 1);
  const lastResult = (ti) => {
    for (let w = Math.min(L.week - 1, R.WEEKS); w >= 1; w--) {
      const g = L.schedule[w - 1]?.find((x) => (x.home === ti || x.away === ti) && x.result);
      if (g) { const won = g.result.winner === ti; const opp = team(g.home === ti ? g.away : g.home); const s = g.result.score; const sc = g.home === ti ? s : [s[1], s[0]]; return `${won ? 'W' : 'L'} ${sc[0]}-${sc[1]} ${g.home === ti ? 'vs' : 'at'} ${opp.abbr}`; }
    }
    return null;
  };
  const streakText = (t) => (t.streak >= 2 ? `won ${t.streak} straight` : t.streak <= -2 ? `lost ${-t.streak} straight` : null);
  const rankName = (t) => `${t.rank && t.rank <= 25 ? `#${t.rank} ` : ''}${t.name}`;

  function gameSlide(g, k) {
    const a = team(g.home); const b = team(g.away);
    const rv = R.isRivalry(g.home, g.away, L);
    const kicker = rv ? `RIVALRY · ${rv[2].toUpperCase()}` : (a.rank <= 10 && b.rank <= 10) ? 'TOP-10 SHOWDOWN' : k === 0 ? 'GAME OF THE WEEK' : 'RANKED SHOWDOWN';
    const bar = (t, side) => h('div', { class: `dy-gw-bar is-${side}`, style: `--c:${t.c1}` },
      h('p', { class: 'dy-gw-bar-name' }, h('span', { class: 'dy-gw-rank', style: `color:${t.c2}` }, t.rank && t.rank <= 25 ? `#${t.rank} ` : ''), t.name.toUpperCase()),
      h('p', { class: 'dy-gw-bar-sub' }, [`${t.w}-${t.l}`, lastResult(t.i), streakText(t)].filter(Boolean).join(' · ')));
    return h('div', { class: 'dy-slide dy-gw', style: `--a1:${a.c1};--a2:${a.c2};--b1:${b.c1};--b2:${b.c2}` },
      tinted(a, b, 'dy-arena dy-gw-arena'),
      h('div', { class: 'dy-gw-crest is-a' }, crest(a, 230)),
      h('div', { class: 'dy-gw-crest is-b' }, crest(b, 230)),
      h('div', { class: 'dy-gw-mid' },
        h('p', { class: 'dy-gw-brand' }, h('span', {}, 'THE FIGHT NIGHT'), 'DOJO'),
        h('p', { class: 'dy-gw-kicker' }, kicker),
        h('p', { class: 'dy-gw-team' }, h('span', { style: `color:${a.c2 === '#000000' ? '#fff' : a.c2}` }, a.rank && a.rank <= 25 ? `#${a.rank} ` : ''), a.name.toUpperCase()),
        rv ? h('div', { class: 'dy-gw-trophy' }, trophy(rv[2], 110)) : h('p', { class: 'dy-gw-vs' }, 'VS'),
        h('p', { class: 'dy-gw-team' }, h('span', { style: `color:${b.c2 === '#000000' ? '#fff' : b.c2}` }, b.rank && b.rank <= 25 ? `#${b.rank} ` : ''), b.name.toUpperCase()),
        h('div', { class: 'dy-gw-when' }, h('p', { class: 'heading' }, `WEEK ${L.week} · SEASON ${L.season}`), h('p', { class: 'caption' }, a.arena.toUpperCase()), h('p', { class: 'caption muted' }, `${R.DIVISIONS[a.div].toUpperCase()} DIVISION`)),
        h('div', { class: 'dy-gw-boxes' },
          h('div', {}, h('p', { class: 'heading' }, `${team(g.pick).abbr} ${g.chance}%`), h('p', { class: 'caption muted' }, 'DOJO PICK')),
          h('div', {}, h('p', { class: 'heading loss' }, k === 0 ? 'SBN PRIME' : 'AGN'), h('p', { class: 'caption muted' }, 'TV')))),
      bar(a, 'a'), bar(b, 'b'));
  }
  function raceSlide() {
    const race = R.awardRace(L).slice(0, 4);
    if (!race.length) return null;
    const lead = race[0].p;
    return h('div', { class: 'dy-slide dy-gw dy-gw-race' },
      tinted(team(lead.team), team(lead.team), 'dy-arena dy-gw-arena'),
      h('div', { class: 'dy-gw-crest is-a dy-gw-lead' }, pAvatar(lead, 'card')),
      h('div', { class: 'dy-gw-crest is-b' }, trophy(R.AWARDS.prodigy, 250)),
      h('div', { class: 'dy-gw-mid' },
        h('p', { class: 'dy-gw-brand' }, h('span', {}, 'THE FIGHT NIGHT'), 'DOJO'),
        h('p', { class: 'dy-gw-kicker' }, 'THE GPT RACE'),
        h('ol', { class: 'dy-gw-racelist' }, race.map(({ p, s }, i) => h('li', {}, h('span', { class: 'dy-gw-rank gold' }, String(i + 1)), pAvatar(p), h('span', { class: 'dy-list-text' }, h('span', { class: 'heading' }, p.name.toUpperCase()), h('span', { class: 'caption muted' }, `${team(p.team).abbr} · ${kfmt(p.stats.dmg)} dmg · ${p.stats.ko} KOs`)), h('span', { class: 'dy-num gold' }, R.oddsFor(i, s, race[0].s)))))),
      h('div', { class: 'dy-gw-bar is-a', style: `--c:${team(lead.team).c1}` }, h('p', { class: 'dy-gw-bar-name' }, lead.name.toUpperCase()), h('p', { class: 'dy-gw-bar-sub' }, `${team(lead.team).name} · the favorite`)));
  }

  function carouselEl() {
    const slides = [];
    if (L.phase === 'season') (MD.dojoWeek(L)?.games || []).forEach((g, k) => slides.push(gameSlide(g, k)));
    const rs = L.phase === 'season' || L.phase === 'playoffs' ? raceSlide() : null;
    if (rs) slides.push(rs);
    if (!slides.length) return null;
    let idx = 0;
    const track = h('div', { class: 'dy-car-track' }, slides);
    const dots = h('div', { class: 'dy-dots' });
    const go = (i) => { idx = (i + slides.length) % slides.length; track.style.transform = `translateX(-${idx * 100}%)`; dots.querySelectorAll('button').forEach((d, j) => d.classList.toggle('is-on', j === idx)); };
    const restart = () => {
      clearInterval(carouselTimer);
      if (slides.length > 1 && !document.documentElement.classList.contains('reduce-motion')) carouselTimer = setInterval(() => go(idx + 1), 7000);
    };
    slides.forEach((_, i) => dots.append(h('button', { class: `dy-dot${i === 0 ? ' is-on' : ''}`, 'aria-label': `Show slide ${i + 1}`, onClick: () => { go(i); restart(); } })));
    const el = h('section', { class: 'dy-carousel dy-gw-carousel', 'aria-label': 'Games of the week', 'aria-roledescription': 'carousel' },
      h('p', { class: 'dy-gw-tag' }, 'GAMES OF THE WEEK'),
      track,
      h('button', { class: 'dy-gw-arrow is-prev', 'aria-label': 'Previous', onClick: () => { go(idx - 1); restart(); } }, '‹'),
      h('button', { class: 'dy-gw-arrow is-next', 'aria-label': 'Next', onClick: () => { go(idx + 1); restart(); } }, '›'),
      dots);
    setTimeout(restart, 0);
    return el;
  }

  function newsList(items, empty) {
    return items.length ? h('ul', { class: 'dy-news' }, items.slice(0, 10).map((n) => h('li', {},
      newsIcon(n),
      h('div', {}, h('p', { class: 'dy-news-kind' }, `${n.kind}${n.week ? ` · WEEK ${n.week}` : ''}`), h('p', { class: 'dy-news-title' }, n.title), h('p', { class: 'caption muted' }, n.text))))) : h('p', { class: 'caption muted dy-pad' }, empty);
  }
  function faUpdates() {
    const moves = L.news.filter((n) => ['SIGNED', 'TRADE', 'TAGGED', 'RETIRED'].includes(n.kind));
    const soon = Object.values(L.players).filter((p) => p.team != null && p.contract && p.contract.left <= 1 && !p.retired).sort((a, b) => b.power - a.power).slice(0, 8);
    return h('div', {},
      moves.length ? newsList(moves, '') : null,
      h('p', { class: 'label-spaced dy-pad' }, 'BEST UPCOMING FREE AGENTS'),
      h('ul', { class: 'dy-list' }, soon.map((p) => pLine(p, h('span', { class: 'dy-num' }, String(p.power)), `${team(p.team).abbr} · ${p.role} · asks about ${O.asking(p)}${p.team === L.user.team ? ' · YOURS' : ''}`))));
  }
  function draftRoom(view) {
    let list = O.draftBoard(L);
    if (view === 'mine') list = list.filter((p) => p.watch || p.scout > 0);
    list = list.slice().sort((a, b) => (a.stock || 99) - (b.stock || 99) || b.stars - a.stars).slice(0, 8);
    if (!list.length) return h('p', { class: 'caption muted dy-pad' }, view === 'mine' ? 'Nobody on your board yet. Watch or scout prospects in the Draft tab.' : 'The draft class arrives with the new season.');
    return h('table', { class: 'dy-table' },
      h('thead', {}, h('tr', {}, ['', 'Prospect', 'Role', 'World', 'Stars', 'Board'].map((x) => h('th', { scope: 'col' }, x)))),
      h('tbody', {}, list.map((p, i) => { const mv = p.stockPrev ? p.stockPrev - p.stock : 0; return h('tr', {},
        h('td', { class: 'dy-num' }, String(p.stock || i + 1)),
        h('td', {}, h('span', { class: 'dy-cell-p' }, pAvatar(p), h('span', {}, p.name, p.watch ? h('span', { class: 'gold' }, ' ★') : null))),
        h('td', { class: `caption ${ROLE_CLASS(p.role)}` }, p.role), h('td', { class: 'caption muted' }, p.series),
        h('td', {}, stars(p.stars)),
        h('td', { class: `dy-num ${mv > 0 ? 'win' : mv < 0 ? 'loss' : 'muted'}` }, mv > 0 ? `▲${mv}` : mv < 0 ? `▼${-mv}` : '–')); })));
  }
  function powerList(view) {
    const t0 = me();
    const list = view === 'conf'
      ? L.teams.filter((t) => confOf(t) === confOf(t0)).sort((a, b) => b.w - a.w || (b.rw - b.rl) - (a.rw - a.rl))
      : L.teams.slice().sort((a, b) => (a.rank || 99) - (b.rank || 99)).slice(0, 25);
    return h('ol', { class: 'dy-p25' }, list.map((t, i) => {
      const mv = t.prevRank ? t.prevRank - t.rank : 0;
      return h('li', { class: t.i === L.user.team ? 'is-you' : '' },
        h('span', { class: 'dy-p25-rank' }, String(view === 'conf' ? i + 1 : t.rank || '–')),
        h('span', { class: `dy-move ${mv > 0 ? 'up' : mv < 0 ? 'down' : ''}` }, view === 'conf' ? '' : mv > 0 ? `↑${mv}` : mv < 0 ? `↓${-mv}` : '–'),
        crest(t, 30),
        h('span', { class: 'dy-p25-name' }, h('span', {}, t.name.toUpperCase()), h('span', { class: 'dy-p25-sub' }, `${R.DIVISIONS[t.div]} · ${t.abbr}`)),
        h('span', { class: 'dy-p25-rec' }, `${t.w}-${t.l}`));
    }));
  }
  function leaderList(kind) {
    const key = { dmg: (p) => p.stats.dmg, ko: (p) => p.stats.ko, sp: (p) => p.stats.sp }[kind];
    const ps = Object.values(L.players).filter((p) => p.team != null && p.stats.gp).sort((a, b) => key(b) - key(a)).slice(0, 5);
    if (!ps.length) return h('p', { class: 'caption muted dy-pad' }, 'No fights yet.');
    return h('ol', { class: 'dy-leaders' }, ps.map((p, i) => h('li', {}, h('span', { class: 'dy-num' }, String(i + 1)), pAvatar(p),
      h('span', { class: 'dy-list-text' }, h('span', { class: 'heading' }, p.name.toUpperCase()), h('span', { class: `caption ${ROLE_CLASS(p.role)}` }, `${p.role} | ${team(p.team).name}`)),
      h('span', { class: 'dy-big-num' }, kind === 'dmg' ? fmt(p.stats.dmg) : String(key(p))))));
  }

  function leadersPanel() {
    return h('section', { class: 'dy-panel dy-panel-flush' },
      h('div', { class: 'dy-panel-head' }, h('h2', { class: 'dy-h' }, 'FIGHTER LEADERS'), h('p', { class: 'caption muted' }, 'SEASON LEADERS')),
      ...tabbed('lead', [['dmg', 'DAMAGE'], ['ko', 'KOS'], ['sp', 'SPECIALS']], leaderList));
  }
  function gppPanel(race) {
    return h('section', { class: 'dy-panel dy-panel-flush' },
      h('div', { class: 'dy-panel-head' }, h('div', { class: 'dy-h-trophy' }, trophy(R.AWARDS.prodigy, 48), h('h2', { class: 'dy-h gold' }, 'GPT RACE'))),
      race.length ? h('ol', { class: 'dy-leaders' }, race.map(({ p, s }, i) => h('li', {}, h('span', { class: 'dy-num' }, String(i + 1)), pAvatar(p), h('span', { class: 'dy-list-text' }, h('span', { class: 'heading' }, p.name.toUpperCase()), h('span', { class: 'caption muted' }, team(p.team).name)), h('span', { class: 'dy-num gold' }, R.oddsFor(i, s, race[0].s))))) : h('p', { class: 'caption muted dy-pad' }, 'The race starts after Week 1.'));
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
    const race = R.awardRace(L).slice(0, 5);
    const conf = R.CONFERENCES[confOf(me())];
    const confNews = L.news.filter((n) => n.team != null && L.teams[n.team] && confOf(L.teams[n.team]) === confOf(me()));
    shell(h('div', { class: 'dy-content dy-hub3' },
      ticker,
      h('aside', { class: 'dy-hub-left dy-panel dy-panel-flush' },
        h('div', { class: 'dy-panel-head' }, h('h2', { class: 'dy-h' }, 'AFL POWER 25'), h('p', { class: 'caption muted' }, 'AGN')),
        powerList('p25')),
      h('div', { class: 'dy-hub-center' },
        carouselEl(),
        h('div', { class: 'dy-hub-pair' },
          h('section', { class: 'dy-panel dy-panel-flush' },
            h('div', { class: 'dy-panel-head' }, h('h2', { class: 'dy-h' }, 'AROUND THE LEAGUE'), h('p', { class: 'caption muted' }, 'NEWS, MOVES AND CONFERENCE NOTES')),
            ...tabbed('news', [['league', 'LEAGUE NEWS'], ['conf', 'CONFERENCE'], ['fa', 'FREE AGENTS']], (v) => (v === 'league' ? newsList(L.news, 'Nothing yet. Play a week.') : v === 'conf' ? newsList(confNews, `Quiet in the ${conf} Conference.`) : faUpdates()))),
          h('section', { class: 'dy-panel dy-panel-flush' },
            h('div', { class: 'dy-panel-head' }, h('h2', { class: 'dy-h' }, 'DRAFT ROOM'), h('button', { class: 'dy-link', onClick: () => { tab = 'draft'; drawHub(); } }, 'VIEW ALL ›')),
            ...tabbed('draft', [['top', 'TOP PROSPECTS'], ['mine', 'MY BOARD']], draftRoom))),
        h('div', { class: 'dy-mobile-extra' }, leadersPanel(), gppPanel(race))),
      h('aside', { class: 'dy-hub-right' },
        nextAction(),
        magBanner(),
        leadersPanel(),
        gppPanel(race))));
  }

  // ---------- Weekly Recap and Weekly Preview ----------
  function weeklyFrame({ icon, title, sub, body, foot, onClose, nav }) {
    const seen = L.weeklySeen && L.weeklySeen.season === L.season && L.weeklySeen.week === L.week;
    const box = h('input', { type: 'checkbox', id: 'dy-wk-skip', checked: seen, onChange: async (e) => { L.weeklySeen = e.target.checked ? { season: L.season, week: L.week } : null; await save(); } });
    const el = h('div', { class: 'dy-weekly', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('header', { class: 'dy-wk-head' },
        h('span', { class: 'dy-wk-icon', 'aria-hidden': 'true' }, icon),
        h('div', {}, h('h2', { class: 'dy-wk-title' }, title), h('p', { class: 'dy-wk-sub' }, sub)),
        nav || null,
        h('button', { class: 'dy-wk-x', 'aria-label': 'Close', onClick: onClose }, '✕')),
      h('div', { class: 'dy-wk-body' }, body),
      h('footer', { class: 'dy-wk-foot' },
        h('label', { class: 'dy-wk-skip' }, box, ' Don\'t show again this week'),
        h('span', { class: 'dy-wk-foot-right' }, ...foot)));
    return el;
  }
  const panel = (title, ...kids) => h('section', { class: 'dy-wk-panel' }, h('h3', { class: 'dy-wk-h' }, title), ...kids);
  const pRow = (p, right, sub) => h('li', { class: 'dy-wk-row' }, pAvatar(p), h('span', { class: 'dy-list-text' }, h('span', { class: 'heading' }, p.name.toUpperCase(), h('span', { class: 'dy-wk-ovr' }, ` ${p.power}`)), h('span', { class: 'caption muted' }, sub)), right);
  const statBoxes = (pairs) => h('div', { class: 'dy-wk-stats' }, pairs.map(([v, k]) => h('div', {}, h('p', { class: 'dy-wk-stat' }, String(v)), h('p', { class: 'caption muted' }, k))));

  function roundTable(g, note) {
    const r = g.result;
    const n = Math.max(3, r.rounds.length);
    const row = (ti, side) => h('tr', { class: r.winner === ti ? 'is-w' : '' },
      h('td', {}, h('span', { class: 'dy-cell-p' }, crest(team(ti), 26), h('span', {}, `${team(ti).rank && r.rk[side] <= 25 ? `#${r.rk[side]} ` : ''}${team(ti).name.toUpperCase()}`))),
      ...Array.from({ length: n }, (_, k) => h('td', { class: `dy-num ${r.rwin[k] === side ? '' : 'muted'}` }, r.rounds[k] ? kfmt(r.rounds[k][side]) : '–')),
      h('td', { class: 'dy-wk-total' }, String(r.score[side])));
    return h('div', {}, h('table', { class: 'dy-table dy-wk-table' },
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'TEAM'), ...Array.from({ length: n }, (_, k) => h('th', { scope: 'col' }, `R${k + 1}`)), h('th', { scope: 'col' }, 'W'))),
      h('tbody', {}, row(g.away, 1), row(g.home, 0))),
      note ? h('p', { class: 'caption muted dy-wk-note' }, note) : null);
  }

  function showRecap(week, then) {
    stopTimers();
    const rc = WK.recap(L, week);
    if (!rc) { then(); return; }
    const mv = WK.movers(L); const pic = rc.latest ? WK.picture(L) : null; const stock = rc.latest ? WK.draftStock(L) : null;
    const weeks = Array.from({ length: Math.min(L.phase === 'season' ? L.week - 1 : R.WEEKS, R.WEEKS) }, (_, i) => i + 1);
    const nav = h('div', { class: 'dy-wk-nav' },
      h('button', { class: 'dy-wk-navb', disabled: week <= 1, 'aria-label': 'Earlier week', onClick: () => showRecap(week - 1, then) }, '‹'),
      h('select', { class: 'dy-select', 'aria-label': 'Week', onChange: (e) => showRecap(Number(e.target.value), then) }, weeks.map((w) => h('option', { value: String(w), selected: w === week }, `Week ${w} · ${L.schedule[w - 1].length} games`))),
      h('button', { class: 'dy-wk-navb', disabled: week >= weeks.length, 'aria-label': 'Later week', onClick: () => showRecap(week + 1, then) }, '›'));
    const card = (x) => {
      const p = L.players[x.pid]; const t = team(x.team); const o = team(x.opp);
      const [first, ...rest] = p.name.split(' ');
      return panel(x.label, h('div', { class: 'dy-wk-pcard', style: `--c1:${t.c1};--c2:${t.c2}` },
        h('div', { class: 'dy-wk-pic' }, pAvatar(p, 'card')),
        h('div', { class: 'dy-wk-pinfo' },
          h('p', { class: 'dy-wk-first' }, rest.length ? first.toUpperCase() : ''), h('p', { class: 'dy-wk-last' }, (rest.length ? rest.join(' ') : first).toUpperCase()),
          h('p', { class: 'caption' }, `${p.role.toUpperCase()} | ${t.abbr} · SEASON ${p.career}`),
          h('p', { class: `dy-wk-res ${x.won ? 'win' : 'loss'}` }, `${x.won ? 'W' : 'L'} ${x.score[0]}-${x.score[1]} `, h('span', { class: 'muted' }, x.home ? 'vs' : '@'), ' ', crest(o, 18), ` ${o.name.toUpperCase()}`)),
        crest(t, 70),
        statBoxes([[kfmt(x.dmg), 'DMG'], [x.ko, 'KOS'], [x.sp, 'SPECIALS']])));
    };
    const rowsTeams = (ids, f) => h('ul', { class: 'dy-wk-list' }, ids.map((i) => { const t = team(i); return h('li', { class: 'dy-wk-row' }, crest(t, 26), h('span', { class: 'dy-list-text' }, h('span', { class: 'heading' }, t.name.toUpperCase()), h('span', { class: 'caption muted' }, lastResult(i) || '')), f(t)); }));
    const body = h('div', { class: 'dy-wk-grid' },
      h('div', { class: 'dy-wk-cards' }, rc.players.map(card)),
      h('div', { class: 'dy-wk-row3' },
        panel('GAME OF THE WEEK', rc.close ? roundTable(rc.close, 'Went the distance: the closest fight of the week on damage.') : h('p', { class: 'caption muted' }, 'No three-round fights this week.')),
        panel('BIGGEST COMEBACK', rc.comeback ? roundTable(rc.comeback, `${team(rc.comeback.result.winner).name} lost round 1 and came back.`) : h('p', { class: 'caption muted' }, 'Nobody came back from a round down.')),
        panel('BLOWOUT OF THE WEEK', rc.blowout ? roundTable(rc.blowout, `A ${rc.blowout.result.score[0] + rc.blowout.result.score[1] === 2 ? '2-0' : ''} sweep.`) : h('p', { class: 'caption muted' }, 'No sweeps this week.'))),
      h('div', { class: 'dy-wk-row3' },
        panel('UPSET OF THE WEEK', rc.upset ? roundTable(rc.upset, `${team(rc.upset.result.winner).name} won with a ${rc.upsetChance}% chance.`) : h('p', { class: 'caption muted' }, 'The favorites held serve.')),
        panel('TOP 25 MATCHUPS', rc.top25.length ? h('div', { class: 'dy-wk-stack' }, rc.top25.slice(0, 2).map((g) => roundTable(g, `${team(g.result.winner).name} win`))) : h('p', { class: 'caption muted' }, 'No top-25 clashes this week.')),
        pic ? panel('PLAYOFF PICTURE', h('p', { class: 'caption muted' }, 'Chance to win the division and make the playoffs'), h('ol', { class: 'dy-wk-pic2' }, pic.map((x, i) => { const t = team(x.i); return h('li', {}, h('span', { class: 'dy-num' }, String(i + 1)), crest(t, 22), h('span', { class: 'dy-list-text' }, t.name.toUpperCase()), h('span', { class: 'caption muted' }, `${t.w}-${t.l}`), h('span', { class: 'dy-num' }, `${Math.round(x.odds * 1000) / 10}%`)); }))) : null),
      rc.latest ? h('div', { class: 'dy-wk-row4' },
        panel('POWER RISERS', rowsTeams(mv.risers, (t) => h('span', { class: 'dy-num' }, `#${t.prevRank} → `, h('b', {}, `#${t.rank}`)))),
        panel('POWER FALLERS', rowsTeams(mv.fallers, (t) => h('span', { class: 'dy-num' }, `#${t.prevRank} → `, h('b', { class: 'loss' }, `#${t.rank}`)))),
        panel('LONGEST ACTIVE STREAKS', h('div', { class: 'dy-wk-two' },
          h('div', {}, h('p', { class: 'label-spaced win' }, 'WINNING'), h('ul', { class: 'dy-wk-list' }, mv.hot.map((i) => h('li', { class: 'dy-wk-row' }, crest(team(i), 22), h('span', { class: 'dy-list-text' }, team(i).name.toUpperCase()), h('b', { class: 'win' }, `W${team(i).streak}`))))),
          h('div', {}, h('p', { class: 'label-spaced loss' }, 'LOSING'), h('ul', { class: 'dy-wk-list' }, mv.cold.map((i) => h('li', { class: 'dy-wk-row' }, crest(team(i), 22), h('span', { class: 'dy-list-text' }, team(i).name.toUpperCase()), h('b', { class: 'loss' }, `L${-team(i).streak}`)))))))) : null,
      rc.latest ? h('div', { class: 'dy-wk-row2' },
        panel('DRAFT STOCK', stock.risers.length || stock.fallers.length ? h('div', {},
          h('p', { class: 'label-spaced win' }, 'RISERS'), h('ul', { class: 'dy-wk-list' }, stock.risers.map((x) => { const p = L.players[x.pid]; return pRow(p, h('span', { class: 'dy-num' }, `${x.from} › `, h('b', { class: 'win' }, x.to)), `${p.role} | ${p.series}`); })),
          h('p', { class: 'label-spaced loss' }, 'FALLERS'), h('ul', { class: 'dy-wk-list' }, stock.fallers.map((x) => { const p = L.players[x.pid]; return pRow(p, h('span', { class: 'dy-num' }, `${x.from} › `, h('b', { class: 'loss' }, x.to)), `${p.role} | ${p.series}`); })))
          : h('p', { class: 'caption muted' }, 'The board settles after a couple of weeks.')),
        panel('NOTABLE INJURIES', rc.injuries.length ? h('ul', { class: 'dy-wk-list' }, rc.injuries.map((pid) => { const p = L.players[pid]; return pRow(p, h('span', { class: 'dy-wk-out' }, h('b', {}, `${p.injury} wk`), h('span', { class: 'caption muted' }, 'OUT')), `${p.role} · ${team(p.team).name}`); })) : h('p', { class: 'caption muted' }, 'Nobody got hurt this week.'))) : null);
    const games = L.schedule[week - 1].length;
    fill(root, weeklyFrame({
      icon: '▦', title: 'WEEKLY RECAP', sub: `SEASON ${L.season} · WEEK ${week}`, body, nav, onClose: then,
      foot: [h('span', { class: 'caption muted' }, `${games} games · Week ${week}`), h('button', { class: 'btn btn-primary', onClick: then }, 'Continue')],
    }));
  }

  function showPreview(then) {
    stopTimers();
    const pv = WK.preview(L);
    if (!pv) { then(); return; }
    const gw = pv.gotw;
    const vsCard = (m) => {
      const a = m.a != null ? L.players[m.a] : null; const hh = m.h != null ? L.players[m.h] : null;
      const side = (p, ti) => h('div', { class: 'dy-wk-vsp' }, p ? pAvatar(p, 'md') : crest(team(ti), 56),
        h('p', { class: 'heading' }, p ? p.name.toUpperCase() : `${team(ti).abbr} UNIT`),
        h('p', { class: 'caption muted' }, p ? `${p.role.toUpperCase()} · ${team(ti).abbr}` : team(ti).name),
        h('p', { class: 'dy-wk-stat' }, p ? String(R.effPower(L, p)) : '–'),
        h('p', { class: 'caption muted' }, p ? `${kfmt(p.stats.dmg)} dmg · ${p.stats.ko} KOs` : ''));
      return h('div', { class: `dy-wk-vs${m.mine ? ' is-mine' : ''}` },
        h('p', { class: 'dy-wk-vs-head' }, h('span', { class: 'gold' }, m.mine ? 'YOUR ACE VS THEIRS' : 'ACE VS ACE'), h('span', { class: 'caption muted' }, `${team(m.away).name.toUpperCase()} AT ${team(m.home).name.toUpperCase()}`)),
        h('div', { class: 'dy-wk-vs-row' }, side(a, m.away), h('span', { class: 'dy-wk-vs-x' }, 'VS'), side(hh, m.home)));
    };
    const line = (x) => h('li', { class: 'dy-wk-row' }, crest(team(x.fav), 26), h('span', { class: 'dy-list-text' }, h('span', { class: 'heading' }, `${rankName(team(x.fav)).toUpperCase()} `, h('span', { class: 'muted' }, 'OVER'), ` ${rankName(team(x.dog)).toUpperCase()}`), h('span', { class: 'caption muted' }, `${x.chance}% to win · ${team(x.away).abbr} at ${team(x.home).abbr}`)), crest(team(x.dog), 22));
    const body = h('div', { class: 'dy-wk-grid' },
      h('div', { class: 'dy-wk-top' },
        gw ? h('section', { class: 'dy-wk-panel dy-wk-gotw', style: `--a:${team(gw.away).c1};--h:${team(gw.home).c1}` },
          h('p', { class: 'dy-gw-tag' }, 'GAME OF THE WEEK'),
          h('div', { class: 'dy-wk-gotw-crests' }, crest(team(gw.away), 120), crest(team(gw.home), 120)),
          h('p', { class: 'dy-gw-brand' }, h('span', {}, 'THE FIGHT NIGHT'), 'DOJO'),
          h('p', { class: 'dy-gw-team' }, `${rankName(team(gw.away)).toUpperCase()} `, h('span', { class: 'caption muted' }, `${team(gw.away).w}-${team(gw.away).l}`)),
          R.isRivalry(gw.home, gw.away, L) ? h('div', { class: 'dy-gw-trophy' }, trophy(R.isRivalry(gw.home, gw.away, L)[2], 80)) : h('p', { class: 'dy-gw-vs' }, 'AT'),
          h('p', { class: 'dy-gw-team' }, `${rankName(team(gw.home)).toUpperCase()} `, h('span', { class: 'caption muted' }, `${team(gw.home).w}-${team(gw.home).l}`)),
          h('p', { class: 'label-spaced' }, 'WIN PROBABILITY'),
          h('div', { class: 'dy-wk-prob' }, h('span', { style: `width:${100 - pv.gotwChance}%;background:${team(gw.away).c1}` }), h('span', { style: `width:${pv.gotwChance}%;background:${team(gw.home).c1}` })),
          h('div', { class: 'dy-wk-prob-n' }, h('b', {}, `${100 - pv.gotwChance}%`), h('b', {}, `${pv.gotwChance}%`)),
          h('p', { class: 'caption' }, `WEEK ${pv.week} · ${team(gw.home).arena.toUpperCase()} · SBN PRIME`)) : null,
        panel('MATCHUPS OF THE WEEK', h('div', { class: 'dy-wk-vsgrid' }, pv.matchups.map(vsCard)))),
      h('div', { class: 'dy-wk-row3' },
        panel('TOP 25 MATCHUPS', pv.top25.length ? h('div', { class: 'dy-wk-stack' }, pv.top25.map((m) => h('div', { class: 'dy-wk-t25' },
          h('p', { class: 'dy-wk-t25-head' }, h('span', { class: 'heading' }, `${rankName(team(m.away)).toUpperCase()} `, h('span', { class: 'muted' }, 'AT'), ` ${rankName(team(m.home)).toUpperCase()}`), h('span', { class: 'caption' }, `${team(m.fav).abbr} ${m.chance}%`)),
          h('table', { class: 'dy-table' }, h('thead', {}, h('tr', {}, ['Playoff chances', 'Now', 'With win', 'With loss'].map((x) => h('th', { scope: 'col' }, x)))),
            h('tbody', {}, m.rows.map((r) => h('tr', {}, h('td', {}, h('span', { class: 'dy-cell-p' }, crest(team(r.i), 22), `${rankName(team(r.i))} (${team(r.i).w}-${team(r.i).l})`)), h('td', { class: 'dy-num' }, `${r.now}%`), h('td', { class: 'dy-num win' }, `${r.win}%`), h('td', { class: 'dy-num loss' }, `${r.loss}%`)))))))) : h('p', { class: 'caption muted' }, 'No top-25 clashes this week.')),
        panel('UPSET ALERT', pv.upsetAlert.length ? h('ul', { class: 'dy-wk-list' }, pv.upsetAlert.map(line)) : h('p', { class: 'caption muted' }, 'No ranked team looks shaky this week.'),
          pv.coinFlips.length ? h('p', { class: 'label-spaced dy-wk-sub2' }, 'COIN FLIPS') : null,
          h('ul', { class: 'dy-wk-list' }, pv.coinFlips.map((x) => h('li', { class: 'dy-wk-row' }, crest(team(x.away), 22), h('span', { class: 'dy-list-text' }, h('span', { class: 'heading' }, `${team(x.away).name.toUpperCase()} `, h('span', { class: 'muted' }, 'at'), ` ${team(x.home).name.toUpperCase()}`)), crest(team(x.home), 22), h('span', { class: 'dy-num' }, `${team(x.fav).abbr} ${x.chance}%`))))),
        panel('GPT WATCH', h('ol', { class: 'dy-wk-list' }, pv.race.map((x, i) => { const p = L.players[x.pid]; return h('li', { class: 'dy-wk-row' }, h('span', { class: 'dy-wk-big' }, String(i + 1)), pAvatar(p, 'md'),
          h('span', { class: 'dy-list-text' }, h('span', { class: 'heading' }, p.name.toUpperCase()), h('span', { class: 'caption muted' }, `${p.role} · ${team(p.team).name}`), h('span', { class: 'caption' }, x.opp != null ? `${x.home ? 'vs' : 'at'} ${rankName(team(x.opp))}` : 'No game')),
          statBoxes([[kfmt(p.stats.dmg), 'DMG'], [p.stats.ko, 'KOS']])); })))),
      h('div', { class: 'dy-wk-row3' },
        panel('RIVALRY GAMES', pv.rivals.length ? h('ul', { class: 'dy-wk-list' }, pv.rivals.map((x) => {
          const st = x.book.streak; const last = x.book.last;
          return h('li', { class: 'dy-wk-rival' }, trophy(x.trophy, 70),
            h('div', { class: 'dy-list-text' },
              h('p', { class: 'heading' }, x.trophy.toUpperCase()),
              h('p', { class: 'dy-wk-rival-line' }, crest(team(x.away), 22), h('b', {}, ` ${x.book.b}-${x.book.a} `), crest(team(x.home), 22), h('span', { class: 'caption muted' }, ` ${team(x.away).name} at ${team(x.home).name}`)),
              h('p', { class: 'caption muted' }, last ? `${st && st.n > 1 ? `${team(st.team).name} have won ${st.n} straight · ` : ''}last meeting: ${team(last.winner).name} ${last.score[0]}-${last.score[1]} (season ${last.season})` : 'First meeting')),
            h('span', { class: 'dy-num' }, `${team(x.fav).abbr} ${x.chance}%`));
        })) : h('p', { class: 'caption muted' }, 'No rivalry games this week.')),
        panel('FACING THEIR OLD TEAM', pv.oldTeam.length ? h('ul', { class: 'dy-wk-list' }, pv.oldTeam.map((x) => { const p = L.players[x.pid]; return pRow(p, statBoxes([[kfmt(p.stats.dmg), 'DMG'], [p.stats.ko, 'KOS']]), `${p.role} · ${team(x.team).abbr} · ${x.home ? 'vs' : 'at'} ${team(x.opp).name.toUpperCase()}, their old team`); })) : h('p', { class: 'caption muted' }, 'No reunions this week.')),
        panel('INJURY REPORT', pv.injuries.length ? h('ul', { class: 'dy-wk-list' }, pv.injuries.map((pid) => { const p = L.players[pid]; return pRow(p, h('span', { class: 'dy-wk-out' }, h('b', {}, `${p.injury} wk`), h('span', { class: 'caption muted' }, 'REMAINING')), `${p.role} · ${team(p.team).name}`); })) : h('p', { class: 'caption muted' }, 'Everyone is healthy.'))));
    fill(root, weeklyFrame({
      icon: '⚑', title: 'WEEKLY PREVIEW', sub: `SEASON ${L.season} · WEEK ${pv.week} · THE WEEK AHEAD`, body, onClose: then,
      foot: [h('span', { class: 'caption muted' }, `${L.schedule[pv.week - 1].length} games · Week ${pv.week}`),
        h('button', { class: 'btn btn-secondary', onClick: () => openGamePlan() }, 'Game Plan'),
        h('button', { class: 'btn btn-primary', onClick: then }, 'Continue')],
    }));
  }

  // On load: recap of last week, then the preview, then the hub.
  function enterDynasty() {
    DP.ensure(L); phone.show(true); phone.refresh();
    const toHub = () => { tab = 'league'; drawHub(); };
    const seen = L.weeklySeen && L.weeklySeen.season === L.season && L.weeklySeen.week === L.week;
    if (L.phase !== 'season' || seen) { toHub(); return; }
    if (L.week > 1) showRecap(L.week - 1, () => showPreview(toHub));
    else showPreview(toHub);
  }

  // ---------- Coach ----------
  // ---------- Roster ----------
  function drawRoster() {
    const t = me();
    const ps = players(t).sort((a, b) => b.power - a.power);
    const pay = R.payroll(L, t);
    shell(h('div', { class: 'dy-content' },
      h('div', { class: 'dy-cap dy-panel' },
        h('div', {}, h('p', { class: 'label-spaced' }, 'PAYROLL'), h('p', { class: 'stat' }, String(pay))),
        h('div', {}, h('p', { class: 'label-spaced' }, 'SALARY CAP'), h('p', { class: 'stat' }, String(R.capOf()))),
        h('div', {}, h('p', { class: 'label-spaced' }, pay > R.capOf() ? 'OVER BY' : 'CAP SPACE'), h('p', { class: `stat ${pay > R.capOf() ? 'loss' : 'win'}` }, String(Math.abs(Math.round((R.capOf() - pay) * 10) / 10))))),
      skillPanel(t),
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
            usable(p) ? h('span', { class: 'dy-sp-badge' }, `+${usable(p)} SP`) : locked(p) ? h('span', { class: 'dy-sp-badge is-locked', title: 'At max: needs an upgrade' }, `🔒 ${locked(p)} SP`) : null,
            fatigueBar(p),
            p.injury > 0 ? h('span', { class: 'dy-inj' }, `OUT ${p.injury} WK`) : null)));
      }))));
  }

  function fatigueBar(p) {
    const color = p.fatigue > 70 ? 'var(--loss)' : p.fatigue > 30 ? 'var(--brand-gold)' : 'var(--win)';
    return h('span', { class: 'dy-fat', title: `Fatigue ${Math.round(p.fatigue)}`, 'aria-label': `Fatigue ${Math.round(p.fatigue)} of 100` },
      h('span', { style: `width:${Math.round(p.fatigue)}%;background:${color}` }));
  }

  // ---------- Skill points (v0.21.0) ----------
  const usable = (p) => R.usablePoints(p);
  const locked = (p) => Math.max(0, (p.sp || 0) - usable(p));
  function skillPanel(t = me()) {
    const pts = R.teamPoints(L, t);
    const auto = !!L.user.autoSpend;
    const withPts = players(t).filter((p) => (p.sp || 0) > 0).sort((a, b) => usable(b) - usable(a));
    return h('section', { class: 'dy-panel dy-skill' },
      h('div', { class: 'dy-panel-head' }, h('h2', { class: 'dy-h' }, 'SKILL POINTS'),
        h('label', { class: 'dy-auto' }, h('input', { type: 'checkbox', checked: auto, onChange: async (e) => {
          L.user.autoSpend = e.target.checked;
          if (L.user.autoSpend) { const n = R.spendAll(L, t); if (n) toast(`Auto spent ${n} point${n > 1 ? 's' : ''} on Power.`); }
          await save(); drawHub();
        } }), h('span', {}, 'Auto upgrade'))),
      h('p', { class: 'caption muted' }, auto ? 'Auto is on: points go into Power as soon as there\'s room under each card\'s max, like the AI teams.' : 'Growth every 3 weeks gives each card skill points: 1 point = +1 Power, up to that card\'s max. Points past the max wait, unspent, until a Star or Superstar upgrade raises it (Star: up to +10, Superstar: +5 or +10, never past 99).'),
      !auto && withPts.length ? h('ul', { class: 'dy-list' }, withPts.map((p) => h('li', {}, pAvatar(p), h('span', { class: 'dy-list-text' }, h('span', {}, p.name), h('span', { class: 'caption muted' }, `Power ${p.power} · max ${R.maxOf(p)} · ${p.sp} point${p.sp === 1 ? '' : 's'}${locked(p) ? ` (${locked(p)} waiting for an upgrade)` : ''}`)),
        usable(p) ? h('span', { class: 'btn-row' },
          h('button', { class: 'btn btn-secondary btn-sm', onClick: async () => { R.spendPoints(p, 1); sfx.play('tap'); await save(); drawHub(); } }, '+1'),
          h('button', { class: 'btn btn-primary btn-sm', onClick: async () => { const n = R.spendPoints(p); sfx.play('correct'); await save(); toast(`${p.name}: +${n} Power.`); drawHub(); } }, `Spend ${usable(p)}`))
          : h('span', { class: 'caption muted dy-why' }, R.maxOf(p) >= 99 ? '🔒 At 99' : `🔒 At max · ${p.dev < 2 && p.career <= 4 ? 'upgrade to raise it' : 'can\'t be upgraded'}`))))
        : !auto ? h('p', { class: 'caption muted' }, 'No skill points right now.') : null,
      !auto && pts ? h('button', { class: 'btn btn-secondary btn-wide', onClick: async () => { const n = R.spendAll(L, t); await save(); toast(`+${n} Power across the roster.`); drawHub(); } }, `Spend all ${pts}`) : null);
  }

  function playerSheet(p) {
    const own = p.team === L.user.team;
    const potLow = Math.min(99, Math.max(p.power, p.potential - 3)); const potHigh = Math.min(99, p.potential + 2);
    sheet({
      title: p.name.toUpperCase(),
      content: h('div', { class: 'dy-psheet' },
        h('div', { class: 'dy-psheet-top' }, pAvatar(p, 'card'),
          h('dl', { class: 'dy-bio' }, [
            ['Team', p.team != null ? team(p.team).name : 'Free agent'], ['Role', `${p.role}${p.second ? ` / ${p.second}` : ''}`], ['Series', p.series],
            ['Power', `${R.effPower(L, p)} (base ${p.power})`], own ? ['Max', `${R.maxOf(p)}${R.maxOf(p) >= 99 ? ' (the cap)' : ' · a Star or Superstar upgrade can raise it'}`] : null,
            own && p.sp ? ['Skill points', `${p.sp}${locked(p) ? ` (${locked(p)} waiting for an upgrade to raise the max)` : ''}`] : null,
            ['Dev trait', DEV_LABEL[p.dev]], ['Career', `Season ${p.career}`],
            p.revealed && (p.gen || p.bust) ? ['Scouting', p.gen ? 'Generational Talent' : 'Bust'] : p.draftPick && p.scout >= 2 ? ['Draft scouting', `${O.TAG_ICON[O.scoutTag(p)]} ${O.scoutTag(p)}`] : null,
            p.draftPick ? ['Drafted', `No. ${p.draftPick}, season ${p.draftSeason}`] : null,
            ['Hype', String(Math.round(p.hype))], ['Aura', String(p.aura)], ['Clutch', String(p.clutch)],
            ['Fatigue', `${Math.round(p.fatigue)}${p.injury ? ` · injured ${p.injury} wk` : ''}`],
            ['Contract', p.contract ? `${p.contract.total} over ${p.contract.years} (cap hit ${R.capHit(p)}, ${p.contract.left} left)${p.tagged === L.season ? ' · franchise tag' : ''}` : `None · asks about ${O.asking(p)} a season`],
            p.lowKey ? ['Personality', 'Low-key: doesn\'t chase the spotlight'] : null,
          ].filter(Boolean).map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v))))),
        h('p', { class: 'caption muted' }, `This season: ${p.stats.gp} games · ${fmt(p.stats.dmg)} damage · ${p.stats.ko} KOs · ${p.stats.sp} specials. Special move: ${SPECIALS[p.role].name}.`)),
    });
  }

  // ---------- Shared bits for the Front Office, Draft and off-season ----------
  const stars = (n) => h('span', { class: 'dy-stars', 'aria-label': `${n} of 5 stars` }, '★'.repeat(n), h('span', { class: 'dy-stars-off' }, '★'.repeat(5 - n)));
  const hue = (str) => { let x = 0; for (const c of String(str)) x = (x * 31 + c.charCodeAt(0)) % 360; return x; };

  function capPanel(t = me()) {
    const pay = R.payroll(L, t); const cap = R.capOf(t); const over = pay > cap;
    return h('div', { class: 'dy-cap dy-panel' },
      h('div', {}, h('p', { class: 'label-spaced' }, 'PAYROLL'), h('p', { class: 'stat' }, String(pay))),
      h('div', {}, h('p', { class: 'label-spaced' }, 'SALARY CAP'), h('p', { class: 'stat' }, String(cap))),
      h('div', {}, h('p', { class: 'label-spaced' }, over ? 'OVER BY' : 'CAP SPACE'), h('p', { class: `stat ${over ? 'loss' : 'win'}` }, String(Math.abs(Math.round((cap - pay) * 10) / 10)))),
      h('div', {}, h('p', { class: 'label-spaced' }, 'SUPERMAX DEALS'), h('p', { class: 'stat' }, `${R.supermaxCount(L, t)}/${R.SUPERMAX_LIMIT}`)),
      t.dead ? h('div', {}, h('p', { class: 'label-spaced' }, 'DEAD MONEY'), h('p', { class: 'stat loss' }, String(t.dead))) : null);
  }

  function pLine(p, right, sub) {
    return h('li', {}, h('button', { class: 'dy-pline', onClick: () => playerSheet(p) }, pAvatar(p),
      h('span', { class: 'dy-list-text' }, h('span', {}, p.name),
        h('span', { class: 'caption muted' }, sub || `${p.role} · ${p.series} · ${DEV_LABEL[p.dev]} · season ${p.career}`))),
    right);
  }

  function offSteps() {
    const steps = (L.off?.step === 'fired' ? ['fired'] : []).concat(L.off?.steps || O.OFF_STEPS);
    const at = steps.indexOf(L.off?.step);
    return h('ol', { class: 'dy-steps', 'aria-label': 'Off-season steps' }, steps.map((k, i) => h('li', {
      class: i < at ? 'is-done' : i === at ? 'is-on' : '', 'aria-current': i === at ? 'step' : null,
    }, O.OFF_LABEL[k])));
  }

  // ---------- The Front Office tab ----------
  const trade = { ti: null, give: [], get: [] };

  function drawOffice() {
    const t = me();
    const ps = players(t).sort((a, b) => R.capHit(b) - R.capHit(a));
    const parts = [capPanel(t),
      h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h' }, 'CONTRACTS'),
        h('p', { class: 'caption muted' }, `A contract is a total over seasons, split evenly into the cap hit. The salary cap is hard: you can't sign, re-sign, trade or upgrade past it (rookie deals and minimum fills are the exception). It grows 5% every off-season. Max deal: ${R.maxDeal()} a season; deals at ${Math.round(R.maxDeal() * R.SUPERMAX_SHARE * 10) / 10}+ are supermax, ${R.SUPERMAX_LIMIT} per team.`),
        h('ul', { class: 'dy-list' }, ps.map((p) => pLine(p, h('span', { class: 'dy-num' }, String(R.capHit(p))),
          `${p.role} · ${p.contract.total} over ${p.contract.years} · ${p.contract.left} left${p.tagged === L.season ? ' · TAG' : ''}`))))];
    if (L.phase === 'offseason') {
      parts.unshift(h('section', { class: 'dy-panel' }, h('p', { class: 'label-spaced gold' }, 'THE OFF-SEASON'), offSteps(),
        h('button', { class: 'btn btn-primary btn-wide', onClick: drawOff }, `Continue: ${O.OFF_LABEL[L.off.step]}`)));
      if (O.tradeOpen(L)) parts.push(tradePanel());
      else parts.push(h('p', { class: 'caption muted' }, O.tradeClosedWhy(L)));
    } else if (L.phase === 'season') {
      parts.push(tradePanel(), pickupPanel());
    } else {
      parts.push(h('p', { class: 'caption muted' }, O.tradeClosedWhy(L)));
    }
    shell(h('div', { class: 'dy-content dy-office' }, parts));
  }

  function tradePanel() {
    if (!O.tradeOpen(L)) return h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h' }, 'TRADES'), h('p', { class: 'body-text' }, O.tradeClosedWhy(L)));
    const t = me();
    const others = L.teams.filter((x) => x.i !== t.i).sort((a, b) => a.name.localeCompare(b.name));
    if (trade.ti == null || trade.ti === t.i) trade.ti = R.rival(L, t.i)?.team ?? others[0].i;
    const them = team(trade.ti);
    trade.give = trade.give.filter((pid) => L.players[pid].team === t.i);
    trade.get = trade.get.filter((pid) => L.players[pid].team === them.i);
    const ev = O.evaluateTrade(L, them.i, trade.give, trade.get);
    const pick = (list, pid) => { const i = list.indexOf(pid); if (i >= 0) list.splice(i, 1); else if (list.length < 2) list.push(pid); else toast('Up to 2 cards each way.'); drawOffice(); };
    const col = (tm, list) => h('ul', { class: 'dy-list dy-pickable' }, players(tm).sort((a, b) => b.power - a.power).map((p) => h('li', {},
      h('label', { class: `dy-check${list.includes(p.pid) ? ' is-on' : ''}` },
        h('input', { type: 'checkbox', checked: list.includes(p.pid), onChange: () => pick(list, p.pid) }),
        pAvatar(p),
        h('span', { class: 'dy-list-text' }, h('span', {}, p.name), h('span', { class: 'caption muted' }, `${p.role} · ${p.power} · pot ${tm.i === t.i ? p.potential : '?'} · ${R.capHit(p)}`))))));
    return h('section', { class: 'dy-panel' },
      h('h2', { class: 'dy-h' }, `TRADES · OPEN THROUGH WEEK ${R.TRADE_DEADLINE}`),
      h('p', { class: 'caption muted' }, 'Rebuilds want youth, potential and cap space. Contenders want Power now. Teams a few pieces away pay for the role they are missing.'),
      h('label', { class: 'dy-field' }, h('span', { class: 'label-spaced' }, 'TRADE WITH'),
        h('select', { class: 'dy-select', onChange: (e) => { trade.ti = Number(e.target.value); trade.get = []; drawOffice(); } },
          others.map((x) => h('option', { value: String(x.i), selected: x.i === them.i }, `${x.name} · ${R.STAGE_LABEL[x.stage]} · ${x.w}-${x.l}`)))),
      h('div', { class: 'dy-trade' },
        h('div', {}, h('p', { class: 'label-spaced' }, 'YOU SEND'), col(t, trade.give)),
        h('div', {}, h('p', { class: 'label-spaced' }, `${them.abbr} SEND`), col(them, trade.get))),
      meter(ev.score, 50, ev.why),
      h('button', { class: 'btn btn-primary btn-wide', disabled: !ev.ok, onClick: async () => {
        const ok = await confirmSheet({ title: 'MAKE THE TRADE?', message: `${trade.give.map((pid) => L.players[pid].name).join(' + ')} for ${trade.get.map((pid) => L.players[pid].name).join(' + ')}. Contracts move with the cards.`, confirmLabel: 'Trade' });
        if (!ok) return;
        O.doTrade(L, t.i, them.i, trade.give.slice(), trade.get.slice());
        L.pending = null;
        trade.give = []; trade.get = [];
        await save(); toast('Trade done.'); drawOffice();
      } }, 'Propose trade'));
  }

  function meter(score, bar, text) {
    return h('div', { class: 'dy-meter-wrap' },
      h('div', { class: 'dy-meter', role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(score), 'aria-label': 'Interest' },
        h('span', { class: 'dy-meter-fill', style: `width:${score}%;background:${score >= bar ? 'var(--win)' : score >= bar - 12 ? 'var(--brand-gold)' : 'var(--loss)'}` }),
        h('span', { class: 'dy-meter-bar', style: `left:${bar}%` })),
      h('p', { class: 'caption' }, `${score} interest${text ? ` · ${text}` : ''}`));
  }

  function pickupPanel() {
    const t = me();
    const hurt = players(t).filter((p) => p.injury > 0).length;
    const pool = O.emergencyPool(L).sort((a, b) => b.power - a.power).slice(0, 10);
    return h('section', { class: 'dy-panel' },
      h('h2', { class: 'dy-h' }, 'EMERGENCY PICKUPS'),
      h('p', { class: 'caption muted' }, `Sign a depth card (Power ${O.EMERGENCY_MAX_POWER} and under) at the minimum (${O.MIN_SALARY}) for the rest of the season. You cut someone to make room; their cap hit stays as dead money.${hurt ? ` You have ${hurt} injured.` : ''}`),
      h('ul', { class: 'dy-list' }, pool.map((p) => pLine(p, h('button', { class: 'btn btn-secondary btn-sm', onClick: () => pickupSheet(p) }, 'Sign')))));
  }

  function pickupSheet(p) {
    const t = me();
    const s = sheet({
      title: `SIGN ${p.name.toUpperCase()}`,
      content: h('div', {},
        h('p', { class: 'body-text' }, `${p.role} · Power ${p.power} · ${p.series}. Who do you cut?`),
        h('ul', { class: 'dy-list' }, players(t).sort((a, b) => a.power - b.power).map((q) => pLine(q,
          h('button', { class: 'btn btn-secondary btn-sm', onClick: async () => {
            const r = O.emergencyPickup(L, p.pid, q.pid);
            if (!r.ok) { toast(r.why); return; }
            L.pending = null; s.close(); await save(); toast(`${p.name} signed. ${q.name} cut.`); drawOffice();
          } }, 'Cut'), `${q.role} · ${q.power} · cap hit ${R.capHit(q)}${q.injury ? ` · OUT ${q.injury} WK` : ''}`)))),
    });
  }

  // ---------- The Draft tab and board ----------
  const board = { world: null, role: null, view: 'all' };

  function hexMap() {
    const worlds = O.classWorlds(L);
    if (!worlds.length) return null;
    const per = (window.innerWidth || 1200) / (window.__uiZoom || 1) < 640 ? 4 : 8;
    const rows = [];
    for (let i = 0; i < worlds.length; i += per) rows.push(worlds.slice(i, i + per));
    return h('div', { class: 'dy-hexmap', role: 'group', 'aria-label': 'Where this class comes from' }, rows.map((row, r) => h('div', { class: `dy-hexrow${r % 2 ? ' is-odd' : ''}` }, row.map((w) => h('button', {
      class: `dy-hex${board.world === w.world ? ' is-on' : ''}`, style: `--h:${hue(w.franchise || w.world)}`, 'aria-pressed': board.world === w.world ? 'true' : 'false',
      title: `${w.world}: ${w.n} prospect${w.n > 1 ? 's' : ''}`, onClick: () => { board.world = board.world === w.world ? null : w.world; redrawBoard(); },
    }, h('span', { class: 'dy-hex-name' }, w.world), h('span', { class: 'dy-hex-n' }, String(w.n)))))));
  }
  let redrawBoard = () => {};

  function boardList(mode) {
    const onClock = mode === 'pick' && O.onTheClock(L) === L.user.team;
    let list = O.draftBoard(L);
    if (board.view === 'mine') list = list.filter((p) => p.watch || p.scout > 0);
    if (board.world) list = list.filter((p) => p.series === board.world);
    if (board.role) list = list.filter((p) => p.role === board.role);
    if (!list.length) return h('p', { class: 'body-text dy-board-empty' }, board.view === 'mine' ? 'Your board is empty. Tap ☆ Watch on a prospect to keep track of them, or scout them.' : 'No prospects match.');
    list.sort((a, b) => (b.scout >= 1 ? b.potential : b.stars * 8 + 56) - (a.scout >= 1 ? a.potential : a.stars * 8 + 56) || b.stars - a.stars);
    const pts = L.user.scoutPts || 0;
    return h('ul', { class: 'dy-board' }, list.map((p) => {
      const v = O.prospectView(p);
      const tagCls = v.tag === 'Diamond' ? 'gold' : v.tag === 'Broken diamond' ? 'loss' : 'muted';
      return h('li', { class: 'dy-prospect' },
        pAvatar(p, 'md'),
        h('span', { class: 'dy-list-text' },
          h('span', { class: 'dy-rname' }, p.name),
          h('span', { class: `caption ${ROLE_CLASS(p.role)}` }, `${p.role} · ${p.series}`),
          h('span', { class: 'dy-prospect-meta' }, stars(v.stars),
            h('span', { class: 'caption' }, v.potential != null ? `Potential ${v.potential}` : 'Potential ?'),
            v.tag ? h('span', { class: `caption ${tagCls}` }, `${O.TAG_ICON[v.tag]} ${v.tag}`) : null)),
        h('span', { class: 'dy-prospect-btns' },
          h('button', { class: `btn btn-sm dy-watch-btn${p.watch ? ' is-on' : ''}`, 'aria-pressed': p.watch ? 'true' : 'false', onClick: async () => { p.watch = !p.watch; await save(); redrawBoard(); } }, p.watch ? '★ Watching' : '☆ Watch'),
          p.scout < 2 ? h('button', { class: 'btn btn-secondary btn-sm', disabled: pts < R.SCOUT_COST, onClick: async () => {
            const r = O.scout(L, p.pid); if (!r.ok) { toast(r.why); return; }
            await save(); redrawBoard();
          } }, p.scout === 0 ? `Scout · ${R.SCOUT_COST}` : `Deep scout · ${R.SCOUT_COST}`) : null,
          onClock ? h('button', { class: 'btn btn-primary btn-sm', onClick: () => draftPlayer(p) }, 'Draft') : null));
    }));
  }

  function boardFilters() {
    const mine = O.draftBoard(L).filter((p) => p.watch || p.scout > 0).length;
    return h('div', { class: 'dy-board-tools' },
      h('div', { class: 'dy-subtabs', role: 'tablist', 'aria-label': 'Draft board view' },
        [['all', `ALL PROSPECTS (${O.draftBoard(L).length})`], ['mine', `MY BOARD (${mine})`]].map(([id, label]) => h('button', { class: `dy-subtab${board.view === id ? ' is-on' : ''}`, role: 'tab', 'aria-selected': board.view === id ? 'true' : 'false', onClick: () => { board.view = id; redrawBoard(); } }, label))),
      roleChips());
  }
  function roleChips() {
    return h('div', { class: 'dy-chips', role: 'group', 'aria-label': 'Filter by role' },
      [null, ...R.ROLES].map((r) => h('button', { class: `dy-chip${board.role === r ? ' is-on' : ''}`, 'aria-pressed': board.role === r ? 'true' : 'false', onClick: () => { board.role = r; redrawBoard(); } }, r || 'All roles')));
  }

  // ---------- The Draft Room: filters | region map | prospects (v0.15.0) ----------
  const room = { region: null, q: '', role: '', stars: 0, scouted: 'any', watch: false, tab: 'all' };
  const ROLE_SHORT = { Striker: 'STR', Tank: 'TNK', Speedster: 'SPD', Mystic: 'MYS', Tactician: 'TAC' };

  function filtered(base = O.draftBoard(L)) {
    let list = base;
    if (room.q) { const q = room.q.toLowerCase(); list = list.filter((p) => p.name.toLowerCase().includes(q) || p.series.toLowerCase().includes(q)); }
    if (room.role) list = list.filter((p) => p.role === room.role);
    if (room.stars) list = list.filter((p) => p.stars >= room.stars);
    if (room.scouted === 'yes') list = list.filter((p) => p.scout > 0); else if (room.scouted === 'no') list = list.filter((p) => !p.scout);
    if (room.watch) list = list.filter((p) => p.watch);
    return list;
  }
  const byBoard = (a, b) => (a.stock || 99) - (b.stock || 99) || b.stars - a.stars;

  function prospectSheet(p, mode) {
    const v = O.prospectView(p);
    const onClock = mode === 'pick' && O.onTheClock(L) === L.user.team;
    const pts = L.user.scoutPts || 0;
    const rg = MAP.region(MAP.regionOf(p.series));
    const s = sheet({
      title: p.name.toUpperCase(),
      content: h('div', { class: 'dy-psheet' },
        h('div', { class: 'dy-psheet-top' }, pAvatar(p, 'lg'),
          h('dl', { class: 'dy-bio' }, [
            ['Role', `${p.role}${p.second ? ` / ${p.second}` : ''}`], ['World', p.series], ['Region', rg.name],
            ['Board', p.stock ? `#${p.stock}${p.stockPrev && p.stockPrev !== p.stock ? ` (was #${p.stockPrev})` : ''}` : '–'],
            ['Stars', '★'.repeat(v.stars) + '☆'.repeat(5 - v.stars)],
            ['Power now', 'Hidden until drafted'],
            ['Potential', v.potential != null ? String(v.potential) : 'Scout to find out'],
            ['Scouting report', v.tag ? `${O.TAG_ICON[v.tag]} ${v.tag}: ${O.TAG_HELP[v.tag]}` : (p.scout ? 'Deep scout to find out' : 'Not scouted')],
          ].map(([k, val]) => h('div', {}, h('dt', {}, k), h('dd', {}, val))))),
        h('p', { class: 'caption muted' }, `Scouting points: ${pts}. A report costs ${R.SCOUT_COST}.`),
        h('div', { class: 'btn-row' },
          h('button', { class: `btn btn-secondary dy-watch-btn${p.watch ? ' is-on' : ''}`, onClick: async () => { p.watch = !p.watch; await save(); s.close(); redrawBoard(); } }, p.watch ? '★ Watching' : '☆ Watch'),
          p.scout < 2 ? h('button', { class: 'btn btn-secondary', disabled: pts < R.SCOUT_COST, onClick: async () => {
            const r = O.scout(L, p.pid); if (!r.ok) { toast(r.why); return; }
            await save(); s.close(); redrawBoard(); prospectSheet(p, mode);
          } }, p.scout === 0 ? `Scout · ${R.SCOUT_COST}` : `Deep scout · ${R.SCOUT_COST}`) : null,
          onClock ? h('button', { class: 'btn btn-primary', onClick: () => { s.close(); draftPlayer(p); } }, 'Draft') : null)),
    });
  }

  function regionStats(list, id) {
    const ps = id ? list.filter((p) => MAP.regionOf(p.series) === id) : list;
    const score = {};
    R.ROLES.forEach((r) => { score[r] = 0; });
    ps.forEach((p) => { score[p.role] += p.stars; });
    const ranked = R.ROLES.slice().sort((a, b) => score[b] - score[a]);
    const strengths = ranked.filter((r) => score[r] > 0).slice(0, 3);
    return { ps, strengths, weaknesses: ranked.slice().reverse().filter((r) => !strengths.includes(r)).slice(0, 3), top: ps.slice().sort(byBoard).slice(0, 5) };
  }

  function mapPanel(list, mode, rerender) {
    const counts = {}; MAP.REGIONS.forEach((r) => { counts[r.id] = 0; });
    list.forEach((p) => { counts[MAP.regionOf(p.series)] += 1 + (p.stars - 1) * 0.35; });
    const max = Math.max(1, ...Object.values(counts));
    const sel = room.region;
    const shade = (id) => {
      if (sel === id) return '#EBD94E';
      const k = counts[id] / max;
      const base = sel ? 0.45 : 1;
      return `rgba(${Math.round(70 + 120 * k)}, ${Math.round(58 + 100 * k)}, ${Math.round(28 + 40 * k)}, ${base})`;
    };
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', MAP.MAP_VIEW); svg.setAttribute('class', 'dy-map-svg'); svg.setAttribute('role', 'group'); svg.setAttribute('aria-label', 'Scouting regions');
    for (const r of MAP.REGIONS) {
      const path = document.createElementNS(svgNS, 'path');
      path.setAttribute('d', r.d); path.setAttribute('fill', shade(r.id));
      path.setAttribute('class', `dy-map-region${sel === r.id ? ' is-on' : ''}`);
      path.setAttribute('tabindex', '0'); path.setAttribute('role', 'button'); path.setAttribute('aria-label', `${r.name}: ${list.filter((p) => MAP.regionOf(p.series) === r.id).length} prospects`);
      const pick = () => { room.region = room.region === r.id ? null : r.id; redrawBoard(); };
      path.addEventListener('click', pick); path.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      svg.append(path);
    }
    for (const r of MAP.REGIONS) {
      const t = document.createElementNS(svgNS, 'text');
      t.setAttribute('x', r.label[0]); t.setAttribute('y', r.label[1]); t.setAttribute('class', `dy-map-label${sel === r.id ? ' is-on' : ''}`);
      t.textContent = r.name.replace(/^THE /, '');
      svg.append(t);
    }
    const st = regionStats(list, sel);
    const rg = sel ? MAP.region(sel) : null;
    const callout = h('div', { class: 'dy-map-callout' },
      h('p', { class: 'dy-map-callout-title' }, rg ? rg.name : 'THE WHOLE AFL CLASS'),
      h('p', { class: 'caption muted' }, rg ? `${rg.area} · ${st.ps.length} prospect${st.ps.length === 1 ? '' : 's'}${rg.series.length ? ` · ${rg.series.join(', ')}` : ' · one-off worlds'}` : `${list.length} prospects across ${MAP.REGIONS.length} regions`),
      h('p', { class: 'dy-map-sub' }, 'STRENGTHS'), h('ul', {}, st.strengths.map((r) => h('li', { class: ROLE_CLASS(r) }, r))),
      h('p', { class: 'dy-map-sub' }, 'WEAKNESSES'), h('ul', {}, st.weaknesses.map((r) => h('li', {}, r))),
      h('p', { class: 'dy-map-sub' }, 'TOP PROSPECTS', h('span', { class: 'caption muted' }, 'Board')),
      h('ul', { class: 'dy-map-top' }, st.top.map((p) => h('li', {}, h('button', { class: 'dy-map-tp', onClick: () => prospectSheet(p, mode) }, h('span', { class: `dy-num ${ROLE_CLASS(p.role)}` }, ROLE_SHORT[p.role]), h('span', {}, p.name), h('span', { class: 'dy-num' }, p.stock ? `#${p.stock}` : '–'))))));
    return h('div', { class: 'dy-map' },
      h('div', { class: 'dy-map-tabs', role: 'tablist', 'aria-label': 'Regions' },
        [[null, 'NATIONAL'], ...MAP.REGIONS.map((r) => [r.id, r.area.toUpperCase()])].map(([id, label]) => h('button', { class: `dy-map-tab${room.region === id ? ' is-on' : ''}`, role: 'tab', 'aria-selected': room.region === id ? 'true' : 'false', onClick: () => { room.region = id; redrawBoard(); } }, label))),
      h('div', { class: 'dy-map-stage' }, svg, callout),
      h('div', { class: 'dy-map-legend' }, h('span', { class: 'caption muted' }, 'few'), h('span', { class: 'dy-map-ramp' }), h('span', { class: 'caption muted' }, 'many, and good · tap a region to scout it')));
  }

  function prospectList(list, mode) {
    const mineCount = O.draftBoard(L).filter((p) => p.watch || p.scout > 0).length;
    let show = room.tab === 'mine' ? list.filter((p) => p.watch || p.scout > 0) : list;
    if (room.region) show = show.filter((p) => MAP.regionOf(p.series) === room.region);
    show = show.slice().sort(byBoard);
    return h('div', { class: 'dy-room-list' },
      h('div', { class: 'dy-subtabs', role: 'tablist' }, [['all', 'PROSPECTS'], ['mine', `MY BOARD (${mineCount})`]].map(([id, label]) => h('button', { class: `dy-subtab${room.tab === id ? ' is-on' : ''}`, role: 'tab', 'aria-selected': room.tab === id ? 'true' : 'false', onClick: () => { room.tab = id; redrawBoard(); } }, label))),
      h('p', { class: 'caption muted dy-pad' }, room.region ? `${MAP.region(room.region).name} · ${show.length}` : `THE WHOLE CLASS · ${show.length} PROSPECTS`),
      show.length ? h('ol', { class: 'dy-room-rows' }, show.map((p, i) => {
        const v = O.prospectView(p);
        const pts = L.user.scoutPts || 0;
        const quick = h('span', { class: 'dy-room-quick' },
          h('button', { class: `dy-qbtn${p.watch ? ' is-on' : ''}`, 'aria-label': p.watch ? `Stop watching ${p.name}` : `Watch ${p.name}`, title: p.watch ? 'Watching' : 'Watch', onClick: async () => { p.watch = !p.watch; await save(); redrawBoard(); } }, p.watch ? '★' : '☆'),
          p.scout < 2 ? h('button', { class: 'dy-qbtn dy-qscout', disabled: pts < R.SCOUT_COST, 'aria-label': `${p.scout ? 'Deep scout' : 'Scout'} ${p.name} for ${R.SCOUT_COST} points`, title: `${p.scout ? 'Deep scout' : 'Scout'} · ${R.SCOUT_COST} pts`, onClick: async () => {
            const r = O.scout(L, p.pid); if (!r.ok) { toast(r.why); return; }
            sfx.play('correct'); await save(); redrawBoard();
            const v2 = O.prospectView(p);
            toast(r.level === 2 ? `${p.name}: ${O.TAG_ICON[v2.tag]} ${v2.tag}. ${O.TAG_HELP[v2.tag]}.` : `${p.name}: potential ${v2.potential}.`);
          } }, p.scout ? 'DEEP' : 'SCOUT') : h('span', { class: 'dy-qdone', title: 'Fully scouted' }, '✓'));
        return h('li', { class: 'dy-room-li' }, quick, h('button', { class: `dy-room-row${p.watch ? ' is-watch' : ''}`, onClick: () => prospectSheet(p, mode) },
          h('span', { class: 'dy-room-rank' }, String(p.stock || i + 1)),
          pAvatar(p, 'md'),
          h('span', { class: 'dy-list-text' },
            h('span', { class: 'heading' }, p.name, p.watch ? h('span', { class: 'gold' }, ' ★') : null),
            h('span', { class: 'caption' }, stars(v.stars), h('span', { class: ROLE_CLASS(p.role) }, ` ${ROLE_SHORT[p.role]}`), h('span', { class: 'muted' }, ` · ${p.series}`)),
            v.potential != null || v.tag ? h('span', { class: `caption ${v.tag === 'Diamond' ? 'gold' : v.tag === 'Broken diamond' ? 'loss' : 'muted'}` }, [v.potential != null ? `Potential ${v.potential}` : null, v.tag ? `${O.TAG_ICON[v.tag]} ${v.tag}` : null].filter(Boolean).join(' · ')) : null)));
      })) : h('p', { class: 'caption muted dy-pad' }, room.tab === 'mine' ? 'Nobody on your board. Tap a prospect and Watch or Scout them.' : 'No prospects match these filters.'));
  }

  function newsFeed() {
    const out = [];
    const st = WK.draftStock(L);
    st.risers.slice(0, 3).forEach((x) => { const p = L.players[x.pid]; if (p) out.push({ p, tag: 'RISING', cls: 'win', text: `${p.name} climbs from ${x.from} to ${x.to} on the board.` }); });
    st.fallers.slice(0, 2).forEach((x) => { const p = L.players[x.pid]; if (p) out.push({ p, tag: 'FALLING', cls: 'loss', text: `${p.name} slides from ${x.from} to ${x.to}.` }); });
    O.draftBoard(L).filter((p) => p.scout >= 2).forEach((p) => out.push({ p, tag: 'SCOUT REPORT', cls: p.gen ? 'gold' : p.bust ? 'loss' : 'muted', text: p.gen ? `${p.name} is a GENERATIONAL TALENT.` : p.bust ? `${p.name} carries bust risk.` : `${p.name} looks solid. Potential ${p.potential}.` }));
    return out.slice(0, 8);
  }

  function draftRoomView(mode = 'scout') {
    const all = O.draftBoard(L);
    if (!all.length) return h('p', { class: 'body-text dy-pad' }, 'No draft class yet. It arrives with the new season.');
    const feat = all.slice().sort(byBoard)[0];
    const mapBox = h('div', { class: 'dy-room-map' });
    const listBox = h('div', { class: 'dy-room-right dy-panel dy-panel-flush' });
    const rerender = () => { const list = filtered(all); fill(mapBox, mapPanel(list, mode, rerender)); fill(listBox, prospectList(list, mode)); };
    const sel = (label, key, opts) => h('label', { class: 'dy-field' }, h('span', { class: 'label-spaced' }, label),
      h('select', { class: 'dy-select', onChange: (e) => { room[key] = e.target.value; if (key === 'region' && !room.region) room.region = null; rerender(); } }, opts.map(([v, t]) => h('option', { value: v, selected: String(room[key]) === String(v) }, t))));
    const search = h('input', { class: 'input', type: 'search', placeholder: 'A prospect or a world…', value: room.q, 'aria-label': 'Search prospects' });
    search.addEventListener('input', () => { room.q = search.value; rerender(); });
    const fv = O.prospectView(feat);
    const left = h('aside', { class: 'dy-room-left' },
      h('button', { class: 'dy-room-feat', style: `--c1:${R.ROLES.indexOf(feat.role) % 2 ? '#3657B2' : '#8300C7'}`, onClick: () => prospectSheet(feat, mode) },
        h('span', { class: 'dy-room-feat-pic' }, pAvatar(feat, 'card')),
        h('span', { class: 'dy-room-feat-text' },
          h('span', { class: 'label-spaced' }, 'TOP OF THE BOARD'),
          h('span', { class: 'dy-room-feat-name' }, feat.name),
          h('span', { class: 'caption' }, feat.series),
          h('span', { class: 'caption' }, `${fv.stars}-star ${feat.role}`), stars(fv.stars))),
      h('section', { class: 'dy-panel dy-room-scout' }, h('p', { class: 'label-spaced' }, 'SCOUTING POINTS'), h('p', { class: 'stat' }, String(L.user.scoutPts || 0)), h('p', { class: 'caption muted' }, `+${R.SCOUT_WEEKLY} a week · a report costs ${R.SCOUT_COST}. The first shows potential; a deep scout shows 💎 gem, nothing, or 💔 bust.`)),
      h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h' }, 'DRAFT NEWS'),
        (() => { const n = newsFeed(); return n.length ? h('ul', { class: 'dy-room-news' }, n.map((x) => h('li', {}, h('button', { class: 'dy-room-news-row', onClick: () => prospectSheet(x.p, mode) }, pAvatar(x.p), h('span', { class: 'dy-list-text' }, h('span', { class: `label-spaced ${x.cls}` }, x.tag), h('span', { class: 'caption' }, x.text)))))) : h('p', { class: 'caption muted' }, 'Board movement and your scouting reports show up here.'); })()),
      h('section', { class: 'dy-panel dy-room-filters' }, h('h2', { class: 'dy-h' }, 'FILTERS'),
        h('label', { class: 'dy-field' }, h('span', { class: 'label-spaced' }, 'SEARCH'), search),
        sel('ROLE', 'role', [['', 'Any role'], ...R.ROLES.map((r) => [r, r])]),
        h('div', { class: 'dy-field' }, h('span', { class: 'label-spaced' }, 'RATING'), h('div', { class: 'dy-chips' }, [[0, 'Any'], [3, '3★+'], [4, '4★+'], [5, '5★']].map(([v, t]) => h('button', { class: `dy-chip${room.stars === v ? ' is-on' : ''}`, 'aria-pressed': room.stars === v ? 'true' : 'false', onClick: () => { room.stars = v; redrawBoard(); } }, t)))),
        sel('REGION', 'region', [['', 'Every region'], ...MAP.REGIONS.map((r) => [r.id, r.name])]),
        sel('SCOUTING', 'scouted', [['any', 'Any'], ['yes', 'Scouted'], ['no', 'Not scouted yet']]),
        h('label', { class: 'dy-wk-skip' }, h('input', { type: 'checkbox', checked: room.watch, onChange: (e) => { room.watch = e.target.checked; rerender(); } }), ' Watching only'),
        h('button', { class: 'btn btn-secondary btn-sm', onClick: () => { Object.assign(room, { region: null, q: '', role: '', stars: 0, scouted: 'any', watch: false }); redrawBoard(); } }, 'Clear filters')));
    rerender();
    return h('div', { class: 'dy-room' }, left, h('div', { class: 'dy-room-center dy-panel dy-panel-flush' }, mapBox), listBox);
  }

  function drawDraftTab() {
    if (L.phase === 'offseason' && L.off.step === 'draft') { drawOff(); return; }
    redrawBoard = drawDraftTab;
    const n = O.draftBoard(L).length;
    shell(h('div', { class: 'dy-content' },
      h('section', { class: 'dy-panel' },
        h('div', { class: 'dy-scout-head' },
          h('div', {}, h('h2', { class: 'dy-h' }, `SEASON ${L.season} DRAFT CLASS`),
            h('p', { class: 'caption muted' }, `${n} prospects · one round in the off-season. The board shows stars, role and world. Scouting tells you the rest.`)),
          h('div', { class: 'dy-scout-pts' }, h('p', { class: 'label-spaced' }, 'SCOUTING POINTS'), h('p', { class: 'stat' }, String(L.user.scoutPts || 0)), h('p', { class: 'caption muted' }, `+${R.SCOUT_WEEKLY} a week`))),
        h('p', { class: 'caption muted' }, 'Newcomers wear the headshots of cards who retire this year, under new names from any culture. Any of them could be a Generational Talent.')),
      draftRoomView('scout')));
  }

  async function draftPlayer(p) {
    const ok = await confirmSheet({ title: `DRAFT ${p.name.toUpperCase()}?`, message: `${p.role} from ${p.series}. Rookie deal: 3 seasons.`, confirmLabel: 'Draft' });
    if (!ok) return;
    if (!O.makePick(L, L.user.team, p.pid)) { toast(`You already have ${R.MAX_PER_SERIES} from ${p.series}.`); return; }
    sfx.play('pick');
    L.news.unshift({ week: 0, off: true, kind: 'DRAFT', team: L.user.team, title: `${me().name} draft ${p.name}`, text: `Pick No. ${p.draftPick}: a ${p.role} from ${p.series}.` });
    O.simDraft(L, true);
    await save(); drawOff();
  }

  // ---------- The off-season ----------
  async function beginOffseason() {
    O.startOffseason(L);
    await save();
    drawOff();
  }

  function offFrame(title, body, next) {
    stopTimers();
    fill(root, header(`OFF-SEASON · ${title}`, () => { save(); tab = 'league'; drawHub(); }),
      h('div', { class: 'dy-wrap' }, offSteps(),
        O.tradeOpen(L) ? h('div', { class: 'dy-off-trade' }, h('span', { class: 'caption' }, '🔁 Trades are open until draft day.'),
          h('button', { class: 'btn btn-secondary btn-sm', onClick: () => { save(); tab = 'office'; drawHub(); } }, 'Make a trade')) : null,
        body, next || null));
  }
  const nextBtn = (label, before) => h('button', { class: 'btn btn-primary btn-wide', onClick: async () => {
    if (before && (await before()) === false) return;
    O.nextStep(L);
    if (O.tradeOpen(L) && DP.offseasonOffer(L)) phone.ping();
    await save(); drawOff();
  } }, label);

  function drawOff() {
    if (L.phase !== 'offseason') { tab = 'league'; drawHub(); return; }
    ({ fired: offFired, retire: offRetire, legacy: offLegacy, awards: offAwards, resign: offResign, upgrade: offUpgrade, draft: offDraft, fa: offFA, ready: offReady }[L.off.step])();
  }

  function offFired() {
    const jobs = O.jobsAfterFiring(L);
    const last = L.history[0];
    offFrame('FIRED', h('div', {},
      h('article', { class: 'dy-article' }, crest(me(), 72),
        h('p', { class: 'label-spaced loss' }, 'AROUND THE LEAGUE'),
        h('h2', { class: 'dy-article-title' }, `${me().name} fire ${L.user.coach}`),
        h('p', { class: 'dy-article-body' }, 'Three missed expectations in a row. The front office wants a new voice. Pick your next job from the teams that missed the playoffs.')),
      h('ul', { class: 'dy-jobs' }, jobs.map((i) => {
        const t = team(i); const st = last.standings.find((x) => x.i === i);
        return h('li', {}, h('button', { class: 'dy-job', onClick: async () => {
          const ok = await confirmSheet({ title: `TAKE THE ${t.name.toUpperCase()} JOB?`, message: `${st.w}-${st.l} last season. Front office: ${R.STAGE_LABEL[t.stage]}.`, confirmLabel: 'Take the job' });
          if (!ok) return;
          const art = O.changeJob(L, i); O.nextStep(L); await save();
          offFrame('NEW JOB', h('article', { class: 'dy-article' }, crest(t, 72), h('p', { class: 'label-spaced' }, 'AROUND THE LEAGUE · YOUR HIRE'), h('h2', { class: 'dy-article-title' }, art.title), h('p', { class: 'dy-article-body' }, art.text)),
            h('button', { class: 'btn btn-primary btn-wide', onClick: drawOff }, 'On to the off-season'));
        } }, crest(t, 40), h('span', { class: 'dy-list-text' }, h('span', {}, t.name), h('span', { class: 'caption muted' }, `${st.w}-${st.l} · ${R.STAGE_LABEL[t.stage]}`))));
      }))), null);
  }

  function offRetire() {
    const o = L.off; const t = me();
    const mine = o.retired.filter((r) => r.team === t.i);
    const notable = o.retired.filter((r) => r.team !== t.i).sort((a, b) => b.power - a.power).slice(0, 8);
    const face = (r) => pAvatar(L.players[r.pid]);
    const row = (r) => h('li', {}, face(r), h('span', { class: 'dy-list-text' }, h('span', {}, r.name),
      h('span', { class: 'caption muted' }, `${r.team != null ? team(r.team).name : 'Free agent'} · ${r.seasons} seasons${r.iron ? ' · Iron Man' : ''} · ${r.series}`)), h('span', { class: 'dy-num' }, String(r.power)));
    offFrame('RETIREMENTS', h('div', { class: 'dy-off-body' },
      h('p', { class: 'body-text' }, `${o.retired.length} cards retired. Retired means retired: they don't come back. Their headshots return in next year's class under new names.`),
      o.inducted.length ? h('section', { class: 'dy-panel dy-pantheon' }, h('h2', { class: 'dy-h gold' }, 'THE GENERATIONAL PANTHEON'),
        h('p', { class: 'caption muted' }, 'Retired at 95+ Power.'),
        h('ul', { class: 'dy-list' }, o.inducted.map((pid) => { const p = L.players[pid]; return h('li', {}, pAvatar(p, 'md'), h('span', { class: 'dy-list-text' }, h('span', { class: 'heading' }, p.name), h('span', { class: 'caption muted' }, `${p.series} · ${p.career} seasons`)), h('span', { class: 'dy-num gold' }, String(p.power))); }))) : null,
      h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h' }, `YOUR TEAM${mine.length ? '' : ': NOBODY RETIRED'}`), mine.length ? h('ul', { class: 'dy-list' }, mine.map(row)) : null),
      notable.length ? h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h' }, 'AROUND THE LEAGUE'), h('ul', { class: 'dy-list' }, notable.map(row))) : null,
      (o.coaching || []).length ? h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h' }, 'COACHING CHANGES'),
        h('p', { class: 'caption muted' }, 'AI coaches are judged like you, and they retire too.'),
        h('ul', { class: 'dy-list' }, o.coaching.map((c) => h('li', {}, crest(team(c.team), 32), h('span', { class: 'dy-list-text' },
          h('span', {}, `${team(c.team).name}: ${c.hire}${c.second ? ' (second chance)' : ''}`),
          h('span', { class: 'caption muted' }, `${c.old} ${c.why === 'fired' ? `fired after a ${c.record} season` : `retired${c.titles ? `, ${c.titles} title${c.titles > 1 ? 's' : ''}` : ''}`}`)),
          h('span', { class: `dy-tag ${c.why === 'fired' ? 'loss' : 'gold'}` }, c.why === 'fired' ? 'FIRED' : 'RETIRED'))))) : h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h' }, 'COACHING CHANGES'), h('p', { class: 'caption muted' }, 'Every AI coach kept their job this year.'))),
    nextBtn(L.off.legacy && !L.complete ? 'The end of an era' : 'On to awards night'));
  }

  function offAwards() {
    sfx.play('fanfare');
    const row = L.history[0];
    const award = (pid) => (pid ? L.players[pid] : null);
    const gpp = award(row.prodigy);
    const special = [['awakening', 'Breakout season'], ['phoenix', 'Comeback season']].filter(([k]) => row[k]).map(([k, why]) => {
      const p = award(row[k]); return h('li', {}, trophy(R.AWARDS[k], 64), pAvatar(p), h('span', { class: 'dy-list-text' }, h('span', {}, p.name), h('span', { class: 'caption muted' }, `${R.AWARDS[k]} · ${why}`)));
    });
    offFrame('AWARDS NIGHT', h('div', { class: 'dy-off-body' },
      h('section', { class: 'dy-panel dy-awards-hero' },
        h('p', { class: 'label-spaced gold' }, `SEASON ${row.season} · THE GPT`),
        h('div', { class: 'dy-gpp-hero' }, trophy(R.AWARDS.prodigy, 180, 'dy-trophy dy-grail'),
          h('div', {}, gpp ? pAvatar(gpp, 'lg') : null, h('h2', { class: 'display-md' }, row.prodigyName), h('p', { class: 'caption muted' }, `${R.AWARDS.prodigy} · ${team(row.prodigyTeam).name}`)))),
      h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h' }, 'BEST AT THEIR ROLE'),
        h('ul', { class: 'dy-awards-grid' }, R.ROLES.map((r) => { const p = award(row.roleAwards[r]); return p ? h('li', {}, trophy(R.AWARDS[r], 96), pAvatar(p), h('p', { class: 'heading' }, p.name), h('p', { class: 'caption muted' }, `${R.AWARDS[r]} · ${team(p.team ?? row.prodigyTeam)?.abbr || ''}`)) : null; }))),
      h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h' }, 'SPECIALTY AWARDS'),
        h('ul', { class: 'dy-list' }, special,
          h('li', {}, trophy(R.AWARDS.coach, 64), crest(team(row.coachOfYear), 32), h('span', { class: 'dy-list-text' }, h('span', {}, team(row.coachOfYear).coachName), h('span', { class: 'caption muted' }, `${R.AWARDS.coach} · Coach of the Year, ${team(row.coachOfYear).name}`)))))),
    nextBtn('On to re-signing'));
  }

  const yearsPick = {};
  function offResign() {
    const t = me();
    const exp = O.expiring(L, t).sort((a, b) => b.power - a.power);
    const signedNow = players(t).filter((p) => p.contract && p.contract.years === p.contract.left && p.contract.left > 0 && (p.resignedSeason === L.season || p.tagged === L.season));
    const body = h('div', { class: 'dy-off-body' },
      capPanel(t),
      h('p', { class: 'body-text' }, exp.length ? `${exp.length} contract${exp.length > 1 ? 's' : ''} ran out. Re-sign them now, use your one Franchise Tag, or let them go to free agency.` : 'No contracts ran out. Nothing to do here.'),
      exp.length ? h('ul', { class: 'dy-list dy-resign' }, exp.map((p) => {
        const ask = O.askFor(L, p, t); const want = O.wantYears(p);
        const yrs = yearsPick[p.pid] || want;
        return h('li', { class: 'dy-resign-row' }, pAvatar(p, 'md'),
          h('span', { class: 'dy-list-text' }, h('span', { class: 'dy-rname' }, p.name),
            h('span', { class: 'caption muted' }, `${p.role} · Power ${p.power} · season ${p.career} · Hype ${Math.round(p.hype)}${p.lowKey ? ' · low-key' : ''}`),
            h('span', { class: 'caption' }, `Asks ${ask} a season · wants ${want} season${want > 1 ? 's' : ''}`),
            (() => { const space = Math.round((R.capOf(t) - R.payroll(L, t) - ask) * 10) / 10; const sm = R.isSupermax(ask); return h('span', { class: `caption dy-resign-preview ${space < 0 ? 'loss' : 'win'}` }, `${yrs} season${yrs > 1 ? 's' : ''}: ${ask} a season, ${Math.round(ask * yrs * 10) / 10} total · cap space after: ${space}${space < 0 ? ' (over the hard cap)' : ''}${sm ? ` · SUPERMAX (${R.supermaxCount(L, t)}/${R.SUPERMAX_LIMIT} used)` : ''}`); })()),
          h('span', { class: 'dy-resign-btns' },
            h('span', { class: 'dy-yrs', role: 'group', 'aria-label': 'Seasons' }, [1, 2, 3, 4].map((y) => h('button', { class: `dy-chip${y === yrs ? ' is-on' : ''}`, 'aria-pressed': y === yrs ? 'true' : 'false', onClick: () => { yearsPick[p.pid] = y; offResign(); } }, `${y}`))),
            h('button', { class: 'btn btn-primary btn-sm', onClick: async () => { const r = O.resign(L, p.pid, yrs); if (!r.ok) { toast(r.why); return; } p.resignedSeason = L.season; await save(); toast(`${p.name}: ${Math.round(ask * yrs * 10) / 10} over ${yrs}.`); offResign(); } }, `Re-sign · ${Math.round(ask * yrs * 10) / 10}`),
            t.tagged == null ? h('button', { class: 'btn btn-secondary btn-sm', onClick: async () => { if (!O.franchiseTag(L, p.pid)) { toast(O.capCheck(L, t, O.tagPrice(L, p)).why || 'You can\'t tag them.'); return; } await save(); toast(`${p.name} tagged for one season.`); offResign(); } }, `Tag · ${O.tagPrice(L, p)}`) : null,
            h('button', { class: 'btn btn-secondary btn-sm', onClick: async () => { O.letGo(L, p.pid); await save(); offResign(); } }, 'Let go')));
      })) : null,
      signedNow.length ? h('p', { class: 'caption muted' }, `Kept: ${signedNow.map((p) => p.name).join(', ')}.`) : null,
      t.tagged != null ? h('p', { class: 'caption gold' }, `Franchise Tag used on ${L.players[t.tagged].name}.`) : null);
    offFrame('RE-SIGN', body, nextBtn('On to upgrades', async () => {
      const left = O.expiring(L, me()).length;
      if (!left) return true;
      return confirmSheet({ title: 'LET THE REST GO?', message: `${left} unsigned card${left > 1 ? 's' : ''} will go to free agency.`, confirmLabel: 'Continue' });
    }));
  }

  function offUpgrade() {
    const t = me();
    const ps = players(t).sort((a, b) => a.career - b.career || b.potential - a.potential);
    const used = t.upgrades || 0;
    offFrame('UPGRADES', h('div', { class: 'dy-off-body' },
      capPanel(t),
      h('p', { class: 'body-text' }, `Invest in development: Normal → Star → Superstar. One step per card each off-season, up to ${O.UPGRADES_PER_TEAM} a team, only in a card's first 4 seasons. Each step raises the card's max: Star by up to +10, Superstar by +5 or +10 (never past 99). Skill points the card banked at its old max can then be spent. Salary follows growth speed, 1x / 2x / 3x, but never more than +6 a season per step, and the raise has to fit under the hard cap. You also find out if they are a Generational Talent or a bust.`),
      h('p', { class: 'label-spaced' }, `${used} OF ${O.UPGRADES_PER_TEAM} USED`),
      h('ul', { class: 'dy-list' }, ps.map((p) => {
        const chk = O.canUpgrade(L, p);
        const c = p.contract && p.dev < 2 && p.contract.left > 0 ? O.upgradeCost(p) : null;
        return pLine(p, chk.ok
          ? h('button', { class: 'btn btn-primary btn-sm', onClick: async () => {
            const ok = await confirmSheet({ title: `${DEV_LABEL[p.dev + 1].toUpperCase()}: ${p.name.toUpperCase()}?`, message: `Cap hit goes from ${c.hitNow} to ${c.hitAfter} for the ${c.left} season${c.left > 1 ? 's' : ''} left (+${c.extra} a season).`, confirmLabel: 'Upgrade' });
            if (!ok) return;
            const r = O.upgrade(L, p.pid); await save();
            toast(`${r.gen ? `${p.name} is a GENERATIONAL TALENT.` : r.bust ? `${p.name} looks like a bust. The upgrade can't fix that.` : `${p.name} is now a ${DEV_LABEL[p.dev]}.`} Max ${r.max - r.raise} → ${r.max}${p.sp ? `: ${R.usablePoints(p)} banked point${R.usablePoints(p) === 1 ? '' : 's'} can go in now` : ''}.`);
            offUpgrade();
          } }, `→ ${DEV_LABEL[p.dev + 1]} · +${c.extra}`)
          : h('span', { class: 'caption muted dy-why' }, p.upgraded === L.season ? `Upgraded${p.gen ? ' · Generational' : p.bust ? ' · Bust' : ''}` : chk.why),
        `${p.role} · ${DEV_LABEL[p.dev]} · season ${p.career} · Power ${p.power}`);
      }))),
    nextBtn('On to the draft'));
  }

  function offDraft() {
    redrawBoard = offDraft;
    const o = L.off; const t = me();
    const myPicks = o.order.map((x, k) => (x === t.i ? k : -1)).filter((k) => k >= 0);
    const left = () => myPicks.filter((k) => k >= o.pick);
    if (O.onTheClock(L) != null && O.onTheClock(L) !== t.i && left().length) { O.simDraft(L, true); }
    const clock = O.onTheClock(L);
    const mine = clock === t.i;
    const myPick = myPicks.length ? myPicks[0] : -1;
    const done = clock == null;
    const recent = o.picks.slice(-6).reverse();
    const strip = h('ol', { class: 'dy-order' }, o.order.slice(o.pick, o.pick + 8).map((i, k) => h('li', { class: i === t.i ? 'is-me' : '' }, h('span', { class: 'caption' }, `${o.pick + k + 1}`), crest(team(i), 28))));
    offFrame('THE DRAFT', h('div', { class: 'dy-off-body' },
      h('section', { class: 'dy-panel' },
        h('p', { class: 'label-spaced gold' }, done ? 'THE DRAFT IS OVER' : mine ? 'YOU ARE ON THE CLOCK' : `PICK ${o.pick + 1}: ${team(clock).name.toUpperCase()}`),
        myPick < 0 ? h('p', { class: 'body-text loss' }, t.forfeitPick ? 'You lost your pick: over the soft cap two seasons running.' : 'You traded your pick away.')
          : h('p', { class: 'caption muted' }, `Your pick${myPicks.length > 1 ? 's' : ''}: ${myPicks.map((k) => `No. ${k + 1}${o.from && o.from[k] !== t.i ? ` (from ${team(o.from[k]).abbr})` : ''}`).join(', ')}. One round. Rookie deals run 3 seasons.`),
        done ? null : strip,
        h('p', { class: 'caption muted' }, `Scouting points left: ${L.user.scoutPts || 0}. You can still scout now.`)),
      recent.length ? h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h' }, 'LATEST PICKS'),
        h('ul', { class: 'dy-list' }, recent.map((x) => { const p = L.players[x.pid]; return h('li', {}, h('span', { class: 'dy-num' }, `${x.pick}`), crest(team(x.team), 24), pAvatar(p), h('span', { class: 'dy-list-text' }, h('span', {}, p.name), h('span', { class: 'caption muted' }, `${p.role} · ${p.series}`))); }))) : null,
      done ? null : draftRoomView('pick')),
    done || !left().length
      ? nextBtn(done ? 'On to free agency' : 'Finish the draft')
      : h('p', { class: 'caption muted' }, 'Make your pick from the board.'));
  }

  const offerSheet = (p) => {
    const t = me(); const fa = L.off.fa;
    const ask = O.asking(p);
    const cur = fa.offers[p.pid] || { per: Math.round(ask * 10) / 10, years: O.wantYears(p) };
    const st = { per: cur.per, years: cur.years };
    const bar = O.FA_BAR[fa.round - 1];
    const body = h('div', { class: 'dy-offer' });
    const s = sheet({ title: `OFFER: ${p.name.toUpperCase()}`, content: body });
    const draw = () => {
      const it = O.interest(L, p, t, st);
      const parts = [['Money', it.parts.money, 40], ['Winning', it.parts.winning, p.lowKey ? 26 : 18], ['Playing time', it.parts.time, p.lowKey ? 24 : 14], ['Teammates from their world', it.parts.friends, 8], ['Your coaching style', it.parts.style, 6], ['Spotlight (Hype + Aura)', it.parts.spotlight, p.lowKey ? 0 : 9], ['Your legacy', it.parts.legacy || 0, it.parts.legacy ? 8 : 0]].filter((x) => x[2]);
      fill(body,
        h('div', { class: 'dy-offer-top' }, pAvatar(p, 'md'), h('div', {}, h('p', { class: 'heading' }, p.name), h('p', { class: 'caption muted' }, `${p.role} · Power ${p.power} · ${p.series} · season ${p.career}${p.lowKey ? ' · low-key' : ''}`),
          h('p', { class: 'caption' }, `Asks about ${Math.round(ask * 10) / 10} a season for ${O.wantYears(p)} season${O.wantYears(p) > 1 ? 's' : ''}`))),
        h('label', { class: 'dy-field' }, h('span', { class: 'label-spaced' }, `PER SEASON: ${st.per}`),
          h('input', { type: 'range', min: String(O.MIN_SALARY), max: String(Math.max(2, Math.round(ask * 1.6))), step: '0.1', value: String(st.per), onInput: (e) => { st.per = Number(e.target.value); draw(); } })),
        h('div', { class: 'dy-field' }, h('span', { class: 'label-spaced' }, 'SEASONS'),
          h('span', { class: 'dy-yrs' }, [1, 2, 3, 4].map((y) => h('button', { class: `dy-chip${y === st.years ? ' is-on' : ''}`, 'aria-pressed': y === st.years ? 'true' : 'false', onClick: () => { st.years = y; draw(); } }, String(y))))),
        it.blocked ? h('p', { class: 'body-text loss' }, it.blocked) : meter(it.score, bar, `signs this round at ${bar}+ (if nobody beats you)`),
        h('ul', { class: 'dy-parts' }, parts.map(([k, v, max]) => h('li', {}, h('span', { class: 'caption' }, k), h('span', { class: 'dy-part' }, h('span', { style: `width:${Math.round((v / max) * 100)}%` }))))),
        h('p', { class: 'caption muted' }, `Total ${Math.round(st.per * st.years * 10) / 10} over ${st.years}. Cap hit ${st.per}. Your space after: ${Math.round((O.capRoom(L, t) - st.per) * 10) / 10}.`),
        h('div', { class: 'btn-row' },
          fa.offers[p.pid] ? h('button', { class: 'btn btn-secondary', onClick: async () => { O.withdraw(L, p.pid); await save(); s.close(); offFA(); } }, 'Withdraw') : null,
          h('button', { class: 'btn btn-primary', disabled: !!it.blocked, onClick: async () => {
            const r = O.makeOffer(L, p.pid, st.per, st.years); if (!r.ok) { toast(r.why); return; }
            await save(); s.close(); offFA();
          } }, fa.offers[p.pid] ? 'Update offer' : 'Make offer')));
    };
    draw();
  };

  const faFilter = { role: null };
  function offFA() {
    const t = me(); const fa = L.off.fa;
    const spots = O.openSpots(L, t);
    const offers = Object.entries(fa.offers).map(([pid, o]) => ({ p: L.players[pid], o }));
    let pool = O.faPool(L).sort((a, b) => b.power - a.power);
    if (faFilter.role) pool = pool.filter((p) => p.role === faFilter.role);
    if (faFilter.year) pool = pool.filter((p) => yearKey(p) === faFilter.year);
    if (faFilter.sort === 'young') pool.sort((a, b) => a.career - b.career || b.power - a.power);
    else if (faFilter.sort === 'old') pool.sort((a, b) => b.career - a.career || b.power - a.power);
    pool = pool.slice(0, 40);
    const last = fa.results[fa.results.length - 1];
    const results = last ? h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h' }, `ROUND ${last.round} RESULTS`),
      h('ul', { class: 'dy-list' }, last.signed.filter((x) => x.user || L.players[x.pid].power >= 85).slice(0, 12).map((x) => {
        const p = L.players[x.pid];
        const txt = x.missed ? `Didn't sign. Interest ${x.score}, needed ${x.bar}.` : x.user && x.team === t.i ? `Signed with you: ${x.per} × ${x.years}` : `Signed with ${team(x.team).name}${x.beat != null ? ` (you were at ${x.beat})` : ''}`;
        return h('li', {}, x.team != null ? crest(team(x.team), 24) : h('span', { class: 'dy-num loss' }, '✕'), pAvatar(p), h('span', { class: 'dy-list-text' }, h('span', {}, p.name), h('span', { class: `caption ${x.user && x.team === t.i ? 'win' : x.user ? 'loss' : 'muted'}` }, txt)));
      }))) : null;
    const tooMany = t.roster.length > R.ROSTER_SIZE;
    const body = h('div', { class: 'dy-off-body' },
      capPanel(t),
      h('section', { class: 'dy-panel' },
        h('p', { class: 'label-spaced gold' }, fa.done ? 'FREE AGENCY IS CLOSED' : `ROUND ${fa.round} OF ${O.FA_ROUNDS}`),
        h('p', { class: 'body-text' }, fa.done ? `Fill any empty spots with the best leftovers on one-season bargain deals (${Math.round(O.BARGAIN * 100)}% of their ask), then start the season.`
          : `You have ${spots} open spot${spots === 1 ? '' : 's'}. Make offers, then run the round. Every player picks the offer they like most. This round they sign at ${O.FA_BAR[fa.round - 1]}+ interest; they get less picky each round.`),
        offers.length ? h('ul', { class: 'dy-list' }, offers.map(({ p, o }) => pLine(p, h('button', { class: 'btn btn-secondary btn-sm', onClick: () => offerSheet(p) }, 'Edit'), `Your offer: ${o.per} × ${o.years} · interest ${O.interest(L, p, t, o).score}`))) : null,
        fa.done ? null : h('button', { class: 'btn btn-primary btn-wide', onClick: async () => {
          O.resolveRound(L); await save(); offFA();
        } }, offers.length ? `Run round ${fa.round}` : `Skip round ${fa.round}`)),
      results,
      tooMany ? h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h loss' }, `CUT ${t.roster.length - R.ROSTER_SIZE} TO MAKE 10`),
        h('ul', { class: 'dy-list' }, players(t).sort((a, b) => a.power - b.power).map((p) => pLine(p, h('button', { class: 'btn btn-secondary btn-sm', onClick: async () => { O.release(L, p.pid); await save(); offFA(); } }, 'Cut'), `${p.role} · ${p.power} · cap hit ${R.capHit(p)} becomes dead money`)))) : null,
      fa.done && spots > 0 ? h('button', { class: 'btn btn-primary btn-wide', onClick: async () => { const got = O.fillWithMinimum(L); await save(); toast(`Signed ${got.length} on bargain deals.`); offFA(); } }, `Fill ${spots} spot${spots > 1 ? 's' : ''} with bargain deals`) : null,
      fa.done ? null : h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h' }, 'FREE AGENTS'), boardChipsFA(),
        h('ul', { class: 'dy-list' }, pool.map((p) => pLine(p, fa.offers[p.pid] ? h('span', { class: 'caption gold' }, 'OFFERED')
          : O.interest(L, p, t, { per: O.asking(p), years: O.wantYears(p) }).blocked ? h('span', { class: 'caption muted dy-why' }, `You have ${R.MAX_PER_SERIES} from this world`)
          : h('button', { class: 'btn btn-secondary btn-sm', disabled: spots - offers.length <= 0, onClick: () => offerSheet(p) }, 'Offer'),
        `${yearLabel(p)} ${p.role} · Power ${p.power} · asks ${O.asking(p)} · ${p.series}${p.formerTeam != null ? ` · ex-${team(p.formerTeam).abbr}` : ''}`)))));
    offFrame('FREE AGENCY', body, fa.done && t.roster.length === R.ROSTER_SIZE ? nextBtn('On to the new season') : null);
  }
  // v0.20.0: filter by career year as well as role ("Rookie Speedster").
  function yearKey(p) { return p.career <= 1 ? 'rookie' : p.career >= 5 ? '5' : String(p.career); }
  function yearLabel(p) { const k = yearKey(p); return k === 'rookie' ? 'Rookie' : k === '5' ? `Year ${p.career}` : `Year ${k}`; }
  function boardChipsFA() {
    const chip = (on, label, fn) => h('button', { class: `dy-chip${on ? ' is-on' : ''}`, onClick: () => { fn(); offFA(); } }, label);
    return h('div', { class: 'dy-fa-filters' },
      h('div', { class: 'dy-chips', 'aria-label': 'Role' }, [null, ...R.ROLES].map((r) => chip(faFilter.role === r, r || 'All roles', () => { faFilter.role = r; }))),
      h('div', { class: 'dy-chips', 'aria-label': 'Career year' }, [[null, 'All years'], ['rookie', 'Rookie'], ['2', 'Year 2'], ['3', 'Year 3'], ['4', 'Year 4'], ['5', 'Year 5+']].map(([k, l]) => chip(faFilter.year === k, l, () => { faFilter.year = k; }))),
      h('div', { class: 'dy-chips', 'aria-label': 'Sort' }, [['power', 'Best Power'], ['young', 'Youngest'], ['old', 'Most experienced']].map(([k, l]) => chip((faFilter.sort || 'power') === k, l, () => { faFilter.sort = k; }))),
      h('p', { class: 'caption muted' }, [faFilter.year ? (faFilter.year === 'rookie' ? 'Rookie' : `Year ${faFilter.year}${faFilter.year === '5' ? '+' : ''}`) : null, faFilter.role].filter(Boolean).join(' ') || 'Everyone'));
  }

  function offReady() {
    const t = me();
    const ps = players(t).sort((a, b) => b.power - a.power);
    const newbies = ps.filter((p) => p.draftSeason === L.season || (p.contract && p.contract.left === p.contract.years && !p.resignedSeason && p.tagged !== L.season));
    offFrame('NEW SEASON', h('div', { class: 'dy-off-body' },
      capPanel(t),
      h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h' }, `${t.name.toUpperCase()} FOR SEASON ${L.season + 1}`),
        h('ul', { class: 'dy-list' }, ps.map((p) => pLine(p, h('span', { class: 'dy-num' }, String(p.power)), `${p.role} · ${DEV_LABEL[p.dev]} · cap hit ${R.capHit(p)}${newbies.includes(p) ? ' · NEW' : ''}`)))),
      R.payroll(L, t) > R.capOf(t) ? h('p', { class: 'body-text loss' }, `You are ${Math.round((R.payroll(L, t) - R.capOf(t)) * 10) / 10} over the cap. Finish the season over and that much comes off next season's cap. Two seasons running costs your draft pick.`) : null,
      h('p', { class: 'body-text' }, `Job security: ${L.user.security}.`)),
    h('button', { class: 'btn btn-primary btn-wide', onClick: async () => {
      const r = O.startNextSeason(L);
      if (!r.ok) { toast(r.why); return; }
      await save();
      tab = 'league'; drawHub();
      toast(`Season ${L.season}. The front office expects: ${R.EXPECT_LABEL[L.user.expect]}.`);
    } }, `Start season ${L.season + 1}`));
  }

  // ---------- Media: OSM, the Dojo, the award race ----------
  const unreadMag = () => (L.mags || []).find((m) => !m.read && m.season === L.season) || null;

  function magBanner() {
    const m = unreadMag(); if (!m) return null;
    const p = L.players[m.cover.pid];
    return h('section', { class: 'dy-panel dy-osm-banner' },
      p ? pAvatar(p, 'md') : null,
      h('div', { class: 'dy-list-text' }, h('p', { class: 'label-spaced gold' }, m.preseason ? `OSM · THE SEASON ${m.season} PRESEASON ISSUE IS OUT` : m.review ? `OSM · SEASON ${m.season} IN REVIEW IS OUT` : m.legacy ? 'OSM · THE FINAL ISSUE' : `OSM · ISSUE ${m.issue} IS OUT`), h('p', { class: 'heading' }, m.cover.line),
        m.spotlight?.pick ? h('p', { class: `caption ${m.spotlight.pick === 'aura' ? 'gold' : 'loss'}` }, `Your quote ran: +${MD.QUOTE_BOOST} ${m.spotlight.pick.toUpperCase()} for your roster for ${MD.QUOTE_WEEKS} weeks.`) : null),
      h('button', { class: 'btn btn-primary btn-sm', onClick: () => openMag(m) }, 'Read'));
  }

  function magThumb(m) {
    const p = L.players[m.cover.pid];
    const t = m.cover.team != null ? team(m.cover.team) : me();
    return h('button', { class: 'osm-thumb', style: `--c1:${t.c1};--c2:${t.c2}`, onClick: () => openMag(m), 'aria-label': `OSM season ${m.season} issue ${m.issue}` },
      h('span', { class: 'osm-thumb-mast' }, 'OSM'),
      p ? h('span', { class: 'osm-thumb-star' }, pAvatar(p, 'card')) : null,
      m.legacy ? h('span', { class: 'osm-thumb-legacy' }, 'FINAL ISSUE') : m.preseason ? h('span', { class: 'osm-thumb-legacy' }, 'PRESEASON') : m.review ? h('span', { class: 'osm-thumb-legacy' }, 'SEASON REVIEW') : null,
      h('span', { class: 'osm-thumb-meta' }, m.review || m.legacy || m.preseason ? `S${m.season}` : `S${m.season} · #${m.issue}`),
      !m.read ? h('span', { class: 'osm-new' }, 'NEW') : null);
  }

  function drawMedia() {
    const d = L.phase === 'season' ? MD.dojoWeek(L) : null;
    const last = L.dojoLast && L.dojoLast.season === L.season ? L.dojoLast : null;
    const rec = L.dojoRecord || { w: 0, l: 0 };
    const race = R.awardRace(L).slice(0, 10);
    const roles = MD.roleRaces(L);
    const wake = MD.breakoutRace(L); const phoenix = MD.comebackRace(L);
    const pickRow = (g, graded) => {
      const a = team(g.home); const b = team(g.away); const pk = team(g.pick);
      return h('li', { class: 'dy-dojo-row' },
        crest(a, 28), h('span', { class: 'dy-num' }, a.abbr), h('span', { class: 'caption muted' }, 'vs'), h('span', { class: 'dy-num' }, b.abbr), crest(b, 28),
        h('span', { class: 'dy-list-text dy-dojo-pick' }, h('span', {}, `Pick: ${pk.name}`), h('span', { class: 'caption muted' }, `${g.chance}% sure`)),
        graded ? h('span', { class: `dy-num ${g.right ? 'win' : 'loss'}` }, g.right ? 'RIGHT' : 'WRONG') : null);
    };
    const watch = d?.watch != null ? L.players[d.watch] : null;
    shell(h('div', { class: 'dy-content dy-media' },
      h('section', { class: 'dy-panel' },
        h('div', { class: 'dy-osm-head' }, h('h2', { class: 'dy-h' }, 'OSM · OTAKU SPORTS MAGAZINE'), h('p', { class: 'caption muted' }, `A new issue every ${R.MAG_EVERY} weeks. The cover star and the spotlight gain Aura.`)),
        (L.mags || []).length ? h('div', { class: 'osm-shelf' }, L.mags.map(magThumb)) : h('p', { class: 'caption muted' }, `The first issue comes out after Week ${R.MAG_EVERY}.`)),
      h('div', { class: 'dy-media-grid' },
        h('section', { class: 'dy-panel' },
          h('h2', { class: 'dy-h' }, 'THE FIGHT NIGHT DOJO'),
          h('p', { class: 'caption muted' }, `The Dojo's picks for the biggest games. Record this season ${rec.season?.w || 0}-${rec.season?.l || 0} · all time ${rec.w}-${rec.l}.`),
          d && d.games.length ? h('div', {}, h('p', { class: 'label-spaced' }, `WEEK ${d.week} PICKS`), h('ul', { class: 'dy-list' }, d.games.map((g) => pickRow(g, false)))) : h('p', { class: 'body-text' }, 'No games this week. The Dojo is back next season.'),
          watch ? h('div', { class: 'dy-watch' }, pAvatar(watch, 'md'), h('div', {}, h('p', { class: 'label-spaced gold' }, 'PLAYER TO WATCH'), h('p', { class: 'heading' }, watch.name), h('p', { class: 'caption muted' }, `${team(watch.team).name} · Hype ${Math.round(watch.hype)} · Aura ${watch.aura}`))) : null,
          last && last !== d ? h('div', {}, h('p', { class: 'label-spaced' }, `WEEK ${last.week} RESULTS`), h('ul', { class: 'dy-list' }, last.games.map((g) => pickRow(g, true)))) : null),
        h('section', { class: 'dy-panel' },
          h('div', { class: 'dy-h-trophy' }, trophy('The Celestial Grail', 56), h('h2', { class: 'dy-h' }, 'RIVALRY TROPHIES')),
          h('ul', { class: 'dy-rivals' }, MD.rivalryList(L).map((r) => {
            const hold = r.holder ? team(r.holder.team) : null;
            return h('li', {}, trophy(r.name, 64),
              h('span', { class: 'dy-list-text' }, h('span', {}, r.name), h('span', { class: 'caption muted' }, `${team(r.a).abbr} vs ${team(r.b).abbr}`),
                h('span', { class: `caption ${hold ? 'gold' : 'muted'}` }, hold ? `Held by ${hold.name}` : 'Not played yet')),
              hold ? crest(hold, 32) : null);
          })))),
      h('section', { class: 'dy-panel' },
        h('div', { class: 'dy-h-trophy' }, trophy(R.AWARDS.prodigy, 72), h('div', {}, h('h2', { class: 'dy-h gold' }, 'THE GPT RACE'), h('p', { class: 'caption muted' }, 'Damage, KOs, wins, team record and Hype. Odds from the AGN desk.'))),
        race.length ? h('ol', { class: 'dy-list dy-race-full' }, race.map(({ p, s }, i) => h('li', {}, h('span', { class: 'dy-num' }, String(i + 1)), pAvatar(p),
          h('span', { class: 'dy-list-text' }, h('span', {}, p.name), h('span', { class: 'caption muted' }, `${team(p.team).name} · ${p.role} · ${fmt(p.stats.dmg)} dmg · ${p.stats.ko} KOs`)),
          h('span', { class: 'dy-num' }, R.oddsFor(i, s, race[0].s))))) : h('p', { class: 'caption muted' }, 'The race starts after Week 1.')),
      h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h' }, 'ROLE AWARDS'),
        h('ul', { class: 'dy-awards-grid dy-role-races' }, roles.map((r) => h('li', {}, trophy(r.award, 84), h('p', { class: 'label-spaced' }, r.role.toUpperCase()),
          r.top.length ? h('ol', { class: 'dy-mini-race' }, r.top.map(({ p }) => h('li', {}, pAvatar(p), h('span', {}, p.name)))) : h('p', { class: 'caption muted' }, '–'))))),
      h('div', { class: 'dy-media-grid' },
        h('section', { class: 'dy-panel' }, h('div', { class: 'dy-h-trophy' }, trophy(R.AWARDS.awakening, 64), h('h2', { class: 'dy-h' }, `${R.AWARDS.awakening.toUpperCase()} · BREAKOUT`)),
          wake.length ? h('ul', { class: 'dy-list' }, wake.map((p) => pLine(p, h('span', { class: 'dy-num win' }, `+${p.power - p.startPower}`), `${team(p.team).abbr} · season ${p.career} · Power ${p.power}`))) : h('p', { class: 'caption muted' }, 'Young cards who grow the most this season.')),
        h('section', { class: 'dy-panel' }, h('div', { class: 'dy-h-trophy' }, trophy(R.AWARDS.phoenix, 64), h('h2', { class: 'dy-h' }, `${R.AWARDS.phoenix.toUpperCase()} · COMEBACK`)),
          phoenix.length ? h('ul', { class: 'dy-list' }, phoenix.map((p) => pLine(p, h('span', { class: 'dy-num win' }, `+${Math.round(p.hype - p.startHype)}`), `${team(p.team).abbr} · Hype ${Math.round(p.startHype)} → ${Math.round(p.hype)}`))) : h('p', { class: 'caption muted' }, 'Cards who started the season under 45 Hype and fought their way back.')))));
  }

  // ---------- The OSM reader (page flip) ----------
  function magPages(m, photo = null) {
    const P = (pid) => L.players[pid];
    const cs = P(m.cover.pid); const ct = m.cover.team != null ? team(m.cover.team) : me();
    const page = (cls, ...kids) => h('article', { class: `osm-page ${cls}` }, ...kids);
    const folio = (n) => h('p', { class: 'osm-folio' }, `OSM · SEASON ${m.season} · ISSUE ${m.issue} · ${n}`);
    const pages = [];
    pages.push(page('osm-cover', tinted(ct, ct, 'dy-arena osm-cover-bg'),
      h('p', { class: 'osm-mast' }, 'OSM'),
      h('p', { class: 'osm-sub' }, `OTAKU SPORTS MAGAZINE · SEASON ${m.season} · ISSUE ${m.issue} · AFTER WEEK ${m.week}`),
      cs ? h('div', { class: 'osm-cover-star' }, pAvatar(cs, 'card')) : null,
      h('div', { class: 'osm-cover-text' },
        h('p', { class: 'osm-kicker' }, cs ? `${cs.role.toUpperCase()} · ${ct.name.toUpperCase()}` : ''),
        h('h2', { class: 'osm-headline' }, cs ? cs.name.toUpperCase() : ''),
        h('p', { class: 'osm-dek' }, m.cover.line)),
      h('ul', { class: 'osm-teasers' }, m.teasers.map((t) => h('li', {}, t))),
      crest(ct, 56)));
    pages.push(page('', h('p', { class: 'osm-section' }, 'PLAYERS OF THE MONTH'),
      h('p', { class: 'osm-intro' }, 'The best at every role over the last three weeks. Each one gains Aura for the cover shoot.'),
      h('ul', { class: 'osm-potm' }, m.potm.map((x) => { const p = P(x.pid); return p ? h('li', {}, h('div', { class: 'osm-potm-pic' }, pAvatar(p, 'card')),
        h('p', { class: `label-spaced ${ROLE_CLASS(x.role)}` }, x.role.toUpperCase()), h('p', { class: 'heading' }, p.name),
        h('p', { class: 'caption muted' }, `${x.team != null ? team(x.team).abbr : ''} · ${fmt(x.dmg)} dmg · ${x.ko} KOs · ${x.w}-${x.l}`)) : null; })),
      folio(2)));
    pages.push(page('', h('p', { class: 'osm-section' }, 'THE POWER 10'),
      h('ol', { class: 'osm-power' }, m.power.map((r) => { const t = team(r.i); const mv = r.prev ? r.prev - r.rank : 0;
        return h('li', {}, h('span', { class: 'osm-rank' }, String(r.rank)), crest(t, 36), h('span', { class: 'dy-list-text' }, h('span', { class: 'heading' }, t.name), h('span', { class: 'caption muted' }, `${r.w}-${r.l} · ${R.DIVISIONS[t.div]}`)),
          h('span', { class: `dy-num ${mv > 0 ? 'win' : mv < 0 ? 'loss' : 'muted'}` }, mv > 0 ? `▲${mv}` : mv < 0 ? `▼${-mv}` : '–')); })),
      folio(3)));
    pages.push(page('', h('p', { class: 'osm-section' }, 'THE GPT RACE'),
      h('div', { class: 'osm-race-top' }, trophy(R.AWARDS.prodigy, 200, 'dy-trophy osm-gpp'),
        h('ol', { class: 'osm-race' }, m.race.map((x, i) => { const p = P(x.pid); return p ? h('li', {}, h('span', { class: 'osm-rank' }, String(i + 1)), pAvatar(p, 'md'),
          h('span', { class: 'dy-list-text' }, h('span', { class: 'heading' }, p.name), h('span', { class: 'caption muted' }, x.team != null ? team(x.team).name : '')), h('span', { class: 'dy-num gold' }, x.odds)) : null; }))),
      h('p', { class: 'osm-intro' }, 'The Generational Player Trophy goes to the best card of the season. The glass is waiting.'),
      folio(4)));
    if (m.spotlight) {
      const sp = m.spotlight; const st = team(sp.team); const sp1 = P(sp.pid);
      pages.push(page('osm-spot', tinted(st, st, 'dy-arena osm-spot-bg'),
        h('p', { class: 'osm-section' }, 'OSM SPOTLIGHT'),
        h('h2', { class: 'osm-headline osm-headline-sm' }, `INSIDE THE ${st.name.toUpperCase()}`),
        h('p', { class: 'osm-dek' }, `${sp.record} · No. ${sp.rank || '–'} in the Power 25 · ${/^coach\b/i.test(L.user.coach) ? L.user.coach : `Head coach ${L.user.coach}`}`),
        h('div', { class: 'osm-spot-star' }, h('div', { class: 'osm-potm-pic osm-coach-pic' }, coachFace(photo, st)), quoteBlock(m)),
        h('p', { class: 'osm-body' }, sp.line),
        sp1 ? h('div', { class: 'osm-spot-mini' }, pAvatar(sp1, 'md'), h('p', { class: 'osm-body' }, h('strong', {}, `The star: ${sp1.name}. `), `${sp1.role} · ${fmt(sp1.stats.dmg)} damage · ${sp1.stats.ko} KOs this season.`)) : null,
        folio(5)));
    }
    pages.push(page('', h('p', { class: 'osm-section' }, 'RIVALRY WATCH'),
      h('ul', { class: 'osm-rivals' }, m.rivals.map((r) => h('li', {}, trophy(r.name, 92, 'dy-trophy osm-rival-trophy'),
        h('p', { class: 'heading' }, r.name), h('p', { class: 'caption muted' }, `${team(r.a).abbr} vs ${team(r.b).abbr}`),
        h('p', { class: `caption ${r.holder != null ? 'gold' : 'muted'}` }, r.holder != null ? `Held by ${team(r.holder).abbr}` : 'Up for grabs')))),
      folio(pages.length + 1)));
    pages.push(page('osm-back', h('p', { class: 'osm-section' }, 'AROUND THE AFL'),
      m.news.length ? h('ul', { class: 'osm-news' }, m.news.map((n) => h('li', {}, n.trophy ? trophy(n.trophy, 40, 'dy-trophy dy-news-trophy') : crest(team(n.team), 32),
        h('span', { class: 'dy-list-text' }, h('span', { class: 'label-spaced' }, n.kind), h('span', { class: 'heading' }, n.title))))) : h('p', { class: 'osm-intro' }, 'A quiet three weeks in the AFL.'),
      h('p', { class: 'osm-next' }, m.week < R.WEEKS ? `NEXT ISSUE AFTER WEEK ${m.week + R.MAG_EVERY}` : 'SEE YOU NEXT SEASON'),
      h('p', { class: 'osm-mast osm-mast-sm' }, 'OSM'),
      folio(pages.length + 1)));
    return pages;
  }

  // The spotlight quote: pick the Aura (calm) or Chaos (fiery) quote for a
  // 3-week +5 boost to your roster. Old issues just show the quote.
  function quoteBlock(m) {
    const sp = m.spotlight;
    const box = h('div', { class: 'osm-quote-box' });
    const cite = () => h('cite', {}, `— ${L.user.coach}, head coach`);
    const draw = () => {
      if (!sp.quotes) { fill(box, h('blockquote', { class: 'osm-quote' }, sp.quote, cite())); return; }
      if (sp.pick) {
        fill(box, h('blockquote', { class: 'osm-quote' }, sp.quotes[sp.pick], cite()),
          h('p', { class: `osm-boost is-${sp.pick}` }, `+${MD.QUOTE_BOOST} ${sp.pick === 'aura' ? 'AURA' : 'CHAOS'} for your roster · weeks ${m.week + 1}–${m.week + MD.QUOTE_WEEKS}`));
        return;
      }
      // Older v0.16.0 issues may still be waiting on a choice: run the Aura quote.
      if (true) { fill(box, h('blockquote', { class: 'osm-quote' }, sp.quotes.aura, cite())); return; }
      const opt = (stat, label) => h('button', { class: `osm-qopt is-${stat}`, onClick: async (e) => {
        e.stopPropagation();
        if (!MD.chooseQuote(L, m, stat)) return;
        sfx.play('pick'); await save(); draw();
        toast(`+${MD.QUOTE_BOOST} ${label} for your roster until the next issue.`);
      } }, h('span', { class: 'osm-qlabel' }, `${label.toUpperCase()} QUOTE · +${MD.QUOTE_BOOST} ${label.toUpperCase()} FOR ${MD.QUOTE_WEEKS} WEEKS`), h('span', { class: 'osm-qtext' }, sp.quotes[stat]));
      fill(box, h('p', { class: 'osm-qhead' }, `WHAT DO YOU TELL OSM? (THE TEAM IS ${({ hot: 'ON A HEATER', winning: 'WINNING', even: 'EVEN', losing: 'LOSING', cold: 'IN A SLUMP' })[sp.mood] || 'WATCHING'})`),
        opt('aura', 'Aura'), opt('chaos', 'Chaos'));
    };
    draw();
    box.addEventListener('pointerdown', (e) => e.stopPropagation());
    box.addEventListener('pointerup', (e) => e.stopPropagation());
    return box;
  }

  // ---------- The season review issue ----------
  function reviewPages(m) {
    const P = (pid) => (pid != null ? L.players[pid] : null);
    const r = m.row; const champ = team(r.champion); const ru = team(r.runnerUp);
    const page = (cls, ...kids) => h('article', { class: `osm-page ${cls}` }, ...kids);
    const folio = (n) => h('p', { class: 'osm-folio' }, `OSM · SEASON ${m.season} IN REVIEW · ${n}`);
    const cs = P(m.champStars[0]);
    const pages = [];
    pages.push(page('osm-cover osm-review-cover', tinted(champ, champ, 'dy-arena osm-cover-bg'),
      h('p', { class: 'osm-mast' }, 'OSM'),
      h('p', { class: 'osm-sub' }, `SEASON ${m.season} IN REVIEW · THE ZENITH CLASH ISSUE`),
      h('div', { class: 'osm-review-grail' }, trophy('The Celestial Grail', 250)),
      cs ? h('div', { class: 'osm-cover-star' }, pAvatar(cs, 'card')) : null,
      h('div', { class: 'osm-cover-text' }, h('p', { class: 'osm-kicker' }, 'CHAMPIONS'), h('h2', { class: 'osm-headline' }, champ.name.toUpperCase()), h('p', { class: 'osm-dek' }, m.cover.line)),
      h('ul', { class: 'osm-teasers' }, m.teasers.map((t) => h('li', {}, t))),
      crest(champ, 56)));
    pages.push(page('', h('p', { class: 'osm-section' }, 'THE ZENITH CLASH'),
      h('div', { class: 'osm-clash' }, crest(champ, 110), h('div', { class: 'osm-clash-score' }, h('p', { class: 'osm-rank' }, `${r.score[0]}–${r.score[1]}`), trophy('The Celestial Grail', 120)), crest(ru, 110)),
      h('p', { class: 'osm-intro' }, `${champ.name} (${r.record}) beat ${ru.name} for the Celestial Grail. Head coach: ${r.coach}.`),
      h('p', { class: 'osm-section osm-section-sm' }, 'THE CHAMPIONS\' STARS'),
      h('ul', { class: 'osm-potm' }, m.champStars.map((pid) => { const p = P(pid); return p ? h('li', {}, h('div', { class: 'osm-potm-pic' }, pAvatar(p, 'card')), h('p', { class: 'heading' }, p.name), h('p', { class: 'caption muted' }, `${p.role} · ${fmt(p.stats.dmg)} dmg · ${p.stats.ko} KOs`)) : null; })),
      folio(2)));
    const gpp = P(r.prodigy);
    pages.push(page('', h('p', { class: 'osm-section' }, 'AWARDS NIGHT'),
      h('div', { class: 'osm-race-top' }, trophy(R.AWARDS.prodigy, 180, 'dy-trophy osm-gpp'),
        h('div', {}, h('p', { class: 'label-spaced' }, 'GENERATIONAL PLAYER TROPHY'), gpp ? h('div', { class: 'osm-potm-pic osm-gpp-pic' }, pAvatar(gpp, 'card')) : null, h('p', { class: 'heading' }, r.prodigyName), h('p', { class: 'caption muted' }, team(r.prodigyTeam)?.name || ''))),
      h('ul', { class: 'osm-awards' }, [...R.ROLES.map((x) => [R.AWARDS[x], r.roleAwards?.[x]]), [R.AWARDS.awakening, r.awakening], [R.AWARDS.phoenix, r.phoenix]].filter(([, pid]) => pid != null).map(([name, pid]) => { const p = P(pid); return h('li', {}, trophy(name, 54), h('span', { class: 'dy-list-text' }, h('span', { class: 'heading' }, p ? p.name : '—'), h('span', { class: 'caption muted' }, name))); }),
        h('li', {}, trophy(R.AWARDS.coach, 54), h('span', { class: 'dy-list-text' }, h('span', { class: 'heading' }, team(r.coachOfYear).coachName), h('span', { class: 'caption muted' }, `${R.AWARDS.coach} · ${team(r.coachOfYear).name}`)))),
      folio(3)));
    pages.push(page('', h('p', { class: 'osm-section' }, 'DIVISIONS & RIVALRIES'),
      h('ul', { class: 'osm-awards' }, r.divisions.map((i) => h('li', {}, trophy(R.DIV_TROPHY[team(i).div], 54), h('span', { class: 'dy-list-text' }, h('span', { class: 'heading' }, team(i).name), h('span', { class: 'caption muted' }, `${R.DIV_TROPHY[team(i).div]} · ${R.DIVISIONS[team(i).div]} Division`))))),
      h('ul', { class: 'osm-rivals' }, Object.entries(r.rivals).map(([name, holder]) => h('li', {}, trophy(name, 80, 'dy-trophy osm-rival-trophy'), h('p', { class: 'heading' }, name), h('p', { class: 'caption gold' }, `Kept by ${team(holder).abbr}`)))),
      h('p', { class: 'osm-intro' }, `Best record: ${team(m.best).name} (${team(m.best).w}-${team(m.best).l}). Bottom of the table: ${team(m.worst).name}.`),
      folio(4)));
    const t = me(); const mine = m.mine;
    pages.push(page('osm-spot', tinted(t, t, 'dy-arena osm-spot-bg'),
      h('p', { class: 'osm-section' }, `YOUR SEASON · ${team(mine?.team ?? t.i).name.toUpperCase()}`),
      mine ? h('h2', { class: 'osm-headline osm-headline-sm' }, `${mine.w}-${mine.l}${mine.champion ? ' · CHAMPIONS' : mine.playoffs ? ' · PLAYOFFS' : ''}`) : null,
      mine ? h('p', { class: 'osm-body' }, `${mine.champion ? 'You won it all.' : mine.playoffs ? 'You made the playoffs.' : 'You missed the playoffs.'} The front office says you ${mine.met ? 'met' : 'missed'} expectations. Job security: ${L.user.security}.`) : null,
      h('p', { class: 'osm-section osm-section-sm' }, 'BIGGEST AURA RISERS · IT CARRIES INTO NEXT SEASON'),
      h('ol', { class: 'osm-power' }, m.auraTop.map((x, i) => { const p = P(x.pid); return p ? h('li', {}, h('span', { class: 'osm-rank' }, String(i + 1)), pAvatar(p), h('span', { class: 'dy-list-text' }, h('span', { class: 'heading' }, p.name), h('span', { class: 'caption muted' }, x.team != null ? team(x.team).name : '')), h('span', { class: 'dy-num gold' }, `${x.aura}${x.gain ? ` (+${x.gain})` : ''}`)) : null; })),
      h('p', { class: 'osm-next' }, 'SEE YOU IN THE OFF-SEASON'),
      folio(5)));
    return pages;
  }

  function preseasonPages(m) {
    const P = (pid) => (pid != null ? L.players[pid] : null);
    const page = (cls, ...kids) => h('article', { class: `osm-page ${cls}` }, ...kids);
    const folio = (n) => h('p', { class: 'osm-folio' }, `OSM · SEASON ${m.season} PRESEASON · ${n}`);
    const fav = team(m.cover.team); const cs = P(m.cover.pid);
    const [a, b] = m.clash.map(team);
    const pages = [];
    pages.push(page('osm-cover', tinted(fav, fav, 'dy-arena osm-cover-bg'),
      h('p', { class: 'osm-mast' }, 'OSM'),
      h('p', { class: 'osm-sub' }, `SEASON ${m.season} PRESEASON ISSUE · WHO WINS IT ALL?`),
      cs ? h('div', { class: 'osm-cover-star' }, pAvatar(cs, 'card')) : null,
      h('div', { class: 'osm-cover-text' }, h('p', { class: 'osm-kicker' }, 'THE FAVORITES'), h('h2', { class: 'osm-headline' }, fav.name.toUpperCase()), h('p', { class: 'osm-dek' }, m.cover.line)),
      h('ul', { class: 'osm-teasers' }, m.teasers.map((t) => h('li', {}, t))),
      crest(fav, 56)));
    pages.push(page('', h('p', { class: 'osm-section' }, 'PRESEASON POWER 10'),
      h('p', { class: 'osm-intro' }, 'Ranked by roster strength before a single fight.'),
      h('ol', { class: 'osm-power' }, m.power.map((x, i) => h('li', { class: me().i === x.team ? 'is-me' : '' }, h('span', { class: 'osm-rank' }, String(i + 1)), crest(team(x.team), 36),
        h('span', { class: 'dy-list-text' }, h('span', { class: 'heading' }, team(x.team).name), h('span', { class: 'caption muted' }, `${R.STAGE_LABEL[x.stage]} · coach ${team(x.team).coachName}`)), h('span', { class: 'dy-num' }, String(x.s))))),
      folio(2)));
    pages.push(page('', h('p', { class: 'osm-section' }, 'OUR PICKS'),
      h('ul', { class: 'osm-awards' }, m.divPicks.map((i) => h('li', {}, trophy(R.DIV_TROPHY[team(i).div], 54), h('span', { class: 'dy-list-text' }, h('span', { class: 'heading' }, team(i).name), h('span', { class: 'caption muted' }, `Wins the ${R.DIVISIONS[team(i).div]} Division`))))),
      h('p', { class: 'osm-section osm-section-sm' }, 'THE ZENITH CLASH PICK'),
      h('div', { class: 'osm-clash' }, crest(a, 96), h('div', { class: 'osm-clash-score' }, trophy('The Celestial Grail', 110), h('p', { class: 'caption muted' }, `${a.abbr} over ${b.abbr}`)), crest(b, 96)),
      h('p', { class: 'osm-section osm-section-sm' }, 'GPT FAVORITES'),
      h('ol', { class: 'osm-power' }, m.gpt.map((pid, i) => { const p = P(pid); return p ? h('li', {}, h('span', { class: 'osm-rank' }, String(i + 1)), pAvatar(p), h('span', { class: 'dy-list-text' }, h('span', { class: 'heading' }, p.name), h('span', { class: 'caption muted' }, `${p.role} · ${p.team != null ? team(p.team).name : ''}`)), h('span', { class: 'dy-num gold' }, String(p.power))) : null; })),
      folio(3)));
    pages.push(page('', h('p', { class: 'osm-section' }, 'THE OFF-SEASON'),
      m.moves.length ? h('ul', { class: 'osm-news' }, m.moves.map((n) => h('li', {}, crest(team(n.team), 30), h('span', { class: 'dy-list-text' }, h('span', { class: 'caption muted' }, n.kind), h('span', { class: 'heading' }, n.title))))) : h('p', { class: 'osm-intro' }, 'A quiet off-season around the AFL.'),
      m.rookies.length ? h('p', { class: 'osm-section osm-section-sm' }, 'ROOKIES TO WATCH') : null,
      m.rookies.length ? h('ul', { class: 'osm-potm' }, m.rookies.map((pid) => { const p = P(pid); return p ? h('li', {}, h('div', { class: 'osm-potm-pic' }, pAvatar(p, 'card')), h('p', { class: 'heading' }, p.name), h('p', { class: 'caption muted' }, `No. ${p.draftPick} pick · ${p.role} · ${p.team != null ? team(p.team).abbr : ''}`)) : null; })) : null,
      folio(4)));
    const mine = m.mine; const t = mine ? team(mine.team) : me();
    const pct = mine ? Math.round(100 * (1 - (mine.rank - 1) / (L.teams.length - 1))) : 0;
    pages.push(page('osm-spot', tinted(t, t, 'dy-arena osm-spot-bg'),
      h('p', { class: 'osm-section' }, `YOUR OUTLOOK · ${t.name.toUpperCase()}`),
      mine ? h('h2', { class: 'osm-headline osm-headline-sm' }, `RANKED NO. ${mine.rank} OF ${L.teams.length}`) : null,
      mine ? h('p', { class: 'osm-body' }, `${mine.rank <= 4 ? 'The experts have you in the hunt for the Grail.' : mine.rank <= 12 ? 'A playoff push is realistic if the stars show up.' : mine.rank <= 20 ? 'The middle of the pack. Somebody has to surprise.' : 'Nobody expects much. Prove them wrong.'} The front office wants: ${mine.expect === 'contender' ? 'a playoff spot' : mine.expect === 'few' ? '7 wins or the playoffs' : 'more wins than last season'}. Job security: ${mine.security}.`) : null,
      mine ? h('div', { class: 'osm-meter' }, h('span', { style: `width:${pct}%` })) : null,
      h('p', { class: 'osm-next' }, 'WEEK 1 IS HERE'),
      folio(5)));
    return pages;
  }

  // The coach's face: their photo, else their player icon, else the crest.
  function coachFace(photo, t) {
    if (photo) return h('img', { src: photo, alt: '', class: 'osm-coach-img' });
    const ic = characters.get(profile.value.iconId);
    return ic ? avatar(ic, characters, 'card') : crest(t, 140);
  }
  async function openMag(m) {
    stopTimers();
    m.read = true; save();
    const pages = m.preseason ? preseasonPages(m) : m.review ? reviewPages(m) : m.legacy ? [legacyCover(m.lg, (await loadPhotos()).coach), h('article', { class: 'osm-page osm-legacy-inner' }, h('p', { class: 'osm-section' }, 'THE CAREER'),
      h('ul', { class: 'osm-power' }, m.lg.teams.map((x) => h('li', {}, h('img', { src: `art/afl/crests/${x.crest}.webp`, alt: '', style: 'width:36px;height:36px' }), h('span', { class: 'dy-list-text' }, h('span', { class: 'heading' }, x.name), h('span', { class: 'caption muted' }, `${x.seasons} season${x.seasons === 1 ? '' : 's'}`))))),
      h('p', { class: 'osm-intro' }, `${m.lg.w}-${m.lg.l} · ${m.lg.titles} Grail${m.lg.titles === 1 ? '' : 's'} · ${m.lg.playoffs} playoff trips. The legends are gone. The New Era starts now.`),
      h('p', { class: 'osm-mast osm-mast-sm' }, 'OSM'))] : magPages(m, (await loadPhotos()).coach);
    const wide = () => window.innerWidth / (window.__uiZoom || 1) >= 1000;
    // Spreads: the cover alone, then pairs (on wide screens).
    const spreads = () => (wide() ? [[0], ...Array.from({ length: Math.ceil((pages.length - 1) / 2) }, (_, k) => [1 + k * 2, 2 + k * 2].filter((i) => i < pages.length))] : pages.map((_, i) => [i]));
    let sp = spreads(); let at = 0; let busy = false;
    const book = h('div', { class: 'osm-book' });
    const count = h('p', { class: 'caption muted osm-count', 'aria-live': 'polite' });
    const prev = h('button', { class: 'btn btn-secondary', onClick: () => turn(-1) }, '‹ Back');
    const next = h('button', { class: 'btn btn-primary', onClick: () => turn(1) }, 'Next ›');
    const paint = () => {
      fill(book, sp[at].map((i) => pages[i]));
      book.classList.toggle('is-spread', sp[at].length > 1);
      count.textContent = sp[at].length > 1 ? `Pages ${sp[at][0] + 1}–${sp[at][1] + 1} of ${pages.length}` : `Page ${sp[at][0] + 1} of ${pages.length}`;
      prev.disabled = at === 0; next.textContent = at === sp.length - 1 ? 'Close' : 'Next ›';
    };
    const reduce = () => document.documentElement.classList.contains('reduce-motion') || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function turn(d) {
      if (busy) return;
      sfx.play('flip');
      if (d > 0 && at === sp.length - 1) { close(); return; }
      const to = at + d; if (to < 0 || to >= sp.length) return;
      if (reduce()) { at = to; paint(); return; }
      busy = true;
      book.classList.add(d > 0 ? 'turn-out-next' : 'turn-out-prev');
      setTimeout(() => {
        at = to; paint();
        book.classList.remove('turn-out-next', 'turn-out-prev');
        book.classList.add(d > 0 ? 'turn-in-next' : 'turn-in-prev');
        setTimeout(() => { book.classList.remove('turn-in-next', 'turn-in-prev'); busy = false; }, 260);
      }, 230);
    }
    let x0 = null;
    book.addEventListener('pointerdown', (e) => { x0 = e.clientX; });
    book.addEventListener('pointerup', (e) => { if (x0 == null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 50) turn(dx < 0 ? 1 : -1); });
    const onKey = (e) => { if (e.key === 'ArrowRight') turn(1); else if (e.key === 'ArrowLeft') turn(-1); else if (e.key === 'Escape') close(); };
    const onResize = () => { const first = sp[at][0]; sp = spreads(); at = Math.max(0, sp.findIndex((s) => s.includes(first))); paint(); };
    document.addEventListener('keydown', onKey); window.addEventListener('resize', onResize);
    function close() { document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); tab = 'media'; drawHub(); }
    const prevCleanup = root._cleanup;
    root._cleanup = () => { document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); prevCleanup(); root._cleanup = prevCleanup; };
    fill(root, header(m.preseason ? `OSM · SEASON ${m.season} PRESEASON` : m.review ? `OSM · SEASON ${m.season} IN REVIEW` : m.legacy ? 'OSM · THE FINAL ISSUE' : `OSM · SEASON ${m.season} · ISSUE ${m.issue}`, close),
      h('div', { class: 'osm-reader' }, book, h('div', { class: 'osm-controls' }, prev, count, next)));
    paint();
  }

  // ---------- The Museum ----------
  const museum = { view: 'champions' };
  function drawMuseum() {
    const views = [['champions', 'CHAMPIONS'], ['awards', 'AWARD WINNERS'], ['rivalries', 'RIVALRY TROPHIES'], ['pantheon', 'GENERATIONAL PANTHEON'], ['records', 'RECORD BOOK']];
    const rows = L.history;
    const P = (pid) => (pid != null ? L.players[pid] : null);
    let body;
    if (museum.view === 'champions') {
      body = h('ul', { class: 'dy-museum' }, rows.map((r) => {
        const c = team(r.champion); const mine = L.user.career.some((x) => x.season === r.season && x.team === r.champion);
        const gpp = P(r.prodigy);
        return h('li', { class: `dy-mrow${mine ? ' is-mine' : ''}` },
          h('span', { class: 'dy-mseason' }, h('span', { class: 'label-spaced' }, 'SEASON'), h('span', { class: 'stat' }, String(r.season))),
          h('span', { class: 'dy-mchamp' }, trophy('The Celestial Grail', 54), crest(c, 44), h('span', { class: 'dy-list-text' }, h('span', { class: 'heading' }, c.name), h('span', { class: 'caption muted' }, `${r.record} · ${r.coach}${mine ? ' (you)' : ''}`))),
          h('span', { class: 'dy-mscore' }, h('span', { class: 'dy-num' }, `${r.score[0]}–${r.score[1]}`), h('span', { class: 'caption muted' }, `over ${team(r.runnerUp).abbr}`)),
          h('span', { class: 'dy-mgpp' }, gpp ? pAvatar(gpp) : null, h('span', { class: 'dy-list-text' }, h('span', {}, r.prodigyName), h('span', { class: 'caption muted' }, `GPT · ${team(r.prodigyTeam)?.abbr || ''}`))),
          h('span', { class: 'dy-mdivs', title: 'Division winners' }, (r.divisions || []).map((i) => crest(team(i), 24))));
      }));
    } else if (museum.view === 'awards') {
      body = h('ul', { class: 'dy-museum' }, rows.map((r) => h('li', { class: 'dy-mrow dy-mawards' },
        h('span', { class: 'dy-mseason' }, h('span', { class: 'label-spaced' }, 'SEASON'), h('span', { class: 'stat' }, String(r.season))),
        h('ul', { class: 'dy-mawards-list' }, [['prodigy', r.prodigy], ...R.ROLES.map((x) => [x, r.roleAwards?.[x]]), ['awakening', r.awakening], ['phoenix', r.phoenix]].filter(([, pid]) => pid != null).map(([k, pid]) => {
          const p = P(pid); return h('li', {}, trophy(R.AWARDS[k], 40), p ? pAvatar(p) : null, h('span', { class: 'dy-list-text' }, h('span', {}, p ? p.name : '—'), h('span', { class: 'caption muted' }, R.AWARDS[k])));
        }), h('li', {}, trophy(R.AWARDS.coach, 40), crest(team(r.coachOfYear), 32), h('span', { class: 'dy-list-text' }, h('span', {}, team(r.coachOfYear).coachName), h('span', { class: 'caption muted' }, R.AWARDS.coach)))))));
    } else if (museum.view === 'rivalries') {
      body = h('ul', { class: 'dy-awards-grid dy-mrivals' }, MD.rivalryBook(L).map((r) => h('li', {}, trophy(r.name, 120),
        h('p', { class: 'heading' }, r.name),
        h('div', { class: 'dy-mriv-score' }, crest(team(r.a), 32), h('span', { class: 'stat' }, `${r.won[r.a]}–${r.won[r.b]}`), crest(team(r.b), 32)),
        h('p', { class: 'caption muted' }, 'Seasons held at the final whistle'),
        h('p', { class: `caption ${r.holder != null ? 'gold' : 'muted'}` }, r.holder != null ? `Now: ${team(r.holder).name}` : 'Not played yet'))));
    } else if (museum.view === 'pantheon') {
      const pan = (L.pantheon || []).slice().sort((a, b) => b.season - a.season || b.power - a.power);
      body = pan.length ? h('ul', { class: 'dy-pantheon-grid' }, pan.map((x) => h('li', {}, h('div', { class: 'osm-potm-pic' }, pAvatar(x, 'card')),
        h('p', { class: 'heading' }, x.name), h('p', { class: 'caption gold' }, `Power ${x.power}`), h('p', { class: 'caption muted' }, `${x.series} · ${x.seasons} seasons · retired season ${x.season}${x.team != null ? ` · ${team(x.team).abbr}` : ''}`))))
        : h('p', { class: 'body-text' }, 'Nobody yet. Cards who retire at 95+ Power are enshrined here.');
    } else {
      const tb = MD.titleBoard(L); const gb = MD.gppBoard(L); const u = L.user;
      const cw = u.career.reduce((n, c) => n + c.w, 0); const cl = u.career.reduce((n, c) => n + c.l, 0);
      body = h('div', { class: 'dy-media-grid' },
        h('section', { class: 'dy-panel' }, h('div', { class: 'dy-h-trophy' }, trophy('The Celestial Grail', 56), h('h2', { class: 'dy-h' }, 'MOST CELESTIAL GRAILS')),
          h('ol', { class: 'dy-list' }, tb.map((x) => h('li', {}, crest(team(x.team), 32), h('span', { class: 'dy-list-text' }, team(x.team).name), h('span', { class: 'dy-num gold' }, String(x.n)))))),
        h('section', { class: 'dy-panel' }, h('div', { class: 'dy-h-trophy' }, trophy(R.AWARDS.prodigy, 56), h('h2', { class: 'dy-h' }, 'MOST GPT AWARDS')),
          h('ol', { class: 'dy-list' }, gb.map((x) => { const p = P(x.pid); return p ? h('li', {}, pAvatar(p), h('span', { class: 'dy-list-text' }, p.name), h('span', { class: 'dy-num gold' }, String(x.n))) : null; }))),
        h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h' }, 'THE RECORD BOOK'),
          h('dl', { class: 'dy-bio' }, [...MD.recordBook(L), ['Your career', `${cw}-${cl} · ${u.career.filter((c) => c.champion).length} titles · ${u.career.filter((c) => c.playoffs).length} playoff trips`]]
            .map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v))))));
    }
    shell(h('div', { class: 'dy-content' },
      h('section', { class: 'dy-panel dy-museum-head' }, trophy('The Celestial Grail', 90, 'dy-trophy dy-grail'),
        h('div', {}, h('p', { class: 'label-spaced gold' }, 'THE AFL MUSEUM'), h('h2', { class: 'display-md' }, 'HALL OF CHAMPIONS'),
          h('p', { class: 'caption muted' }, `Every Zenith Clash, every Celestial Grail, every Generational Player Trophy. ${rows.length} season${rows.length === 1 ? '' : 's'} on record.`))),
      h('div', { class: 'dy-chips', role: 'group', 'aria-label': 'Museum rooms' }, views.map(([id, label]) => h('button', { class: `dy-chip${museum.view === id ? ' is-on' : ''}`, 'aria-pressed': museum.view === id ? 'true' : 'false', onClick: () => { museum.view = id; drawMuseum(); } }, label))),
      body));
  }

  // ---------- Coach office: photo, wall, trophy shelf ----------
  const photoKey = () => `dynasty:photos:slot${slot}`;
  async function loadPhotos() { return (await store.get(photoKey(), null)) || { coach: null, wall: [null, null, null, null, null, null] }; }
  function pickPhoto() {
    return new Promise((resolve) => {
      const input = h('input', { type: 'file', accept: 'image/*', class: 'visually-hidden' });
      input.addEventListener('change', () => {
        const f = input.files && input.files[0]; input.remove();
        if (!f) { resolve(null); return; }
        const url = URL.createObjectURL(f); const img = new Image();
        img.onload = () => {
          const s = Math.min(1, 720 / Math.max(img.width, img.height));
          const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.82));
        };
        img.onerror = () => { URL.revokeObjectURL(url); toast('That picture could not be opened.'); resolve(null); };
        img.src = url;
      });
      document.body.append(input); input.click();
    });
  }
  async function editPhoto(which, i) {
    const ph = await loadPhotos();
    const has = which === 'coach' ? ph.coach : ph.wall[i];
    const set = async (v) => { if (which === 'coach') ph.coach = v; else ph.wall[i] = v; await store.set(photoKey(), ph); drawCoach(); };
    if (!has) { const d = await pickPhoto(); if (d) await set(d); return; }
    const s = sheet({ title: which === 'coach' ? 'COACH PHOTO' : 'OFFICE WALL', content: h('div', { class: 'btn-row' },
      h('button', { class: 'btn btn-primary', onClick: async () => { s.close(); const d = await pickPhoto(); if (d) await set(d); } }, 'Replace'),
      h('button', { class: 'btn btn-secondary', onClick: async () => { s.close(); await set(null); } }, 'Remove')) });
  }

  async function drawCoach() {
    const u = L.user; const t = me();
    const ph = await loadPhotos();
    if (tab !== 'coach') return;
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
    const icon = characters.get(profile.value.iconId);
    const shelf = MD.trophyShelf(L);
    const live = L.phase === 'season' || L.phase === 'playoffs';
    const cw = u.career.reduce((n, c) => n + c.w, 0) + (live ? t.w : 0); const cl = u.career.reduce((n, c) => n + c.l, 0) + (live ? t.l : 0);
    shell(h('div', { class: 'dy-content' },
      h('div', { class: 'dy-coach' },
        h('section', { class: 'dy-panel dy-coach-card' },
          h('button', { class: 'dy-coach-photo', onClick: () => editPhoto('coach'), 'aria-label': ph.coach ? 'Change coach photo' : 'Add a coach photo' },
            ph.coach ? h('img', { src: ph.coach, alt: '' }) : icon ? avatar(icon, characters, 'lg') : h('span', { class: 'dy-add' }, '+ ADD PHOTO')),
          h('div', { class: 'dy-coach-id' },
            h('p', { class: 'label-spaced gold' }, `HEAD COACH · ${t.name.toUpperCase()}`),
            h('h2', { class: 'display-md' }, u.coach.toUpperCase()),
            h('div', { class: 'dy-coach-stats' }, [['RECORD', `${t.w}-${t.l}`], ['CAREER', `${cw}-${cl}`], ['TITLES', String(u.career.filter((c) => c.champion).length)], ['SECURITY', u.security]]
              .map(([k, v]) => h('div', {}, h('p', { class: 'label-spaced' }, k), h('p', { class: 'heading' }, v))))),
          h('dl', { class: 'dy-bio' }, [
            ['Origin', qbio('origin')], ['Style', qbio('style')], ['Old career', qbio('career')], ['Favorite anime', qbio('anime')], ['Chasing', qbio('chasing')],
            ['Rival', rivalLine], ['Expectation', R.EXPECT_LABEL[u.expect]],
          ].map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v)))),
          h('h3', { class: 'dy-h' }, 'PERKS'),
          h('ul', { class: 'dy-perks' }, perks.map((p) => h('li', {}, p)))),
        h('div', { class: 'dy-office-right' },
          h('section', { class: 'dy-panel' },
            h('h2', { class: 'dy-h' }, 'THE OFFICE WALL'),
            h('p', { class: 'caption muted' }, 'Tap a frame to hang a picture from your phone. Pictures stay on this device, in this save.'),
            h('ul', { class: 'dy-wall' }, ph.wall.map((src, i) => h('li', {}, h('button', { class: `dy-frame${src ? '' : ' is-empty'}`, onClick: () => editPhoto('wall', i), 'aria-label': src ? `Change picture ${i + 1}` : `Add picture ${i + 1}` },
              src ? h('img', { src, alt: '' }) : h('span', { class: 'dy-add' }, '+ ADD')))))),
          h('section', { class: 'dy-panel dy-shelf-panel' },
            h('h2', { class: 'dy-h' }, 'TROPHY SHELF'),
            shelf.length ? h('ul', { class: 'dy-shelf' }, shelf.map((x) => h('li', { class: x.big ? 'is-big' : '' }, trophy(x.name, x.big ? 130 : 96) || h('span', { class: 'dy-trophy-ph', 'aria-hidden': 'true' }, '★'), h('p', { class: 'caption' }, x.name), h('p', { class: 'caption muted' }, x.why))))
              : h('p', { class: 'caption muted' }, 'Trophies you win land here on their own: division titles, rivalry trophies, your players\' awards and the Celestial Grail.')))),
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

  // ---------- The end of an era (v0.13.0) ----------
  const archiveFace = (x, size = 'md') => { const c = characters.get(x.cid); return c ? avatar(c, characters, size) : null; };

  function legacyCover(lg, photo) {
    const t = me();
    return h('article', { class: 'osm-page osm-cover osm-legacy-cover' },
      tinted(t, t, 'dy-arena osm-cover-bg'),
      h('p', { class: 'osm-mast' }, 'OSM'),
      h('p', { class: 'osm-sub' }, `OTAKU SPORTS MAGAZINE · THE FINAL ISSUE OF AN ERA · SEASON ${lg.finishedSeason}`),
      h('div', { class: 'osm-cover-star osm-coach-star' }, photo ? h('img', { src: photo, alt: '' }) : (characters.get(profile.value.iconId) ? avatar(characters.get(profile.value.iconId), characters, 'card') : crest(t, 160))),
      h('div', { class: 'osm-cover-text' },
        h('p', { class: 'osm-kicker' }, 'COACH OF AN ERA'),
        h('h2', { class: 'osm-headline' }, lg.coach.toUpperCase()),
        h('p', { class: 'osm-dek' }, `${lg.seasons} seasons. ${lg.titles} Celestial Grail${lg.titles === 1 ? '' : 's'}. The coach who saw the legends out.`)),
      h('ul', { class: 'osm-teasers' }, [`${lg.w}-${lg.l} career record`, `${lg.playoffs} playoff trip${lg.playoffs === 1 ? '' : 's'}`, `${lg.trophies.length} trophies on the shelf`].map((x) => h('li', {}, x))),
      crest(t, 56));
  }

  function legacyBody(lg) {
    return [
      h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h' }, 'THE CAREER'),
        h('div', { class: 'dy-legacy-stats' }, [['SEASONS', lg.seasons], ['RECORD', `${lg.w}-${lg.l}`], ['GRAILS', lg.titles], ['PLAYOFFS', lg.playoffs], ['TROPHIES', lg.trophies.length]]
          .map(([k, v]) => h('div', {}, h('p', { class: 'label-spaced' }, k), h('p', { class: 'stat' }, String(v))))),
        h('div', { class: 'dy-legacy-teams' }, lg.teams.map((x) => h('span', { class: 'dy-legacy-team' }, h('img', { src: `art/afl/crests/${x.crest}.webp`, alt: '', class: 'dy-crest', style: 'width:32px;height:32px' }), `${x.name} · ${x.seasons} season${x.seasons === 1 ? '' : 's'}`)))),
      lg.trophies.length ? h('section', { class: 'dy-panel dy-shelf-panel' }, h('h2', { class: 'dy-h' }, 'THE TROPHY SHELF'),
        h('ul', { class: 'dy-shelf' }, lg.trophies.map((x) => h('li', { class: x.name === 'The Celestial Grail' ? 'is-big' : '' }, trophy(x.name, x.name === 'The Celestial Grail' ? 130 : 90), h('p', { class: 'caption' }, x.name), h('p', { class: 'caption muted' }, x.why))))) : null,
      lg.best.length ? h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h' }, 'THE BEST YOU COACHED'),
        h('ul', { class: 'dy-list' }, lg.best.map((x) => h('li', {}, archiveFace(x, 'md'), h('span', { class: 'dy-list-text' }, h('span', { class: 'heading' }, x.name), h('span', { class: 'caption muted' }, `${x.role} · ${x.series} · ${x.seasons} season${x.seasons === 1 ? '' : 's'} with you · ${fmt(x.dmg)} dmg · ${x.ko} KOs`)))))) : null,
      lg.pantheon.length ? h('section', { class: 'dy-panel dy-pantheon' }, h('h2', { class: 'dy-h gold' }, 'YOUR PANTHEON MEMBERS'),
        h('ul', { class: 'dy-list' }, lg.pantheon.map((x) => h('li', {}, archiveFace(x), h('span', { class: 'dy-list-text' }, x.name), h('span', { class: 'dy-num gold' }, String(x.power)))))) : null,
    ];
  }

  async function offLegacy() {
    if (!L.complete) {
      sfx.play('farewell');
      const lg = LG.completeDynasty(L);
      const arch = (await store.get(LG.ARCHIVE_KEY, null)) || [];
      if (!arch.some((x) => x.id === lg.id)) { arch.unshift(lg); await store.set(LG.ARCHIVE_KEY, arch.slice(0, 30)); }
      await save();
    }
    const lg = L.legacy;
    const ph = await loadPhotos();
    const lastP = (L.lastLegends || []).map((pid) => L.players[pid]).filter(Boolean);
    offFrame('END OF AN ERA', h('div', { class: 'dy-off-body' },
      h('section', { class: 'dy-panel dy-legacy-hero' },
        h('p', { class: 'label-spaced gold' }, 'THE LAST LEGENDS'),
        h('h2', { class: 'display-md' }, 'THE ERA IS OVER'),
        h('p', { class: 'body-text' }, `${lastP[0] ? lastP[0].name : 'The last legend'} has retired. Every original AFL character has now called it a career, and the league belongs to a new generation.`),
        lastP.length ? h('ul', { class: 'dy-farewell' }, lastP.slice(0, 6).map((p) => h('li', {}, h('div', { class: 'osm-potm-pic' }, pAvatar(p, 'card')), h('p', { class: 'heading' }, p.name), h('p', { class: 'caption muted' }, `${p.series} · ${p.career} seasons · Power ${p.power}`)))) : null),
      h('div', { class: 'dy-legacy-cover' }, legacyCover(lg, ph.coach)),
      ...legacyBody(lg),
      h('section', { class: 'dy-panel' }, h('h2', { class: 'dy-h' }, 'THE NEW ERA'),
        h('p', { class: 'body-text' }, 'Your dynasty is complete and saved to the Hall of Coaches. Keep going with this save as long as you like: the league carries on with made-up characters only.'),
        h('p', { class: 'caption muted' }, `Your legacy also carries into new saves: you can take any job, the hire makes headlines, and free agents want to play for you.${lg.titles >= 2 ? ' With 2+ Grails, you also get one extra season before the hot seat.' : ''}`))),
    nextBtn('Begin the New Era'));
  }

  // ---------- Hall of Coaches (from the save-slot screen) ----------
  async function drawHall() {
    const arch = (await store.get(LG.ARCHIVE_KEY, null)) || [];
    const cab = LG.cabinet(arch); const rep = LG.reputation(arch);
    fill(root, header('HALL OF COACHES', drawSlots),
      h('div', { class: 'dy-wrap' },
        h('section', { class: 'dy-panel' },
          h('p', { class: 'label-spaced gold' }, 'YOUR LEGACY'),
          h('p', { class: 'heading' }, `${rep.dynasties} completed dynast${rep.dynasties === 1 ? 'y' : 'ies'} · ${rep.titles} Celestial Grail${rep.titles === 1 ? '' : 's'}`),
          h('p', { class: 'caption muted' }, `New saves: take any job · big-name hire · free agents +${LG.faPull(rep)} interest${LG.securityGrace(rep) ? ' · one extra season before the hot seat' : ''}.`)),
        cab.length ? h('section', { class: 'dy-panel dy-shelf-panel' }, h('h2', { class: 'dy-h' }, 'ALL-TIME TROPHY CABINET'),
          h('ul', { class: 'dy-shelf' }, cab.map((x) => h('li', {}, trophy(x.name, 90), h('p', { class: 'caption' }, x.name), h('p', { class: 'caption gold' }, `× ${x.n}`))))) : null,
        arch.map((lg) => h('section', { class: 'dy-panel dy-hall-entry' },
          h('div', { class: 'dy-hall-head' },
            h('div', {}, h('p', { class: 'label-spaced gold' }, `FINISHED ${lg.date} · ${lg.seasons} SEASONS`), h('h2', { class: 'display-md' }, lg.coach.toUpperCase())),
            h('div', { class: 'dy-legacy-stats' }, [['RECORD', `${lg.w}-${lg.l}`], ['GRAILS', lg.titles], ['PLAYOFFS', lg.playoffs]].map(([k, v]) => h('div', {}, h('p', { class: 'label-spaced' }, k), h('p', { class: 'stat' }, String(v)))))),
          h('div', { class: 'dy-legacy-teams' }, lg.teams.map((x) => h('span', { class: 'dy-legacy-team' }, h('img', { src: `art/afl/crests/${x.crest}.webp`, alt: '', class: 'dy-crest', style: 'width:28px;height:28px' }), x.name))),
          lg.best.length ? h('ul', { class: 'dy-hall-best' }, lg.best.map((x) => h('li', {}, archiveFace(x, 'sm'), h('span', { class: 'caption' }, x.name)))) : null,
          lg.lastLegends?.length ? h('p', { class: 'caption muted' }, `Saw out the last legends: ${lg.lastLegends.map((x) => x.name).join(', ')}.`) : null)),
        arch.length ? null : h('p', { class: 'body-text' }, 'Finish a dynasty (coach until the last legend retires) to enter the Hall.')));
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
            rv ? trophy(rv[2], 72, 'dy-trophy dy-plan-trophy') : null, rv ? h('p', { class: 'dy-trophy-line' }, rv[2].toUpperCase()) : null, h('p', { class: 'caption' }, home.arena)),
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
      teamA: mineCards, teamB: theirCards, seed, labels: { A: me().abbr, B: team(pd.opp).abbr }, names: { B: team(pd.opp).name },
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
          DP.afterPlayoffGame(L, g);
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
    setTimeout(() => phone.ping(), 500);
    const g = rc.g; const r = g.result; const userHome = g.home === L.user.team;
    const opp = team(userHome ? g.away : g.home);
    const s = userHome ? r.score : [r.score[1], r.score[0]];
    const mvp = L.players[r.mvp];
    const t = me();
    if (R.isRivalry(g.home, g.away, L) && rc.won) setTimeout(() => sfx.play('fanfare'), 250);
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
          rv ? trophy(rv[2], rc.won ? 120 : 72, `dy-trophy dy-recap-trophy${rc.won ? '' : ' is-lost'}`) : null,
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
    sfx.play(mine ? 'fanfare' : 'gong');
    fill(root, header(`SEASON ${row.season} · THE ZENITH CLASH`, () => { tab = 'league'; drawHub(); }),
      h('div', { class: 'dy-wrap' },
        h('div', { class: 'dy-champ' }, tinted(champ, team(row.runnerUp)),
          h('div', { class: 'dy-champ-text' },
            h('div', { class: 'dy-champ-art' }, trophy('The Celestial Grail', 150, 'dy-trophy dy-grail'), crest(champ, 72)),
            h('p', { class: 'label-spaced gold' }, 'THE CELESTIAL GRAIL'),
            h('h2', { class: 'display-lg' }, mine ? 'CHAMPIONS!' : champ.name.toUpperCase()),
            h('p', { class: 'body-text' }, `${champ.name} beat ${team(row.runnerUp).name} ${row.score[0]}–${row.score[1]} in the Zenith Clash. Coach ${row.coach}.`))),
        h('section', { class: 'dy-panel' },
          h('h2', { class: 'dy-h' }, 'DIVISION CHAMPIONS'),
          h('ul', { class: 'dy-list' }, (row.divisions || []).map((i) => h('li', {}, crest(team(i), 32), h('span', { class: 'dy-list-text' }, h('span', {}, team(i).name), h('span', { class: 'caption muted' }, `${R.DIV_TROPHY[team(i).div]} · ${R.DIVISIONS[team(i).div]} Division`)))))),
        h('section', { class: 'dy-panel' },
          h('h2', { class: 'dy-h' }, 'THE FRONT OFFICE'),
          h('p', { class: 'heading' }, `${t.name}: ${t.w}-${t.l}${last?.playoffs ? ', made the playoffs' : ''}.`),
          h('p', { class: 'body-text' }, `Expectation: ${R.EXPECT_LABEL[u.expect]}. ${last?.met ? 'You met it.' : 'You missed it.'} Job security: ${u.security}.`),
          u.security === 'Fired' ? h('p', { class: 'body-text loss' }, 'You\'ve been fired. You\'ll pick a new job at the start of the off-season.') : null),
        L.phase === 'done'
          ? h('div', { class: 'btn-row' },
            (() => { const rv = (L.mags || []).find((m) => m.review && m.season === row.season); return rv ? h('button', { class: 'btn btn-secondary', onClick: () => openMag(rv) }, '📰 Read the OSM season review') : null; })(),
            h('button', { class: 'btn btn-primary', onClick: beginOffseason }, 'Start the off-season'))
          : h('button', { class: 'btn btn-primary btn-wide', onClick: () => { tab = 'league'; drawHub(); } }, 'Back to the office')));
  }

  await drawSlots();
  help.showFirstTime();
  return root;
}
