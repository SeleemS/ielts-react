// lib/billing.test.js
// Unit tests for the Stripe billing core: price resolution (PPP), subscription
// → plan mapping, and the webhook event handler (mocked Supabase/Stripe deps).
import { describe, it, expect } from 'vitest';
import {
  CHECKOUT_SKUS,
  isOneTimeSku,
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

describe('sellable SKUs', () => {
  it('sells Monthly, Annual and the Exam Pass — and nothing retired', () => {
    expect(CHECKOUT_SKUS).toEqual(['monthly', 'annual', 'exam_pass']);
    expect(CHECKOUT_SKUS).not.toContain('3month');
    expect(CHECKOUT_SKUS).not.toContain('6month');
  });

  it('classifies only the Exam Pass as a one-time purchase', () => {
    expect(isOneTimeSku('exam_pass')).toBe(true);
    for (const sku of ['monthly', 'annual', '3month', '6month', 'lifetime']) {
      expect(isOneTimeSku(sku)).toBe(false);
    }
  });

  it('keeps retired plans resolvable so existing subscribers still map', () => {
    // 3-month and 6-month are no longer sold but must keep renewing.
    expect(resolveLookupKey('3month', 'US')).toBe('premium_3month');
    expect(resolveLookupKey('6month', 'IN')).toBe('premium_6month_ppp');
    expect(skuFromLookupKey('premium_3month')).toBe('3month');
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
    latest_invoice: 'in_current',
    status: 'active',
    cancel_at_period_end: false,
    current_period_start: 1790000000,
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
  rpcResult = null,
  rpcError = null,
} = {}) {
  const calls = { updates: [], inserts: [], rpcs: [] };
  const admin = {
    async rpc(name, args) {
      calls.rpcs.push({ name, args });
      if (rpcError) return { error: rpcError };
      if (rpcResult) return { data: rpcResult, error: null };
      // SQL transaction semantics are tested against PostgreSQL separately.
      if (name === 'revoke_billing_purchase') {
        calls.updates.push({ table: 'users', fields: { plan: 'free', plan_status: 'refunded',
          plan_expires_at: null, billing_pause_until: null } });
        return { data: { status: 'revoked' }, error: null };
      }
      if (args.p_fields.plan_sku === 'exam_pass') {
        args.p_fields = { ...args.p_fields,
          plan_started_at: new Date().toISOString(), premium_since: new Date().toISOString(),
          plan_expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        };
      }
      calls.updates.push({ table: 'users', fields: args.p_fields });
      if (args.p_realtime_quota != null) calls.updates.push({ table: 'user_quotas', fields: {
        realtime_seconds_quota: args.p_realtime_quota,
        realtime_seconds_remaining: args.p_realtime_quota,
      } });
      return { data: { status: 'applied', access_expires_at: args.p_fields.plan_expires_at }, error: null };
    },
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

function currentStripe(subscription = sub()) {
  return {
    subscriptions: { retrieve: async () => subscription },
    paymentIntents: { retrieve: async id => ({ id, status: 'succeeded',
      latest_charge: { id: 'ch_settled', payment_intent: id, refunded: false, amount_refunded: 0, disputed: false } }) },
    charges: { retrieve: async id => ({ id, customer: 'cus_123', payment_intent: 'pi_test', invoice: 'in_current' }) },
    checkout: { sessions: { list: async () => ({ data: [], has_more: false }) } },
    invoices: { retrieve: async id => ({ id, status: 'paid', subscription: subscription.id, customer: 'cus_123' }) },
    invoicePayments: { list: async () => ({ data: [{ invoice: 'in_current' }], has_more: false }) },
  };
}

function event(type, object) {
  return { id: `evt_${type}`, created: Math.floor(Date.now() / 1000), type, data: { object: { id: 'cs_test_default', payment_intent: 'pi_test', lines: { data: [{ type: 'subscription', period: { start: 1790000000, end: PERIOD_END } }] }, created: Math.floor(Date.now() / 1000), ...object } } };
}

describe('handleStripeEvent', () => {
  it('retries downstream receipts without rewriting entitlements or consumed quota', async () => {
    const { admin, calls } = mockAdmin({ rpcResult: {
      status: 'already_applied', access_expires_at: '2026-10-01T00:00:00Z',
    } });
    await handleStripeEvent(event('checkout.session.completed', {
      id: 'cs_replay', mode: 'payment', payment_status: 'paid', amount_total: 100,
      client_reference_id: 'user-1', metadata: { sku: 'exam_pass' },
    }), { admin, stripe: currentStripe() });
    expect(calls.updates).toEqual([]);
    expect(calls.inserts.find(c => c.fields.event === 'subscription_activated')
      .fields.props.access_expires_at).toBe('2026-10-01T00:00:00Z');
    expect(calls.inserts.some(c => c.table === 'lifecycle_emails')).toBe(true);
  });

  it('can recover receipts after an analytics failure without granting a second time', async () => {
    const { admin, calls } = mockAdmin();
    const baseFrom = admin.from.bind(admin);
    const baseRpc = admin.rpc.bind(admin);
    let fulfilled = false;
    let failed = false;
    admin.rpc = async (name, args) => {
      if (fulfilled) return { data: {
        status: 'already_applied', access_expires_at: args.p_fields.plan_expires_at,
      } };
      const result = await baseRpc(name, args);
      fulfilled = true;
      return result;
    };
    admin.from = table => {
      const query = baseFrom(table);
      if (table === 'activity_events' && !failed) {
        query.insert = async () => {
          failed = true;
          return { error: { code: '08006', message: 'connection lost after fulfillment' } };
        };
      }
      return query;
    };
    const checkout = event('checkout.session.completed', {
      mode: 'subscription', subscription: 'sub_123', client_reference_id: 'user-1',
    });
    const deps = { admin, stripe: { subscriptions: { retrieve: async () => sub() } } };
    await expect(handleStripeEvent(checkout, deps)).rejects.toThrow('activity_events insert failed');
    await expect(handleStripeEvent(checkout, deps)).resolves.toContain('activated user');
    expect(calls.updates.filter(c => c.table === 'users')).toHaveLength(1);
    expect(calls.updates.filter(c => c.table === 'user_quotas')).toHaveLength(1);
    expect(calls.inserts.some(c => c.fields.event === 'purchase_success')).toBe(true);
    expect(calls.inserts.some(c => c.table === 'lifecycle_emails')).toBe(true);
  });

  it.each(['stale', 'legacy'])('does not emit activation or purchase receipts for %s checkout', async status => {
    const { admin, calls } = mockAdmin({ rpcResult: { status } });
    const result = await handleStripeEvent(event('checkout.session.completed', {
      mode: 'subscription', subscription: 'sub_old', client_reference_id: 'user-1',
    }), { admin, stripe: { subscriptions: { retrieve: async () => sub() } } });
    expect(result).toBe(`ignored: checkout ${status}`);
    expect(calls.updates).toEqual([]);
    expect(calls.inserts).toEqual([]);
  });

  it('fails closed on an RPC failure instead of applying non-atomic writes', async () => {
    const { admin, calls } = mockAdmin({ rpcError: { message: 'transaction aborted' } });
    await expect(handleStripeEvent(event('checkout.session.completed', {
      mode: 'subscription', subscription: 'sub_123', client_reference_id: 'user-1',
    }), { admin, stripe: { subscriptions: { retrieve: async () => sub() } } }))
      .rejects.toThrow('checkout fulfillment failed');
    expect(calls.updates).toEqual([]);
    expect(calls.inserts).toEqual([]);
  });

  it('gives a full 30-day pass despite an earlier checkout creation time', async () => {
    const { admin, calls } = mockAdmin();
    const created = Math.floor(Date.now() / 1000) - 86400;
    await handleStripeEvent(event('checkout.session.completed', {
      id: 'cs_delayed', created, mode: 'payment', payment_status: 'paid', amount_total: 100,
      client_reference_id: 'user-1', metadata: { sku: 'exam_pass' },
    }), { admin, stripe: currentStripe() });
    expect(calls.rpcs[0].args.p_session_created_at).toBe(new Date(created * 1000).toISOString());
    expect(new Date(calls.updates[0].fields.plan_expires_at).getTime() - Date.now())
      .toBeGreaterThan(29.99 * 86400000);
  });

  it('leaves incomplete subscription checkout retryable until it becomes active', async () => {
    const { admin, calls } = mockAdmin();
    let status = 'incomplete';
    const checkout = event('checkout.session.completed', {
      mode: 'subscription', subscription: 'sub_123', client_reference_id: 'user-1',
    });
    const deps = { admin, stripe: { subscriptions: { retrieve: async () => sub({ status }) } } };
    expect(await handleStripeEvent(checkout, deps)).toContain('error:');
    expect(calls.rpcs).toHaveLength(0);
    expect(calls.inserts).toHaveLength(0);
    status = 'active';
    expect(await handleStripeEvent(checkout, deps)).toContain('activated user');
    expect(calls.rpcs).toHaveLength(1);
    expect(calls.updates.find(c => c.table === 'user_quotas').fields.realtime_seconds_remaining)
      .toBe(REALTIME_SECONDS_GLOBAL);
  });

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

  it.each([
    ['paid', 1499],
    ['paid', 0],
    ['no_payment_required', 0],
  ])('Exam Pass checkout (%s, %i cents) grants 30 days without a subscription', async (paymentStatus, amountTotal) => {
    const { admin, calls } = mockAdmin();
    const out = await handleStripeEvent(
      event('checkout.session.completed', {
        id: 'cs_test_pass',
        mode: 'payment',
        payment_status: paymentStatus,
        amount_total: amountTotal,
        customer: 'cus_123',
        client_reference_id: 'user-1',
        metadata: { sku: 'exam_pass', ppp: '0' },
      }),
      { admin, stripe: currentStripe() }
    );
    expect(out).toContain('exam pass');
    const userUpdate = calls.updates.find((update) => update.table === 'users');
    expect(userUpdate.fields).toMatchObject({
      plan: 'premium',
      plan_status: 'active',
      plan_sku: 'exam_pass',
      stripe_subscription_id: null,
    });
    // Founder decision (item 36): the pass is 30 days, not the original 28.
    const grantedDays = Math.round(
      (new Date(userUpdate.fields.plan_expires_at).getTime() - Date.now()) / 86400000
    );
    expect(grantedDays).toBe(30);
    expect(userUpdate.fields.plan_renews_at).toBeNull();
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
    ).toMatchObject({ amount_minor: amountTotal });
    const passPurchase = calls.inserts.find(
      (call) => call.table === 'activity_events' && call.fields.event === 'purchase_success'
    );
    expect(passPurchase).toBeTruthy();
    expect(passPurchase.fields.billing_event_id).toBe('purchase:cs_test_pass');
    expect(passPurchase.fields.props).toMatchObject({
      sku: 'exam_pass',
      amount: amountTotal,
      amount_minor: amountTotal,
      billing_mode: 'payment',
      transaction_id: 'cs_test_pass',
    });
  });

  it.each([
    ['unpaid', 1499],
    ['unpaid', 0],
    ['no_payment_required', 1499],
    ['no_payment_required', null],
  ])('does not activate an unsettled Exam Pass (%s, %s cents)', async (paymentStatus, amountTotal) => {
    const { admin, calls } = mockAdmin();
    const out = await handleStripeEvent(
      event('checkout.session.completed', {
        id: 'cs_test_unsettled_pass',
        mode: 'payment',
        payment_status: paymentStatus,
        amount_total: amountTotal,
        customer: 'cus_123',
        client_reference_id: 'user-1',
        metadata: { sku: 'exam_pass', ppp: '0' },
      }),
      { admin, stripe: currentStripe() }
    );
    expect(out).toBe('ignored: unsupported checkout');
    expect(calls.updates).toEqual([]);
    expect(calls.inserts).toEqual([]);
  });

  it('clears the Exam Pass expiry when its holder later subscribes', async () => {
    const { admin, calls } = mockAdmin();
    await handleStripeEvent(
      event('checkout.session.completed', {
        id: 'cs_test_sub_after_pass',
        mode: 'subscription',
        subscription: 'sub_123',
        customer: 'cus_123',
        client_reference_id: 'user-1',
      }),
      { admin, stripe: { subscriptions: { retrieve: async () => sub() } } }
    );
    const userUpdate = calls.updates.find((update) => update.table === 'users');
    // plan_expires_at is what makes a pass authoritative in isPremiumRow, so a
    // subscription must clear it or the pass would still cut access off early.
    expect(userUpdate.fields.plan_expires_at).toBeNull();
    expect(userUpdate.fields.stripe_subscription_id).toBe('sub_123');
  });

  it('ignores non-subscription checkouts', async () => {
    const { admin } = mockAdmin();
    const out = await handleStripeEvent(
      event('checkout.session.completed', { mode: 'payment' }),
      { admin, stripe: currentStripe() }
    );
    expect(out).toContain('ignored');
  });

  it('uses the current Stripe subscription instead of a stale lifecycle payload', async () => {
    const { admin, calls } = mockAdmin();
    await handleStripeEvent(event('customer.subscription.updated', sub({ status: 'active' })),
      { admin, stripe: currentStripe(sub({ status: 'canceled' })) });
    expect(calls.rpcs[0].args.p_fields.plan).toBe('free');
    expect(calls.rpcs[0].name).toBe('apply_subscription_billing_event');
  });

  it('does not record an event when current subscription retrieval fails', async () => {
    const { admin, calls } = mockAdmin();
    await expect(handleStripeEvent(event('customer.subscription.updated', sub()), {
      admin, stripe: { subscriptions: { retrieve: async () => { throw new Error('Stripe unavailable'); } } },
    })).rejects.toThrow('Stripe unavailable');
    expect(calls.rpcs).toEqual([]);
    expect(calls.inserts).toEqual([]);
  });

  it.each(['invoice.paid', 'invoice.payment_failed'])('never maps %s through customer alone', async type => {
    const { admin, calls } = mockAdmin();
    const result = await handleStripeEvent(event(type, { id: 'in_unrelated', customer: 'cus_123' }),
      { admin, stripe: currentStripe() });
    expect(result).toBe('ignored: invoice has no subscription');
    expect(calls.updates).toEqual([]);
    expect(calls.rpcs).toEqual([]);
  });

  it('does not refill quota or change a plan on a duplicate renewal receipt', async () => {
    const { admin, calls } = mockAdmin({ rpcResult: { status: 'already_applied' } });
    await handleStripeEvent(event('invoice.paid', {
      id: 'in_duplicate', subscription: 'sub_123', billing_reason: 'subscription_cycle', amount_paid: 899,
    }), { admin, stripe: currentStripe() });
    expect(calls.updates).toEqual([]);
    expect(calls.rpcs[0].args.p_event_key).toBe('invoice:in_duplicate');
    expect(calls.rpcs[0].args.p_allow_replace).toBe(false);
    expect(calls.inserts.find(c => c.fields.event === 'subscription_payment_succeeded')).toBeTruthy();
  });

  it('records old-period renewal revenue without refilling the current allowance', async () => {
    const { admin, calls } = mockAdmin();
    await handleStripeEvent(event('invoice.paid', {
      id: 'in_old_period', subscription: 'sub_123', billing_reason: 'subscription_cycle', amount_paid: 899,
      lines: { data: [{ type: 'subscription', period: { start: 1780000000, end: 1790000000 } }] },
    }), { admin, stripe: currentStripe() });
    expect(calls.rpcs[0].args.p_realtime_quota).toBeNull();
    expect(calls.inserts.find(c => c.fields.event === 'subscription_payment_succeeded')).toBeTruthy();
  });

  it('supports modern item period and invoice subscription-line shapes', async () => {
    const { admin, calls } = mockAdmin();
    await handleStripeEvent(event('invoice.paid', {
      id: 'in_modern_period', parent: { subscription_details: { subscription: 'sub_123' } },
      billing_reason: 'subscription_cycle', amount_paid: 899,
      lines: { data: [{ parent: { subscription_item_details: { subscription: 'sub_123', proration: false } },
        period: { start: 1790000000, end: PERIOD_END } }] },
    }), { admin, stripe: currentStripe(sub({ current_period_start: null,
      items: { data: [{ current_period_start: 1790000000, current_period_end: PERIOD_END,
        price: { lookup_key: 'premium_monthly' } }] } })) });
    expect(calls.rpcs[0].args.p_realtime_quota).toBe(REALTIME_SECONDS_GLOBAL);
  });

  it('leaves an invoice retryable when its service period cannot be verified', async () => {
    const { admin, calls } = mockAdmin();
    await expect(handleStripeEvent(event('invoice.paid', {
      id: 'in_missing_period', subscription: 'sub_123', billing_reason: 'subscription_cycle',
      lines: { data: [] },
    }), { admin, stripe: currentStripe() })).rejects.toThrow('service period is unavailable');
    expect(calls.rpcs).toEqual([]);
    expect(calls.inserts).toEqual([]);
  });

  it('proration and initial invoices never refill realtime quota', async () => {
    const { admin, calls } = mockAdmin();
    await handleStripeEvent(event('invoice.paid', {
      id: 'in_proration', subscription: 'sub_123', billing_reason: 'subscription_update', amount_paid: 120,
    }), { admin, stripe: currentStripe() });
    expect(calls.rpcs[0].args.p_realtime_quota).toBeNull();
    const count = calls.rpcs.length;
    await handleStripeEvent(event('invoice.paid', {
      id: 'in_initial', subscription: 'sub_123', billing_reason: 'subscription_create',
    }), { admin, stripe: currentStripe() });
    expect(calls.rpcs).toHaveLength(count);
  });

  it('does not claim stale lifecycle events changed the account', async () => {
    const { admin, calls } = mockAdmin({ rpcResult: { status: 'stale' } });
    const result = await handleStripeEvent(event('customer.subscription.deleted', sub()),
      { admin, stripe: currentStripe(sub({ status: 'canceled' })) });
    expect(result).toBe('ignored: stale subscription event');
    expect(calls.updates).toEqual([]);
    expect(calls.rpcs[0].args.p_allow_replace).toBe(false);
  });

  it('subscription.updated with canceled status downgrades and revokes realtime quota', async () => {
    const { admin, calls } = mockAdmin();
    const out = await handleStripeEvent(
      event('customer.subscription.updated', sub({ status: 'canceled', metadata: { user_id: 'user-1' } })),
      { admin, stripe: currentStripe(sub({ status: 'canceled', metadata: { user_id: 'user-1' } })) }
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
      { admin, stripe: currentStripe() }
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
      { admin, stripe: currentStripe(sub({ cancel_at: cancelAt })) }
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
      { admin, stripe: currentStripe(sub({ status: 'canceled' })) }
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
      { admin, stripe: currentStripe(sub({ metadata: { user_id: 'deleted-user' } })) }
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
        { admin, stripe: currentStripe(sub({ metadata: { user_id: 'user-1' } })) }
      )
    ).rejects.toThrow(/user mapping id lookup failed: database unavailable/i);
    expect(calls.updates).toEqual([]);
    expect(calls.inserts).toEqual([]);
  });

  it('invoice.payment_failed marks past_due', async () => {
    const { admin, calls } = mockAdmin();
    const out = await handleStripeEvent(
      event('invoice.payment_failed', { id: 'in_failed', subscription: 'sub_123', customer: 'cus_123' }),
      { admin, stripe: currentStripe(sub({ status: 'past_due' })) }
    );
    expect(out).toContain('past_due');
    expect(calls.updates[0].fields).toMatchObject({ plan_status: 'past_due' });
  });

  it('invoice.payment_failed records an idempotent renewal_failed row for the scorecard', async () => {
    const { admin, calls } = mockAdmin();
    await handleStripeEvent(
      event('invoice.payment_failed', {
        id: 'in_777', subscription: 'sub_123',
        customer: 'cus_123',
        currency: 'usd',
        amount_due: 899,
        attempt_count: 2,
        billing_reason: 'subscription_cycle',
      }),
      { admin, stripe: currentStripe(sub({ status: 'past_due' })) }
    );
    const failure = calls.inserts.find(
      (call) => call.table === 'activity_events' && call.fields.event === 'renewal_failed'
    );
    expect(failure).toBeTruthy();
    // Keyed on the invoice, so Stripe's retries of the same failure collapse.
    expect(failure.fields.billing_event_id).toBe('invoice_failed:in_777');
    expect(failure.fields.user_id).toBe('user-1');
    expect(failure.fields.props).toMatchObject({
      currency: 'usd',
      invoice_id: 'in_777', subscription_id: 'sub_123',
      attempt_count: 2,
    });
    // A failed charge must never look like revenue.
    expect(failure.fields.event).not.toBe('subscription_payment_succeeded');
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

  it.each([
    [{ refunded: true, amount_refunded: 100 }, 'refund'],
    [{ refunded: false, amount_refunded: 1 }, 'refund'],
    [{ disputed: true }, 'dispute'],
  ])('rejects an already reversed exact pass payment before first fulfillment (%j)', async (flags, reason) => {
    const { admin, calls } = mockAdmin({ rpcResult: { status: 'recorded' } });
    const stripe = currentStripe();
    stripe.paymentIntents.retrieve = async id => ({ id, status: 'succeeded',
      latest_charge: { id: 'ch_reversed', payment_intent: id, ...flags } });
    const result = await handleStripeEvent(event('checkout.session.completed', {
      id: 'cs_reversed', mode: 'payment', payment_status: 'paid', amount_total: 1499,
      client_reference_id: 'user-1', metadata: { sku: 'exam_pass' },
    }), { admin, stripe });
    expect(result).toBe('ignored: checkout payment revoked');
    expect(calls.rpcs).toHaveLength(1);
    expect(calls.rpcs[0]).toMatchObject({ name: 'revoke_billing_purchase', args: {
      p_purchase_key: 'checkout:cs_reversed', p_charge_id: 'ch_reversed', p_reason: reason,
    } });
    expect(calls.updates).toEqual([]);
    expect(calls.inserts).toEqual([]);
  });

  it('still accepts a zero-total discounted pass with no PaymentIntent', async () => {
    const { admin, calls } = mockAdmin();
    const result = await handleStripeEvent(event('checkout.session.completed', {
      id: 'cs_free_coupon', mode: 'payment', payment_status: 'no_payment_required', amount_total: 0,
      payment_intent: null, client_reference_id: 'user-1', metadata: { sku: 'exam_pass' },
    }), { admin, stripe: {} });
    expect(result).toContain('activated exam pass');
    expect(calls.rpcs[0].name).toBe('fulfill_checkout');
  });

  it('leaves a paid pass retryable when its exact charge cannot be verified', async () => {
    const { admin, calls } = mockAdmin();
    await expect(handleStripeEvent(event('checkout.session.completed', {
      id: 'cs_missing_pi', mode: 'payment', payment_status: 'paid', amount_total: 1499,
      payment_intent: null, client_reference_id: 'user-1', metadata: { sku: 'exam_pass' },
    }), { admin, stripe: {} })).rejects.toThrow('PaymentIntent is unavailable');
    expect(calls.rpcs).toEqual([]);
  });

  it('records an older purchase refund without revoking the newer current plan', async () => {
    const { admin, calls } = mockAdmin({ rpcResult: { status: 'not_current' } });
    const result = await handleStripeEvent(event('charge.refunded', {
      id: 'ch_old', amount_refunded: 200, currency: 'usd',
    }), { admin, stripe: currentStripe() });
    expect(result).toContain('not_current');
    expect(calls.updates).toEqual([]);
    expect(calls.rpcs[0].args).toMatchObject({
      p_purchase_key: 'invoice:in_current', p_subscription_id: 'sub_123',
      p_provider_current_key: 'invoice:in_current', p_charge_id: 'ch_old',
    });
    expect(calls.inserts.find(c => c.fields.event === 'payment_refunded')).toBeTruthy();
  });

  it('requires explicit reconciliation for an unmapped legacy current purchase', async () => {
    const { admin, calls } = mockAdmin({ rpcResult: { status: 'needs_reconciliation' } });
    await expect(handleStripeEvent(event('charge.refunded', {
      id: 'ch_legacy', amount_refunded: 200,
    }), { admin, stripe: currentStripe() })).rejects.toThrow('exact legacy purchase reconciliation');
    expect(calls.updates).toEqual([]);
    expect(calls.inserts).toEqual([]);
  });

  it('does not let an unpaid latest invoice override the matching funded pointer', async () => {
    const { admin, calls } = mockAdmin();
    const stripe = currentStripe(sub({ latest_invoice: 'in_unpaid_latest' }));
    stripe.invoices.retrieve = async id => ({ id, status: id === 'in_unpaid_latest' ? 'open' : 'paid',
      subscription: 'sub_123', customer: 'cus_123' });
    await handleStripeEvent(event('charge.refunded', { id: 'ch_paid_current', amount_refunded: 1 }), { admin, stripe });
    expect(calls.rpcs[0].args.p_provider_current_key).toBeNull();
    expect(calls.updates.find(c => c.table === 'users').fields.plan_status).toBe('refunded');
  });

  it('uses the actual paid renewal invoice for purchase identity even if latest is unpaid', async () => {
    const { admin, calls } = mockAdmin();
    await handleStripeEvent(event('invoice.paid', {
      id: 'in_paid_actual', subscription: 'sub_123', billing_reason: 'subscription_cycle', amount_paid: 899,
    }), { admin, stripe: currentStripe(sub({ latest_invoice: 'in_unpaid_latest' })) });
    expect(calls.rpcs[0].args.p_fields).toMatchObject({
      _invoice_id: 'in_paid_actual', _paid_purchase: true, _purchase_requires_refill: true,
    });
  });

  it('resolves modern charge payment through InvoicePayments to the exact invoice', async () => {
    const { admin, calls } = mockAdmin({ rpcResult: { status: 'not_current' } });
    const stripe = currentStripe();
    stripe.charges.retrieve = async id => ({ id, customer: 'cus_123', payment_intent: 'pi_modern' });
    stripe.invoicePayments.list = async params => {
      expect(params.payment).toEqual({ type: 'payment_intent', payment_intent: 'pi_modern' });
      return { data: [{ invoice: 'in_old_modern' }], has_more: false };
    };
    await handleStripeEvent(event('charge.refunded', { id: 'ch_modern', amount_refunded: 10 }), { admin, stripe });
    expect(calls.rpcs[0].args).toMatchObject({ p_purchase_key: 'invoice:in_old_modern',
      p_provider_current_key: 'invoice:in_current' });
  });

  it('resolves a one-time refund to its exact checkout session', async () => {
    const { admin, calls } = mockAdmin({ rpcResult: { status: 'recorded' } });
    const stripe = currentStripe();
    stripe.checkout.sessions.list = async params => {
      expect(params.payment_intent).toBe('pi_test');
      return { data: [{ id: 'cs_exact_pass', mode: 'payment', payment_intent: 'pi_test',
        customer: 'cus_123', client_reference_id: 'user-1', metadata: { sku: 'exam_pass' } }], has_more: false };
    };
    await handleStripeEvent(event('charge.refunded', { id: 'ch_pass', amount_refunded: 1 }), { admin, stripe });
    expect(calls.rpcs[0].args).toMatchObject({ p_purchase_key: 'checkout:cs_exact_pass', p_subscription_id: null });
    expect(calls.updates).toEqual([]);
  });

  it('supports a legacy charge.invoice relationship without a PaymentIntent', async () => {
    const { admin, calls } = mockAdmin({ rpcResult: { status: 'not_current' } });
    const stripe = currentStripe();
    stripe.charges.retrieve = async id => ({ id, customer: 'cus_123', invoice: 'in_legacy_direct', payment_intent: null });
    stripe.checkout.sessions.list = async () => { throw new Error('must not guess a checkout without PaymentIntent'); };
    await handleStripeEvent(event('charge.refunded', { id: 'ch_legacy_direct', amount_refunded: 20 }), { admin, stripe });
    expect(calls.rpcs[0].args.p_purchase_key).toBe('invoice:in_legacy_direct');
  });

  it('rejects a refund checkout belonging to a different customer before any database mutation', async () => {
    const { admin, calls } = mockAdmin();
    const stripe = currentStripe();
    stripe.checkout.sessions.list = async () => ({ data: [{ id: 'cs_wrong_customer', mode: 'payment',
      payment_intent: 'pi_test', customer: 'cus_different', client_reference_id: 'user-1',
      metadata: { sku: 'exam_pass' } }], has_more: false });
    await expect(handleStripeEvent(event('charge.refunded', { id: 'ch_wrong_customer' }), { admin, stripe }))
      .rejects.toThrow('checkout relationship mismatch');
    expect(calls.rpcs).toEqual([]);
  });

  it('rejects a refund invoice belonging to a different customer before any database mutation', async () => {
    const { admin, calls } = mockAdmin();
    const stripe = currentStripe();
    stripe.invoices.retrieve = async id => ({ id, status: 'paid', subscription: 'sub_123', customer: 'cus_different' });
    await expect(handleStripeEvent(event('charge.refunded', { id: 'ch_wrong_invoice' }), { admin, stripe }))
      .rejects.toThrow('invoice subscription relationship mismatch');
    expect(calls.rpcs).toEqual([]);
  });

  it('leaves refund correlation retryable if Stripe lookup fails', async () => {
    const { admin, calls } = mockAdmin();
    const stripe = currentStripe();
    stripe.charges.retrieve = async () => { throw new Error('temporary Stripe outage'); };
    await expect(handleStripeEvent(event('charge.refunded', { id: 'ch_retryable' }), { admin, stripe }))
      .rejects.toThrow('temporary Stripe outage');
    expect(calls.rpcs).toEqual([]);
    expect(calls.inserts).toEqual([]);
  });

  it('does not guess when a charge payment has multiple invoice associations', async () => {
    const { admin, calls } = mockAdmin();
    const stripe = currentStripe();
    stripe.charges.retrieve = async id => ({ id, customer: 'cus_123', payment_intent: 'pi_multiple' });
    stripe.invoicePayments.list = async () => ({ data: [{ invoice: 'in_one' }, { invoice: 'in_two' }], has_more: false });
    await expect(handleStripeEvent(event('charge.refunded', { id: 'ch_multiple' }), { admin, stripe }))
      .rejects.toThrow('requires relationship reconciliation');
    expect(calls.rpcs).toEqual([]);
  });

  it('charge.refunded revokes its exactly correlated current purchase', async () => {
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
      { admin, stripe: currentStripe() }
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
      return { id: chargeId, customer: 'cus_123', payment_intent: 'pi_test', invoice: 'in_current' };
    };
    const out = await handleStripeEvent(
      event('charge.dispute.created', { charge: 'ch_disputed' }),
      { admin, stripe: { ...currentStripe(), charges: { retrieve } } }
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
    const out = await handleStripeEvent(event('customer.created', {}), { admin, stripe: currentStripe() });
    expect(out).toContain('ignored');
    expect(calls.updates.length).toBe(0);
  });
});
