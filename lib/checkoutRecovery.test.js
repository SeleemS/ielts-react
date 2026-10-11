// Abandoned-checkout recovery: session params, the checkout.session.expired
// webhook branch, recovered-session fulfillment, and the recovery email queue.
import { describe, expect, it, vi } from 'vitest';
import {
  CHECKOUT_EXPIRY_SECONDS,
  checkoutExpiryParams,
  couponFromSession,
  isResumeToken,
  liveResumeUrl,
  newResumeToken,
  queueCheckoutRecoveryEmail,
  safeRecoveryUrl,
  upgradeContextFromSession,
  upgradeFromSession,
} from './checkoutRecovery';
import { duplicatePurchaseReasons, handleStripeEvent } from './billing';

const RECOVERY_URL = 'https://buy.stripe.com/r/live_asAb1724';
const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345';
const NOW = new Date('2026-09-23T12:00:00.000Z');

// Minimal chainable Supabase double. `users` answers maybeSingle lookups,
// `recent` answers the 7-day cooldown query, inserts are recorded.
function fakeAdmin({
  user = { id: 'user-1', email: 'Learner@Example.com', plan: 'free', plan_status: 'inactive' },
  recent = [],
  insertError = null,
  userError = null,
  activityError = null,
} = {}) {
  const calls = { inserts: [], filters: [], rpcs: [] };
  const admin = {
    calls,
    async rpc(name, args) {
      calls.rpcs.push({ name, args });
      return { data: { status: 'applied', access_expires_at: args.p_fields.plan_expires_at || null }, error: null };
    },
    from(table) {
      const query = {
        select: () => query,
        eq: (column, value) => { calls.filters.push({ table, column, value }); return query; },
        gte: (column, value) => { calls.filters.push({ table, column, value, op: 'gte' }); return query; },
        limit: async () => ({ data: recent, error: null }),
        maybeSingle: async () => ({ data: user, error: userError }),
        insert: async (row) => {
          calls.inserts.push({ table, row });
          if (table === 'activity_events') return { error: activityError };
          return { error: insertError };
        },
      };
      return query;
    },
  };
  return admin;
}

function expiredEvent(object = {}) {
  return {
    id: 'evt_expired',
    type: 'checkout.session.expired',
    created: Math.floor(NOW.getTime() / 1000),
    data: {
      object: {
        id: 'cs_live_expired',
        object: 'checkout.session',
        mode: 'payment',
        status: 'expired',
        created: Math.floor(NOW.getTime() / 1000) - 3 * 3600,
        customer: 'cus_123',
        client_reference_id: 'user-1',
        amount_total: 599,
        currency: 'usd',
        success_url: 'https://www.ielts-bank.com/pricing?checkout=success&session_id={CHECKOUT_SESSION_ID}&upgrade=writing&stage=saved',
        metadata: { user_id: 'user-1', sku: 'exam_pass', ppp: '1', pass_days: '30' },
        after_expiration: {
          recovery: {
            enabled: true,
            allow_promotion_codes: true,
            url: RECOVERY_URL,
            expires_at: Math.floor(NOW.getTime() / 1000) + 30 * 86400,
          },
        },
        ...object,
      },
    },
  };
}

describe('checkoutExpiryParams', () => {
  it('expires sessions after three hours with Stripe recovery enabled', () => {
    const params = checkoutExpiryParams({ nowMs: NOW.getTime(), allowPromotionCodes: true });
    expect(CHECKOUT_EXPIRY_SECONDS).toBe(3 * 3600);
    expect(params.expires_at).toBe(Math.floor(NOW.getTime() / 1000) + 3 * 3600);
    // Stripe accepts 30 minutes to 24 hours after creation.
    expect(params.expires_at - NOW.getTime() / 1000).toBeGreaterThanOrEqual(30 * 60);
    expect(params.expires_at - NOW.getTime() / 1000).toBeLessThanOrEqual(24 * 3600);
    expect(params.after_expiration).toEqual({
      recovery: { enabled: true, allow_promotion_codes: true },
    });
  });

  it('mirrors the original promotion-code rule on recovered sessions', () => {
    expect(checkoutExpiryParams({ allowPromotionCodes: false }).after_expiration.recovery)
      .toEqual({ enabled: true, allow_promotion_codes: false });
  });
});

