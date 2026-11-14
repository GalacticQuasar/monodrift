// Offline support: a service worker that keeps a copy of the game on the device.
// This is a template, not a module: the build (vite.config.ts) fills in VERSION and
// PRECACHE and writes the result to dist/sw.js. Plain JS because service worker
// types clash with the DOM types the rest of src/ is checked against.

const VERSION = __VERSION__;
const PRECACHE = __PRECACHE__;
const CACHE = `monodrift-${VERSION}`;
/** Wait this long for the network before opening the saved copy of the page. */
const PAGE_TIMEOUT_MS = 3000;

// Save every file of this version; a new deploy has a new VERSION, so it installs
// alongside the old one and takes over once it's complete.
self.addEventListener('install', e => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

// Drop the copies saved by older versions.
self.addEventListener('activate', e => {
  e.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('monodrift-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') e.respondWith(page(req));
  // JS/CSS names are content-hashed and icons rarely change: saved copy first.
  // ignoreVary: copies were saved without the Origin header the page's requests carry.
  else e.respondWith(caches.match(req, { ignoreVary: true }).then(hit => hit || fetch(req)));
});

/**
 * The page itself: from the network when it answers quickly, so online players get
 * the latest version; otherwise the saved copy. The network copy isn't saved here:
 * it may need JS/CSS this version doesn't have, so only an install updates it.
 */
async function page(req) {
  let res;
  try {
    res = await Promise.race([
      fetch(req),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), PAGE_TIMEOUT_MS)),
    ]);
    if (res.ok) return res;
  } catch {
    // offline or too slow: fall through to the saved copy
  }
  // the saved copy of this page (e.g. /updates), else the game
  const path = new URL(req.url).pathname;
  const saved = (await caches.match(path, { cacheName: CACHE, ignoreVary: true })) || (await caches.match('/', { cacheName: CACHE, ignoreVary: true }));
  return saved || res || Response.error();
}
