// Service worker: permette l'uso completamente offline.
// File dell'app: si prende la versione più recente quando c'è rete (entro 4 secondi),
// altrimenti la copia salvata. Librerie esterne: sempre dalla copia salvata.
const CACHE_VERSION = 'v20';
const CACHE = 'verbali-cse-' + CACHE_VERSION;

const APP = [
  './', './index.html', './styles.css', './app.js', './db.js', './util.js', './checklist.js', './catalogo.js', './pdf.js', './logo.js', './word.js', './drive.js', './sync.js',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'
];
const CDN = [
  'https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.module.js',
  'https://cdn.jsdelivr.net/npm/dexie@3.2.4/dist/dexie.min.js',
  'https://cdn.jsdelivr.net/npm/signature_pad@4.1.7/dist/signature_pad.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/pdfmake.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/vfs_fonts.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(APP.map(u => new Request(u, { cache: 'reload' })));
    // Le librerie esterne: un errore su una non blocca l'installazione.
    await Promise.all(CDN.map(async u => {
      try {
        const r = await fetch(u, { mode: 'cors' });
        if (r.ok) await c.put(u, r);
      } catch { /* verrà riprovata al primo utilizzo */ }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE && k !== CACHE + '-font') await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

async function retePrima(req) {
  const c = await caches.open(CACHE);
  try {
    const r = await Promise.race([
      fetch(req, { cache: 'no-cache' }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))
    ]);
    if (r.ok) c.put(req, r.clone());
    return r;
  } catch (err) {
    const cached = await c.match(req, { ignoreSearch: true });
    if (cached) return cached;
    if (req.mode === 'navigate') return c.match('./index.html');
    throw err;
  }
}

// Solo le librerie dell'elenco CDN: indirizzi esatti, senza ignorare i parametri.
async function cachePrima(req) {
  const cached = await caches.match(req.url);
  if (cached) return cached;
  const r = await fetch(req);
  if (r.ok) (await caches.open(CACHE)).put(req.url, r.clone());
  return r;
}

async function caratteri(req) {
  const c = await caches.open(CACHE + '-font');
  const cached = await c.match(req.url);
  if (cached) return cached;
  const r = await fetch(req);
  if (r.ok || r.type === 'opaque') c.put(req.url, r.clone());
  return r;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) e.respondWith(retePrima(req));
  else if (CDN.includes(url.origin + url.pathname)) e.respondWith(cachePrima(req));
  // Caratteri tipografici: salvati al primo uso, così l'aspetto resta uguale anche offline.
  else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') e.respondWith(caratteri(req));
  // Tutto il resto (indirizzi, partite IVA) va sempre in rete, senza cache.
});
