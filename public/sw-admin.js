/**
 * Himalayan Koh Admin — PWA Service Worker & Secure Push Handler
 *
 * Security & Isolation Rules:
 * 1. Network-only for all /api/* routes, admin endpoints, credentials, CRM/LeadOS, and PII.
 * 2. Static asset caching ONLY for public brand assets and fonts.
 * 3. Standards-compliant Web Push notification listener with event deduplication.
 * 4. Deep-link routing on notification click.
 */

const CACHE_NAME = 'hk-admin-shell-v1';
const STATIC_SHELL_ASSETS = [
  '/logo.svg',
  '/images/hk_salt_crystal.webp',
  '/admin-manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_SHELL_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // RULE: NEVER cache API calls, admin mutation endpoints, or PII. Always fetch fresh from network.
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/wp-json/') ||
    url.pathname.startsWith('/admin') ||
    event.request.method !== 'GET'
  ) {
    return; // allow browser network fetch
  }

  // Only cache static shell assets
  if (STATIC_SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request);
      })
    );
  }
});

// Real Web Push Notification Listener
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = {
      title: 'Himalayan Koh Alert',
      body: event.data.text() || 'New operational update in Admin console',
      url: '/admin',
    };
  }

  const title = payload.title || 'Himalayan Koh Admin';
  const options = {
    body: payload.body || 'New order or operational activity received.',
    icon: payload.icon || '/logo.svg',
    badge: '/logo.svg',
    tag: payload.tag || `hk-order-${Date.now()}`,
    data: {
      url: payload.url || '/admin/orders',
      timestamp: Date.now(),
    },
    vibrate: [100, 50, 100],
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Deep-link on notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) || '/admin/orders';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/admin') && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
