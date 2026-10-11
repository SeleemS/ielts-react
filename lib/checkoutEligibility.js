// lib/checkoutEligibility.js
// The one definition of "may this account open a new Checkout Session for
// this plan?". Shared by every path that can start a purchase —
// pages/api/billing/checkout.js, the emailed resume link
// (pages/api/billing/resume.js) — and by the webhook's duplicate-purchase
// backstop (lib/billing.js), so a guard can never be fixed in one place and
// forgotten in another.
//
//   * anonymous accounts cannot buy (receipts + portal need an email);
//   * an account that already owns a recurring subscription — including one
//     whose access is paused — cannot buy anything (already_premium);
//   * an Exam Pass holder may subscribe, but cannot stack a second pass
//     (already_exam_pass);
//   * the win-back offer needs a monthly plan and a cancellation >= 30 days
//     ago.
//
// Pure: no I/O, no Stripe, no env. `userRow` needs BILLING_USER_COLUMNS.

import { isPremiumRow } from './premium';

export const BILLING_USER_COLUMNS =
  'id, email, is_anonymous, plan, plan_status, plan_renews_at, plan_expires_at, billing_pause_until, canceled_at, stripe_customer_id, stripe_subscription_id';

const WINBACK_MIN_CANCELED_MS = 30 * 86400000;

// Kept local (not imported from lib/billing) so lib/billing can import this
// module without a cycle. lib/checkoutEligibility.test.js pins it to
// ONE_TIME_SKUS.
function oneTimeSku(sku) {
  return sku === 'exam_pass' || sku === 'week_pass';
}

// Entitlement facts about the stored row, independent of what is being bought.
export function billingOwnership(userRow, nowMs = Date.now()) {
  if (!userRow) return { entitledNow: false, holdsExamPass: false, ownsRecurringPlan: false };
  // A billing pause intentionally blocks product access, so isPremiumRow on
  // the stored row returns false. It must not make the learner eligible to buy
  // a second recurring subscription. Ignore only the access-pause timestamp
  // when deciding whether an existing paid commitment still owns this account.
  const hasTruePausedSubscription = Boolean(
    userRow.stripe_subscription_id
    && userRow.plan === 'premium'
    && userRow.plan_status === 'paused'
  );
  const entitledNow = isPremiumRow({ ...userRow, billing_pause_until: null }, nowMs);
  // An unexpired one-time pass with no subscription behind it. A pass holder
  // is deliberately allowed to convert to a subscription while the pass runs
  // (Stripe bills the subscription from day one; the pass simply stops being
  // the thing granting access) — but must not stack a second pass.
  const holdsExamPass = Boolean(
    entitledNow
    && userRow.plan_expires_at
    && new Date(userRow.plan_expires_at).getTime() > nowMs
    && !userRow.stripe_subscription_id
  );
  const ownsRecurringPlan = (entitledNow && !holdsExamPass) || hasTruePausedSubscription;
  return { entitledNow, holdsExamPass, ownsRecurringPlan };
}

// Returns { ok: true, winBackEligible, holdsExamPass } or
// { ok: false, status, code, body } where `body` is the exact JSON the
// checkout route answers with.
export function checkoutEligibility(userRow, { sku, offer = null, nowMs = Date.now() } = {}) {
  if (!userRow) {
    return { ok: false, status: 401, code: 'account_not_found', body: { error: 'Account not found.' } };
  }
  if (userRow.is_anonymous || !userRow.email) {
    return {
      ok: false,
      status: 403,
      code: 'anonymous_user',
      body: { error: 'Link an email or Google account before upgrading.', code: 'anonymous_user' },
    };
  }
  const { holdsExamPass, ownsRecurringPlan } = billingOwnership(userRow, nowMs);
  if (ownsRecurringPlan) {
    return {
      ok: false,
      status: 409,
      code: 'already_premium',
      body: { error: 'You already have Pro — manage your plan.', code: 'already_premium' },
    };
  }
  if (holdsExamPass && oneTimeSku(sku)) {
    return {
      ok: false,
      status: 409,
      code: 'already_exam_pass',
      body: {
        error: 'Your pass is still active. Subscribe instead, or wait until it ends.',
        code: 'already_exam_pass',
      },
    };
  }
  const winBackEligible = Boolean(
    offer === 'winback'
    && sku === 'monthly'
    && userRow.canceled_at
    && new Date(userRow.canceled_at).getTime() <= nowMs - WINBACK_MIN_CANCELED_MS
  );
  if (offer === 'winback' && !winBackEligible) {
    return {
      ok: false,
      status: 403,
      code: 'winback_ineligible',
      body: { error: 'This returning-subscriber offer is not available for this account.' },
    };
  }
  return { ok: true, winBackEligible, holdsExamPass };
}
