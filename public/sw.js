/* SZMC Alumni Network Service Worker — Notifications, Deep-Linking & Safe PWA Caching */

const CACHE_NAME = 'szmc-alumni-shell-v2';
const PRECACHE_STATIC_ASSETS = [
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/szmc-logo.png',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(PRECACHE_STATIC_ASSETS).catch(() => undefined)
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Handle future Web Push payloads (VAPID) cleanly for background mobile drawer alerts
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      title: 'SZMC Alumni',
      body: event.data ? event.data.text() : 'You have a new notification.',
    };
  }

  const title = payload.title || 'SZMC Alumni';
  const isMessage = payload.category === 'message' || payload.type === 'new_message';
  const isBlood = payload.category === 'blood' || payload.type === 'blood_request' || payload.type === 'blood';

  const options = {
    body: payload.body || payload.message || 'Tap to open in SZMC Alumni',
    icon: payload.icon || '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: payload.tag || `szmc-push-${Date.now()}`,
    renotify: true,
    requireInteraction: Boolean(isBlood),
    vibrate: isBlood ? [220, 100, 220, 100, 220] : [120, 60, 120],
    timestamp: payload.timestamp || Date.now(),
    data: {
      route: payload.route || (isMessage ? 'messages' : 'feed'),
      conversationId: payload.conversationId || null,
      postId: payload.postId || null,
      notificationId: payload.notificationId || null,
      url: payload.url || '/',
    },
    actions: [
      { action: 'open', title: isMessage ? 'Reply' : 'View' },
      { action: 'mark_read', title: 'Mark read' },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle tap on mobile notification drawer or desktop OS notification
self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const action = event.action || 'open';
  const data = (notification && notification.data) || {};
  notification.close();

  const targetRoute =
    typeof data.route === 'string' && data.route.trim()
      ? data.route.trim()
      : data.postId
      ? `post-${data.postId}`
      : data.conversationId
      ? 'messages'
      : 'feed';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      if (action === 'mark_read') {
        for (const client of clientList) {
          client.postMessage({
            type: 'SZMC_NOTIFICATION_MARK_READ',
            notificationId: data.notificationId || null,
            conversationId: data.conversationId || null,
          });
        }
        return;
      }

      // Focus an existing open SZMC Alumni window/tab and deep-link directly
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({
            type: 'SZMC_NOTIFICATION_CLICK',
            route: targetRoute,
            conversationId: data.conversationId || null,
            postId: data.postId || null,
            notificationId: data.notificationId || null,
          });
          return client.focus();
        }
      }

      // Otherwise open a fresh PWA/browser window directly at the target hash
      const hashRoute = targetRoute.startsWith('#') ? targetRoute : `#${targetRoute}`;
      const targetUrl = new URL(`/${hashRoute}`, self.location.origin).href;
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});

// Safe fetch handler: never interfere with API calls, SSE streams, downloads, or external hosts
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/download/') ||
    url.pathname.startsWith('/@vite') ||
    url.pathname.startsWith('/src/')
  ) {
    return;
  }

  // Cache-first for immutable hashed Vite bundles and static icons
  if (
    url.pathname.startsWith('/assets/') ||
    PRECACHE_STATIC_ASSETS.includes(url.pathname)
  ) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((networkRes) => {
            if (networkRes && networkRes.ok && networkRes.type === 'basic') {
              const clone = networkRes.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => undefined);
            }
            return networkRes;
          })
      )
    );
  }
});
