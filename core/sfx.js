// Sound effects (v0.13.0). Every sound is made on the fly with Web Audio, so
// there are no audio files to download or license. Volume comes from
// Settings → Sound effects volume (0 = off).

import { settings } from './settings.js';

let ctx = null; let out = null;
const last = {};

function audio() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    out = ctx.createGain(); out.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  out.gain.value = (settings.value.sfxVolume / 100) * 0.55;
  return ctx;
}

// A shaped note. f → f2 glides the pitch.
function tone(c, { f = 440, f2 = null, d = 0.12, type = 'sine', g = 0.3, at = 0, a = 0.005 }) {
  const t = c.currentTime + at;
  const o = c.createOscillator(); const v = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(g, t + a); v.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(v).connect(out); o.start(t); o.stop(t + d + 0.02);
}
// A burst of noise through a filter (hits, whooshes).
function noise(c, { d = 0.1, g = 0.3, f = 1200, q = 0.8, type = 'bandpass', at = 0, f2 = null }) {
  const t = c.currentTime + at;
  const len = Math.ceil(c.sampleRate * d);
  const buf = c.createBuffer(1, len, c.sampleRate); const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource(); src.buffer = buf;
  const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + d);
  const v = c.createGain(); v.gain.setValueAtTime(g, t); v.gain.exponentialRampToValueAtTime(0.0001, t + d);
  src.connect(fl).connect(v).connect(out); src.start(t);
}
const chord = (c, notes, o) => notes.forEach((f, i) => tone(c, { f, ...o, at: (o.at || 0) + (o.step || 0) * i }));

const SOUNDS = {
  tap: (c) => tone(c, { f: 900, f2: 700, d: 0.05, type: 'triangle', g: 0.08 }),
  swing: (c) => noise(c, { d: 0.12, g: 0.18, f: 800, f2: 2400, q: 1.2 }),
  hit: (c) => { noise(c, { d: 0.09, g: 0.35, f: 900, q: 0.7 }); tone(c, { f: 140, f2: 70, d: 0.1, type: 'sine', g: 0.35 }); },
  special: (c) => { noise(c, { d: 0.25, g: 0.2, f: 600, f2: 3000, q: 2 }); tone(c, { f: 330, f2: 990, d: 0.22, type: 'sawtooth', g: 0.08 }); },
  ko: (c) => { tone(c, { f: 220, f2: 55, d: 0.45, type: 'square', g: 0.16 }); noise(c, { d: 0.3, g: 0.3, f: 300, type: 'lowpass' }); },
  gong: (c) => { tone(c, { f: 110, d: 1.1, g: 0.3 }); tone(c, { f: 165, d: 0.9, g: 0.12 }); tone(c, { f: 262, d: 0.6, g: 0.06 }); },
  win: (c) => chord(c, [523, 659, 784, 1047], { d: 0.32, type: 'triangle', g: 0.2, step: 0.09 }),
  loss: (c) => chord(c, [392, 330, 262], { d: 0.4, type: 'triangle', g: 0.16, step: 0.14 }),
  correct: (c) => chord(c, [784, 1175], { d: 0.16, type: 'sine', g: 0.2, step: 0.07 }),
  wrong: (c) => tone(c, { f: 180, f2: 120, d: 0.2, type: 'square', g: 0.09 }),
  flip: (c) => noise(c, { d: 0.18, g: 0.16, f: 3500, f2: 900, q: 0.6, type: 'highpass' }),
  pick: (c) => { tone(c, { f: 196, d: 0.5, g: 0.2 }); chord(c, [392, 587], { d: 0.35, type: 'triangle', g: 0.14, step: 0.08, at: 0.05 }); },
  fanfare: (c) => { chord(c, [392, 523, 659], { d: 0.18, type: 'sawtooth', g: 0.07, step: 0.12 }); chord(c, [523, 659, 784, 1047], { d: 0.9, type: 'triangle', g: 0.1, at: 0.4 }); },
  farewell: (c) => { chord(c, [330, 392, 494, 659], { d: 1.6, type: 'sine', g: 0.12, step: 0.35 }); tone(c, { f: 82, d: 2.4, g: 0.18, at: 0.2 }); },
};
const GAP = { hit: 0.06, tap: 0.04, swing: 0.06 };

export const sfx = {
  play(name) {
    try {
      if (!settings.value.sfxVolume) return;
      const f = SOUNDS[name]; if (!f) return;
      const now = performance.now() / 1000;
      if (GAP[name] && now - (last[name] || 0) < GAP[name]) return;
      last[name] = now;
      const c = audio(); if (!c) return;
      f(c);
    } catch { /* sound is never worth breaking the game */ }
  },
  // A soft tap for every button. Buttons with data-sfx="none" stay quiet.
  init() {
    document.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('button');
      if (b && !b.disabled && b.dataset.sfx !== 'none') sfx.play('tap');
    }, true);
  },
};
