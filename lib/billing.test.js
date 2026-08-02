// lib/billing.test.js
// Unit tests for the Stripe billing core: price resolution (PPP), subscription
// → plan mapping, and the webhook event handler (mocked Supabase/Stripe deps).
import { describe, it, expect } from 'vitest';
import {
  resolveLookupKey,
  isPppCountry,
  mapSubscriptionToPlanFields,
  subscriptionCancellationAt,
  subscriptionPeriodEnd,
  subscriptionIsPpp,
  handleStripeEvent,
  skuFromLookupKey,
  subscriptionSku,
  isRecurringPlanUpgrade,
  REALTIME_SECONDS_GLOBAL,
  REALTIME_SECONDS_PPP,
} from './billing';

// ---------------------------------------------------------------------------
// Price resolution / PPP
// ---------------------------------------------------------------------------
describe('resolveLookupKey', () => {
  it('maps global countries to list prices', () => {
    expect(resolveLookupKey('monthly', 'US')).toBe('premium_monthly');
    expect(resolveLookupKey('3month', 'GB')).toBe('premium_3month');
    expect(resolveLookupKey('6month', 'GB')).toBe('premium_6month'); // legacy subs
    expect(resolveLookupKey('annual', 'DE')).toBe('premium_annual');
    expect(resolveLookupKey('annual', '')).toBe('premium_annual'); // unknown geo → global
  });

  it('maps PPP countries to _ppp prices', () => {
    expect(resolveLookupKey('monthly', 'IN')).toBe('premium_monthly_ppp');
    expect(resolveLookupKey('3month', 'PK')).toBe('premium_3month_ppp');
    expect(resolveLookupKey('6month', 'PK')).toBe('premium_6month_ppp'); // legacy subs
    expect(resolveLookupKey('annual', 'VN')).toBe('premium_annual_ppp');
    expect(resolveLookupKey('monthly', 'ng')).toBe('premium_monthly_ppp'); // case-insensitive
  });

  it('rejects unknown SKUs', () => {
    expect(resolveLookupKey('lifetime', 'US')).toBeNull();
  });

  it('classifies PPP membership', () => {
    expect(isPppCountry('IN')).toBe(true);
    expect(isPppCountry('US')).toBe(false);
    expect(isPppCountry(undefined)).toBe(false);
    for (const fullPriceMarket of ['SA', 'AE', 'QA', 'KW', 'BH', 'OM', 'SY', 'IR', 'SD']) {
      expect(isPppCountry(fullPriceMarket)).toBe(false);
    }
  });

  it('supports the one-time Exam Pass lookup', () => {
    expect(resolveLookupKey('exam_pass', 'US')).toBe('premium_exam_pass');
    expect(resolveLookupKey('exam_pass', 'IN')).toBe('premium_exam_pass_ppp');
    expect(skuFromLookupKey('premium_exam_pass_ppp')).toBe('exam_pass');
  });
});

describe('subscriptionSku', () => {
  it('prefers the price lookup key', () => {
    expect(
      subscriptionSku({
        items: { data: [{ price: { lookup_key: 'premium_3month_ppp' } }] },
        metadata: { sku: 'annual' },
      })
    ).toBe('3month');
  });

  it('falls back to checkout metadata when the price lost its lookup key', () => {
    // Superseded prices (transfer_lookup_key) keep billing with lookup_key null.
    expect(
      subscriptionSku({
        items: { data: [{ price: { lookup_key: null } }] },
        metadata: { sku: 'monthly' },
      })
    ).toBe('monthly');
    expect(
      subscriptionSku({
        items: { data: [{ price: { lookup_key: null } }] },
        metadata: { sku: '6month' },
      })
    ).toBe('6month');
  });

  it('never trusts unknown metadata SKUs', () => {
    expect(
      subscriptionSku({
        items: { data: [{ price: { lookup_key: null } }] },
        metadata: { sku: 'lifetime' },
      })
    ).toBeNull();
    expect(subscriptionSku({})).toBeNull();
  });
});

