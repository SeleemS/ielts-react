// The shared purchase guards: checkout, the resume link and the webhook's
// duplicate backstop all read these answers.
import { describe, expect, it } from 'vitest';
import { billingOwnership, checkoutEligibility } from './checkoutEligibility';
import { CHECKOUT_SKUS, ONE_TIME_SKUS } from './billing';

const NOW = Date.parse('2026-09-23T12:00:00.000Z');
const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString();

const free = { id: 'user-1', email: 'a@b.com', is_anonymous: false, plan: 'free', plan_status: 'inactive' };
const subscriber = {
  ...free, plan: 'premium', plan_status: 'active', plan_renews_at: iso(NOW + 20 * DAY),
  stripe_subscription_id: 'sub_1',
};
const passHolder = {
  ...free, plan: 'premium', plan_status: 'active', plan_expires_at: iso(NOW + 10 * DAY),
};

describe('checkoutEligibility', () => {
  it('lets a free account buy any advertised plan', () => {
    for (const sku of CHECKOUT_SKUS) {
      expect(checkoutEligibility(free, { sku, nowMs: NOW })).toMatchObject({ ok: true, winBackEligible: false });
    }
  });

  it('refuses a missing or anonymous account', () => {
    expect(checkoutEligibility(null, { sku: 'monthly', nowMs: NOW })).toMatchObject({ ok: false, status: 401 });
    expect(checkoutEligibility({ ...free, is_anonymous: true }, { sku: 'monthly', nowMs: NOW }))
      .toMatchObject({ ok: false, status: 403, code: 'anonymous_user' });
    expect(checkoutEligibility({ ...free, email: null }, { sku: 'monthly', nowMs: NOW }).code).toBe('anonymous_user');
  });

  it('refuses every purchase for a subscriber, including a paused one', () => {
    for (const sku of CHECKOUT_SKUS) {
      expect(checkoutEligibility(subscriber, { sku, nowMs: NOW }))
        .toMatchObject({ ok: false, status: 409, code: 'already_premium' });
    }
    const paused = { ...subscriber, plan_status: 'paused', billing_pause_until: iso(NOW + 5 * DAY) };
    expect(checkoutEligibility(paused, { sku: 'monthly', nowMs: NOW }).code).toBe('already_premium');
    const canceledInPeriod = { ...subscriber, plan_status: 'canceled' };
    expect(checkoutEligibility(canceledInPeriod, { sku: 'annual', nowMs: NOW }).code).toBe('already_premium');
  });

  it('lets a pass holder subscribe but not stack a second pass', () => {
    expect(checkoutEligibility(passHolder, { sku: 'monthly', nowMs: NOW })).toMatchObject({ ok: true, holdsExamPass: true });
    expect(checkoutEligibility(passHolder, { sku: 'exam_pass', nowMs: NOW }))
      .toMatchObject({ ok: false, status: 409, code: 'already_exam_pass' });
    const expiredPass = { ...passHolder, plan_expires_at: iso(NOW - DAY) };
    expect(checkoutEligibility(expiredPass, { sku: 'exam_pass', nowMs: NOW }).ok).toBe(true);
  });

  it('gates the win-back offer on a cancellation at least 30 days old', () => {
    const lapsed = { ...free, canceled_at: iso(NOW - 31 * DAY) };
    expect(checkoutEligibility(lapsed, { sku: 'monthly', offer: 'winback', nowMs: NOW }))
      .toMatchObject({ ok: true, winBackEligible: true });
    expect(checkoutEligibility({ ...free, canceled_at: iso(NOW - 3 * DAY) }, { sku: 'monthly', offer: 'winback', nowMs: NOW }))
      .toMatchObject({ ok: false, status: 403, code: 'winback_ineligible' });
    expect(checkoutEligibility(free, { sku: 'monthly', offer: 'winback', nowMs: NOW }).ok).toBe(false);
  });

  it('keeps its one-time SKU rule in step with lib/billing', () => {
    expect(ONE_TIME_SKUS).toEqual(['exam_pass', 'week_pass']);
  });

  it('refuses a Week Pass on top of any active pass, but lets a free account buy one', () => {
    const holder = { id: 'u', email: 'a@b.c', is_anonymous: false, plan: 'premium', plan_status: 'active',
      plan_expires_at: new Date(Date.now() + 3 * 86400000).toISOString(), stripe_subscription_id: null };
    expect(checkoutEligibility(holder, { sku: 'week_pass' })).toMatchObject({ ok: false, code: 'already_exam_pass' });
    expect(checkoutEligibility({ id: 'u', email: 'a@b.c', is_anonymous: false, plan: 'free', plan_status: 'inactive' }, { sku: 'week_pass' }).ok).toBe(true);
  });
});

describe('billingOwnership', () => {
  it('separates a recurring plan from a one-time pass', () => {
    expect(billingOwnership(subscriber, NOW)).toEqual({ entitledNow: true, holdsExamPass: false, ownsRecurringPlan: true });
    expect(billingOwnership(passHolder, NOW)).toEqual({ entitledNow: true, holdsExamPass: true, ownsRecurringPlan: false });
    expect(billingOwnership(free, NOW)).toEqual({ entitledNow: false, holdsExamPass: false, ownsRecurringPlan: false });
    expect(billingOwnership(null, NOW).ownsRecurringPlan).toBe(false);
  });
});
