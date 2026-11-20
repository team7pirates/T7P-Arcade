// Background music. Plays the playlist below in a shuffled loop.
//
// CHANGING THE MUSIC: put the new .mp3 files in the music/ folder, list them
// in TRACKS here and in MUSIC_FILES in sw.js, and update the credits in About. Keep them small (about 96 kbps); they are downloaded the
// first time each one plays and then kept on the phone for offline play.
//
// Browsers only allow sound after the player has tapped or pressed a key, so
// the music starts on the first tap (tapping through the loading screen counts).
// It pauses when the app is in the background and follows the Music volume
// setting (0 turns it off). Volume goes through Web Audio because iPhones
// ignore audio.volume.

import { settings } from './settings.js';

const TRACKS = [
  'music/groovy-hip-hop.mp3',   // "Groovy Hip Hop" by Benjamin Tissot (Bensound)
  'music/hood-2-hood.mp3',      // "Hood 2 Hood" by Pecan Pie (Uppbeat)
  'music/lighter.mp3',          // "Lighter" by Otto.mp3 (Uppbeat)
  'music/low-rider.mp3',        // "Low Rider" by SENSHO (Uppbeat)
  'music/low-riders.mp3',       // "Low Riders" by Otto.mp3 (Uppbeat)
  'music/whats-the-rush.mp3',   // "What's The Rush" by Stan Town (Uppbeat)
  'music/get-my-punk-on.mp3',   // "Get My Punk On" by The Breed (v0.35.0)
  'music/how-to-dance.mp3',     // "How To Dance" by The Breed (v0.35.0)
  'music/miami-vintage.mp3',    // "Miami Vintage" by Sonda (Uppbeat, v0.35.0)
  'music/the-flower.mp3',       // "The Flower" by RA (v0.35.0)
];

const FADE_IN_S = 1.5;

let audio = null;
let ctx = null;
let gain = null;
let started = false;
let queue = [];
let last = null;
let blobUrl = null;
let loading = false;

const level = () => {
  const v = settings.value.musicVolume / 100;
  return v * v; // ears hear volume on a curve; this makes the slider feel even
};

function shuffled() {
  const list = TRACKS.slice();
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  // never play the same song twice in a row across a reshuffle
  if (list.length > 1 && list[0] === last) list.push(list.shift());
  return list;
}

function setup() {
  audio = new Audio();
  audio.preload = 'auto';
  audio.addEventListener('ended', () => playNext());
  audio.addEventListener('error', () => setTimeout(playNext, 2000));
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC) {
    try {
      ctx = new AC();
      gain = ctx.createGain();
      gain.gain.value = 0;
      ctx.createMediaElementSource(audio).connect(gain).connect(ctx.destination);
    } catch {
      ctx = null;
      gain = null;
    }
  }
}

function applyVolume(fade = false) {
  if (!audio) return;
  const target = level();
  if (gain && ctx) {
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    if (fade) {
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(target, now + FADE_IN_S);
    } else {
      gain.gain.setValueAtTime(target, now);
    }
  } else {
    audio.volume = target;
  }
}

async function playNext() {
  if (loading || settings.value.musicVolume === 0) return;
  if (!queue.length) queue = shuffled();
  const url = queue.shift();
  last = url;
  loading = true;
  try {
    // Fetch the whole file so the service worker can keep it for offline play.
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const old = blobUrl;
    blobUrl = URL.createObjectURL(blob);
    audio.src = blobUrl;
    if (old) URL.revokeObjectURL(old);
    applyVolume(true);
    if (!document.hidden) await audio.play().catch(() => {});
  } catch {
    // offline and not saved yet, or the file is missing: try another song later
    setTimeout(() => { loading = false; playNext(); }, 5000);
    return;
  }
  loading = false;
}

function resume() {
  if (!started || settings.value.musicVolume === 0) return;
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  if (!audio.src) { playNext(); return; }
  if (audio.paused) audio.play().catch(() => {});
}

function start() {
  if (started) return;
  started = true;
  setup();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  if (settings.value.musicVolume > 0) playNext();
}

export const music = {
  // Call once at startup. Waits for the player's first tap or key press.
  init() {
    const unlock = () => {
      start();
      // the AudioContext sometimes needs a gesture of its own on iPhone
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
      if (ctx && ctx.state === 'running') {
        window.removeEventListener('pointerdown', unlock, true);
        window.removeEventListener('keydown', unlock, true);
      }
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);

    document.addEventListener('visibilitychange', () => {
      if (!audio) return;
      if (document.hidden) audio.pause();
      else resume();
    });

    settings.onChange((s) => {
      if (!audio) return;
      if (s.musicVolume === 0) {
        audio.pause();
      } else {
        applyVolume();
        resume();
      }
    });
  },

  // "Next song" in Settings.
  next() {
    if (!started) start();
    if (settings.value.musicVolume === 0) return;
    if (audio) audio.pause();
    loading = false;
    playNext();
  },
};
