// Hors-ligne : l'app est mise en cache à la 1re visite ; les fichiers du lecteur de texte
// (jsdelivr) sont mis en cache la 1re fois qu'on scanne une carte.
// Pour publier une nouvelle version, changer VERSION.
const VERSION = 'v0.10';
const APP = [
  './', 'index.html', 'style.css', 'app.js', 'xlsx.js', 'parse-card.js', 'store.js',
  'sync.js', 'stats.js', 'duree.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(APP)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== 'ocr').map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const cdn = url.hostname === 'cdn.jsdelivr.net';
  if (url.origin !== location.origin && !cdn) return; // les données de langue passent par Tesseract lui-même
  const store = cdn ? 'ocr' : VERSION;
  // Réseau d'abord : une mise à jour du code arrive tout de suite quand il y a du réseau ;
  // hors ligne, on sert la copie en cache.
  const fromNet = () =>
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(store).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req));
  // les gros fichiers du lecteur de texte : copie en cache d'abord, pour ne pas les retélécharger
  e.respondWith(cdn ? caches.match(req).then((hit) => hit || fromNet()) : fromNet());
});