describe('isRecurringPlanUpgrade', () => {
  it('allows only moves to a longer recurring term', () => {
    expect(isRecurringPlanUpgrade('monthly', '3month')).toBe(true);
    expect(isRecurringPlanUpgrade('monthly', '6month')).toBe(true);
    expect(isRecurringPlanUpgrade('monthly', 'annual')).toBe(true);
    expect(isRecurringPlanUpgrade('3month', 'annual')).toBe(true);
    expect(isRecurringPlanUpgrade('6month', 'annual')).toBe(true);
    expect(isRecurringPlanUpgrade('annual', 'monthly')).toBe(false);
    expect(isRecurringPlanUpgrade('3month', 'monthly')).toBe(false);
    expect(isRecurringPlanUpgrade('6month', '3month')).toBe(false);
    expect(isRecurringPlanUpgrade('6month', 'monthly')).toBe(false);
    expect(isRecurringPlanUpgrade('monthly', 'monthly')).toBe(false);
    expect(isRecurringPlanUpgrade('exam_pass', 'annual')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Subscription mapping
// ---------------------------------------------------------------------------
const PERIOD_END = 1800000000; // unix seconds

function sub(overrides = {}) {
  return {
    id: 'sub_123',
    customer: 'cus_123',
    status: 'active',
    cancel_at_period_end: false,
    current_period_end: PERIOD_END,
    created: 1760000000,
    metadata: {},
    items: { data: [{ price: { lookup_key: 'premium_monthly' } }] },
    ...overrides,
  };
}

describe('mapSubscriptionToPlanFields', () => {
  it('active → premium/active with renews_at', () => {
    const f = mapSubscriptionToPlanFields(sub());
    expect(f).toMatchObject({
      plan: 'premium',
      plan_status: 'active',
      stripe_customer_id: 'cus_123',
      stripe_subscription_id: 'sub_123',
    });
    expect(f.plan_renews_at).toBe(new Date(PERIOD_END * 1000).toISOString());
    expect(f.plan_sku).toBe('monthly');
    expect(f.premium_since).toBe(new Date(1760000000 * 1000).toISOString());
  });

  it('trialing → premium/trialing', () => {
    expect(mapSubscriptionToPlanFields(sub({ status: 'trialing' })).plan_status).toBe('trialing');
  });

  it('cancel_at_period_end keeps premium but marks canceled (access to period end)', () => {
    const f = mapSubscriptionToPlanFields(sub({ cancel_at_period_end: true }));
    expect(f.plan).toBe('premium');
    expect(f.plan_status).toBe('canceled');
    expect(subscriptionCancellationAt(sub({ cancel_at_period_end: true })))
      .toBe(new Date(PERIOD_END * 1000).toISOString());
  });

  it('explicit cancel_at keeps premium through that timestamp and marks canceled', () => {
    const cancelAt = PERIOD_END - 86400;
    const f = mapSubscriptionToPlanFields(sub({
      cancel_at: cancelAt,
      cancel_at_period_end: false,
    }));

    expect(f.plan).toBe('premium');
    expect(f.plan_status).toBe('canceled');
    expect(f.plan_renews_at).toBe(new Date(cancelAt * 1000).toISOString());
  });

  it('past_due keeps premium in grace', () => {
    const f = mapSubscriptionToPlanFields(sub({ status: 'past_due' }));
    expect(f).toMatchObject({ plan: 'premium', plan_status: 'past_due' });
  });

  it('maps an app-requested true pause without granting access', () => {
    const resumesAt = PERIOD_END + 30 * 86400;
    const f = mapSubscriptionToPlanFields(sub({
      status: 'paused',
      metadata: { ielts_pause_resumes_at: String(resumesAt) },
    }));

    expect(f).toMatchObject({
      plan: 'premium',
      plan_status: 'paused',
      billing_pause_until: new Date(resumesAt * 1000).toISOString(),
    });
  });

  it('does not let missing or stale pause metadata block an active plan', () => {
    expect(mapSubscriptionToPlanFields(sub({ status: 'paused' }))).toMatchObject({
      plan: 'free',
      plan_status: 'inactive',
      billing_pause_until: null,
    });
    expect(mapSubscriptionToPlanFields(sub({
      status: 'active',
      metadata: { ielts_pause_resumes_at: String(PERIOD_END) },
    }))).toMatchObject({
      plan: 'premium',
      plan_status: 'active',
      billing_pause_until: null,
    });
  });

  it('canceled/unpaid/incomplete_expired → free', () => {
    for (const status of ['canceled', 'unpaid', 'incomplete_expired']) {
      expect(mapSubscriptionToPlanFields(sub({ status })).plan).toBe('free');
    }
  });

  it('incomplete → not entitled', () => {
    const f = mapSubscriptionToPlanFields(sub({ status: 'incomplete' }));
    expect(f).toMatchObject({ plan: 'free', plan_status: 'inactive' });
  });

  it('reads period end from item shape (newer API versions)', () => {
    const s = sub({ current_period_end: undefined });
    s.items.data[0].current_period_end = PERIOD_END;
    expect(subscriptionPeriodEnd(s)).toBe(new Date(PERIOD_END * 1000).toISOString());
  });
});

describe('subscriptionIsPpp', () => {
  it('detects via metadata and lookup key', () => {
    expect(subscriptionIsPpp(sub({ metadata: { ppp: '1' } }))).toBe(true);
    const s = sub();
    s.items.data[0].price.lookup_key = 'premium_6month_ppp';
    expect(subscriptionIsPpp(s)).toBe(true);
    expect(subscriptionIsPpp(sub())).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Webhook event handler (mocked deps)
// ---------------------------------------------------------------------------
function mockAdmin({
  userRow = { id: 'user-1', email: 'learner@example.com' },
  selectError = null,
} = {}) {
  const calls = { updates: [], inserts: [] };
  const admin = {
    from(table) {
      return {
        update(fields) {
          return {
            eq(col, val) {
              calls.updates.push({ table, fields, col, val });
              return Promise.resolve({ error: null });
            },
          };
        },
        insert(fields) {
          calls.inserts.push({ table, fields });
          return Promise.resolve({ error: null });
        },
        select() {
          return {
            eq() {
              return {
                maybeSingle: () => Promise.resolve({ data: userRow, error: selectError }),
              };
            },
          };
        },
      };
    },
  };
  return { admin, calls };
}

function event(type, object) {
  return { id: `evt_${type}`, type, data: { object } };
}

describe('handleStripeEvent', () => {
  it('checkout.session.completed activates premium and seeds realtime quota', async () => {
    const { admin, calls } = mockAdmin();
    const stripe = { subscriptions: { retrieve: async () => sub() } };
    const out = await handleStripeEvent(
      event('checkout.session.completed', {
        id: 'cs_test_subscription',
        mode: 'subscription',
        subscription: 'sub_123',
        customer: 'cus_123',
        client_reference_id: 'user-1',
        amount_total: 899,
        currency: 'usd',
      }),
      { admin, stripe }
    );
    expect(out).toContain('activated user user-1');
    const userUpdate = calls.updates.find((u) => u.table === 'users');
    expect(userUpdate.fields).toMatchObject({ plan: 'premium', plan_status: 'active' });
    expect(userUpdate.fields.plan_started_at).toBeTruthy();
    const quotaUpdate = calls.updates.find((u) => u.table === 'user_quotas');
    expect(quotaUpdate.fields.realtime_seconds_quota).toBe(REALTIME_SECONDS_GLOBAL);
    expect(quotaUpdate.fields.realtime_seconds_remaining).toBe(REALTIME_SECONDS_GLOBAL);
    expect(calls.inserts.some((call) => call.table === 'activity_events' && call.fields.event === 'subscription_activated')).toBe(true);
    // Server-side purchase event: revenue/funnel analytics must not depend on
    // the buyer's client analytics surviving the checkout round trip.
    const purchase = calls.inserts.find(
      (call) => call.table === 'activity_events' && call.fields.event === 'purchase_success'
    );
    expect(purchase).toBeTruthy();
    expect(purchase.fields).toMatchObject({
      anon_id: 'billing:user-1',
      user_id: 'user-1',
      billing_event_id: 'purchase:cs_test_subscription',
    });
    expect(purchase.fields.props).toMatchObject({
      sku: 'monthly',
      ppp: '0',
      amount: 899,
      amount_minor: 899,
      currency: 'usd',
      billing_mode: 'subscription',
      transaction_id: 'cs_test_subscription',
    });
    expect(
      calls.inserts.some(
        (call) =>
          call.table === 'lifecycle_emails' &&
          call.fields.idempotency_key === 'welcome_purchase:cs_test_subscription'
      )
    ).toBe(true);
  });

  it('seeds the PPP realtime allowance for PPP subscriptions', async () => {
    const { admin, calls } = mockAdmin();
    const stripe = { subscriptions: { retrieve: async () => sub({ metadata: { ppp: '1' } }) } };
    await handleStripeEvent(
      event('checkout.session.completed', {
        mode: 'subscription',
        subscription: 'sub_123',
        customer: 'cus_123',
        client_reference_id: 'user-1',
      }),
      { admin, stripe }
    );
    const quotaUpdate = calls.updates.find((u) => u.table === 'user_quotas');
    expect(quotaUpdate.fields.realtime_seconds_quota).toBe(REALTIME_SECONDS_PPP);
  });

  it('checkout with no user mapping signals a retryable error', async () => {
    const { admin } = mockAdmin({ userRow: null });
    const stripe = { subscriptions: { retrieve: async () => sub() } };
    const out = await handleStripeEvent(
      event('checkout.session.completed', {
        mode: 'subscription',
        subscription: 'sub_123',
        customer: 'cus_999',
        client_reference_id: null,
      }),
      { admin, stripe }
    );
    expect(out.startsWith('error:')).toBe(true);
  });

  it('paid Exam Pass checkout grants 28 days without a subscription', async () => {
    const { admin, calls } = mockAdmin();
    const out = await handleStripeEvent(
      event('checkout.session.completed', {
        id: 'cs_test_pass',
        mode: 'payment',
        payment_status: 'paid',
        amount_total: 1499,
        customer: 'cus_123',
        client_reference_id: 'user-1',
        metadata: { sku: 'exam_pass', ppp: '0' },
      }),
      { admin, stripe: {} }
    );
    expect(out).toContain('exam pass');
    const userUpdate = calls.updates.find((update) => update.table === 'users');
    expect(userUpdate.fields).toMatchObject({
      plan: 'premium',
      plan_status: 'active',
      plan_sku: 'exam_pass',
      stripe_subscription_id: null,
    });
    expect(new Date(userUpdate.fields.plan_expires_at).getTime()).toBeGreaterThan(Date.now());
    expect(
      calls.inserts.some(
        (call) =>
          call.table === 'lifecycle_emails' &&
          call.fields.idempotency_key === 'welcome_purchase:cs_test_pass'
      )
    ).toBe(true);
    expect(
      calls.inserts.find(
        (call) =>
          call.table === 'activity_events' &&
          call.fields.event === 'subscription_activated'
      ).fields.props
    ).toMatchObject({ amount_minor: 1499 });
    const passPurchase = calls.inserts.find(
      (call) => call.table === 'activity_events' && call.fields.event === 'purchase_success'
    );
    expect(passPurchase).toBeTruthy();
    expect(passPurchase.fields.billing_event_id).toBe('purchase:cs_test_pass');
    expect(passPurchase.fields.props).toMatchObject({
      sku: 'exam_pass',
      amount: 1499,
      amount_minor: 1499,
      billing_mode: 'payment',
      transaction_id: 'cs_test_pass',
    });
  });

  it('ignores non-subscription checkouts', async () => {
    const { admin } = mockAdmin();
    const out = await handleStripeEvent(
      event('checkout.session.completed', { mode: 'payment' }),
      { admin, stripe: {} }
    );
    expect(out).toContain('ignored');
  });

  it('subscription.updated with canceled status downgrades and revokes realtime quota', async () => {
    const { admin, calls } = mockAdmin();
    const out = await handleStripeEvent(
      event('customer.subscription.updated', sub({ status: 'canceled', metadata: { user_id: 'user-1' } })),
      { admin, stripe: {} }
    );
    expect(out).toContain('free/canceled');
    const quotaUpdate = calls.updates.find((u) => u.table === 'user_quotas');
    expect(quotaUpdate.fields).toMatchObject({
      realtime_seconds_quota: 0,
      realtime_seconds_remaining: 0,
    });
  });

  it('subscription.updated active keeps premium and does NOT touch quotas', async () => {
    const { admin, calls } = mockAdmin();
    await handleStripeEvent(
      event('customer.subscription.updated', sub({ metadata: { user_id: 'user-1' } })),
      { admin, stripe: {} }
    );
    expect(calls.updates.some((u) => u.table === 'user_quotas')).toBe(false);
  });

  it('subscription.updated with explicit cancel_at keeps access but stops renewal', async () => {
    const { admin, calls } = mockAdmin();
    const cancelAt = PERIOD_END - 86400;
    const out = await handleStripeEvent(
      event('customer.subscription.updated', sub({
        cancel_at: cancelAt,
        cancel_at_period_end: false,
        metadata: { user_id: 'user-1' },
      })),
      { admin, stripe: {} }
    );

    expect(out).toContain('premium/canceled');
    const userUpdate = calls.updates.find((u) => u.table === 'users');
    expect(userUpdate.fields).toMatchObject({
      plan: 'premium',
      plan_status: 'canceled',
      plan_renews_at: new Date(cancelAt * 1000).toISOString(),
    });
    expect(calls.updates.some((u) => u.table === 'user_quotas')).toBe(false);
  });

  it('subscription.deleted downgrades', async () => {
    const { admin, calls } = mockAdmin();
    const out = await handleStripeEvent(
      event('customer.subscription.deleted', sub({ metadata: { user_id: 'user-1' } })),
      { admin, stripe: {} }
    );
    expect(out).toContain('downgraded');
    const userUpdate = calls.updates.find((u) => u.table === 'users');
    expect(userUpdate.fields).toMatchObject({ plan: 'free', plan_status: 'canceled' });
  });

  it('acknowledges a deleted-account subscription event without orphan writes', async () => {
    const { admin, calls } = mockAdmin({ userRow: null });
    const out = await handleStripeEvent(
      event('customer.subscription.deleted', sub({
        metadata: { user_id: 'deleted-user' },
      })),
      { admin, stripe: {} }
    );

    expect(out).toBe('ignored: no user mapping for subscription.deleted');
    expect(calls.updates).toEqual([]);
    expect(calls.inserts).toEqual([]);
  });

  it('retries subscription events when user mapping lookup fails', async () => {
    const { admin, calls } = mockAdmin({
      selectError: new Error('database unavailable'),
    });

    await expect(
      handleStripeEvent(
        event('customer.subscription.deleted', sub({
          metadata: { user_id: 'user-1' },
        })),
        { admin, stripe: {} }
      )
    ).rejects.toThrow(/user mapping id lookup failed: database unavailable/i);
    expect(calls.updates).toEqual([]);
    expect(calls.inserts).toEqual([]);
  });

  it('invoice.payment_failed marks past_due', async () => {
    const { admin, calls } = mockAdmin();
    const out = await handleStripeEvent(
      event('invoice.payment_failed', { customer: 'cus_123' }),
      { admin, stripe: {} }
    );
    expect(out).toContain('past_due');
    expect(calls.updates[0].fields).toMatchObject({ plan_status: 'past_due' });
  });

  it('invoice.paid records renewal or prorated-upgrade revenue idempotently', async () => {
    const { admin, calls } = mockAdmin();
    const stripe = { subscriptions: { retrieve: async () => sub() } };
    const out = await handleStripeEvent(
      event('invoice.paid', {
        id: 'in_renewal',
        customer: 'cus_123',
        subscription: 'sub_123',
        billing_reason: 'subscription_cycle',
        amount_paid: 1999,
        currency: 'usd',
      }),
      { admin, stripe }
    );

    expect(out).toContain('renewed');
    const payment = calls.inserts.find(
      (call) =>
        call.table === 'activity_events' &&
        call.fields.event === 'subscription_payment_succeeded'
    );
    expect(payment.fields).toMatchObject({
      billing_event_id: 'invoice:in_renewal',
      user_id: 'user-1',
      props: {
        sku: 'monthly',
        amount: 1999,
        amount_minor: 1999,
        currency: 'usd',
        billing_reason: 'subscription_cycle',
      },
    });
  });

  it('supports the newer nested invoice subscription shape', async () => {
    const { admin, calls } = mockAdmin();
    const retrieve = async (subscriptionId) => {
      expect(subscriptionId).toBe('sub_nested');
      return sub({ id: subscriptionId });
    };
    await handleStripeEvent(
      event('invoice.paid', {
        id: 'in_nested',
        customer: 'cus_123',
        parent: { subscription_details: { subscription: 'sub_nested' } },
        billing_reason: 'subscription_update',
        amount_paid: 875,
        currency: 'usd',
      }),
      { admin, stripe: { subscriptions: { retrieve } } }
    );

    expect(
      calls.inserts.find(
        (call) => call.fields.event === 'subscription_payment_succeeded'
      ).fields.props
    ).toMatchObject({ amount_minor: 875, billing_reason: 'subscription_update' });
  });

  it('charge.refunded revokes subscriptions and unexpired Exam Pass access immediately', async () => {
    const { admin, calls } = mockAdmin();
    const out = await handleStripeEvent(
      {
        ...event('charge.refunded', {
          id: 'ch_refunded',
          customer: 'cus_123',
          amount_refunded: 1200,
          currency: 'usd',
        }),
        data: {
          object: {
            id: 'ch_refunded',
            customer: 'cus_123',
            amount_refunded: 1200,
            currency: 'usd',
          },
          previous_attributes: { amount_refunded: 500 },
        },
      },
      { admin, stripe: {} }
    );
    expect(out).toContain('refunded');
    const userUpdate = calls.updates.find((u) => u.table === 'users');
    expect(userUpdate.fields).toMatchObject({
      plan: 'free',
      plan_status: 'refunded',
      plan_expires_at: null,
      billing_pause_until: null,
    });
    const refund = calls.inserts.find(
      (call) =>
        call.table === 'activity_events' && call.fields.event === 'payment_refunded'
    );
    expect(refund.fields).toMatchObject({
      billing_event_id: 'refund:evt_charge.refunded',
      props: {
        amount_minor: 700,
        currency: 'usd',
        charge_id: 'ch_refunded',
      },
    });
  });

  it('resolves a dispute through its Charge because Dispute has no customer field', async () => {
    const { admin, calls } = mockAdmin();
    const retrieve = async (chargeId) => {
      expect(chargeId).toBe('ch_disputed');
      return { id: chargeId, customer: 'cus_123' };
    };
    const out = await handleStripeEvent(
      event('charge.dispute.created', { charge: 'ch_disputed' }),
      { admin, stripe: { charges: { retrieve } } }
    );
    expect(out).toContain('refunded');
    const userUpdate = calls.updates.find((u) => u.table === 'users');
    expect(userUpdate.fields).toMatchObject({
      plan: 'free',
      plan_status: 'refunded',
      plan_expires_at: null,
    });
  });

  it('acknowledges unknown events without side effects', async () => {
    const { admin, calls } = mockAdmin();
    const out = await handleStripeEvent(event('customer.created', {}), { admin, stripe: {} });
    expect(out).toContain('ignored');
    expect(calls.updates.length).toBe(0);
  });
});
