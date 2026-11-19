// Mystic elements (v0.34.0). A Mystic's special (Hex) is a 1.2× hit that
// leaves an element on the foe. Each tick happens at the start of that foe's
// turn and takes a share of its base health (1-5%, like Khalil asked):
//   fire  🔥 Burn   5% a turn for 4 turns
//   frost ❄️ Freeze 3% a turn for 3 turns, and the frozen card hits 30% softer
//   shock ⚡ Shock  4% a turn for 3 turns, and each tick drains 20 special meter
//   drain 🩸 Drain  5% a turn for 3 turns, and the Mystic's side heals 1.5× that
// Sims keep all four close to each other (and to the old Burn).

export const FX = {
  fire: { key: 'fire', label: 'BURN', name: 'Burn', icon: '🔥', pct: 0.05, turns: 4, text: 'burns for 5% health a turn for 4 turns' },
  frost: { key: 'frost', label: 'FROZEN', name: 'Freeze', icon: '❄️', pct: 0.03, turns: 3, soften: 0.30, text: 'freezes: 3% health a turn for 3 turns, and the frozen card hits 30% softer' },
  shock: { key: 'shock', label: 'SHOCK', name: 'Shock', icon: '⚡', pct: 0.04, turns: 3, meter: 20, text: 'shocks for 4% health a turn for 3 turns, draining 20 special meter each time' },
  drain: { key: 'drain', label: 'DRAIN', name: 'Drain', icon: '🩸', pct: 0.05, turns: 3, heal: 1.5, text: 'drains 5% health a turn for 3 turns and heals the Mystic\'s side for half again as much' },
};
export const ELEMENT_KEYS = Object.keys(FX);

const LIST = {
  fire: ['Dabi', 'Portgas D. Ace', 'Roy Mustang', 'Shigekuni Genryusai Yamamoto', 'Jogo', 'Ghost Rider', 'Firestorm', 'Fahrenheit',
    'Etrigan the Demon', 'Hellstrike', 'Itachi Uchiha', 'Madara Uchiha', 'Dabura', 'Blair', 'Jiraiya', 'Jean Grey', 'Magik', 'Byakuran',
    'Shippo', 'Jaken', 'Choi Jong-in', 'Mordred Hood', 'Emerald Eyes'],
  frost: ['Aokiji', 'Iceman', 'Toshiro Hitsugaya', 'Rukia Kuchiki', 'Shoto Todoroki', 'Doma', 'Crystal', 'Mera', 'Satoru Gojo',
    'Byakuya Kuchiki', 'Kaede', 'Yorozu', 'Empress', 'Wen'],
  shock: ['Enel', 'Storm', 'Jenny Sparks', 'Professor X', 'Scarlet Witch', 'Nejire Hado', 'Vision', 'Red Tornado', 'Green Lantern',
    'Sinestro', 'Silver Surfer', 'Martian Manhunter', 'Doctor Strange', 'Zatanna', 'Doctor Fate', 'Wong', 'Loki', 'Alex Luthor',
    'Magneto', 'Dazzler', 'Sasuke Uchiha', 'Zeno Zoldyck', 'Toge Inumaki', 'Alphonse Elric', 'Van Hohenheim', 'Chrome Dokuro',
    'Mukuro Rokudo', 'Obito Uchiha', 'Eren Yeager', 'Bartholomew Kuma', 'Donquixote Doflamingo', 'Kagome Higurashi', 'Kikyo',
    'Koenma', 'Genkai', 'Rin', 'Void', 'Ulquiorra Cifer', 'Excalibur', 'Stanley Dover', 'Jack Hawksmoor', 'Lord Emp', 'Falcona', 'Tusk'],
  drain: ['Galactus', 'Adam Warlock', 'Raven', 'Nobara Kugisaki', 'Yuta Okkotsu', 'Suguru Geto', 'Mahito', 'Tomura Shigaraki',
    'All For One', 'Sung Jin-woo', 'Ashborn', 'Father', 'Yhwach', 'Shinigami', 'The Spectre', 'Deadman', 'Swamp Thing', 'Poison Ivy',
    'Doctor Voodoo', 'Voodoo', 'Orochimaru', 'Nagato', 'Marshall D. Teach', 'Nico Robin', 'Arachne Gorgon', 'Crona', 'Asura',
    'Miroku', 'Hakudoshi', 'Kanna', 'Orihime Inoue', 'Laughing Bull'],
};
export const ELEMENTS = {};
for (const [el, names] of Object.entries(LIST)) for (const n of names) ELEMENTS[n] = el;

// Pick a card's element: its own (a fused fighter's), then by name, then by
// its face's name, then fire (the classic Hex).
export function elementOf(f) {
  if (f?.element && FX[f.element]) return f.element;
  return ELEMENTS[f?.name] || ELEMENTS[f?.faceName] || 'fire';
}
