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

self.addEventListener("push", (event) => {
  const data = event.data?.json?.() ?? {};
  const title = data.title || "Nuova notifica";
  const badgeCount = Number(data.badgeCount ?? data.data?.badgeCount ?? 0) || 0;
  const options = {
    body: data.body || data.message || "",
    icon: "/leaf-512.png",
    badge: "/leaf-512.png",
    requireInteraction: true,
    silent: false,
    vibrate: [120, 80, 120],
    data: {
      url: data.url || "/",
      ...data.data,
      badgeCount
    }
  };

  const updateBadgePromise = (() => {
    if (typeof self.registration.setAppBadge === "function") {
      if (badgeCount > 0) {
        return self.registration.setAppBadge(badgeCount);
      }
      if (typeof self.registration.clearAppBadge === "function") {
        return self.registration.clearAppBadge();
      }
      return self.registration.setAppBadge(0);
    }
    return Promise.resolve();
  })();

  console.log("ServiceWorker push event received", data);
  event.waitUntil(
    Promise.all([
      self.registration
        .showNotification(title, options)
        .then(() =>
          console.log("ServiceWorker notification shown", title, options)
        )
        .catch((error) =>
          console.error("ServiceWorker showNotification failed", error)
        ),
      updateBadgePromise.catch((error) =>
        console.error("ServiceWorker app badge update failed", error)
      ),
      self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((clients) => {
          clients.forEach((client) =>
            client.postMessage({ type: "PUSH_RECEIVED", badgeCount })
          );
        })
    ])
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const normalizeTargetUrl = (rawUrl) => {
    const value = typeof rawUrl === "string" && rawUrl.trim() ? rawUrl : "/";
    if (value.startsWith("http://") || value.startsWith("https://")) {
      return value;
    }
    if (value.startsWith("/#") || value.startsWith("#")) {
      return value.startsWith("#") ? `/${value}` : value;
    }
    if (value === "/") {
      return "/#/";
    }
    return `/#${value.startsWith("/") ? value : `/${value}`}`;
  };

  const targetUrl = normalizeTargetUrl(event.notification.data?.url);

  const sameRoute = (clientUrl, desiredUrl) => {
    try {
      const current = new URL(clientUrl);
      const desired = new URL(desiredUrl, self.location.origin);
      return (
        current.origin === desired.origin &&
        current.pathname === desired.pathname &&
        current.hash === desired.hash
      );
    } catch {
      return false;
    }
  };

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ("focus" in client && sameRoute(client.url, targetUrl)) {
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
