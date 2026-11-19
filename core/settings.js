// Player settings. Saved under the "settings" key; applied to the page as
// classes on <html> so any screen's CSS can react to them.

import { store } from './store.js';

const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const DEFAULT_SETTINGS = {
  musicVolume: 60,       // 0–100. 0 turns the music off.
  sfxVolume: 80,         // 0–100.
  skipFightScenes: false,
  reducedMotion: null,   // null = follow the phone's own setting.
  colorblindTiers: false,
  cleanLanguage: true,   // v0.27.0: the language filter. Off = cursing, darker jokes, flirtier Matchup.
  ageAnswer: null,       // 'adult' | 'minor' from the 18+ question (null = not asked yet).
};

let current = { ...DEFAULT_SETTINGS };
const listeners = new Set();

export const settings = {
  get value() { return current; },

  async load() {
    const saved = await store.get('settings', {});
    current = { ...DEFAULT_SETTINGS, ...saved };
    apply();
    return current;
  },

  async update(patch) {
    current = { ...current, ...patch };
    await store.set('settings', current);
    apply();
    listeners.forEach((fn) => fn(current));
    return current;
  },

  reducedMotion() {
    return current.reducedMotion === null ? prefersReducedMotion() : current.reducedMotion;
  },

  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

function apply() {
  const root = document.documentElement;
  root.classList.toggle('reduce-motion', settings.reducedMotion());
  root.classList.toggle('cb-tiers', !!current.colorblindTiers);
}
