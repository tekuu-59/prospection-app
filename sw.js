// Hors-ligne : l'app est mise en cache à la 1re visite ; les bibliothèques de vendor/ (carte, lecteur
// de texte) sont mises en cache la 1re fois qu'on s'en sert.
// Pour publier une nouvelle version, changer VERSION.
const VERSION = 'v0.12';
const APP = [
  './', 'index.html', 'style.css', 'app.js', 'xlsx.js', 'parse-card.js', 'store.js',
  'sync.js', 'stats.js', 'duree.js', 'rgpd.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
];
const VENDOR = 'vendor'; // numéro de version dans le chemin : jamais besoin de les retélécharger

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(APP)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== VENDOR).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // tuiles de carte, Nominatim : jamais en cache
  const vendor = url.pathname.includes('/vendor/');
  const store = vendor ? VENDOR : VERSION;
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
  // les gros fichiers de vendor/ : copie en cache d'abord, pour ne pas les retélécharger
  e.respondWith(vendor ? caches.match(req).then((hit) => hit || fromNet()) : fromNet());
});