describe('recovery URL safety', () => {
  it('only accepts https Stripe-hosted links', () => {
    expect(safeRecoveryUrl(RECOVERY_URL)).toBe(RECOVERY_URL);
    expect(safeRecoveryUrl('https://checkout.stripe.com/c/pay/cs_x')).toContain('checkout.stripe.com');
    for (const bad of [
      'http://buy.stripe.com/r/x',
      'https://buy.stripe.com.evil.example/r/x',
      'https://evil.example/?stripe.com',
      'javascript:alert(1)',
      'https://user:pw@buy.stripe.com/r/x',
      '',
      null,
    ]) {
      expect(safeRecoveryUrl(bad), String(bad)).toBeNull();
    }
  });

  it('recovers the upgrade context from the success URL', () => {
    expect(upgradeFromSession(expiredEvent().data.object)).toBe('writing');
    expect(upgradeContextFromSession(expiredEvent().data.object)).toEqual({ upgrade: 'writing', stage: 'saved' });
    expect(upgradeFromSession({ success_url: 'https://www.ielts-bank.com/pricing?upgrade=evil' })).toBe('');
    expect(upgradeFromSession({})).toBe('');
  });

  it('reads the coupon the original checkout carried', () => {
    expect(couponFromSession({ metadata: { discount_coupon: 'IELTSBANK_SEPT30' } })).toBe('IELTSBANK_SEPT30');
    expect(couponFromSession({ discounts: [{ coupon: 'WINBACK' }] })).toBe('WINBACK');
    expect(couponFromSession({ discounts: [{ coupon: { id: 'X1' } }] })).toBe('X1');
    expect(couponFromSession({ metadata: { discount_coupon: '"><x' } })).toBeNull();
    expect(couponFromSession({})).toBeNull();
  });
});

describe('resume link (never the Stripe recovery URL)', () => {
  it('mints unguessable opaque tokens', () => {
    const a = newResumeToken();
    const b = newResumeToken();
    expect(isResumeToken(a)).toBe(true);
    expect(a).not.toBe(b);
    for (const bad of ['', 'short', `${TOKEN}x`, 'cs_live_expired', RECOVERY_URL, null, 42]) {
      expect(isResumeToken(bad), String(bad)).toBe(false);
    }
  });

  it('renders our /billing/resume URL until the link lapses', () => {
    const payload = { resume_token: TOKEN, resume_expires_at: '2026-10-23T12:00:00Z', recovery_url: RECOVERY_URL };
    expect(liveResumeUrl(payload, NOW.getTime())).toBe(`https://www.ielts-bank.com/billing/resume?c=${TOKEN}`);
    expect(liveResumeUrl(payload, Date.parse('2026-10-24T00:00:00Z'))).toBeNull();
    // A legacy row with only Stripe's URL never renders it.
    expect(liveResumeUrl({ recovery_url: RECOVERY_URL }, NOW.getTime())).toBeNull();
    expect(liveResumeUrl({ resume_token: 'nope' }, NOW.getTime())).toBeNull();
  });
});

