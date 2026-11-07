// Service worker : met l'app en cache pour un fonctionnement 100 % hors-ligne.
// En ligne, il récupère toujours la version la plus récente. Hors-ligne, il utilise la copie du téléphone.
// Pour publier une mise à jour, change simplement le numéro de VERSION.
importScripts('./lang-list.js'); // liste des langues : leurs fichiers sont mis en cache automatiquement
const VERSION = 'v4';
const CACHE = 'langues-' + VERSION;
const FICHIERS = ['./', './index.html', './db.js', './lang.js', './style.css', './app.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './lang-list.js']
  .concat((self.LANG_CODES || []).map(c => './lang-' + c + '.js'));

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then(r => {
      if (r && r.ok && new URL(e.request.url).origin === location.origin) {
        const copie = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, copie));
      }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(hit => hit || caches.match('./index.html')))
  );
});
