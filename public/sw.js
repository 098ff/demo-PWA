// Demo PWA Service Worker for Push Notifications

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {
    title: '🚨 BEEP ALERT!',
    body: 'มีคนกดส่งสัญญาณปี๊ปหาคุณ!',
    custom_sound_url: '',
    from: 'Someone'
  };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const notificationOptions = {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    sound: '/noti.mp3',
    silent: false,
    tag: 'beep-notification-' + Date.now(),
    renotify: true,
    requireInteraction: true,
    // Aggressive vibration pattern for attention
    vibrate: [500, 150, 500, 150, 800, 150, 800],
    data: {
      url: '/',
      custom_sound_url: data.custom_sound_url || '/noti.mp3',
      from: data.from,
      timestamp: Date.now()
    }
  };

  event.waitUntil(
    (async () => {
      // 1. Notify any active windows to play sound immediately via Web Audio / HTML5 Audio
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      });

      for (const client of windowClients) {
        client.postMessage({
          type: 'PLAY_BEEP_NOW',
          data: data
        });
      }

      // 2. Display the system push notification
      return self.registration.showNotification(data.title, notificationOptions);
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const customSoundUrl = event.notification.data?.custom_sound_url || '';
  const fromUser = event.notification.data?.from || '';

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      });

      for (const client of windowClients) {
        if ('focus' in client) {
          client.postMessage({
            type: 'PLAY_BEEP_NOW',
            data: { custom_sound_url: customSoundUrl, from: fromUser }
          });
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(`/?beep=1&from=${encodeURIComponent(fromUser)}`);
      }
    })()
  );
});