describe('queueCheckoutRecoveryEmail', () => {
  const args = {
    sessionId: 'cs_live_expired',
    sessionCreated: Math.floor(NOW.getTime() / 1000) - 3 * 3600,
    recoveryUrl: RECOVERY_URL,
    recoveryExpiresAt: '2026-10-23T12:00:00.000Z',
    sku: 'exam_pass',
    upgrade: 'writing',
    now: NOW,
    token: TOKEN,
  };

  it('queues one checkout_abandoned email carrying an opaque resume token', async () => {
    const admin = fakeAdmin();
    await expect(queueCheckoutRecoveryEmail(admin, 'user-1', {
      ...args, upgradeContext: { upgrade: 'writing', stage: 'saved' }, coupon: 'IELTSBANK_SEPT30',
    })).resolves.toBe('recovery email queued');
    const [{ table, row }] = admin.calls.inserts;
    expect(table).toBe('lifecycle_emails');
    expect(row).toEqual({
      user_id: 'user-1',
      recipient_email: 'learner@example.com',
      email_type: 'checkout_abandoned',
      idempotency_key: 'checkout_abandoned:user-1:2026-09-23',
      payload: {
        upgrade: 'writing',
        stage: 'saved',
        sku: 'exam_pass',
        session_id: 'cs_live_expired',
        coupon: 'IELTSBANK_SEPT30',
        resume_token: TOKEN,
        resume_expires_at: '2026-10-23T12:00:00.000Z',
        recovery_url: RECOVERY_URL,
        recovery_expires_at: '2026-10-23T12:00:00.000Z',
      },
    });
    expect(admin.calls.filters).toContainEqual(
      expect.objectContaining({ column: 'created_at', op: 'gte', value: '2026-09-16T12:00:00.000Z' })
    );
  });

  it('sends at most one per learner per 7 days', async () => {
    const admin = fakeAdmin({ recent: [{ id: 'earlier' }] });
    await expect(queueCheckoutRecoveryEmail(admin, 'user-1', args))
      .resolves.toBe('recovery email skipped (sent within 7 days)');
    expect(admin.calls.inserts).toHaveLength(0);
  });

  it('never nudges a learner who already has Pro', async () => {
    const admin = fakeAdmin({ user: { email: 'a@b.com', plan: 'premium', plan_status: 'active' } });
    await expect(queueCheckoutRecoveryEmail(admin, 'user-1', args))
      .resolves.toBe('recovery email skipped (already premium)');
    expect(admin.calls.inserts).toHaveLength(0);
  });

  it('skips an unknown plan or a learner without an email address', async () => {
    await expect(queueCheckoutRecoveryEmail(fakeAdmin(), 'user-1', { ...args, sku: '6month' }))
      .resolves.toBe('recovery email skipped (unknown plan)');
    await expect(queueCheckoutRecoveryEmail(fakeAdmin({ user: { email: null } }), 'user-1', args))
      .resolves.toBe('recovery email skipped (no email)');
  });

  it('queues without Stripe\'s URL and never stores an unsafe one', async () => {
    const admin = fakeAdmin();
    await expect(queueCheckoutRecoveryEmail(admin, 'user-1', { ...args, recoveryUrl: 'https://evil.example' }))
      .resolves.toBe('recovery email queued');
    expect(admin.calls.inserts[0].row.payload).toMatchObject({ resume_token: TOKEN, recovery_url: null });
  });

  it('treats a duplicate as already queued and fails soft on errors', async () => {
    await expect(queueCheckoutRecoveryEmail(fakeAdmin({ insertError: { code: '23505' } }), 'user-1', args))
      .resolves.toBe('recovery email already queued');
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(queueCheckoutRecoveryEmail(fakeAdmin({ userError: { message: 'db down' } }), 'user-1', args))
      .resolves.toBe('recovery email failed');
    errors.mockRestore();
  });
});

