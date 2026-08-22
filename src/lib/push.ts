/**
 * Web Push server surface — the framework-agnostic half of the
 * `browser/push-subscribe` flow.
 *
 * The client effect handler (`@almadar/runtime` ClientEffectHandlers) fetches
 * the VAPID public key from `GET /api/push/vapid-public-key` and registers the
 * shared service worker served at `/almadar-push-sw.js`; the `push` integration
 * in `@almadar/integrations` signs sends with the matching private key. Only
 * the PUBLIC key ever crosses this surface.
 *
 * @packageDocumentation
 */

/** VAPID public key from the environment, or null when push is unconfigured. */
export function vapidPublicKey(): string | null {
  const key = process.env.VAPID_PUBLIC_KEY;
  return key && key.length > 0 ? key : null;
}

/** Root-scope path the shared push service worker is served from. */
export const PUSH_SERVICE_WORKER_PATH = '/almadar-push-sw.js';

/**
 * The shared push service worker. Shows the notification payload sent by the
 * `push` integration ({ title, body, icon?, url? }) and opens `url` on click.
 * Served inline so every host (playground, generated shells) shares one
 * source of truth instead of copying an asset file around.
 */
export const PUSH_SERVICE_WORKER_SOURCE = `self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(self.registration.showNotification(data.title || 'Notification', {
    body: data.body || '',
    icon: data.icon || undefined,
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(self.clients.openWindow(url));
});
`;
