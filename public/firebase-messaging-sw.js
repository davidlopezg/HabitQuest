/**
 * Service Worker de Firebase Cloud Messaging (avisos con la app CERRADA).
 *
 * Se registra en tiempo de ejecución con la config de Firebase como parámetro
 * (?cfg=...), así el fichero público no necesita conocer la config en build.
 *
 * Requisitos del proyecto Firebase: Cloud Messaging habilitado + VAPID key.
 */

importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

let messaging = null;
try {
  const cfg = JSON.parse(new URLSearchParams(self.location.search).get('cfg') || '{}');
  if (cfg && cfg.messagingSenderId) {
    const app = firebase.initializeApp(cfg);
    messaging = firebase.messaging(app);
  }
} catch (err) {
  console.warn('[FCM] no configurado', err);
}

if (messaging) {
  messaging.onBackgroundMessage((payload) => {
    const n = payload.notification || {};
    const data = payload.data || {};
    return self.registration.showNotification(n.title || 'HabitQuest', {
      body: n.body || 'Tienes un hábito pendiente.',
      icon: data.icon || undefined,
      badge: data.badge || undefined,
      tag: data.tag || undefined,
      data: { url: data.url || '/HabitQuest/' },
    });
  });
}

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