describe('handleStripeEvent checkout.session.expired', () => {
  it('records the expiry and queues the recovery email for the checkout owner', async () => {
    const admin = fakeAdmin();
    const outcome = await handleStripeEvent(expiredEvent(), { admin, stripe: {} });
    expect(outcome).toBe('recorded expired checkout for user user-1 (recovery email queued)');

    const activity = admin.calls.inserts.find((call) => call.table === 'activity_events').row;
    expect(activity).toMatchObject({
      billing_event_id: 'expired:cs_live_expired',
      event: 'checkout_expired',
      user_id: 'user-1',
      props: expect.objectContaining({
        sku: 'exam_pass',
        ppp: '1',
        transaction_id: 'cs_live_expired',
        billing_mode: 'payment',
        recovery_available: true,
      }),
    });
    // The recovery link opens a checkout prefilled with the learner's email:
    // it lives only in the service-role email queue, never in analytics.
    expect(JSON.stringify(activity)).not.toContain('buy.stripe.com');

    const email = admin.calls.inserts.find((call) => call.table === 'lifecycle_emails').row;
    expect(email.payload).toMatchObject({
      recovery_url: RECOVERY_URL, sku: 'exam_pass', upgrade: 'writing', stage: 'saved', session_id: 'cs_live_expired',
    });
    expect(isResumeToken(email.payload.resume_token)).toBe(true);
    // The token is the only thing the email carries, and it is not analytics.
    expect(JSON.stringify(activity)).not.toContain(email.payload.resume_token);
  });

  it('queues a resume link for a subscription expiry even without Stripe\'s recovery URL', async () => {
    const admin = fakeAdmin();
    const outcome = await handleStripeEvent(expiredEvent({
      mode: 'subscription',
      metadata: { user_id: 'user-1', sku: 'monthly', ppp: '0', discount_coupon: 'IELTSBANK_SEPT30' },
      after_expiration: null,
    }), { admin, stripe: {} });
    expect(outcome).toContain('recovery email queued');
    expect(admin.calls.inserts.find((call) => call.table === 'activity_events').row.props)
      .toMatchObject({ sku: 'monthly', billing_mode: 'subscription', recovery_available: false });
    const email = admin.calls.inserts.find((call) => call.table === 'lifecycle_emails').row;
    expect(email.payload).toMatchObject({ sku: 'monthly', coupon: 'IELTSBANK_SEPT30', recovery_url: null });
  });

  it('sends nothing for an expired checkout of an unknown plan', async () => {
    const admin = fakeAdmin();
    const outcome = await handleStripeEvent(expiredEvent({
      metadata: { user_id: 'user-1', sku: 'lifetime' },
    }), { admin, stripe: {} });
    expect(outcome).toContain('recovery email skipped (unknown plan)');
    expect(admin.calls.inserts.some((call) => call.table === 'lifecycle_emails')).toBe(false);
  });

  it('acknowledges an expiry it cannot map to a learner without retrying', async () => {
    const admin = fakeAdmin({ user: null });
    const outcome = await handleStripeEvent(expiredEvent(), { admin, stripe: {} });
    expect(outcome).toBe('ignored: no user mapping for expired checkout');
    expect(outcome.startsWith('error:')).toBe(false);
    expect(admin.calls.inserts).toHaveLength(0);
  });

  it('keeps the webhook successful when the email queue is unavailable', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const admin = fakeAdmin({ insertError: { code: '42P01', message: 'relation missing' } });
    const outcome = await handleStripeEvent(expiredEvent(), { admin, stripe: {} });
    expect(outcome).toContain('recovery email failed');
    expect(outcome.startsWith('error:')).toBe(false);
    errors.mockRestore();
  });
});

