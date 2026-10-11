// lib/checkoutRecovery.js
// Abandoned-checkout recovery (growth sprint Sep 23, monetization action #3).
//
//   1. Checkout Sessions expire after CHECKOUT_EXPIRY_SECONDS (3h, not
//      Stripe's 24h default) with after_expiration.recovery enabled, so Stripe
//      attaches a 30-day recovery URL to the expired session.
//   2. The webhook's checkout.session.expired branch (lib/billing.js) records
//      `checkout_expired` and queues ONE existing `checkout_abandoned`
//      lifecycle email (queueCheckoutRecoveryEmail below).
//   3. The email links to OUR route, /billing/resume?c=<opaque token> — never
//      to Stripe's recovery URL. Opening Stripe's URL mints a fresh session
//      copy without passing through pages/api/billing/checkout.js, which would
//      skip the already_premium / already_exam_pass / promo guards for 30 days
//      (double subscriptions, a second pass resetting expiry, an ended promo
//      coupon reused). The resume route (pages/api/billing/resume.js +
//      lib/checkoutResume.js) makes the learner sign in as the same account,
//      re-runs the shared guards (lib/checkoutEligibility.js) and opens a
//      brand-new session through the normal checkout handler.
//   4. The token -> {user, original session, plan, upgrade context, Stripe
//      recovery URL} mapping lives in lifecycle_emails.payload (service-role
//      only; no new table). The recovery URL is kept there for support only
//      and is never rendered or redirected to. Nothing here reaches analytics.
//   5. A purchase from the resume route carries metadata.resumed_from; one
//      from a Stripe recovery URL carries `recovered_from`. The webhook records
//      `checkout_recovered` for both and flags any DUPLICATE PURCHASE.
//
// Consent: the email is the existing checkout_abandoned type, so the delivery
// cron applies the same study-plan preference gate and one-click unsubscribe
// as before (lib/emailPrefs.js). At most one per learner per 7 days, never to
// someone who already has Pro.

import { isPremiumRow } from './premium';
import { normalizeUpgradeContext } from './upgradeContext';

export const CHECKOUT_EXPIRY_SECONDS = 3 * 60 * 60;
export const RECOVERY_EMAIL_COOLDOWN_DAYS = 7;
// How long an emailed resume link works. Every use re-checks eligibility and
// prices a new session at today's catalogue, so this is a courtesy limit, not
// a safety one. Matches Stripe's own 30-day recovery window.
export const RESUME_TTL_DAYS = 30;
const DAY_MS = 86400000;
const SITE_URL = 'https://www.ielts-bank.com';
// Mirrors CHECKOUT_SKUS in lib/billing (not imported: lib/billing imports
// this module). The resume route re-validates against the live list.
const RESUMABLE_SKUS = ['monthly', 'annual', 'exam_pass', 'week_pass'];

// Both parameters are valid for `payment` (Exam Pass) and `subscription`
// sessions on the hosted page (Stripe API 2026-06-24: after_expiration is only
// refused for ui_mode=elements; expires_at must be 30 min – 24 h after
// creation). Recovered sessions follow the same promotion-code rule as the
// original: no user codes when a coupon is already attached.
export function checkoutExpiryParams({ nowMs = Date.now(), allowPromotionCodes = true } = {}) {
  return {
    expires_at: Math.floor(nowMs / 1000) + CHECKOUT_EXPIRY_SECONDS,
    after_expiration: {
      recovery: { enabled: true, allow_promotion_codes: Boolean(allowPromotionCodes) },
    },
  };
}

// Only ever STORE a Stripe-hosted HTTPS recovery URL (support reference; it
// is never emailed or redirected to — see the header).
export function safeRecoveryUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (host !== 'stripe.com' && !host.endsWith('.stripe.com')) return null;
  return url.toString();
}

