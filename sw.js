// Offline support for T7P Arcade.
// On first visit this saves every file in APP_FILES on the phone. After that the
// game opens from that copy, with or without internet.
//
// RELEASING AN UPDATE: bump CACHE_VERSION (and APP_VERSION in core/version.js)
// to the same number, and add any new files to APP_FILES.

const CACHE_VERSION = '0.1.0';
const APP_CACHE = `t7p-app-${CACHE_VERSION}`;
const ART_CACHE = 't7p-art'; // portraits and models: kept across versions

const APP_FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'styles/tokens.css',
  'styles/base.css',
  'styles/screens.css',
  'core/app.js',
  'core/version.js',
  'core/store.js',
  'core/settings.js',
  'core/profile.js',
  'core/characters.js',
  'core/modes.js',
  'core/ui.js',
  'core/router.js',
  'core/install.js',
  'core/screens/loading.js',
  'core/screens/menu.js',
  'core/screens/icon-picker.js',
  'core/screens/get-app.js',
  'core/screens/settings.js',
  'core/screens/about.js',
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

  // Portraits and 3D models: saved the first time they are shown.
  if (url.pathname.includes('/portraits/') || url.pathname.includes('/models/')) {
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
