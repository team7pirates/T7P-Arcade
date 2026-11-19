// Forbidden Fusion contracts (v0.29.0, Khalil's idea).
// Before each climb, three companies offer deals for 10, 20 or 30 floors. You
// get paid for every floor you clear, plus a bonus for finishing the deal.
// Ask for more and they might say yes, meet you halfway, or walk away. Break a
// deal mid-climb and you pay a buyout. Lose before it ends and the deal falls
// through. Both hurt your reputation, which shrinks future offers; finishing a
// deal raises it. No deal? You climb as a free agent at minimum pay, and after
// 3 floors companies start texting with offers.
//
// Contract pay counts as sponsor money: it adds to your Bounty and every 25
// Bounty is a talent point, like sponsors.

export const COMPANIES = [
  { id: 'apex', name: 'Apex Fight Co.', icon: '🔺', style: 'Big money, short patience', pay: 1.1, walk: 1.2 },
  { id: 'lotus', name: 'Crimson Lotus Promotions', icon: '🪷', style: 'Loyal to fighters who finish', pay: 0.95, walk: 0.8, bonus: 1.3 },
  { id: 'halo', name: 'Iron Halo Entertainment', icon: '😇', style: 'Steady and fair', pay: 1, walk: 1 },
  { id: 'ronin', name: 'Neon Ronin Media', icon: '🌃', style: 'Loves a loud fighter', pay: 1.05, walk: 0.9, followers: true },
  { id: 'titan', name: 'Titan Forge Sports', icon: '🔨', style: 'Pays more for long deals', pay: 0.9, walk: 1, long: 1.2 },
  { id: 'kitsune', name: 'Kitsune Global', icon: '🦊', style: 'Cheap buyouts, cheap pay', pay: 0.9, walk: 0.9, buyout: 0.5 },
];
export const LENGTHS = [10, 20, 30];
export const FREE_AGENT_PAY = 3;
export const FREE_AGENT_WAIT = 3;   // floors before companies start texting a free agent

export const ORIGINS = [
  { id: 'brawler', name: 'Street Brawler', icon: '🥊', text: 'Grew up fighting for lunch money. Unpredictable.', perk: '+15 Chaos · 300 followers to start', chaos: 15, followers: 300 },
  { id: 'prodigy', name: 'Dojo Prodigy', icon: '🥋', text: 'Trained since you could walk. Everyone expects greatness.', perk: '+10 Aura', aura: 10 },
  { id: 'soldier', name: 'Ex-Soldier', icon: '🎖️', text: 'Calm under fire. Doesn\'t panic when it\'s close.', perk: '+15 Clutch', clutch: 15 },
  { id: 'rich', name: 'Rich Kid', icon: '💎', text: 'Famous before your first fight. Companies think you\'re soft.', perk: '1,500 followers to start · offers 10% lower', followers: 1500, pay: 0.9 },
  { id: 'legacy', name: 'Tower Legacy', icon: '🗼', text: 'Your family climbed before you. Companies know the name.', perk: 'Offers 10% higher · −10 Chaos', chaos: -10, pay: 1.1 },
];
export const PERSONALITIES = [
  { id: 'cocky', name: 'Cocky', icon: '😤', text: 'Talks big, backs it up (usually).', perk: '+25% followers you gain', followers: 1.25 },
  { id: 'humble', name: 'Humble', icon: '🙏', text: 'Lets the fights do the talking.', perk: 'Companies walk away 30% less when you negotiate', walk: 0.7 },
  { id: 'funny', name: 'Funny', icon: '😂', text: 'Every interview is a highlight.', perk: '+10% followers · 5% better offers', followers: 1.1, pay: 1.05 },
  { id: 'cold', name: 'Cold', icon: '🧊', text: 'No emotions. Just results.', perk: '+5 Clutch', clutch: 5 },
];
export const origin = (id) => ORIGINS.find((o) => o.id === id) || null;
export const personality = (id) => PERSONALITIES.find((o) => o.id === id) || null;

// What companies think a floor of your time is worth.
export function worth(data) {
  const best = Math.max(0, ...((data?.hof || []).map((e) => e.floor || 0)), data?.best || 0);
  const fol = data?.lastPhone?.followers ?? data?.followers ?? 0;
  const rep = data?.rep || 0;
  const repMult = Math.max(0.6, Math.min(1.5, 1 + rep * 0.08));
  const b = data?.build || {};
  const mult = (origin(b.origin)?.pay || 1) * (personality(b.personality)?.pay || 1);
  return Math.max(4, Math.round((6 + best * 0.6 + Math.min(10, fol / 1000)) * repMult * mult));
}

// Three offers, one of each length, from three different companies.
export function makeOffers(data, rand = Math.random) {
  const w = worth(data);
  const cos = COMPANIES.slice().sort(() => rand() - 0.5).slice(0, 3);
  return LENGTHS.map((len, i) => {
    const co = cos[i];
    const lenMult = len === 10 ? 0.9 : len === 20 ? 1 : 1.15 * (co.long || 1);
    const pay = Math.max(2, Math.round(w * lenMult * co.pay * (0.92 + rand() * 0.16)));
    return offerFrom(co, len, pay);
  });
}
export function offerFrom(co, len, pay) {
  return { co: co.id, name: co.name, icon: co.icon, style: co.style, len, pay, bonus: Math.round(pay * len * 0.5 * (co.bonus || 1)), buyoutPer: Math.max(1, Math.round(pay * 0.6 * (co.buyout || 1))), asked: false };
}
export const company = (id) => COMPANIES.find((c) => c.id === id);

// Ask for `ask` a floor. Returns { result: 'yes'|'counter'|'walk', pay }.
export function negotiate(offer, ask, data, rand = Math.random) {
  const over = ask / offer.pay - 1;
  if (over <= 0) return { result: 'yes', pay: ask };
  const co = company(offer.co);
  const pers = personality(data?.build?.personality);
  const walk = Math.min(0.95, over * 1.8 * (co?.walk || 1) * (pers?.walk || 1));
  const roll = rand();
  if (roll < walk / 2) return { result: 'walk', pay: 0 };
  if (roll < walk) return { result: 'counter', pay: Math.round((offer.pay + ask) / 2) };
  return { result: 'yes', pay: ask };
}

// A signed contract on the climb.
export function sign(offer, pay) {
  return { co: offer.co, name: offer.name, icon: offer.icon, len: offer.len, pay, bonus: Math.round(pay * offer.len * 0.5 * (company(offer.co)?.bonus || 1)), buyoutPer: offer.buyoutPer, done: 0, status: 'active' };
}
export const buyoutCost = (c) => Math.max(10, (c.len - c.done) * c.buyoutPer);
export const remaining = (c) => c.len - c.done;
