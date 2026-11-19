// How the player has set up their phone (v0.27.0), shared by every mode.
// Saved under 'phone:prefs'. v0.25's single 'phone:wallpaper' becomes the
// home wallpaper.

import { store } from './store.js';
import { characters } from './characters.js';

const KEY = 'phone:prefs';
export const GRADIENTS = {
  midnight: ['Midnight', 'radial-gradient(ellipse at 30% 0%, #3a1a5c, #0e0a14 65%)'],
  sunset: ['Sunset', 'linear-gradient(170deg, #ff9a5a 0%, #c2416b 45%, #2a0f3a 100%)'],
  ocean: ['Ocean', 'linear-gradient(160deg, #2bc0e4 0%, #1e5799 50%, #0b1630 100%)'],
  gold: ['Gold rush', 'linear-gradient(160deg, #f0c060 0%, #8a5a14 50%, #1a1006 100%)'],
  sakura: ['Sakura', 'radial-gradient(circle at 70% 20%, #ffc0d9 0%, #c25a8c 40%, #2a0f22 100%)'],
  forest: ['Forest', 'linear-gradient(170deg, #4caf7a 0%, #1d5b45 50%, #07140f 100%)'],
};
export const ARENAS = ['2001', '2002', '2003', '2004'];
export const CLOCK_STYLES = [['big', 'Big'], ['small', 'Small'], ['stacked', 'Stacked']];
export const CLOCK_COLORS = ['#ffffff', '#f0c060', '#ff6f91', '#3aa8f5', '#4caf7a', '#b388ff'];
export const ICON_THEMES = [['color', 'Colorful'], ['dark', 'Dark'], ['neon', 'Neon'], ['gold', 'Gold']];
export const FRAMES = [['graphite', 'Graphite', '#2c2e34'], ['silver', 'Silver', '#c9ccd2'], ['gold', 'Gold', '#c9a45c'], ['purple', 'T7P purple', '#5b2d8f'], ['white', 'White', '#eceef2']];
export const SOUNDS = [['correct', 'Ding'], ['pick', 'Pop'], ['flip', 'Swish'], ['fanfare', 'Fanfare'], ['silent', 'Silent']];
export const TEXT_SIZES = [['s', 'Small'], ['m', 'Normal'], ['l', 'Large']];

export const DEFAULTS = {
  home: { kind: 'grad', id: 'midnight' }, lock: null, sameWallpaper: true,
  lockOn: true, clock: 'big', clockColor: '#ffffff', previews: true,
  order: null, dock: ['messages', 'chirp', 'lenz', 'boo'], hidden: [],
  icons: 'color', frame: 'graphite', sound: 'correct', vibrate: false, text: 'm',
};

let prefs = { ...DEFAULTS };
let loaded = null;
export const loadPrefs = () => (loaded ||= (async () => {
  try {
    const p = await store.get(KEY, null);
    if (p) prefs = { ...DEFAULTS, ...p };
    else { const old = await store.get('phone:wallpaper', null); if (old) prefs = { ...DEFAULTS, home: old }; }
  } catch { /* ignore */ }
  return prefs;
})());
export const getPrefs = () => prefs;
export async function setPrefs(patch) { prefs = { ...prefs, ...patch }; try { await store.set(KEY, prefs); } catch { /* ignore */ } return prefs; }

export const lockWallpaper = () => (prefs.sameWallpaper || !prefs.lock ? prefs.home : prefs.lock);
export function wallpaperCss(w) {
  if (!w) return GRADIENTS.midnight[1];
  if (w.kind === 'grad') return (GRADIENTS[w.id] || GRADIENTS.midnight)[1];
  const shade = 'linear-gradient(180deg, rgba(0,0,0,.25), rgba(0,0,0,.45))';
  if (w.kind === 'arena') return `${shade}, url("art/afl/arenas/${w.id}.webp") center / cover`;
  if (w.kind === 'char') { const c = characters.get(w.id); const u = c && characters.portraitUrl(c); return u ? `${shade}, url("${u}") center top / cover, #120b1c` : GRADIENTS.midnight[1]; }
  if (w.kind === 'custom' && w.data) return `${shade}, url("${w.data}") center / cover`;
  return GRADIENTS.midnight[1];
}
// Shrink an uploaded photo so it fits in the save.
export function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1400 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}
// The apps in the player's order, with the dock and hidden apps split out.
export function arrange(appIds) {
  const order = (prefs.order || []).filter((id) => appIds.includes(id));
  appIds.forEach((id) => { if (!order.includes(id)) order.push(id); });
  const dock = prefs.dock.filter((id) => appIds.includes(id) && !prefs.hidden.includes(id)).slice(0, 4);
  const grid = order.filter((id) => !dock.includes(id) && !prefs.hidden.includes(id) && id !== 'settings');
  if (appIds.includes('settings')) grid.push('settings'); // Settings can't be hidden
  return { order, dock, grid };
}
