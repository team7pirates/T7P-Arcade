// Lenz photos (v0.27.0): turns a character portrait into a different-looking
// photo each time: a scene behind them, a layout (full shot, polaroid,
// blended into the scene, close-up selfie), a filter, a sticker and a
// location tag. The look is picked from the post's id, so it never changes
// and older posts get one too.
//
// Scene art: drop pictures with no people in them into art/scenes/ (webp or
// jpg) and add them to SCENE_ART below, e.g. { id: 'gym', file: 'gym.webp',
// loc: 'Tower Gym' }. Until then the scenes are painted with CSS.

import { h } from './ui.js';
import { characters } from './characters.js';

// v0.35.0: real Lenz photos (no people in them) in art/lenz/, grouped by
// what the post is about. Any character can post any of them; the post's
// header shows who. A post picks one with { photo: id }.
export const LENZ_PHOTOS = {
  train: [['gloves', 'Tower Gym'], ['dumbbells', 'Tower Gym'], ['jumprope', 'Training Dojo'], ['shoes', 'Morning run'], ['dojo', 'Training Dojo']],
  eat: [['ramen', 'Ramen Ichiban'], ['burger', 'Downtown'], ['cake', 'Cheat day'], ['feast', 'Team dinner'], ['nightmarket', 'Night Market']],
  fight: [['arenafloor', 'The Arena'], ['tunnel', 'Arena Tunnel'], ['locker', 'Locker Room'], ['neoncity', 'Downtown at night'], ['elevator', 'Tower Elevator']],
  win: [['confetti', 'Center Ring'], ['trophy', 'The Arena'], ['medal', 'Center Ring'], ['pressroom', 'Press Room'], ['towertop', 'Top of the Tower']],
  off: [['couch', 'Day off'], ['beach', 'Sunset Beach'], ['coffee', 'Corner cafe'], ['rooftop', 'Rooftop'], ['hotspring', 'Hot Spring']],
  grail: [['grail-trophy', 'Championship night']],
  gpt: [['gpt-trophy', 'Awards night']],
};
const PHOTO_LOC = Object.fromEntries(Object.values(LENZ_PHOTOS).flat());
// Pick a photo of a type, avoiding the last few used (ph.lenzRecent).
export function pickPhoto(ph, type, rand = Math.random) {
  const all = (LENZ_PHOTOS[type] || LENZ_PHOTOS.off).map((x) => x[0]);
  const recent = ph?.lenzRecent || [];
  const pool = all.filter((x) => !recent.includes(x));
  const id = (pool.length ? pool : all)[Math.floor(rand() * (pool.length || all.length))];
  if (ph) ph.lenzRecent = [id, ...recent.filter((x) => x !== id)].slice(0, 8);
  return id;
}
export const photoUrl = (id) => `art/lenz/${id}.webp`;

export const SCENE_ART = [
  // { id: 'gym', file: 'gym.webp', loc: 'Tower Gym' },
];
const CSS_SCENES = [
  { id: 'arena1', css: 'url("art/afl/arenas/2001.webp") center / cover', loc: 'The Arena' },
  { id: 'arena2', css: 'url("art/afl/arenas/2002.webp") center / cover', loc: 'Center Ring' },
  { id: 'arena3', css: 'url("art/afl/arenas/2003.webp") center / cover', loc: 'Arena Tunnel' },
  { id: 'arena4', css: 'url("art/afl/arenas/2004.webp") center / cover', loc: 'Stadium Floor' },
  { id: 'sunset', css: 'linear-gradient(180deg, #ffb46a 0%, #ff6f61 35%, #6a2c70 70%, #1b1035 100%)', loc: 'Sunset Beach' },
  { id: 'city', css: 'radial-gradient(circle at 20% 80%, #ff2fe0 0 6%, transparent 7%), radial-gradient(circle at 70% 75%, #00f0ff 0 5%, transparent 6%), linear-gradient(180deg, #0b0f2a 0%, #1d1450 60%, #3a1d6a 100%)', loc: 'Downtown at night' },
  { id: 'dojo', css: 'repeating-linear-gradient(90deg, #6b4423 0 38px, #5a3a1e 38px 40px), #6b4423', loc: 'Training Dojo' },
  { id: 'sky', css: 'linear-gradient(180deg, #7ec8ff 0%, #bfe6ff 60%, #ffffff 100%)', loc: 'Rooftop' },
  { id: 'ramen', css: 'radial-gradient(circle at 50% 30%, #ffd27a 0 18%, transparent 40%), linear-gradient(180deg, #7a2e1d, #2b0f0a)', loc: 'Ramen Ichiban' },
  { id: 'gymfloor', css: 'linear-gradient(180deg, #2d3440 0%, #2d3440 60%, #4a5260 60%, #1c2028 100%)', loc: 'Tower Gym' },
];
const LAYOUTS = ['full', 'polaroid', 'blend', 'selfie', 'full', 'blend'];
const FILTERS = ['none', 'warm', 'bw', 'vintage', 'neon', 'cool', 'none'];
const STICKERS = ['🔥', '💪', '👑', '✨', '😤', '🏆', '💯', '⚡', '😎', null, null];