describe('recovered checkout completion', () => {
  const stripe = (original) => ({
    checkout: { sessions: { retrieve: vi.fn(async () => original) } },
    paymentIntents: { retrieve: async (id) => ({ id, status: 'succeeded',
      latest_charge: { id: 'ch_1', payment_intent: id, refunded: false, amount_refunded: 0, disputed: false } }) },
  });
  const completed = (object) => ({
    id: 'evt_completed',
    type: 'checkout.session.completed',
    created: Math.floor(NOW.getTime() / 1000),
    data: { object: {
      id: 'cs_live_recovered', mode: 'payment', payment_status: 'paid', amount_total: 599,
      currency: 'usd', customer: 'cus_123', payment_intent: 'pi_1', recovered_from: 'cs_live_expired',
      created: Math.floor(NOW.getTime() / 1000), ...object,
    } },
  });

  it('records checkout_recovered and tags the purchase with recovered_from', async () => {
    const admin = fakeAdmin();
    const deps = { admin, stripe: stripe(null) };
    const outcome = await handleStripeEvent(completed({
      client_reference_id: 'user-1', metadata: { user_id: 'user-1', sku: 'exam_pass', ppp: '1', pass_days: '30' },
    }), deps);
    expect(outcome).toContain('activated exam pass');
    expect(deps.stripe.checkout.sessions.retrieve).not.toHaveBeenCalled();
    const events = admin.calls.inserts.filter((call) => call.table === 'activity_events').map((call) => call.row);
    expect(events.find((row) => row.event === 'purchase_success').props.recovered_from).toBe('cs_live_expired');
    expect(events.find((row) => row.event === 'checkout_recovered')).toMatchObject({
      billing_event_id: 'recovered:cs_live_recovered',
      props: expect.objectContaining({ recovered_from: 'cs_live_expired', sku: 'exam_pass' }),
    });
  });

  it('takes user and plan stamps from the original session when the copy lacks them', async () => {
    const admin = fakeAdmin();
    const original = {
      id: 'cs_live_expired', customer: 'cus_123', client_reference_id: 'user-1',
      metadata: { user_id: 'user-1', sku: 'exam_pass', ppp: '1', pass_days: '45' },
    };
    const outcome = await handleStripeEvent(completed({ metadata: {} }), { admin, stripe: stripe(original) });
    expect(outcome).toContain('activated exam pass user user-1');
    expect(admin.calls.rpcs[0].args.p_fields._exam_pass_days).toBe(45);
  });

  it('refuses to borrow stamps from a different customer\'s session', async () => {
    const admin = fakeAdmin();
    const original = { id: 'cs_live_expired', customer: 'cus_other', client_reference_id: 'user-2',
      metadata: { sku: 'exam_pass' } };
    await expect(handleStripeEvent(completed({ metadata: {} }), { admin, stripe: stripe(original) }))
      .rejects.toThrow('recovered checkout does not match its original session');
    expect(admin.calls.rpcs).toHaveLength(0);
  });
});

describe('purchase completed from the resume link', () => {
  it('attributes the purchase to the recovery email via metadata.resumed_from', async () => {
    const admin = fakeAdmin();
    const stripe = {
      paymentIntents: { retrieve: async (id) => ({ id, status: 'succeeded',
        latest_charge: { id: 'ch_1', payment_intent: id, refunded: false, amount_refunded: 0, disputed: false } }) },
    };
    const outcome = await handleStripeEvent({
      id: 'evt_resumed', type: 'checkout.session.completed', created: Math.floor(NOW.getTime() / 1000),
      data: { object: {
        id: 'cs_live_fresh', mode: 'payment', payment_status: 'paid', amount_total: 599, currency: 'usd',
        customer: 'cus_123', payment_intent: 'pi_2', created: Math.floor(NOW.getTime() / 1000),
        client_reference_id: 'user-1',
        metadata: { user_id: 'user-1', sku: 'exam_pass', ppp: '1', pass_days: '30', resumed_from: 'cs_live_expired' },
      } },
    }, { admin, stripe });
    expect(outcome).toContain('activated exam pass');
    const events = admin.calls.inserts.filter((call) => call.table === 'activity_events').map((call) => call.row);
    expect(events.find((row) => row.event === 'checkout_recovered').props)
      .toMatchObject({ recovered_from: 'cs_live_expired', recovery_path: 'resume_link' });
    expect(events.some((row) => row.event === 'duplicate_purchase')).toBe(false);
  });
});

