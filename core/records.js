// Personal records for every mode, kept on the device under the "records" key.
// Each mode writes its own section, e.g. records.grids.hard.best.

import { store } from './store.js';

let current = {};

export const records = {
  get value() { return current; },

  async load() {
    current = (await store.get('records', {})) || {};
    return current;
  },

  // Change one mode's section with a function: update('grids', (g) => { ... })
  async update(mode, fn) {
    const section = current[mode] ? structuredClone(current[mode]) : {};
    const next = fn(section) || section;
    current = { ...current, [mode]: next };
    await store.set('records', current);
    return next;
  },

  get(mode) { return current[mode] || {}; },
};
