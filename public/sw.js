const OFFLINE = "/portal/offline";
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open("portal-v1").then((c) => c.add(OFFLINE)));
  self.skipWaiting();
});
self.addEventListener("activate", () => self.clients.claim());
self.addEventListener("fetch", (e) => {
  // Só navegações (HTML): se a rede cair, mostra a página de offline. Nada de dados é cacheado.
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE)));
  }
});
