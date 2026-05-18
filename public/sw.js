const CACHE_NAME = "oggi-app-v6";
const ASSETS_TO_CACHE = ["/", "/index.html", "/favicon.svg", "/manifest.json"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('push', (event) => {
  const data = event.data?.json?.() ?? {};
  const title = data.title || 'Nuova notifica';
  const options = {
    body: data.body || data.message || '',
    icon: '/leaf-512.png',
    badge: '/leaf-512.png',
    requireInteraction: true,
    data: {
      url: data.url || '/',
      ...data.data
    }
  };

  console.log('ServiceWorker push event received', data);
  event.waitUntil(
    Promise.all([
      self.registration
        .showNotification(title, options)
        .then(() => console.log('ServiceWorker notification shown', title, options))
        .catch((error) => console.error('ServiceWorker showNotification failed', error)),
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
        clients.forEach((client) => client.postMessage({ type: 'PUSH_RECEIVED' }));
      })
    ])
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client && client.url === targetUrl) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
