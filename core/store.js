// Saves: everything the player owns lives in IndexedDB on this device.
// One database, one "kv" table of key → value. Modes add their own keys
// (for example "save:dynasty") through the same get/set calls.
//
// If IndexedDB is blocked (some private-browsing windows), the game still
// runs, but nothing is kept after the tab closes. `store.persistent` says which.

const DB_NAME = 't7p-arcade';
const DB_VERSION = 1;
const TABLE = 'kv';

let dbPromise = null;
const memory = new Map();

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (!('indexedDB' in self)) return resolve(null);
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      return resolve(null);
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(TABLE)) db.createObjectStore(TABLE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function run(mode, fn) {
  return openDb().then((db) => {
    if (!db) {
      const r = fn(null);
      return r && typeof r === 'object' && 'result' in r ? r.result : undefined;
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(TABLE, mode);
      const result = fn(tx.objectStore(TABLE));
      tx.oncomplete = () => resolve(result && 'result' in result ? result.result : result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  });
}

export const store = {
  persistent: true,

  async init() {
    const db = await openDb();
    this.persistent = !!db;
    // Ask the browser not to clear our saves when the phone runs low on space.
    try {
      if (db && navigator.storage && navigator.storage.persist) await navigator.storage.persist();
    } catch { /* not supported: fine */ }
    return this.persistent;
  },

  async get(key, fallback = undefined) {
    const value = await run('readonly', (t) => (t ? t.get(key) : { result: memory.get(key) }));
    return value === undefined ? fallback : value;
  },

  async set(key, value) {
    await run('readwrite', (t) => (t ? t.put(value, key) : memory.set(key, value)));
    return value;
  },

  async remove(key) {
    await run('readwrite', (t) => (t ? t.delete(key) : memory.delete(key)));
  },

  // Every saved key and value, for the Back up button.
  async all() {
    const db = await openDb();
    if (!db) return Object.fromEntries(memory);
    return new Promise((resolve, reject) => {
      const out = {};
      const tx = db.transaction(TABLE, 'readonly');
      const req = tx.objectStore(TABLE).openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (cur) { out[cur.key] = cur.value; cur.continue(); }
      };
      tx.oncomplete = () => resolve(out);
      tx.onerror = () => reject(tx.error);
    });
  },

  // Replace everything with a backup (Restore), or wipe it (pass {}).
  async replaceAll(entries) {
    const db = await openDb();
    if (!db) {
      memory.clear();
      for (const [k, v] of Object.entries(entries)) memory.set(k, v);
      return;
    }
    await new Promise((resolve, reject) => {
      const tx = db.transaction(TABLE, 'readwrite');
      const t = tx.objectStore(TABLE);
      t.clear();
      for (const [k, v] of Object.entries(entries)) t.put(v, k);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  },
};
