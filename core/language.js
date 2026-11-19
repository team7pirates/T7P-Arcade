// The language filter (v0.27.0). On by default. Turning it off asks
// "Are you 18 or older?" first; answering No keeps it on and locks it.
// Off allows cursing, darker jokes and flirtier Matchup chats. It never allows
// slurs, hate or anything sexual: the AI rules in phone-ai.js say so too.

import { h, sheet } from './ui.js';
import { settings } from './settings.js';

const WORDS = ['motherfuck\\w*', 'fuck\\w*', 'f+u+c+k+', 'bullshit\\w*', 'shit\\w*', 'goddamn\\w*', 'damn\\w*', 'bitch\\w*', 'bastard\\w*', 'asshole\\w*', 'dumbass\\w*', 'jackass\\w*', 'ass', 'dick\\w*', 'piss\\w*', 'crap\\w*', 'wtf', 'stfu', 'lmfao'];
const RX = new RegExp(`\\b(${WORDS.join('|')})\\b`, 'gi');

export const filterOn = () => settings.value.cleanLanguage !== false;
// Stars out cursing while the filter is on: "shit" → "s***".
export function scrub(text) {
  if (!filterOn() || !text) return text;
  return String(text).replace(RX, (w) => w[0] + '*'.repeat(Math.max(2, w.length - 1)));
}

// A switch for any settings page. onChange() is called after it changes.
export function languageSwitch(onChange) {
  const v = settings.value;
  const locked = v.ageAnswer === 'minor';
  const id = `lang-${Math.random().toString(36).slice(2, 7)}`;
  const input = h('input', { type: 'checkbox', id, class: 'switch-input', role: 'switch', checked: filterOn(), disabled: locked });
  input.addEventListener('change', async () => {
    if (input.checked) { await settings.update({ cleanLanguage: true }); onChange?.(); return; }
    if (settings.value.ageAnswer === 'adult') { await settings.update({ cleanLanguage: false }); onChange?.(); return; }
    input.checked = true;
    const s = sheet({ title: 'ARE YOU 18 OR OLDER?', center: true, content: h('div', { class: 'age-gate' },
      h('p', { class: 'body-text' }, 'Turning the language filter off lets characters curse, tell darker jokes and get flirtier on Matchup. It\'s for adults only.'),
      h('p', { class: 'caption muted' }, 'Nothing sexual is ever allowed, filter or not.'),
      h('div', { class: 'age-gate-btns' },
        h('button', { class: 'btn btn-primary', onClick: async () => { await settings.update({ ageAnswer: 'adult', cleanLanguage: false }); s.close(); onChange?.(); } }, 'Yes, I\'m 18+'),
        h('button', { class: 'btn btn-secondary', onClick: async () => { await settings.update({ ageAnswer: 'minor', cleanLanguage: true }); s.close(); onChange?.(); } }, 'No')),
    ) });
  });
  return h('div', { class: 'set-row' },
    h('label', { for: id, class: 'set-text' },
      h('span', { class: 'heading' }, 'Language filter'),
      h('span', { class: 'caption muted' }, locked ? 'Locked on: only adults can turn it off.' : filterOn() ? 'On: no cursing. Turn off for cursing, darker jokes and flirtier dating (18+).' : 'Off: characters can curse, joke darker and flirt more. Never anything sexual.')),
    h('span', { class: 'switch' }, input, h('span', { class: 'switch-track', 'aria-hidden': 'true' })));
}
