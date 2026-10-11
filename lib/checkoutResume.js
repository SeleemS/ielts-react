// lib/checkoutResume.js
// Server side of the recovery email's "Finish my checkout" link
// (/billing/resume?c=<token>; see lib/checkoutRecovery.js for why the email
// never carries Stripe's own recovery URL).
//
// resolveResume() decides, for a signed-in learner and the queued email row
// the token points at, whether a NEW Checkout Session may be opened for the
// same plan. It applies the same guards as checkout (lib/checkoutEligibility)
// plus the checks only a resume needs: the link belongs to this account, has
// not lapsed, names a plan still on sale, and any discount it advertised is
// still live. The route then goes through the normal checkout handler, which
// re-runs every guard again at session-creation time.

import { CHECKOUT_SKUS } from './billing';
import { checkoutEligibility } from './checkoutEligibility';
import { RESUME_TTL_DAYS, isResumeToken } from './checkoutRecovery';
import { normalizeUpgradeContext } from './upgradeContext';
import { PROMO, promoAppliesTo, weekPassEnabled } from '../src/lib/saleConfig';

const DAY_MS = 86400000;

// Where each refusal sends the learner. Pro / pass holders go to their
// dashboard; everyone else to /pricing. The `resume` query drives the
// friendly notice there (src/lib/checkoutResumeNotice.js).
const REDIRECTS = {
  not_found: '/pricing?resume=unavailable',
  expired: '/pricing?resume=expired',
  plan_unavailable: '/pricing?resume=plan_changed',
  offer_ended: '/pricing?resume=offer_ended',
  already_premium: '/dashboard?resume=already_premium',
  already_exam_pass: '/dashboard?resume=already_exam_pass',
};

export const RESUME_OUTCOMES = [
  'ok', 'not_found', 'expired', 'wrong_user', 'anonymous_user', 'plan_unavailable',
  'offer_ended', 'already_premium', 'already_exam_pass',
];

// The queued checkout_abandoned email row holding this token, or null.
// lifecycle_emails is service-role only; `admin` must be the service client.
export async function findResumeRow(admin, token) {
  if (!isResumeToken(token)) return null;
  const { data, error } = await admin
    .from('lifecycle_emails')
    .select('id, user_id, payload, created_at')
    .eq('email_type', 'checkout_abandoned')
    .eq('payload->>resume_token', token)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

function withContext(path, context) {
  const extra = new URLSearchParams(normalizeUpgradeContext(context)).toString();
  return extra ? `${path}&${extra}` : path;
}

function refuse(outcome, context = {}, extra = {}) {
  const base = REDIRECTS[outcome];
  return { ok: false, outcome, redirect: base ? withContext(base, context) : null, ...extra };
}

// Pure. `row` is findResumeRow's result, `userId` the signed-in account,
// `userRow` that account's billing columns (BILLING_USER_COLUMNS).
export function resolveResume({ row, userId, userRow, nowMs = Date.now(), winbackCouponId = process.env.STRIPE_WINBACK_COUPON_ID }) {
  if (!row?.payload || !row.user_id) return refuse('not_found');
  const payload = row.payload;
  const context = {
    upgrade: payload.upgrade,
    stage: payload.stage,
    return_to: payload.return_to,
  };
  const sessionId = typeof payload.session_id === 'string' ? payload.session_id : null;
  const sku = typeof payload.sku === 'string' ? payload.sku : null;

  // Ownership first: a forwarded or shared email must not reveal anything
  // about the other account (not even whether the link has lapsed).
  if (row.user_id !== userId) return refuse('wrong_user', {}, { sku: null });

  const createdMs = Date.parse(row.created_at || '');
  const expiresMs = Date.parse(payload.resume_expires_at || '')
    || (Number.isFinite(createdMs) ? createdMs + RESUME_TTL_DAYS * DAY_MS : NaN);
  if (!Number.isFinite(expiresMs) || expiresMs <= nowMs) return refuse('expired', context, { sku });

  if (!CHECKOUT_SKUS.includes(sku) || (sku === 'week_pass' && !weekPassEnabled())) {
    return refuse('plan_unavailable', context, { sku });
  }

  // The discount the original checkout carried. A win-back coupon is
  // re-requested (checkout re-checks eligibility); a promo coupon must still
  // be the live promo for this plan, otherwise the learner sees today's price
  // on /pricing first instead of being surprised at Stripe.
  const coupon = typeof payload.coupon === 'string' ? payload.coupon : null;
  const offer = coupon && winbackCouponId && coupon === winbackCouponId && sku === 'monthly' ? 'winback' : null;
  if (coupon && !offer && !(coupon === PROMO.couponId && promoAppliesTo(sku, nowMs))) {
    return refuse('offer_ended', context, { sku });
  }

  const eligibility = checkoutEligibility(userRow, { sku, offer, nowMs });
  if (!eligibility.ok) {
    if (eligibility.code === 'winback_ineligible') return refuse('offer_ended', context, { sku });
    if (eligibility.code === 'already_premium' || eligibility.code === 'already_exam_pass') {
      return refuse(eligibility.code, context, { sku });
    }
    // Missing / anonymous account: the page asks for a proper sign-in.
    return refuse('anonymous_user', context, { sku });
  }

  return {
    ok: true,
    outcome: 'ok',
    sku,
    offer,
    sessionId,
    context: normalizeUpgradeContext(context),
  };
}

// Server-side record of every resume attempt (operational, like
// checkout_session_created). Never includes the token, email or URLs.
// Fail-soft: analytics must never block a checkout.
export async function recordCheckoutResume(admin, { userId, outcome, sku = null, originalSessionId = null, httpStatus = null, code = null }) {
  if (!userId) return false;
  try {
    const { error } = await admin.from('activity_events').insert({
      anon_id: `billing:${userId}`,
      user_id: userId,
      event: 'checkout_resume',
      props: {
        source: 'recovery_email',
        operational: true,
        outcome,
        sku: CHECKOUT_SKUS.includes(sku) ? sku : null,
        ...(originalSessionId ? { original_session_id: originalSessionId } : {}),
        ...(httpStatus ? { http_status: httpStatus } : {}),
        ...(code ? { code: String(code).slice(0, 40) } : {}),
      },
    });
    if (error) throw error;
    return true;
  } catch {
    console.error('checkout_resume record unavailable');
    return false;
  }
}
