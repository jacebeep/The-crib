/**
 * THA CRIB — service worker
 * - code (html/css/js): network first, so new pushes show up right away; falls back to cache offline
 * - textures, models, fonts: cache first after the first visit
 */
const CACHE = 'tha-crib-v2';

const CORE = [
  './',
  './index.html',
  './style.css',
  './main.js',
  './mansion3d.js',
  './audio.js',
  './sync.js',
  './firebase-config.js',
  './manifest.webmanifest',
  './assets/three.min.js',
  './assets/GLTFLoader.js',
  './assets/js/DRACOLoader.js',
  './assets/js/Sky.js',
  './assets/js/Water.js',
  './assets/js/Lensflare.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const isCode = (url) => /\.(html|css|js|webmanifest)$/.test(url.pathname) || url.pathname.endsWith('/');

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  const isSdk = url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/');
  if (!sameOrigin && !isFont && !isSdk) return;

  if (sameOrigin && (req.mode === 'navigate' || isCode(url))) {
    // network first
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  // cache first (textures, models, decoder, fonts)
  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok || res.type === 'opaque') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }))
  );
});
