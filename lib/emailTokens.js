// lib/emailTokens.js
// Signed, login-free unsubscribe links. Server-only (node:crypto) — kept apart
// from lib/emailPrefs.js so the gate table stays importable from the browser
// bundle (the dashboard preference block uses it).

import { createHmac, timingSafeEqual } from 'node:crypto';
import { EMAIL_PREFS } from './emailPrefs';

export const SITE_URL = 'https://www.ielts-bank.com';

export function emailSecret() {
  return (
    process.env.EMAIL_UNSUBSCRIBE_SECRET ||
    process.env.NEWSLETTER_UNSUBSCRIBE_SECRET ||
    process.env.CRON_SECRET ||
    ''
  );
}

function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

// Legacy, whole-newsletter token: HMAC(email). Links already sitting in
// people's inboxes use this, so it must keep working forever.
export function unsubscribeToken(email) {
  const secret = emailSecret();
  if (!secret) return '';
  return createHmac('sha256', secret).update(normalizeEmail(email)).digest('hex');
}

// Pref-scoped token: HMAC("<email>:<pref>"). A token for one pref can never
// flip the other one.
export function prefUnsubscribeToken(email, pref) {
  const secret = emailSecret();
  if (!secret || !EMAIL_PREFS.includes(pref)) return '';
  return createHmac('sha256', secret).update(`${normalizeEmail(email)}:${pref}`).digest('hex');
}

function safeEquals(expected, token) {
  if (!expected || !/^[a-f0-9]{64}$/.test(String(token || ''))) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(String(token)));
}

export function validUnsubscribeToken(email, token) {
  return safeEquals(unsubscribeToken(email), token);
}

export function validPrefUnsubscribeToken(email, pref, token) {
  return safeEquals(prefUnsubscribeToken(email, pref), token);
}

// The link that goes in the footer of every gated lifecycle email. One click,
// no login, no confirmation step — it flips exactly the pref that produced
// this email.
export function prefUnsubscribeUrl(email, pref) {
  const token = prefUnsubscribeToken(email, pref);
  if (!token) return '';
  return `${SITE_URL}/api/newsletter/unsubscribe?email=${encodeURIComponent(
    normalizeEmail(email)
  )}&pref=${pref}&token=${token}`;
}
