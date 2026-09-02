// src/lib/push.js
// Browser side of the daily reminder.
//
// Rules baked in here:
//   * The service worker is registered ONLY inside enableReminders(), i.e.
//     after an explicit click. Nothing registers or prompts on page load.
//   * Notification.requestPermission() is likewise called only from that click
//     (browsers require a user gesture anyway, and a cold prompt is the
//     fastest way to get permanently blocked).
//   * iOS/iPadOS Safari can only subscribe when the site is installed to the
//     Home Screen — detected, and surfaced as a hint instead of a dead button.

const SW_URL = '/sw.js';

export function pushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function isIos() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports itself as a Mac, but has touch points.
    (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1)
  );
}

// Installed-to-Home-Screen check (the iOS precondition for web push).
export function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.navigator?.standalone === true ||
    window.matchMedia?.('(display-mode: standalone)')?.matches === true
  );
}

export function iosNeedsInstall() {
  return isIos() && !isStandalone();
}

export function permissionState() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index);
  return output;
}

export function timeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

// Minutes EAST of UTC (the sign people expect), unlike getTimezoneOffset().
export function tzOffsetMinutes() {
  return -new Date().getTimezoneOffset();
}

async function registerWorker() {
  const existing = await navigator.serviceWorker.getRegistration(SW_URL);
  const registration = existing || (await navigator.serviceWorker.register(SW_URL));
  await navigator.serviceWorker.ready;
  return registration;
}

// The push subscription this browser already holds, or null. Registers
// nothing: it only inspects an existing registration.
export async function currentSubscription() {
  if (!pushSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.getRegistration(SW_URL);
    if (!registration) return null;
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

async function vapidKey() {
  const response = await fetch('/api/push/key');
  if (!response.ok) throw new Error('push-not-configured');
  const { key } = await response.json();
  if (!key) throw new Error('push-not-configured');
  return key;
}

async function postSubscription(accessToken, body) {
  const response = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`subscribe-${response.status}`);
  return response.json();
}

// Full enable flow, called straight from the click handler.
export async function enableReminders({ accessToken, reminderHour = 19 }) {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };
  if (iosNeedsInstall()) return { ok: false, reason: 'ios-install-required' };
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: `permission-${permission}` };

  const registration = await registerWorker();
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(await vapidKey()),
    }));

  await postSubscription(accessToken, {
    subscription: subscription.toJSON(),
    reminder_hour_local: reminderHour,
    time_zone: timeZone(),
    tz_offset_minutes: tzOffsetMinutes(),
  });
  return { ok: true, endpoint: subscription.endpoint };
}

// Change the reminder time for the subscription this browser already has.
export async function updateReminderHour({ accessToken, reminderHour }) {
  const subscription = await currentSubscription();
  if (!subscription) return { ok: false, reason: 'not-subscribed' };
  await postSubscription(accessToken, {
    subscription: subscription.toJSON(),
    reminder_hour_local: reminderHour,
    time_zone: timeZone(),
    tz_offset_minutes: tzOffsetMinutes(),
  });
  return { ok: true };
}

// Turn reminders off: drop the browser subscription AND disable the row, so a
// stale endpoint can never keep firing.
export async function disableReminders({ accessToken }) {
  const subscription = await currentSubscription();
  if (!subscription) return { ok: true };
  const { endpoint } = subscription;
  try {
    await subscription.unsubscribe();
  } catch {
    /* the row is disabled below regardless */
  }
  await fetch('/api/push/subscribe', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ endpoint }),
  });
  return { ok: true };
}
