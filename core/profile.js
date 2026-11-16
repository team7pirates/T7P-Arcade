// The player's profile: codename, chosen icon character and last-played mode.
// Saved under the "profile" key.

import { store } from './store.js';

const DEFAULT_PROFILE = {
  codename: '',
  iconId: null,      // a character ID from the roster
  lastMode: null,    // a mode ID from modes.js
  createdAt: null,
};

export const CODENAME_MAX = 20;

let current = { ...DEFAULT_PROFILE };

export function cleanCodename(text) {
  return String(text || '')
    .replace(/[^\p{L}\p{N} _.\-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CODENAME_MAX)
    .toUpperCase();
}

export const profile = {
  get value() { return current; },

  get displayName() { return current.codename || 'GUEST'; },

  async load() {
    const saved = await store.get('profile', null);
    current = { ...DEFAULT_PROFILE, ...(saved || {}) };
    if (!current.createdAt) {
      current.createdAt = new Date().toISOString();
      await store.set('profile', current);
    }
    return current;
  },

  async update(patch) {
    current = { ...current, ...patch };
    await store.set('profile', current);
    return current;
  },
};
