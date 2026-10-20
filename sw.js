// Service worker: mette in cache l'app e le librerie per l'uso completamente offline.
// A ogni modifica dei file dell'app, incrementare CACHE_VERSION.
const CACHE_VERSION = 'v2';
const CACHE = 'verbali-cse-' + CACHE_VERSION;

const APP = [
  './', './index.html', './styles.css', './app.js', './db.js', './util.js', './checklist.js', './catalogo.js', './pdf.js',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'
];
const CDN = [
  'https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.module.js',
  'https://cdn.jsdelivr.net/npm/dexie@3.2.4/dist/dexie.min.js',
  'https://cdn.jsdelivr.net/npm/signature_pad@4.1.7/dist/signature_pad.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/pdfmake.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/vfs_fonts.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(APP);
    await Promise.all(CDN.map(async u => {
      const r = await fetch(u, { mode: 'cors' });
      if (!r.ok) throw new Error('Download fallito: ' + u);
      await c.put(u, r);
    }));
    // Alla prima installazione si attiva subito; gli aggiornamenti attendono la conferma dell'utente.
    if (!self.registration.active) self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;
    try {
      return await fetch(req);
    } catch (err) {
      if (req.mode === 'navigate') return caches.match('./index.html');
      throw err;
    }
  })());
});
