// "Get the App": installing the PWA to the home screen, and offline updates.

import { toast } from './ui.js';

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
// downloads in the background and we offer a reload.
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
    const offerUpdate = (worker) => {
      toast('An update is ready.', {
        action: 'Reload',
        onAction: () => worker.postMessage('skip-waiting'),
      });
    };
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
