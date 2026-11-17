// "Get the App": installing the PWA to the home screen, and offline updates.

import { toast } from './ui.js';
import { showAutoUpdate } from './whats-new.js';

let deferredPrompt = null;
const listeners = new Set();

export const install = {
  get installed() {
    return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  },
  get canPrompt() { return !!deferredPrompt; },
  get isIos() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  },
  async prompt() {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    listeners.forEach((fn) => fn());
    return outcome === 'accepted';
  },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  listeners.forEach((fn) => fn());
});
window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  listeners.forEach((fn) => fn());
  toast('T7P Arcade is on your home screen.');
});

// Offline support. The service worker (sw.js) keeps a copy of every file so
// the game opens without internet. When a new version is published it
// downloads in the background and installs on its own: a big banner says the
// game is about to reload (after the loading screen is done). "Finish first"
// waits until the player is back on the main menu.
let appReady = false;
let waitingWorker = null;
let shown = false;

function applyNow(worker) { worker.postMessage('skip-waiting'); }

function offerUpdate(worker) {
  waitingWorker = worker;
  if (!appReady || shown) return;
  shown = true;
  showAutoUpdate({
    onReload: () => applyNow(worker),
    onWait: () => {
      const onMenu = () => { if (['', '#', '#/', '#/menu', '#menu'].includes(location.hash)) { window.removeEventListener('hashchange', onMenu); applyNow(worker); } };
      window.addEventListener('hashchange', onMenu);
    },
  }).catch(() => applyNow(worker));
}

export function markAppReady() {
  appReady = true;
  if (waitingWorker) offerUpdate(waitingWorker);
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });

  navigator.serviceWorker.register('sw.js').then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
      });
    });
    // Check for a new version whenever the app comes back to the front.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch(() => { /* offline support unavailable; the game still runs online */ });
}
