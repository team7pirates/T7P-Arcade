// Offline support for T7P Arcade.
// On first visit this saves every file in APP_FILES on the phone. After that the
// game opens from that copy, with or without internet.
//
// RELEASING AN UPDATE: bump CACHE_VERSION (and APP_VERSION in core/version.js)
// to the same number, and add any new files to APP_FILES.

const CACHE_VERSION = '0.30.0';
const APP_CACHE = `t7p-app-${CACHE_VERSION}`;
const ART_CACHE = 't7p-art'; // portraits, models and music: kept across versions

// Songs in the current playlist. Saved songs not on this list are deleted
// when an update installs (keep it in step with TRACKS in core/music.js).
const MUSIC_FILES = [
  'groovy-hip-hop.mp3',
  'hood-2-hood.mp3',
  'lighter.mp3',
  'low-rider.mp3',
  'low-riders.mp3',
  'whats-the-rush.mp3',
];

const APP_FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'whats-new.json',
  'styles/tokens.css',
  'styles/base.css',
  'styles/screens.css',
  'styles/modes.css',
  'core/app.js',
  'core/ui-scale.js',
  'core/sfx.js',
  'core/version.js',
  'core/store.js',
  'core/settings.js',
  'core/profile.js',
  'core/characters.js',
  'core/modes.js',
  'core/ui.js',
  'core/router.js',
  'core/install.js',
  'core/records.js',
  'core/grid.js',
  'core/grid-board.js',
  'core/mode-kit.js',
  'core/whats-new.js',
  'core/card.js',
  'core/combat.js',
  'core/battle-view.js',
  'core/music.js',
  'core/screens/loading.js',
  'core/screens/menu.js',
  'core/screens/feedback.js',
  'core/playtime.js',
  'core/feedback.js',
  'core/ai.js',
  'core/ai-setup.js',
  'core/language.js',
  'core/phone-ai.js',
  'core/phone-bonds.js',
  'core/phone-prefs.js',
  'core/phone-scenes.js',
  'modes/fusion-contracts.js',
  'core/screens/icon-picker.js',
  'core/screens/get-app.js',
  'core/screens/settings.js',
  'core/screens/about.js',
  'core/screens/records.js',
  'core/screens/fight-lab.js',
  'core/screens/changelog.js',
  'modes/grids.js',
  'modes/gauntlet.js',
  'modes/tier-target.js',
  'modes/blind-tier-list.js',
  'modes/forbidden-fusion.js',
  'modes/brawl.js',
  'modes/brawl-rules.js',
  'modes/dynasty.js',
  'modes/dynasty-rules.js',
  'modes/dynasty-off.js',
  'modes/dynasty-media.js',
  'modes/dynasty-legacy.js',
  'modes/dynasty-weekly.js',
  'modes/dynasty-map.js',
  'modes/dynasty-tamper.js',
  'modes/fusion-rules.js',
  'modes/fusion-phone.js',
  'core/phone-ui.js',
  'core/cleanup.js',
  'core/phone-core.js',
  'core/phone-dating.js',
  'modes/dynasty-phone.js',
  'data/roster.json',
  'fonts/poppins-600.woff2',
  'fonts/poppins-700.woff2',
  'fonts/poppins-800.woff2',
  'fonts/poppins-700-italic.woff2',
  'fonts/poppins-800-italic.woff2',
  'fonts/inter-400.woff2',
  'fonts/inter-500.woff2',
  'fonts/inter-600.woff2',
  'fonts/inter-600-italic.woff2',
  'icons/mascot.webp',
  'icons/badge.webp',
  'icons/favicon-64.png',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) =>
      // cache: 'reload' skips the browser's own cache so we save fresh files.
      cache.addAll(APP_FILES.map((url) => new Request(url, { cache: 'reload' }))),
    ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((k) => k.startsWith('t7p-app-') && k !== APP_CACHE)
        .map((k) => caches.delete(k))))
      .then(() => caches.open(ART_CACHE))
      .then((art) => art.keys().then((reqs) => Promise.all(reqs
        .filter((r) => r.url.includes('/music/') && !MUSIC_FILES.some((f) => r.url.endsWith(`/music/${f}`)))
        .map((r) => art.delete(r)))))
      .then(() => self.clients.claim()),
  );
});

// The page asks for this when the player taps "Reload" on the update message.
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Opening the app: answer with the saved index.html.
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('index.html', { cacheName: APP_CACHE })
        .then((hit) => hit || fetch(req)),
    );
    return;
  }

  // Release notes: always try the internet first so the update pop-up can
  // describe the new version; fall back to the saved copy offline.
  if (url.pathname.endsWith('/whats-new.json')) {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .catch(() => caches.match('whats-new.json', { cacheName: APP_CACHE })),
    );
    return;
  }

  // Portraits, 3D models and music: saved the first time they are used.
  if (url.pathname.includes('/portraits/') || url.pathname.includes('/models/') || url.pathname.includes('/art/')
      || url.pathname.includes('/music/')) {
    event.respondWith(
      caches.open(ART_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Everything else: the saved copy first, the network if it is missing.
  event.respondWith(
    caches.match(req, { cacheName: APP_CACHE, ignoreSearch: true })
      .then((hit) => hit || fetch(req)),
  );
});
