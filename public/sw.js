const CACHE_NAME = 'habitquest-v2';
const PRECACHE = ['/HabitQuest/', '/HabitQuest/index.html'];

// Precarga mínima: solo el shell.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

// Activar de inmediato y limpiar cachés antiguas.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Estrategia: red primero para navegaciones (siempre app nueva si hay red),
// caché con relleno en red para el resto (assets versionados).
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put('/HabitQuest/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/HabitQuest/index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok && new URL(req.url).origin === self.location.origin) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

// Clic en una notificación → enfocar la app (o abrirla).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/HabitQuest/';
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const client = all.find((c) => c.visibilityState === 'visible') || all[0];
      if (client) {
        await client.focus();
        if ('navigate' in client) client.navigate(target).catch(() => {});
      } else {
        await self.clients.openWindow(target);
      }
    })()
  );
});
