// Characters core: loads the roster that ships with the app (data/roster.json,
// exported from Supabase) and answers questions about it. Every mode gets
// characters from here, never from its own copy.

let roster = null;
let byId = new Map();

const TIERS = [
  { tier: 'S', min: 90 },
  { tier: 'A', min: 75 },
  { tier: 'B', min: 55 },
  { tier: 'C', min: 1 },
];

function fold(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

// v0.42.0: original faces for created fighters (art/players/cpNN.webp). They
// are picture-only entries: get() and portraitUrl() know them, but they never
// appear in list or search, so no mode can pick them as a character.
export const ORIGINAL_FACES = Array.from({ length: 40 }, (_, i) => {
  const n = String(i + 1).padStart(2, '0');
  return { id: 9001 + i, name: `Original face #${i + 1}`, series: 'Original', franchise: 'Original', portrait: true, art: `art/players/cp${n}.webp`, original: true };
});
const EXTRA = new Map(ORIGINAL_FACES.map((c) => [c.id, c]));
EXTRA.set(9500, { id: 9500, name: 'Halestorm', series: 'Team7Pirates', franchise: 'Team7Pirates', portrait: true, art: 'art/players/halestorm.webp', original: true });

export const characters = {
  get loaded() { return !!roster; },
  get version() { return roster ? roster.rosterVersion : null; },
  get list() { return roster ? roster.characters : []; },
  get count() { return roster ? roster.characters.length : 0; },

  async load() {
    if (roster) return roster;
    const res = await fetch('data/roster.json');
    if (!res.ok) throw new Error(`Roster failed to load (${res.status})`);
    const data = await res.json();
    data.characters.forEach((c) => {
      c._search = fold([c.name, c.label, ...(c.aliases || []), c.series].join(' '));
    });
    roster = data;
    byId = new Map(data.characters.map((c) => [c.id, c]));
    return roster;
  },

  get(id) { return byId.get(Number(id)) || EXTRA.get(Number(id)) || null; },
  get originals() { return ORIGINAL_FACES; },

  // Name search: matches the name, label, aliases and series, ignoring accents.
  // Names that start with the search come first.
  search(query, limit = 60) {
    const q = fold(query).trim();
    const list = this.list.filter((c) => !c.retired);
    if (!q) return list.slice(0, limit);
    const starts = [];
    const contains = [];
    for (const c of list) {
      const name = fold(c.name);
      if (name.startsWith(q) || (c.aliases || []).some((a) => fold(a).startsWith(q))) starts.push(c);
      else if (c._search.includes(q)) contains.push(c);
      if (starts.length >= limit) break;
    }
    return starts.concat(contains).slice(0, limit);
  },

  tierFor(powerLevel) {
    if (!powerLevel) return null;
    return TIERS.find((t) => powerLevel >= t.min).tier;
  },

  initials(c) {
    const words = String(c.name).replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
    if (words.length === 0) return '?';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  },

  // Portraits are added later as portraits/<id>.webp. The roster marks the ones
  // that exist with "portrait": true, so we never ask for a missing file.
  portraitUrl(c) {
    return c && c.portrait ? (c.art || `portraits/${c.id}.webp`) : null;
  },
};
