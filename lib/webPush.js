// lib/webPush.js
// Thin wrapper around the `web-push` package: VAPID config from env, one
// send() that classifies the outcome, and a lazy import so unit tests (and any
// route that never sends) don't need the dependency loaded.
//
// Env (Vercel + .env.local, never committed):
//   WEB_PUSH_PUBLIC_KEY   VAPID public key, base64url — also served to the
//                         browser by /api/push/key as applicationServerKey.
//   WEB_PUSH_PRIVATE_KEY  VAPID private key, base64url.
//   WEB_PUSH_SUBJECT      mailto: or https: contact URL required by the spec.

let cachedModule = null;

export function vapidConfig() {
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY || '';
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY || '';
  const subject = process.env.WEB_PUSH_SUBJECT || 'mailto:hello@ielts-bank.com';
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

export async function loadWebPush() {
  if (cachedModule) return cachedModule;
  const imported = await import('web-push');
  cachedModule = imported.default || imported;
  return cachedModule;
}

// 404/410 from a push service means the subscription is permanently gone
// (browser reinstalled, permission revoked, endpoint expired) — the caller
// disables the row instead of retrying.
export function isGoneStatus(statusCode) {
  return statusCode === 404 || statusCode === 410;
}

// subscription: { endpoint, keys: { p256dh, auth } }
// payload: plain object, JSON-encoded for the service worker.
export async function sendPush(subscription, payload, { webPush = null, ttl = 6 * 3600 } = {}) {
  const config = vapidConfig();
  if (!config) return { sent: false, gone: false, reason: 'web-push-not-configured' };
  const client = webPush || (await loadWebPush());
  try {
    client.setVapidDetails(config.subject, config.publicKey, config.privateKey);
    await client.sendNotification(
      { endpoint: subscription.endpoint, keys: subscription.keys },
      JSON.stringify(payload),
      { TTL: ttl, urgency: 'normal' }
    );
    return { sent: true, gone: false, reason: 'ok' };
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 0;
    return {
      sent: false,
      gone: isGoneStatus(statusCode),
      statusCode,
      reason: `push-${statusCode || 'error'}: ${String(error?.message || 'send failed').slice(0, 160)}`,
    };
  }
}