function hash(n) { let x = (Number(n) || 0) * 2654435761 % 4294967296; x ^= x >>> 13; return Math.abs(x); }
const scenes = () => [...SCENE_ART.map((s) => ({ id: s.id, css: `url("art/scenes/${s.file}") center / cover`, loc: s.loc })), ...CSS_SCENES];

export function styleFor(p) {
  const k = hash((p.id || 0) * 31 + (p.cid || 0));
  const sc = scenes();
  return {
    scene: sc[k % sc.length],
    layout: LAYOUTS[(k >>> 4) % LAYOUTS.length],
    filter: FILTERS[(k >>> 8) % FILTERS.length],
    sticker: STICKERS[(k >>> 12) % STICKERS.length],
    tilt: ((k >>> 16) % 9) - 4,
    side: (k >>> 20) % 2 ? 'left' : 'right',
  };
}

// The photo for a Lenz post. Posts without a character keep their old look.
export function lenzPhoto(p) {
  if (p.photo && PHOTO_LOC[p.photo]) {
    const s = styleFor(p);
    const f = ['none', 'warm', 'none', 'vintage', 'cool', 'none'][(s.tilt + 4) % 6];
    return h('div', { class: `ph-lpic lp is-photo f-${f}` }, h('img', { src: photoUrl(p.photo), alt: '', loading: 'lazy' }),
      s.sticker ? h('span', { class: `lp-sticker is-${s.side}` }, s.sticker) : null, h('span', { class: 'lp-loc' }, `📍 ${PHOTO_LOC[p.photo]}`));
  }
  const c = p.cid != null ? characters.get(p.cid) : null; const u = c && characters.portraitUrl(c);
  if (!u) {
    if (p.art) return h('div', { class: 'ph-lpic' }, h('img', { src: p.art, alt: '', loading: 'lazy' }));
    return h('div', { class: 'ph-lpic is-blank' }, h('span', {}, p.icon || '📸'));
  }
  const s = styleFor(p);
  const img = () => h('img', { src: u, alt: c.name, loading: 'lazy' });
  const loc = h('span', { class: 'lp-loc' }, `📍 ${s.scene.loc}`);
  const sticker = s.sticker ? h('span', { class: `lp-sticker is-${s.side}` }, s.sticker) : null;
  let inner;
  if (s.layout === 'polaroid') inner = h('span', { class: 'lp-polaroid', style: `transform: rotate(${s.tilt}deg)` }, img(), h('span', { class: 'lp-pcap' }, (p.caption || '').split(/[.!?]/)[0].slice(0, 28)));
  else if (s.layout === 'blend') inner = h('span', { class: `lp-blend is-${s.side}` }, img());
  else if (s.layout === 'selfie') inner = h('span', { class: 'lp-selfie' }, img());
  else inner = h('span', { class: 'lp-full' }, img());
  return h('div', { class: `ph-lpic lp is-${s.layout} f-${s.filter}`, style: `background:${s.scene.css}` }, inner, sticker, loc);
}
