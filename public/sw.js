const CACHE = "personal-os-shell-v1";
const SHELL = ["/manifest.webmanifest", "/favicon.ico"];
self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin || new URL(event.request.url).pathname.startsWith("/api/")) return;
  const requestUrl = new URL(event.request.url);
  if (event.request.mode === "navigate") { event.respondWith(fetch(event.request).catch(() => new Response("Personal OS is offline. Reconnect to load your private workspace.", { status: 503, headers: { "Content-Type": "text/plain" } }))); return; }
  if (!requestUrl.pathname.startsWith("/_next/static/") && !SHELL.includes(requestUrl.pathname)) return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => { if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone())); return response; })));
});
self.addEventListener("push", (event) => { const payload = event.data ? event.data.json() : {}; event.waitUntil(self.registration.showNotification(payload.title || "Personal OS", { body: payload.body || "A saved reminder needs your attention.", icon: "/favicon.ico", data: { url: payload.url || "/notifications" } })); });
self.addEventListener("notificationclick", (event) => { event.notification.close(); event.waitUntil(clients.openWindow(event.notification.data?.url || "/notifications")); });
