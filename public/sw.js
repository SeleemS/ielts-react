/* IELTS Bank service worker — daily practice reminders only.
 *
 * Deliberately NOT a caching/offline worker: it registers only after the user
 * clicks "Enable daily reminder" on the dashboard (src/lib/push.js), and it
 * intercepts no fetches, so it cannot change how any page loads.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

function parsePayload(event) {
  try {
    return event.data ? event.data.json() : {};
  } catch {
    return {};
  }
}

self.addEventListener('push', (event) => {
  const payload = parsePayload(event);
  const title = payload.title || 'Your daily IELTS question is ready';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || 'One 10-minute set keeps your streak alive.',
      icon: '/logo192.png',
      badge: '/logo192.png',
      tag: payload.tag || 'daily-reminder',
      renotify: false,
      data: {
        url: payload.url || '/review?src=push',
        notification_id: payload.notification_id || null,
        endpoint: payload.endpoint || null,
        streak: payload.streak || 0,
      },
    })
  );
});

// Lightweight click beacon (docs/ANALYTICS-TRACKING.md: push_click). No
// session in a worker, so /api/push/event authenticates by matching the
// subscription endpoint instead.
function reportClick(data) {
  if (!data?.endpoint) return Promise.resolve();
  return fetch('/api/push/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'push_click',
      endpoint: data.endpoint,
      notification_id: data.notification_id,
      streak: data.streak,
    }),
    keepalive: true,
  }).catch(() => {});
}

self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data || {};
  event.notification.close();
  const target = new URL(data.url || '/review?src=push', self.location.origin);
  event.waitUntil(
    Promise.all([
      reportClick(data),
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
        // Reuse an open tab when there is one, so the reminder never buries
        // work in progress behind a second window.
        const existing = clients.find((client) => client.url.startsWith(self.location.origin));
        if (existing) {
          return existing.focus().then((focused) => (focused || existing).navigate(target.href));
        }
        return self.clients.openWindow(target.href);
      }),
    ])
  );
});