// 24 random bytes, base64url: 32 characters, unguessable, carries no data.
// Web Crypto rather than node:crypto: lib/billing (which imports this module)
// is also bundled for the browser via src/lib/useVisitorMarket.
export function newResumeToken() {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function isResumeToken(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{32}$/.test(value);
}

export function resumeUrl(token) {
  return `${SITE_URL}/billing/resume?c=${encodeURIComponent(token)}`;
}

// The resume link to render in the email, or null when the row has no valid
// token (cron-fallback rows, legacy rows) or the link has lapsed.
export function liveResumeUrl(payload, nowMs = Date.now()) {
  if (!isResumeToken(payload?.resume_token)) return null;
  const expiresAt = Date.parse(payload?.resume_expires_at || '');
  if (Number.isFinite(expiresAt) && expiresAt <= nowMs) return null;
  return resumeUrl(payload.resume_token);
}

function utcDateKey(date) {
  return date.toISOString().slice(0, 10);
}

// The coupon the expired session carried (promo or win-back), so the resume
// route can tell when the advertised discount has since ended.
export function couponFromSession(session) {
  const stamped = session?.metadata?.discount_coupon;
  if (typeof stamped === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(stamped)) return stamped;
  for (const discount of session?.discounts || []) {
    const coupon = typeof discount?.coupon === 'string' ? discount.coupon : discount?.coupon?.id;
    if (typeof coupon === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(coupon)) return coupon;
  }
  return null;
}

// Queue the recovery email for an expired session. Returns a short status for
// webhook logs. Never throws: the durable `checkout_expired` record is written
// by the caller first, and a failed email must not make Stripe retry forever.
export async function queueCheckoutRecoveryEmail(admin, userId, {
  sessionId,
  sessionCreated,
  recoveryUrl = null,
  recoveryExpiresAt = null,
  sku = null,
  upgrade = '',
  upgradeContext = null,
  coupon = null,
  now = new Date(),
  token = newResumeToken(),
}) {
  if (!RESUMABLE_SKUS.includes(sku)) return 'recovery email skipped (unknown plan)';
  try {
    const { data: user, error: userError } = await admin
      .from('users')
      .select('email, plan, plan_status, plan_renews_at, plan_expires_at, billing_pause_until')
      .eq('id', userId)
      .maybeSingle();
    if (userError) throw userError;
    if (!user?.email) return 'recovery email skipped (no email)';
    if (isPremiumRow(user, now.getTime())) return 'recovery email skipped (already premium)';

    const since = new Date(now.getTime() - RECOVERY_EMAIL_COOLDOWN_DAYS * DAY_MS).toISOString();
    const { data: recent, error: recentError } = await admin
      .from('lifecycle_emails')
      .select('id')
      .eq('user_id', userId)
      .eq('email_type', 'checkout_abandoned')
      .gte('created_at', since)
      .limit(1);
    if (recentError) throw recentError;
    if (recent?.length) return 'recovery email skipped (sent within 7 days)';

    const created = Number.isFinite(sessionCreated) && sessionCreated > 0
      ? new Date(sessionCreated * 1000)
      : now;
    const context = normalizeUpgradeContext(upgradeContext || { upgrade });
    const { error } = await admin.from('lifecycle_emails').insert({
      user_id: userId,
      recipient_email: String(user.email).toLowerCase(),
      email_type: 'checkout_abandoned',
      // Same key shape as the cron fallback, so the two can never both send.
      idempotency_key: `checkout_abandoned:${userId}:${utcDateKey(created)}`,
      payload: {
        upgrade: context.upgrade || '',
        ...(context.stage ? { stage: context.stage } : {}),
        ...(context.return_to ? { return_to: context.return_to } : {}),
        sku,
        session_id: sessionId || null,
        coupon: coupon || null,
        resume_token: token,
        resume_expires_at: new Date(now.getTime() + RESUME_TTL_DAYS * DAY_MS).toISOString(),
        // Support reference only — never rendered or redirected to.
        recovery_url: safeRecoveryUrl(recoveryUrl),
        recovery_expires_at: recoveryExpiresAt,
      },
    });
    if (error && error.code !== '23505') throw error;
    return error ? 'recovery email already queued' : 'recovery email queued';
  } catch (error) {
    console.error('checkout recovery email not queued:', error?.message || error);
    return 'recovery email failed';
  }
}

// Upgrade context ("writing" / "speaking" / "mock", plus stage and return
// path) travels in the success URL, which the expired session still carries.
export function upgradeContextFromSession(session) {
  try {
    const params = new URL(session?.success_url || '').searchParams;
    return normalizeUpgradeContext({
      upgrade: params.get('upgrade'),
      stage: params.get('stage'),
      return_to: params.get('return_to'),
    });
  } catch {
    return {};
  }
}

export function upgradeFromSession(session) {
  return upgradeContextFromSession(session).upgrade || '';
}