describe('webhook duplicate-purchase backstop', () => {
  const FUTURE = '2099-10-10T00:00:00.000Z';
  const nowSec = Math.floor(NOW.getTime() / 1000);
  const settledStripe = (extra = {}) => ({
    paymentIntents: { retrieve: async (id) => ({ id, status: 'succeeded',
      latest_charge: { id: 'ch_1', payment_intent: id, refunded: false, amount_refunded: 0, disputed: false } }) },
    ...extra,
  });
  const passCompleted = (object = {}) => ({
    id: 'evt_pass', type: 'checkout.session.completed', created: nowSec,
    data: { object: {
      id: 'cs_live_second_pass', mode: 'payment', payment_status: 'paid', amount_total: 599, currency: 'usd',
      customer: 'cus_123', payment_intent: 'pi_9', created: nowSec, client_reference_id: 'user-1',
      recovered_from: 'cs_live_expired',
      metadata: { user_id: 'user-1', sku: 'exam_pass', ppp: '1', pass_days: '30' },
      ...object,
    } },
  });
  const liveSub = (overrides = {}) => ({
    id: 'sub_new', customer: 'cus_123', latest_invoice: 'in_new', status: 'active',
    cancel_at_period_end: false, current_period_start: nowSec, current_period_end: nowSec + 30 * 86400,
    created: nowSec, metadata: { user_id: 'user-1' },
    items: { data: [{ price: { lookup_key: 'premium_monthly' } }] },
    ...overrides,
  });
  const subCompleted = () => ({
    id: 'evt_sub', type: 'checkout.session.completed', created: nowSec,
    data: { object: {
      id: 'cs_live_second_sub', mode: 'subscription', subscription: 'sub_new', amount_total: 899,
      currency: 'usd', customer: 'cus_123', created: nowSec, client_reference_id: 'user-1',
      metadata: { user_id: 'user-1', sku: 'monthly', ppp: '0' },
    } },
  });

  it('alerts when a second Exam Pass lands on a live pass, without undoing anything', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const admin = fakeAdmin({ user: {
      id: 'user-1', email: 'a@b.com', plan: 'premium', plan_status: 'active', plan_sku: 'exam_pass',
      plan_expires_at: FUTURE, stripe_subscription_id: null,
    } });
    const outcome = await handleStripeEvent(passCompleted(), { admin, stripe: settledStripe() });
    expect(outcome).toContain('activated exam pass');
    expect(errors).toHaveBeenCalledWith('DUPLICATE PURCHASE:', expect.objectContaining({
      userId: 'user-1', sku: 'exam_pass', transaction_id: 'cs_live_second_pass',
      reasons: ['account_had_exam_pass'], prior_expires_at: FUTURE, recovered_from: 'cs_live_expired',
    }));
    const flagged = admin.calls.inserts.find((call) => call.row?.event === 'duplicate_purchase').row;
    expect(flagged).toMatchObject({
      billing_event_id: 'duplicate:cs_live_second_pass',
      user_id: 'user-1',
      props: expect.objectContaining({ recovery_path: 'stripe_recovery_url', prior_plan_sku: 'exam_pass' }),
    });
    // Nothing is canceled or refunded in code: only the fulfillment RPC ran.
    expect(admin.calls.rpcs.map((call) => call.name)).toEqual(['fulfill_checkout']);
    errors.mockRestore();
  });

  it('alerts when a subscription completes while another subscription is live on the customer', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    // customer.subscription.created already pointed the row at the NEW sub,
    // so only Stripe's subscription list reveals the older one.
    const admin = fakeAdmin({ user: {
      id: 'user-1', email: 'a@b.com', plan: 'premium', plan_status: 'active',
      plan_renews_at: FUTURE, stripe_subscription_id: 'sub_new',
    } });
    const list = vi.fn(async () => ({
      data: [liveSub(), liveSub({ id: 'sub_old' }), liveSub({ id: 'sub_dead', status: 'canceled' })],
    }));
    const stripe = settledStripe({ subscriptions: { retrieve: async () => liveSub(), list } });
    const outcome = await handleStripeEvent(subCompleted(), { admin, stripe });
    expect(outcome).toContain('activated user user-1');
    expect(list).toHaveBeenCalledWith({ customer: 'cus_123', status: 'all', limit: 20 });
    expect(errors).toHaveBeenCalledWith('DUPLICATE PURCHASE:', expect.objectContaining({
      reasons: ['customer_has_other_live_subscription'], other_live_subscription_ids: ['sub_old'],
      subscription_id: 'sub_new',
    }));
    expect(admin.calls.inserts.some((call) => call.row?.event === 'duplicate_purchase')).toBe(true);
    errors.mockRestore();
  });

  it('stays quiet for a first purchase, a pass holder subscribing, and a webhook retry', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const subStripe = () => settledStripe({
      subscriptions: { retrieve: async () => liveSub(), list: async () => ({ data: [liveSub()] }) },
    });
    const passHolder = { id: 'user-1', email: 'a@b.com', plan: 'premium', plan_status: 'active', plan_expires_at: FUTURE };
    const noFlag = (admin) => admin.calls.inserts.some((call) => call.row?.event === 'duplicate_purchase');

    // First purchase on a free account.
    let admin = fakeAdmin();
    await handleStripeEvent(subCompleted(), { admin, stripe: subStripe() });
    expect(noFlag(admin)).toBe(false);
    // A pass holder converting to a subscription is allowed by checkout.
    admin = fakeAdmin({ user: passHolder });
    await handleStripeEvent(subCompleted(), { admin, stripe: subStripe() });
    expect(noFlag(admin)).toBe(false);
    // A retry of the same pass: the row already shows THIS pass's expiry.
    admin = fakeAdmin({ user: passHolder });
    admin.rpc = async () => ({ data: { status: 'already_applied', access_expires_at: FUTURE }, error: null });
    await handleStripeEvent(passCompleted({ recovered_from: undefined }), { admin, stripe: settledStripe() });
    expect(noFlag(admin)).toBe(false);
    expect(errors).not.toHaveBeenCalledWith('DUPLICATE PURCHASE:', expect.anything());
    errors.mockRestore();
  });

  it('classifies prior entitlements with the shared checkout guards', () => {
    const now = NOW.getTime();
    const subscriber = { plan: 'premium', plan_status: 'active', plan_renews_at: FUTURE, stripe_subscription_id: 'sub_old' };
    expect(duplicatePurchaseReasons(subscriber, { sku: 'monthly', subscriptionId: 'sub_new', nowMs: now }))
      .toEqual(['account_had_subscription']);
    expect(duplicatePurchaseReasons(subscriber, { sku: 'exam_pass', nowMs: now })).toEqual(['account_had_subscription']);
    expect(duplicatePurchaseReasons(subscriber, { sku: 'monthly', subscriptionId: 'sub_old', nowMs: now })).toEqual([]);
    const paused = { ...subscriber, plan_status: 'paused', billing_pause_until: FUTURE };
    expect(duplicatePurchaseReasons(paused, { sku: 'annual', subscriptionId: 'sub_new', nowMs: now }))
      .toEqual(['account_had_subscription']);
    expect(duplicatePurchaseReasons(null, { sku: 'monthly', otherSubscriptionIds: ['sub_x'] }))
      .toEqual(['customer_has_other_live_subscription']);
    expect(duplicatePurchaseReasons({ plan: 'free' }, { sku: 'exam_pass', nowMs: now })).toEqual([]);
  });

  it('never blocks fulfillment when the prior billing-state read fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const admin = fakeAdmin();
    const baseFrom = admin.from.bind(admin);
    admin.from = (table) => {
      const query = baseFrom(table);
      if (table !== 'users') return query;
      return {
        ...query,
        select: (columns) => (String(columns).includes('plan_sku')
          ? { eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'db down' } }) }) }
          : query.select(columns)),
      };
    };
    const outcome = await handleStripeEvent(passCompleted(), { admin, stripe: settledStripe() });
    expect(outcome).toContain('activated exam pass');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('duplicate-purchase check skipped'), 'db down');
    warn.mockRestore();
  });
});
