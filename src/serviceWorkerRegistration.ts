export async function unregisterOldServiceWorkers() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  const registrations = await navigator.serviceWorker.getRegistrations();
  for (const registration of registrations) {
    await registration.unregister();
  }
}

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  const isLocalhost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";
  const isSecureOrigin =
    window.location.protocol === "https:" ||
    isLocalhost ||
    window.isSecureContext;

  if (!import.meta.env.PROD && !isSecureOrigin) {
    console.warn(
      "Service Worker registration skipped: non-secure origin in development",
      {
        hostname: window.location.hostname,
        protocol: window.location.protocol,
        isSecureContext: window.isSecureContext
      }
    );
    return;
  }

  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      console.log(
        "Service Worker registrato con successo:",
        registration.scope
      );

      registration.update();

      if (registration.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
      }

      if (registration.active && !navigator.serviceWorker.controller) {
        const hasReloaded = sessionStorage.getItem("swReloaded") === "1";
        if (!hasReloaded) {
          sessionStorage.setItem("swReloaded", "1");
          window.location.reload();
          return;
        }
      }

      registration.addEventListener("updatefound", () => {
        const installingWorker = registration.installing;
        if (!installingWorker) return;
        installingWorker.addEventListener("statechange", () => {
          if (
            installingWorker.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            installingWorker.postMessage({ type: "SKIP_WAITING" });
          }
        });
      });
    } catch (error) {
      console.warn("Service Worker non registrato:", error);
    }
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    sessionStorage.removeItem("swReloaded");
    window.location.reload();
  });
}
