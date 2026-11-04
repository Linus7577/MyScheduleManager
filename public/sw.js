// The service worker: shows push notifications, and keeps today's Loop readable with no connection.
// Only /loop is ever saved as a page, because every other page holds private data with no need to work offline.

const STATIC_CACHE = "static-v1";
const PAGE_CACHE = "pages-v1";
const OFFLINE_PAGE = "/offline.html";
const LOOP_PAGE = "/loop";
const LOGIN_PAGE = "/login";
const MAX_STATIC_FILES = 400;
const STATIC_PATHS = ["/_next/static/", "/art/", "/audio/", "/icons/"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.add(OFFLINE_PAGE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== STATIC_CACHE && name !== PAGE_CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

/** Each new release adds files under new names, so the oldest are dropped to keep this from growing forever. */
async function trimStatic(cache) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(keys.length - MAX_STATIC_FILES, 0)).map((key) => cache.delete(key)));
}

async function staticFile(request) {
  const cache = await caches.open(STATIC_CACHE);
  const saved = await cache.match(request);
  if (saved) return saved;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    await trimStatic(cache);
  }
  return response;
}


/** The newest version whenever there's a connection. The saved Loop, or a plain notice, when there isn't. */
async function page(request) {
  const url = new URL(request.url);
  const isTodaysLoop = url.pathname === LOOP_PAGE && !url.search;
  try {
    const response = await fetch(request);
    // Reaching the login page means nobody is signed in here, so the saved page is no longer theirs to read.
    // A page's redirect can't be seen from here, so it's the login page's own arrival that counts.
    if (url.pathname === LOGIN_PAGE) await caches.delete(PAGE_CACHE);
    else if (isTodaysLoop && response.ok) await (await caches.open(PAGE_CACHE)).put(LOOP_PAGE, response.clone());
    return response;
  } catch {
    if (url.pathname === LOOP_PAGE) {
      const saved = await (await caches.open(PAGE_CACHE)).match(LOOP_PAGE, { ignoreVary: true });
      if (saved) return saved;
    }
    return (await caches.match(OFFLINE_PAGE)) ?? Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") event.respondWith(page(request));
  else if (STATIC_PATHS.some((path) => url.pathname.startsWith(path))) event.respondWith(staticFile(request));
});

/** Saves today's Loop and every file it needs to run, so it works offline even if the owner only opened Home today. */
async function saveLoop() {
  const response = await fetch(LOOP_PAGE, { credentials: "same-origin" });
  if (response.redirected) await caches.delete(PAGE_CACHE);
  if (!response.ok || response.redirected) return;
  await (await caches.open(PAGE_CACHE)).put(LOOP_PAGE, response.clone());
  const html = await response.text();
  const files = [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)].map((match) => match[1].replace(/&amp;/g, "&"));
  await Promise.all(files.map((file) => staticFile(new Request(file)).catch(() => null)));
}

self.addEventListener("message", (event) => {
  if (event.origin !== self.location.origin) return;
  if (event.data?.type === "save-loop") event.waitUntil(saveLoop().catch(() => null));
  if (event.data?.type === "sign-out") event.waitUntil(caches.delete(PAGE_CACHE));
});

self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data?.json() ?? {};
  } catch {
    message = {};
  }
  event.waitUntil(
    self.registration.showNotification(message.title || "My Schedule Manager", {
      body: message.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: message.tag,
      data: { url: message.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin);
  const url = target.origin === self.location.origin ? target.href : self.location.origin;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
      const open = windows.find((client) => "focus" in client);
      if (!open) return self.clients.openWindow(url);
      await open.focus();
      return open.navigate(url);
    })
  );
});
