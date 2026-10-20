// tests/billing-routes.test.js
// Route-level tests for the Stripe webhook (real signature verification over
// the raw body) and the checkout route (auth / anonymous / PPP mapping).
// Lives outside pages/ so Next.js never serves it as a route.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Readable } from 'node:stream';
import { createHmac } from 'node:crypto';
import Stripe from 'stripe';
import { PROMO } from '../src/lib/saleConfig';

const WEBHOOK_SECRET = 'whsec_test_secret_for_vitest';

process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_for_vitest';
process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-dummy';

// ---------------------------------------------------------------------------
// Helpers: fake Next.js req/res
// ---------------------------------------------------------------------------
function makeReq({ method = 'POST', headers = {}, body = null, raw = null } = {}) {
  const req = raw ? Readable.from([raw]) : Readable.from([]);
  req.method = method;
  req.headers = headers;
  req.body = body;
  req.socket = { remoteAddress: '127.0.0.1' };
  return req;
}

function makeRes() {
  const res = {
    statusCode: null,
    jsonBody: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.jsonBody = body;
      return this;
    },
    setHeader(k, v) {
      this.headers[k] = v;
    },
  };
  return res;
}

function signedPayload(event) {
  const payload = JSON.stringify(event);
  const stripe = new Stripe('sk_test_dummy_for_vitest');
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: WEBHOOK_SECRET,
  });
  return { payload: Buffer.from(payload), signature };
}

// ---------------------------------------------------------------------------
// Webhook route
// ---------------------------------------------------------------------------
describe('POST /api/webhooks/stripe', () => {
  it('rejects non-POST', async () => {
    const { default: handler } = await import('../pages/api/webhooks/stripe');
    const res = makeRes();
    await handler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('rejects an invalid signature', async () => {
    const { default: handler } = await import('../pages/api/webhooks/stripe');
    const res = makeRes();
    const req = makeReq({
      raw: Buffer.from(JSON.stringify({ type: 'customer.created' })),
      headers: { 'stripe-signature': 't=1,v1=deadbeef' },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.jsonBody.error).toMatch(/signature/i);
  });

  it('accepts a correctly signed event and acknowledges ignored types', async () => {
    const { default: handler } = await import('../pages/api/webhooks/stripe');
    const { payload, signature } = signedPayload({
      id: 'evt_test_1',
      type: 'customer.created',
      data: { object: { id: 'cus_x' } },
    });
    const res = makeRes();
    const req = makeReq({ raw: payload, headers: { 'stripe-signature': signature } });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ received: true });
  });

  it('rejects a signed payload that was tampered with after signing', async () => {
    const { default: handler } = await import('../pages/api/webhooks/stripe');
    const { signature } = signedPayload({ id: 'evt_1', type: 'customer.created', data: { object: {} } });
    const tampered = Buffer.from(
      JSON.stringify({ id: 'evt_1', type: 'customer.subscription.deleted', data: { object: {} } })
    );
    const res = makeRes();
    await handler(makeReq({ raw: tampered, headers: { 'stripe-signature': signature } }), res);
    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Checkout route (mocked supabase + stripe client)
// ---------------------------------------------------------------------------
const mockState = {
  reportRow: null,
  reportError: null,
  reportFilters: [],
  authUser: null,
  authError: null,
  authReject: null,
  userRow: null,
  userError: null,
  userReject: null,
  userUpdateError: null,
  userUpdateReject: null,
  customerLinkReadback: null,
  customerLinkReadbackError: null,
  customerLinkReadbackReject: null,
  rateLimit: true,
  rateLimitError: null,
  rateLimitReject: null,
  rpcCalls: [],
  retrievedSession: null,
  retrievedSubscription: null,
  updatedSubscription: null,
  previewInvoice: null,
  subscriptionUpdateError: null,
  reconciliationOutcome: 'activated user user-1 (active)',
  priceOverride: null,
  priceList: null,
  coupon: null,
  couponReject: null,
  stripeCalls: {},
  passDaysProbe: null,
  sessionsById: null,
};

// Mirrors the live catalogue after scripts/configure-exam-pass-annual.mjs:
// annual at $49.99, and the Exam Pass as a genuine one-time price.
function priceForLookupKey(lookupKey) {
  const priceShape = {
    premium_monthly: { unit_amount: 899, interval: 'month', interval_count: 1 },
    premium_3month: { unit_amount: 1999, interval: 'month', interval_count: 3 },
    premium_annual: { unit_amount: 4999, interval: 'year', interval_count: 1 },
    premium_exam_pass: { unit_amount: 1999 },
    premium_monthly_ppp: { unit_amount: 499, interval: 'month', interval_count: 1 },
    premium_3month_ppp: { unit_amount: 899, interval: 'month', interval_count: 3 },
    premium_annual_ppp: { unit_amount: 1999, interval: 'year', interval_count: 1 },
    premium_exam_pass_ppp: { unit_amount: 599 },
    premium_week_pass: { unit_amount: 499 },
    premium_week_pass_ppp: { unit_amount: 299 },
  }[lookupKey] || { unit_amount: 7999, interval: 'year', interval_count: 1 };
  return {
    id: 'price_mock_1',
    lookup_key: lookupKey,
    active: true,
    currency: 'usd',
    billing_scheme: 'per_unit',
    unit_amount: priceShape.unit_amount,
    ...(priceShape.interval
      ? {
          type: 'recurring',
          recurring: {
            interval: priceShape.interval,
            interval_count: priceShape.interval_count,
            usage_type: 'licensed',
          },
        }
      : { type: 'one_time', recurring: null }),
    ...(mockState.priceOverride || {}),
  };
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => {
        if (mockState.authReject) throw mockState.authReject;
        return mockState.authUser
          ? { data: { user: mockState.authUser }, error: mockState.authError }
          : {
              data: null,
              error: mockState.authError || { message: 'invalid token' },
            };
      },
    },
    from: (table) => table === 'writing_reports' ? {
      select: () => {
        const query = { eq: (key, value) => { mockState.reportFilters.push([key, value]); return query; }, order: () => query, limit: () => query, maybeSingle: async () => ({ data: mockState.reportRow, error: mockState.reportError }) };
        return query;
      },
    } : ({
      select: (columns) => ({
        eq: () => ({
          maybeSingle: async () => {
            if (columns === 'stripe_customer_id') {
              if (mockState.customerLinkReadbackReject) {
                throw mockState.customerLinkReadbackReject;
              }
              return {
                data: mockState.customerLinkReadback,
                error: mockState.customerLinkReadbackError,
              };
            }
            if (mockState.userReject) throw mockState.userReject;
            return {
              data: mockState.userRow,
              error: mockState.userError,
            };
          },
        }),
      }),
      update: () => ({
        eq: async () => {
          if (mockState.userUpdateReject) throw mockState.userUpdateReject;
          return { error: mockState.userUpdateError };
        },
      }),
      insert: async () => ({ error: null }),
    }),
    rpc: async (name, args) => {
      mockState.rpcCalls.push({ name, args });
      if (name === 'billing_exam_pass_days_supported') {
        return mockState.passDaysProbe || { data: null, error: { message: 'function does not exist' } };
      }
      if (mockState.rateLimitReject) throw mockState.rateLimitReject;
      return {
        data: mockState.rateLimit,
        error: mockState.rateLimitError,
      };
    },
  }),
}));

vi.mock('../lib/billing', async (importOriginal) => {
  const actual = await importOriginal();
  const { default: StripeSdk } = await import('stripe');
  // Real signature verification (used by the webhook route) + mocked network calls.
  const realWebhooks = new StripeSdk('sk_test_dummy_for_vitest').webhooks;
  return {
    ...actual,
    getStripe: () => ({
      webhooks: realWebhooks,
      prices: {
        list: async (args) => {
          mockState.stripeCalls.pricesList = args;
          return {
            data:
              mockState.priceList
              || [priceForLookupKey(args.lookup_keys[0])],
          };
        },
      },
      coupons: {
        retrieve: async (id) => {
          mockState.stripeCalls.couponRetrieve = id;
          if (mockState.couponReject) throw mockState.couponReject;
          return mockState.coupon;
        },
      },
      customers: {
        create: async (args) => {
          mockState.stripeCalls.customerCreate = args;
          return { id: 'cus_mock_1' };
        },
        del: async (id) => {
          mockState.stripeCalls.customerDelete = id;
          return { id, deleted: true };
        },
      },
      checkout: {
        sessions: {
          create: async (args) => {
            mockState.stripeCalls.sessionCreate = args;
            return { url: 'https://checkout.stripe.com/c/pay/mock' };
          },
          retrieve: async (id, args) => {
            mockState.stripeCalls.sessionRetrieve = { id, args };
            return mockState.sessionsById?.[id] || mockState.retrievedSession;
          },
        },
      },
      subscriptions: {
        retrieve: async (id, args) => {
          mockState.stripeCalls.subscriptionRetrieve = { id, args };
          return mockState.retrievedSubscription;
        },
        update: async (id, args, options) => {
          mockState.stripeCalls.subscriptionUpdate = { id, args, options };
          if (mockState.subscriptionUpdateError) throw mockState.subscriptionUpdateError;
          return mockState.updatedSubscription;
        },
      },
      invoices: {
        createPreview: async (args) => {
          mockState.stripeCalls.invoicePreview = args;
          return mockState.previewInvoice;
        },
      },
    }),
    handleStripeEvent: async (event, deps) => {
      if (
        event.type === 'checkout.session.completed'
        && String(event.id || '').startsWith('verify:')
      ) {
        mockState.stripeCalls.reconciliation = { event, deps };
        return mockState.reconciliationOutcome;
      }
      return actual.handleStripeEvent(event, deps);
    },
  };
});

describe('POST /api/billing/checkout', () => {
  beforeEach(() => {
    mockState.reportRow = null; mockState.reportError = null; mockState.reportFilters = [];
    mockState.authUser = null;
    mockState.authError = null;
    mockState.authReject = null;
    mockState.userRow = null;
    mockState.userError = null;
    mockState.userReject = null;
    mockState.userUpdateError = null;
    mockState.userUpdateReject = null;
    mockState.customerLinkReadback = null;
    mockState.customerLinkReadbackError = null;
    mockState.customerLinkReadbackReject = null;
    mockState.rateLimit = true;
    mockState.rateLimitError = null;
    mockState.rateLimitReject = null;
    mockState.rpcCalls = [];
    mockState.retrievedSession = null;
    mockState.retrievedSubscription = null;
    mockState.updatedSubscription = null;
    mockState.subscriptionUpdateError = null;
    mockState.reconciliationOutcome = 'activated user user-1 (active)';
    mockState.priceOverride = null;
    mockState.priceList = null;
    mockState.coupon = null;
    mockState.couponReject = null;
    mockState.stripeCalls = {};
    mockState.passDaysProbe = null;
    vi.restoreAllMocks();
    delete process.env.STRIPE_AUTOMATIC_TAX;
    delete process.env.STRIPE_WINBACK_COUPON_ID;
  });

  // Item 39: the only discount the page may advertise is a real Stripe coupon,
  // and checkout must verify it takes off exactly the advertised percentage.
  function withLivePromo(overrides = {}) {
    const saved = { ...PROMO };
    Object.assign(PROMO, {
      active: true,
      name: 'September offer',
      couponId: 'IELTSBANK_SEPT30',
      percentOff: 30,
      endsAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      appliesTo: ['monthly', 'annual', 'exam_pass'],
      ...overrides,
    });
    return () => Object.assign(PROMO, saved);
  }

  async function callCheckout({ headers = {}, body = { sku: 'monthly' } } = {}) {
    const { default: handler } = await import('../pages/api/billing/checkout');
    const res = makeRes();
    await handler(makeReq({ headers, body }), res);
    return res;
  }

  it('rejects unauthenticated requests', async () => {
    const res = await callCheckout();
    expect(res.statusCode).toBe(401);
  });

  it('returns a retryable service error when auth verification rejects', async () => {
    mockState.authReject = new Error('auth service unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callCheckout({
      headers: { authorization: 'Bearer tok' },
    });

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody.error).toMatch(/try again/i);
    expect(mockState.stripeCalls).toEqual({});
  });

  it('does not misreport a resolved account-query failure as a missing account', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.userError = new Error('database unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callCheckout({
      headers: { authorization: 'Bearer tok' },
    });

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody.error).toMatch(/verify your account/i);
    expect(mockState.stripeCalls).toEqual({});
  });

  it('recovers when the account query rejects', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.userReject = new Error('network unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callCheckout({
      headers: { authorization: 'Bearer tok' },
    });

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody.error).toMatch(/try again/i);
    expect(mockState.stripeCalls).toEqual({});
  });

  it('keeps a verified missing user row distinct from dependency failure', async () => {
    mockState.authUser = { id: 'user-1' };
    const res = await callCheckout({
      headers: { authorization: 'Bearer tok' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.jsonBody.error).toMatch(/account not found/i);
    expect(mockState.stripeCalls).toEqual({});
  });

  it.each(['lifetime', '3month', '6month'])(
    'rejects retired or unknown new-purchase SKU %s before account or Stripe work',
    async (sku) => {
      mockState.authUser = { id: 'user-1' };
      const res = await callCheckout({
        headers: { authorization: 'Bearer tok' },
        body: { sku },
      });
      expect(res.statusCode).toBe(400);
      expect(mockState.rpcCalls).toEqual([]);
      expect(mockState.stripeCalls).toEqual({});
    }
  );

  it('rejects anonymous accounts with a linkable error code', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = { id: 'user-1', email: null, is_anonymous: true, plan: 'free' };
    const res = await callCheckout({ headers: { authorization: 'Bearer tok' } });
    expect(res.statusCode).toBe(403);
    expect(res.jsonBody.code).toBe('anonymous_user');
  });

  it('rejects users who already have premium', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = {
      id: 'user-1',
      email: 'a@b.com',
      is_anonymous: false,
      plan: 'premium',
      plan_status: 'active',
    };
    const res = await callCheckout({ headers: { authorization: 'Bearer tok' } });
    expect(res.statusCode).toBe(409);
    expect(res.jsonBody.code).toBe('already_premium');
    expect(res.jsonBody.error).toBe('You already have Pro — manage your plan.');
  });

  it('blocks an active subscriber from buying any second plan, Exam Pass included', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = {
      id: 'user-1',
      email: 'a@b.com',
      is_anonymous: false,
      plan: 'premium',
      plan_status: 'active',
      plan_renews_at: '2099-01-20T00:00:00.000Z',
      stripe_customer_id: 'cus_existing',
      stripe_subscription_id: 'sub_existing',
    };

    for (const sku of ['monthly', 'annual', 'exam_pass']) {
      const res = await callCheckout({
        headers: { authorization: 'Bearer tok' },
        body: { sku },
      });
      expect(res.statusCode).toBe(409);
      expect(res.jsonBody.code).toBe('already_premium');
    }
    expect(mockState.rpcCalls).toEqual([]);
    expect(mockState.stripeCalls).toEqual({});
  });

  it('lets an Exam Pass holder subscribe but not stack a second pass', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = {
      id: 'user-1',
      email: 'a@b.com',
      is_anonymous: false,
      plan: 'premium',
      plan_status: 'active',
      plan_expires_at: '2099-01-20T00:00:00.000Z',
      stripe_customer_id: 'cus_existing',
      stripe_subscription_id: null,
    };

    const blocked = await callCheckout({
      headers: { authorization: 'Bearer tok' },
      body: { sku: 'exam_pass' },
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.jsonBody.code).toBe('already_exam_pass');
    expect(mockState.stripeCalls).toEqual({});

    const allowed = await callCheckout({
      headers: { authorization: 'Bearer tok' },
      body: { sku: 'annual' },
    });
    expect(allowed.statusCode).toBe(200);
    expect(mockState.stripeCalls.sessionCreate.mode).toBe('subscription');
  });

  it('rejects a second recurring checkout while Premium access is paused', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = {
      id: 'user-1',
      email: 'a@b.com',
      is_anonymous: false,
      plan: 'premium',
      plan_status: 'active',
      plan_renews_at: '2099-01-20T00:00:00.000Z',
      billing_pause_until: '2098-08-20T00:00:00.000Z',
      stripe_customer_id: 'cus_existing',
      stripe_subscription_id: 'sub_existing',
    };

    const res = await callCheckout({ headers: { authorization: 'Bearer tok' } });

    expect(res.statusCode).toBe(409);
    expect(res.jsonBody.code).toBe('already_premium');
    expect(mockState.rpcCalls).toEqual([]);
    expect(mockState.stripeCalls).toEqual({});
  });

  it('rejects checkout while Stripe holds the subscription in true paused status', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = {
      id: 'user-1',
      email: 'a@b.com',
      is_anonymous: false,
      plan: 'premium',
      plan_status: 'paused',
      billing_pause_until: '2098-08-20T00:00:00.000Z',
      stripe_customer_id: 'cus_existing',
      stripe_subscription_id: 'sub_existing',
    };

    const res = await callCheckout({ headers: { authorization: 'Bearer tok' } });

    expect(res.statusCode).toBe(409);
    expect(res.jsonBody.code).toBe('already_premium');
    expect(mockState.rpcCalls).toEqual([]);
    expect(mockState.stripeCalls).toEqual({});
  });

  it('rate-limits repeated checkout attempts before any Stripe call', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = {
      id: 'user-1',
      email: 'a@b.com',
      is_anonymous: false,
      plan: 'free',
    };
    mockState.rateLimit = false;

    const res = await callCheckout({ headers: { authorization: 'Bearer tok' } });

    expect(res.statusCode).toBe(429);
    expect(res.jsonBody.error).toMatch(/too many checkout attempts/i);
    expect(mockState.rpcCalls).toEqual([
      {
        name: 'check_rate_limit',
        args: {
          p_bucket: 'billing-checkout',
          p_identifier: 'user-1',
          p_window_seconds: 600,
          p_max: 10,
        },
      },
    ]);
    expect(mockState.stripeCalls).toEqual({});
  });

  it('fails closed when the checkout limiter returns an error', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = {
      id: 'user-1',
      email: 'a@b.com',
      is_anonymous: false,
      plan: 'free',
    };
    mockState.rateLimitError = new Error('database unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await callCheckout({ headers: { authorization: 'Bearer tok' } });

    expect(res.statusCode).toBe(503);
    expect(mockState.stripeCalls).toEqual({});
  });

  it('fails closed when the checkout limiter rejects', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = {
      id: 'user-1',
      email: 'a@b.com',
      is_anonymous: false,
      plan: 'free',
    };
    mockState.rateLimitReject = new Error('network unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await callCheckout({ headers: { authorization: 'Bearer tok' } });

    expect(res.statusCode).toBe(503);
    expect(mockState.stripeCalls).toEqual({});
  });

  it('creates a checkout session with the global price by default', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = { id: 'user-1', email: 'a@b.com', is_anonymous: false, plan: 'free' };
    const res = await callCheckout({ headers: { authorization: 'Bearer tok' } });
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.url).toContain('checkout.stripe.com');
    expect(mockState.stripeCalls.pricesList).toEqual({
      lookup_keys: ['premium_monthly'],
      active: true,
      limit: 2,
    });
    const session = mockState.stripeCalls.sessionCreate;
    expect(session.mode).toBe('subscription');
    expect(session.client_reference_id).toBe('user-1');
    expect(session.allow_promotion_codes).toBe(true);
    expect(session.payment_method_collection).toBe('if_required');
    expect(session.subscription_data.metadata.user_id).toBe('user-1');
    expect(session.automatic_tax).toBeUndefined();
  });

  it.each([
    { upgrade: 'writing', stage: 'saved', return_to: '/ielts-writing-checker' },
    { upgrade: 'speaking', stage: 'saved', return_to: '/speakingquestion/part-2-example' },
    { upgrade: 'mock', stage: 'sample', return_to: '/mock/academic-reading-1' },
  ])('carries safe context through both Stripe URLs: $upgrade', async (context) => {
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = { id: 'user-1', email: 'a@b.com', is_anonymous: false, plan: 'free' };
    const res = await callCheckout({ headers: { authorization: 'Bearer tok' }, body: { sku: 'exam_pass', ...context, essay: 'private-content', audioPath: 'private-path' } });
    expect(res.statusCode).toBe(200);
    const session = mockState.stripeCalls.sessionCreate;
    for (const key of ['success_url', 'cancel_url']) {
      const target = new URL(session[key]);
      expect(target.origin).toBe('https://www.ielts-bank.com');
      expect(target.pathname).toBe('/pricing');
      for (const [field, value] of Object.entries(context)) expect(target.searchParams.get(field)).toBe(value);
      expect(session[key]).not.toContain('private');
    }
    expect(session.success_url).toContain('session_id={CHECKOUT_SESSION_ID}');
  });

  it.each([false, true])('verifies ownership of a saved report before opening Stripe (found=%s)', async found => {
    const reportId = '10000000-0000-4000-8000-000000000001';
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = { id: 'user-1', email: 'a@b.com', is_anonymous: false, plan: 'free' };
    mockState.reportRow = found ? { attempt_id: reportId } : null;
    const res = await callCheckout({ headers: { authorization: 'Bearer tok' }, body: { upgrade: 'writing', stage: 'sample', return_to: `/writing-report/${reportId}` } });
    expect(mockState.reportFilters).toEqual([['attempt_id', reportId], ['user_id', 'user-1']]);
    expect(res.statusCode).toBe(found ? 200 : 404);
    if (!found) expect(mockState.stripeCalls).toEqual({});
    else expect(mockState.stripeCalls.sessionCreate.success_url).toContain(encodeURIComponent(`/writing-report/${reportId}`));
  });
  it('does not open Stripe when report verification fails', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = { id: 'user-1', email: 'a@b.com', is_anonymous: false, plan: 'free' };
    mockState.reportError = { message: 'database offline' };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callCheckout({ headers: { authorization: 'Bearer tok' }, body: { upgrade: 'writing', return_to: '/writing-report/10000000-0000-4000-8000-000000000001' } });
    expect(res.statusCode).toBe(503); expect(mockState.stripeCalls).toEqual({});
  });

  it('drops untrusted return URLs at the server boundary', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = { id: 'user-1', email: 'a@b.com', is_anonymous: false, plan: 'free' };
    await callCheckout({ headers: { authorization: 'Bearer tok' }, body: { upgrade: 'writing', stage: 'saved', return_to: '//attacker.example/path' } });
    expect(mockState.stripeCalls.sessionCreate.success_url).not.toContain('return_to');
    expect(mockState.stripeCalls.sessionCreate.cancel_url).not.toContain('attacker');
  });

  it('creates a global annual checkout on the advertised price contract', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = { id: 'user-1', email: 'a@b.com', is_anonymous: false, plan: 'free' };
    const res = await callCheckout({
      headers: { authorization: 'Bearer tok' },
      body: { sku: 'annual' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockState.stripeCalls.pricesList.lookup_keys).toEqual(['premium_annual']);
    const session = mockState.stripeCalls.sessionCreate;
    expect(session.mode).toBe('subscription');
    expect(session.subscription_data.metadata.sku).toBe('annual');
    expect(session.subscription_data.metadata.ppp).toBe('0');
  });

  it('opens the Exam Pass as a one-time payment with nothing set up to renew', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = { id: 'user-1', email: 'a@b.com', is_anonymous: false, plan: 'free' };
    const res = await callCheckout({
      headers: { authorization: 'Bearer tok' },
      body: { sku: 'exam_pass' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockState.stripeCalls.pricesList.lookup_keys).toEqual(['premium_exam_pass']);
    const session = mockState.stripeCalls.sessionCreate;
    expect(session.mode).toBe('payment');
    expect(session.subscription_data).toBeUndefined();
    // payment_method_collection is a subscription/setup-mode field; sending it
    // on a one-time session is rejected by Stripe.
    expect(session.payment_method_collection).toBeUndefined();
    expect(session.metadata).toMatchObject({ sku: 'exam_pass', ppp: '0', user_id: 'user-1' });
    expect(session.client_reference_id).toBe('user-1');
  });

  it('stamps the advertised 30-day length without probing the database', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = { id: 'user-1', email: 'a@b.com', is_anonymous: false, plan: 'free' };
    const res = await callCheckout({ headers: { authorization: 'Bearer tok' }, body: { sku: 'exam_pass' } });
    expect(res.statusCode).toBe(200);
    expect(mockState.stripeCalls.sessionCreate.metadata.pass_days).toBe('30');
    expect(mockState.rpcCalls.map((call) => call.name)).not.toContain('billing_exam_pass_days_supported');
    // Subscriptions carry no pass length.
    await callCheckout({ headers: { authorization: 'Bearer tok' }, body: { sku: 'monthly' } });
    expect(mockState.stripeCalls.sessionCreate.metadata.pass_days).toBeUndefined();
  });

  describe('with NEXT_PUBLIC_EXAM_PASS_DAYS=45', () => {
    async function callCheckout45(body) {
      vi.stubEnv('NEXT_PUBLIC_EXAM_PASS_DAYS', '45');
      try {
        return await callCheckout({ headers: { authorization: 'Bearer tok' }, body });
      } finally {
        vi.unstubAllEnvs();
      }
    }

    beforeEach(() => {
      mockState.authUser = { id: 'user-1' };
      mockState.userRow = { id: 'user-1', email: 'a@b.com', is_anonymous: false, plan: 'free' };
    });

    it('refuses to sell a 45-day pass until the database can grant it', async () => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      const res = await callCheckout45({ sku: 'exam_pass' });
      expect(res.statusCode).toBe(503);
      expect(mockState.stripeCalls.sessionCreate).toBeUndefined();
      expect(mockState.stripeCalls.pricesList).toBeUndefined();
      expect(errors).toHaveBeenCalledWith('checkout EXAM PASS LENGTH NOT DEPLOYED:', expect.anything());
    });

    it('refuses when the deployed function grants other lengths only', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      mockState.passDaysProbe = { data: [30], error: null };
      const res = await callCheckout45({ sku: 'exam_pass' });
      expect(res.statusCode).toBe(503);
    });

    it('sells and stamps a 45-day pass once the migration is live', async () => {
      mockState.passDaysProbe = { data: [30, 45], error: null };
      const res = await callCheckout45({ sku: 'exam_pass' });
      expect(res.statusCode).toBe(200);
      expect(mockState.stripeCalls.sessionCreate.metadata.pass_days).toBe('45');
    });

    it('never blocks subscriptions on the pass-length probe', async () => {
      const res = await callCheckout45({ sku: 'annual' });
      expect(res.statusCode).toBe(200);
      expect(mockState.rpcCalls.map((call) => call.name)).not.toContain('billing_exam_pass_days_supported');
    });
  });

  it('resolves the regional Exam Pass price for a PPP visitor', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = { id: 'user-1', email: 'a@b.com', is_anonymous: false, plan: 'free' };
    const res = await callCheckout({
      headers: { authorization: 'Bearer tok', 'x-vercel-ip-country': 'IN' },
      body: { sku: 'exam_pass' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockState.stripeCalls.pricesList.lookup_keys).toEqual(['premium_exam_pass_ppp']);
    expect(mockState.stripeCalls.sessionCreate.metadata.ppp).toBe('1');
  });

  it('blocks an Exam Pass checkout if Stripe returns a recurring price', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = { id: 'user-1', email: 'a@b.com', is_anonymous: false, plan: 'free' };
    mockState.priceOverride = {
      type: 'recurring',
      recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' },
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await callCheckout({
      headers: { authorization: 'Bearer tok' },
      body: { sku: 'exam_pass' },
    });

    expect(res.statusCode).toBe(503);
    expect(mockState.stripeCalls.sessionCreate).toBeUndefined();
  });

  it('lets an eligible win-back account buy the annual plan at list price', async () => {
    process.env.STRIPE_WINBACK_COUPON_ID = 'IELTSBANK_WINBACK40';
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = {
      id: 'user-1',
      email: 'a@b.com',
      is_anonymous: false,
      plan: 'free',
      canceled_at: new Date(Date.now() - 31 * 86400000).toISOString(),
    };
    const res = await callCheckout({
      headers: { authorization: 'Bearer tok' },
      body: { sku: 'annual', offer: 'winback' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockState.stripeCalls.sessionCreate.discounts).toBeUndefined();
    expect(mockState.stripeCalls.sessionCreate.allow_promotion_codes).toBe(true);
  });

  describe('48-hour first-report offer', () => {
    beforeEach(() => {
      process.env.STRIPE_REPORT_OFFER_COUPON_ID = 'IELTSBANK_REPORT48_WEEK40';
      process.env.NEXT_PUBLIC_WEEK_PASS = '1';
      mockState.authUser = { id: 'user-1' };
      mockState.userRow = { id: 'user-1', email: 'a@b.com', is_anonymous: false, plan: 'free' };
      mockState.passDaysProbe = { data: [7, 30, 45], error: null };
    });
    afterEach(() => {
      delete process.env.STRIPE_REPORT_OFFER_COUPON_ID;
      delete process.env.NEXT_PUBLIC_WEEK_PASS;
    });

    it('attaches the coupon to a Week Pass within 48h of the first free report', async () => {
      mockState.reportRow = { created_at: new Date(Date.now() - 5 * 3600000).toISOString() };
      const res = await callCheckout({ headers: { authorization: 'Bearer tok' }, body: { sku: 'week_pass', offer: 'report48' } });
      expect(res.statusCode).toBe(200);
      expect(mockState.stripeCalls.sessionCreate.discounts).toEqual([{ coupon: 'IELTSBANK_REPORT48_WEEK40' }]);
      expect(mockState.stripeCalls.sessionCreate.allow_promotion_codes).toBe(false);
      expect(mockState.stripeCalls.sessionCreate.metadata.offer).toBe('report48');
    });

    it('charges list price once the 48 hours are over', async () => {
      mockState.reportRow = { created_at: new Date(Date.now() - 49 * 3600000).toISOString() };
      const res = await callCheckout({ headers: { authorization: 'Bearer tok' }, body: { sku: 'week_pass', offer: 'report48' } });
      expect(res.statusCode).toBe(200);
      expect(mockState.stripeCalls.sessionCreate.discounts).toBeUndefined();
    });

    it('never discounts other plans or learners who have paid before', async () => {
      mockState.reportRow = { created_at: new Date(Date.now() - 3600000).toISOString() };
      await callCheckout({ headers: { authorization: 'Bearer tok' }, body: { sku: 'monthly', offer: 'report48' } });
      expect(mockState.stripeCalls.sessionCreate.discounts).toBeUndefined();
      mockState.stripeCalls = {};
      mockState.userRow = { ...mockState.userRow, plan_sku: 'monthly', premium_since: '2026-01-01T00:00:00Z' };
      await callCheckout({ headers: { authorization: 'Bearer tok' }, body: { sku: 'week_pass', offer: 'report48' } });
      expect(mockState.stripeCalls.sessionCreate.discounts).toBeUndefined();
    });
  });

  it('selects the PPP price from request geo, never from the client body', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = { id: 'user-1', email: 'a@b.com', is_anonymous: false, plan: 'free' };
    const res = await callCheckout({
      headers: { authorization: 'Bearer tok', 'x-vercel-ip-country': 'IN' },
      body: { sku: 'annual' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockState.stripeCalls.pricesList.lookup_keys).toEqual(['premium_annual_ppp']);
    expect(mockState.stripeCalls.sessionCreate.subscription_data.metadata.ppp).toBe('1');
  });

  it.each([
    ['amount', { unit_amount: 999 }],
    ['currency', { currency: 'cad' }],
    ['active state', { active: false }],
    ['price type', { type: 'one_time', recurring: null }],
    [
      'billing interval',
      { recurring: { interval: 'year', interval_count: 1, usage_type: 'licensed' } },
    ],
    [
      'usage type',
      { recurring: { interval: 'month', interval_count: 1, usage_type: 'metered' } },
    ],
  ])('blocks checkout when Stripe %s differs from the advertised plan', async (_, override) => {
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = {
      id: 'user-1',
      email: 'a@b.com',
      is_anonymous: false,
      plan: 'free',
    };
    mockState.priceOverride = override;
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await callCheckout({ headers: { authorization: 'Bearer tok' } });

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody.error).toMatch(/pricing is being updated/i);
    expect(mockState.stripeCalls.customerCreate).toBeUndefined();
    expect(mockState.stripeCalls.sessionCreate).toBeUndefined();
  });

  it('blocks checkout when a lookup key resolves ambiguously', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = {
      id: 'user-1',
      email: 'a@b.com',
      is_anonymous: false,
      plan: 'free',
    };
    const first = priceForLookupKey('premium_monthly');
    mockState.priceList = [first, { ...first, id: 'price_mock_2' }];
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await callCheckout({ headers: { authorization: 'Bearer tok' } });

    expect(res.statusCode).toBe(500);
    expect(mockState.stripeCalls.customerCreate).toBeUndefined();
    expect(mockState.stripeCalls.sessionCreate).toBeUndefined();
  });

  it('reuses an existing stripe customer instead of creating a new one', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = {
      id: 'user-1',
      email: 'a@b.com',
      is_anonymous: false,
      plan: 'free',
      stripe_customer_id: 'cus_existing',
    };
    await callCheckout({ headers: { authorization: 'Bearer tok' } });
    expect(mockState.stripeCalls.customerCreate).toBeUndefined();
    expect(mockState.stripeCalls.sessionCreate.customer).toBe('cus_existing');
  });

  it('removes a new Stripe customer when linking it returns an error', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = {
      id: 'user-1',
      email: 'a@b.com',
      is_anonymous: false,
      plan: 'free',
    };
    mockState.userUpdateError = new Error('database unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await callCheckout({
      headers: { authorization: 'Bearer tok' },
    });

    expect(res.statusCode).toBe(500);
    expect(mockState.stripeCalls.customerDelete).toBe('cus_mock_1');
    expect(mockState.stripeCalls.sessionCreate).toBeUndefined();
  });

  it('removes a new Stripe customer when linking it rejects', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = {
      id: 'user-1',
      email: 'a@b.com',
      is_anonymous: false,
      plan: 'free',
    };
    mockState.userUpdateReject = new Error('network unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await callCheckout({
      headers: { authorization: 'Bearer tok' },
    });

    expect(res.statusCode).toBe(500);
    expect(mockState.stripeCalls.customerDelete).toBe('cus_mock_1');
    expect(mockState.stripeCalls.sessionCreate).toBeUndefined();
  });

  it('keeps a customer when read-back proves a rejected link committed', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = {
      id: 'user-1',
      email: 'a@b.com',
      is_anonymous: false,
      plan: 'free',
    };
    mockState.userUpdateReject = new Error('response lost');
    mockState.customerLinkReadback = {
      stripe_customer_id: 'cus_mock_1',
    };

    const res = await callCheckout({
      headers: { authorization: 'Bearer tok' },
    });

    expect(res.statusCode).toBe(200);
    expect(mockState.stripeCalls.customerDelete).toBeUndefined();
    expect(mockState.stripeCalls.sessionCreate.customer).toBe('cus_mock_1');
  });

  it('does not delete a customer when rejected link state cannot be confirmed', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = {
      id: 'user-1',
      email: 'a@b.com',
      is_anonymous: false,
      plan: 'free',
    };
    mockState.userUpdateReject = new Error('response lost');
    mockState.customerLinkReadbackReject = new Error('read-back unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await callCheckout({
      headers: { authorization: 'Bearer tok' },
    });

    expect(res.statusCode).toBe(500);
    expect(mockState.stripeCalls.customerDelete).toBeUndefined();
    expect(mockState.stripeCalls.sessionCreate).toBeUndefined();
  });

  it('rejects a win-back offer before the 30-day eligibility window', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = {
      id: 'user-1',
      email: 'a@b.com',
      is_anonymous: false,
      plan: 'free',
      canceled_at: new Date(Date.now() - 29 * 86400000).toISOString(),
    };
    const res = await callCheckout({
      headers: { authorization: 'Bearer tok' },
      body: { sku: 'monthly', offer: 'winback' },
    });
    expect(res.statusCode).toBe(403);
    expect(mockState.stripeCalls.pricesList).toBeUndefined();
  });

  it('fails closed when an eligible win-back coupon is not configured', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = {
      id: 'user-1',
      email: 'a@b.com',
      is_anonymous: false,
      plan: 'free',
      canceled_at: new Date(Date.now() - 31 * 86400000).toISOString(),
    };
    const res = await callCheckout({
      headers: { authorization: 'Bearer tok' },
      body: { sku: 'monthly', offer: 'winback' },
    });
    expect(res.statusCode).toBe(503);
    expect(mockState.stripeCalls.sessionCreate).toBeUndefined();
  });

  it('applies only the configured coupon to an eligible monthly win-back checkout', async () => {
    process.env.STRIPE_WINBACK_COUPON_ID = 'IELTSBANK_WINBACK40';
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = {
      id: 'user-1',
      email: 'a@b.com',
      is_anonymous: false,
      plan: 'free',
      canceled_at: new Date(Date.now() - 31 * 86400000).toISOString(),
    };
    const res = await callCheckout({
      headers: { authorization: 'Bearer tok' },
      body: { sku: 'monthly', offer: 'winback' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockState.stripeCalls.sessionCreate.allow_promotion_codes).toBe(false);
    expect(mockState.stripeCalls.sessionCreate.discounts).toEqual([
      { coupon: 'IELTSBANK_WINBACK40' },
    ]);
  });

  it('attaches the configured promo coupon and stops stacking promotion codes', async () => {
    const restore = withLivePromo();
    mockState.coupon = { id: 'IELTSBANK_SEPT30', percent_off: 30, valid: true };
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = { id: 'user-1', email: 'a@b.com', is_anonymous: false, plan: 'free' };
    try {
      const res = await callCheckout({ headers: { authorization: 'Bearer tok' } });

      expect(res.statusCode).toBe(200);
      expect(mockState.stripeCalls.couponRetrieve).toBe('IELTSBANK_SEPT30');
      const session = mockState.stripeCalls.sessionCreate;
      expect(session.discounts).toEqual([{ coupon: 'IELTSBANK_SEPT30' }]);
      // Stripe accepts either a coupon or promotion codes, never both.
      expect(session.allow_promotion_codes).toBe(false);
    } finally {
      restore();
    }
  });

  it.each([
    ['a different percentage', { id: 'IELTSBANK_SEPT30', percent_off: 20, valid: true }],
    ['an amount-off coupon', { id: 'IELTSBANK_SEPT30', amount_off: 300, valid: true }],
    ['an invalid coupon', { id: 'IELTSBANK_SEPT30', percent_off: 30, valid: false }],
  ])('fails closed when the promo coupon is %s', async (_label, coupon) => {
    const restore = withLivePromo();
    mockState.coupon = coupon;
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = { id: 'user-1', email: 'a@b.com', is_anonymous: false, plan: 'free' };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await callCheckout({ headers: { authorization: 'Bearer tok' } });

      expect(res.statusCode).toBe(503);
      expect(res.jsonBody.error).toMatch(/pricing is being updated/i);
      expect(mockState.stripeCalls.sessionCreate).toBeUndefined();
    } finally {
      restore();
    }
  });

  it('fails closed when the promo coupon no longer exists in Stripe', async () => {
    const restore = withLivePromo();
    mockState.couponReject = new Error('No such coupon');
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = { id: 'user-1', email: 'a@b.com', is_anonymous: false, plan: 'free' };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await callCheckout({ headers: { authorization: 'Bearer tok' } });
      expect(res.statusCode).toBe(503);
      expect(mockState.stripeCalls.sessionCreate).toBeUndefined();
    } finally {
      restore();
    }
  });

  it('never touches a coupon for a SKU the promo does not name', async () => {
    const restore = withLivePromo({ appliesTo: ['annual'] });
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = { id: 'user-1', email: 'a@b.com', is_anonymous: false, plan: 'free' };
    try {
      const res = await callCheckout({
        headers: { authorization: 'Bearer tok' },
        body: { sku: 'exam_pass' },
      });
      expect(res.statusCode).toBe(200);
      expect(mockState.stripeCalls.couponRetrieve).toBeUndefined();
      expect(mockState.stripeCalls.sessionCreate.discounts).toBeUndefined();
      expect(mockState.stripeCalls.sessionCreate.allow_promotion_codes).toBe(true);
    } finally {
      restore();
    }
  });

  it('ships with no promo, so no coupon is ever fetched at checkout', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = { id: 'user-1', email: 'a@b.com', is_anonymous: false, plan: 'free' };
    const res = await callCheckout({ headers: { authorization: 'Bearer tok' } });
    expect(res.statusCode).toBe(200);
    expect(mockState.stripeCalls.couponRetrieve).toBeUndefined();
    expect(mockState.stripeCalls.sessionCreate.discounts).toBeUndefined();
  });

  it.each(['monthly', 'annual', 'exam_pass'])(
    'expires a %s checkout after 3 hours with Stripe recovery enabled',
    async (sku) => {
      mockState.authUser = { id: 'user-1' };
      mockState.userRow = { id: 'user-1', email: 'a@b.com', is_anonymous: false, plan: 'free' };
      const before = Math.floor(Date.now() / 1000);
      const res = await callCheckout({ headers: { authorization: 'Bearer tok' }, body: { sku } });
      const after = Math.floor(Date.now() / 1000);
      expect(res.statusCode).toBe(200);
      const session = mockState.stripeCalls.sessionCreate;
      expect(session.mode).toBe(sku === 'exam_pass' ? 'payment' : 'subscription');
      expect(session.expires_at).toBeGreaterThanOrEqual(before + 3 * 3600);
      expect(session.expires_at).toBeLessThanOrEqual(after + 3 * 3600);
      expect(session.after_expiration).toEqual({
        recovery: { enabled: true, allow_promotion_codes: true },
      });
      expect(session.allow_promotion_codes).toBe(true);
    }
  );

  it('keeps promotion codes off recovered sessions when a coupon is attached', async () => {
    process.env.STRIPE_WINBACK_COUPON_ID = 'WINBACK40';
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = {
      id: 'user-1', email: 'a@b.com', is_anonymous: false, plan: 'free',
      canceled_at: new Date(Date.now() - 60 * 86400000).toISOString(),
    };
    const res = await callCheckout({
      headers: { authorization: 'Bearer tok' },
      body: { sku: 'monthly', offer: 'winback' },
    });
    expect(res.statusCode).toBe(200);
    const session = mockState.stripeCalls.sessionCreate;
    expect(session.discounts).toEqual([{ coupon: 'WINBACK40' }]);
    expect(session.allow_promotion_codes).toBe(false);
    expect(session.after_expiration.recovery).toEqual({ enabled: true, allow_promotion_codes: false });
  });

  it('enables automatic Tax only when the production setting is explicitly on', async () => {
    process.env.STRIPE_AUTOMATIC_TAX = '1';
    mockState.authUser = { id: 'user-1' };
    mockState.userRow = {
      id: 'user-1',
      email: 'a@b.com',
      is_anonymous: false,
      plan: 'free',
    };
    const res = await callCheckout({ headers: { authorization: 'Bearer tok' } });
    expect(res.statusCode).toBe(200);
    expect(mockState.stripeCalls.sessionCreate.automatic_tax).toEqual({ enabled: true });
  });
});

describe('POST /api/billing/verify-session', () => {
  beforeEach(() => {
    mockState.authUser = null;
    mockState.authError = null;
    mockState.authReject = null;
    mockState.userRow = {
      plan: 'premium',
      plan_status: 'active',
      plan_renews_at: null,
      plan_expires_at: null,
      billing_pause_until: null,
    };
    mockState.userError = null;
    mockState.userReject = null;
    mockState.rateLimit = true;
    mockState.rateLimitError = null;
    mockState.rateLimitReject = null;
    mockState.rpcCalls = [];
    mockState.retrievedSession = null;
    mockState.sessionsById = null;
    mockState.reconciliationOutcome = 'activated user user-1 (active)';
    mockState.stripeCalls = {};
    vi.restoreAllMocks();
  });

  async function callVerify({ headers = {}, body = {} } = {}) {
    const { default: handler } = await import('../pages/api/billing/verify-session');
    const res = makeRes();
    await handler(makeReq({ headers, body }), res);
    return res;
  }

  it('rejects unauthenticated and malformed reconciliation requests', async () => {
    let res = await callVerify({ body: { session_id: 'cs_live_valid' } });
    expect(res.statusCode).toBe(401);

    mockState.authUser = { id: 'user-1' };
    res = await callVerify({
      headers: { authorization: 'Bearer tok' },
      body: { session_id: 'not-a-checkout-session' },
    });
    expect(res.statusCode).toBe(400);
    expect(mockState.stripeCalls.sessionRetrieve).toBeUndefined();
  });

  it('returns a retryable response when auth verification rejects', async () => {
    mockState.authReject = new Error('auth service unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callVerify({
      headers: { authorization: 'Bearer tok' },
      body: { session_id: 'cs_live_valid' },
    });

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody.error).toMatch(/still processing/i);
    expect(mockState.stripeCalls.sessionRetrieve).toBeUndefined();
  });

  it('rate-limits repeated activation checks before Stripe retrieval', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.rateLimit = false;

    const res = await callVerify({
      headers: { authorization: 'Bearer tok' },
      body: { session_id: 'cs_live_valid' },
    });

    expect(res.statusCode).toBe(429);
    expect(res.jsonBody.error).toMatch(/too many activation checks/i);
    expect(mockState.rpcCalls).toEqual([
      {
        name: 'check_rate_limit',
        args: {
          p_bucket: 'billing-verify-session',
          p_identifier: 'user-1',
          p_window_seconds: 600,
          p_max: 20,
        },
      },
    ]);
    expect(mockState.stripeCalls.sessionRetrieve).toBeUndefined();
  });

  it('fails closed when the activation limiter returns an error', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.rateLimitError = new Error('database unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await callVerify({
      headers: { authorization: 'Bearer tok' },
      body: { session_id: 'cs_live_valid' },
    });

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody.error).toMatch(/still processing/i);
    expect(mockState.stripeCalls.sessionRetrieve).toBeUndefined();
  });

  it('fails closed when the activation limiter rejects', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.rateLimitReject = new Error('network unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await callVerify({
      headers: { authorization: 'Bearer tok' },
      body: { session_id: 'cs_live_valid' },
    });

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody.error).toMatch(/still processing/i);
    expect(mockState.stripeCalls.sessionRetrieve).toBeUndefined();
  });

  it('rejects a completed checkout belonging to another account', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.retrievedSession = {
      id: 'cs_live_other',
      client_reference_id: 'user-2',
      metadata: {},
      status: 'complete',
      payment_status: 'paid',
    };
    const res = await callVerify({
      headers: { authorization: 'Bearer tok' },
      body: { session_id: 'cs_live_other' },
    });
    expect(res.statusCode).toBe(403);
    expect(mockState.stripeCalls.reconciliation).toBeUndefined();
  });

  it('waits rather than granting access for an incomplete payment', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.retrievedSession = {
      id: 'cs_live_open',
      client_reference_id: 'user-1',
      metadata: {},
      status: 'open',
      payment_status: 'unpaid',
    };
    const res = await callVerify({
      headers: { authorization: 'Bearer tok' },
      body: { session_id: 'cs_live_open' },
    });
    expect(res.statusCode).toBe(409);
    expect(mockState.stripeCalls.reconciliation).toBeUndefined();
  });

  it('reuses the webhook activation path for a paid owned checkout', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.retrievedSession = {
      id: 'cs_live_paid',
      client_reference_id: 'user-1',
      metadata: { user_id: 'user-1' },
      status: 'complete',
      payment_status: 'paid',
    };
    const res = await callVerify({
      headers: { authorization: 'Bearer tok' },
      body: { session_id: 'cs_live_paid' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.active).toBe(true);
    expect(mockState.stripeCalls.sessionRetrieve).toEqual({
      id: 'cs_live_paid',
      args: { expand: ['subscription'] },
    });
    expect(mockState.stripeCalls.reconciliation.event.id).toBe('verify:cs_live_paid');
  });

  it('reports recovered_from and resolves ownership through the original session', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.sessionsById = {
      cs_live_recovered: {
        id: 'cs_live_recovered', customer: 'cus_1', recovered_from: 'cs_live_expired',
        metadata: { sku: 'exam_pass' }, status: 'complete', payment_status: 'paid', amount_total: 599, currency: 'usd',
      },
      cs_live_expired: { id: 'cs_live_expired', customer: 'cus_1', client_reference_id: 'user-1' },
    };
    const res = await callVerify({
      headers: { authorization: 'Bearer tok' },
      body: { session_id: 'cs_live_recovered' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toMatchObject({ active: true, recovered_from: 'cs_live_expired', sku: 'exam_pass' });
  });

  it('does not let a recovered session borrow another customer\'s ownership', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.sessionsById = {
      cs_live_recovered: {
        id: 'cs_live_recovered', customer: 'cus_attacker', recovered_from: 'cs_live_expired',
        metadata: {}, status: 'complete', payment_status: 'paid',
      },
      cs_live_expired: { id: 'cs_live_expired', customer: 'cus_1', client_reference_id: 'user-1' },
    };
    const res = await callVerify({
      headers: { authorization: 'Bearer tok' },
      body: { session_id: 'cs_live_recovered' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('does not claim activation when the shared handler ignores the checkout', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.retrievedSession = {
      id: 'cs_live_unsupported',
      client_reference_id: 'user-1',
      metadata: { user_id: 'user-1' },
      status: 'complete',
      payment_status: 'paid',
    };
    mockState.reconciliationOutcome = 'ignored: unsupported checkout';

    const res = await callVerify({
      headers: { authorization: 'Bearer tok' },
      body: { session_id: 'cs_live_unsupported' },
    });

    expect(res.statusCode).toBe(409);
    expect(res.jsonBody).toMatchObject({ active: false });
  });

  it('does not claim activation unless entitlement readback is Premium', async () => {
    mockState.authUser = { id: 'user-1' };
    mockState.retrievedSession = {
      id: 'cs_live_inactive',
      client_reference_id: 'user-1',
      metadata: { user_id: 'user-1' },
      status: 'complete',
      payment_status: 'paid',
    };
    mockState.reconciliationOutcome = 'activated user user-1 (inactive)';
    mockState.userRow = {
      plan: 'free',
      plan_status: 'inactive',
      plan_renews_at: null,
      plan_expires_at: null,
      billing_pause_until: null,
    };

    const res = await callVerify({
      headers: { authorization: 'Bearer tok' },
      body: { session_id: 'cs_live_inactive' },
    });

    expect(res.statusCode).toBe(409);
    expect(res.jsonBody).toMatchObject({ active: false });
  });

  it.each(['resolved error', 'rejection'])(
    'returns retryable processing state when entitlement readback has a %s',
    async (failureMode) => {
      mockState.authUser = { id: 'user-1' };
      mockState.retrievedSession = {
        id: 'cs_live_readback_error',
        client_reference_id: 'user-1',
        metadata: { user_id: 'user-1' },
        status: 'complete',
        payment_status: 'paid',
      };
      if (failureMode === 'resolved error') {
        mockState.userError = new Error('database unavailable');
      } else {
        mockState.userReject = new Error('network unavailable');
      }
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const res = await callVerify({
        headers: { authorization: 'Bearer tok' },
        body: { session_id: 'cs_live_readback_error' },
      });

      expect(res.statusCode).toBe(503);
      expect(res.jsonBody.error).toMatch(/still processing/i);
    }
  );
});

// ---------------------------------------------------------------------------
// In-place subscription upgrades
// ---------------------------------------------------------------------------
describe('POST /api/billing/change-plan', () => {
  beforeEach(() => {
    mockState.authUser = { id: 'user-1' };
    mockState.authError = null;
    mockState.authReject = null;
    mockState.userError = null;
    mockState.userReject = null;
    mockState.userUpdateError = null;
    mockState.userUpdateReject = null;
    mockState.rateLimit = true;
    mockState.rateLimitError = null;
    mockState.rateLimitReject = null;
    mockState.rpcCalls = [];
    mockState.stripeCalls = {};
    mockState.subscriptionUpdateError = null;
    mockState.previewInvoice = {
      id: 'upcoming_in_upgrade',
      amount_due: 3200,
      currency: 'usd',
    };
    mockState.priceOverride = null;
    mockState.priceList = null;
    mockState.userRow = {
      id: 'user-1',
      plan: 'premium',
      plan_status: 'active',
      stripe_customer_id: 'cus_existing',
      stripe_subscription_id: 'sub_existing',
    };
    mockState.retrievedSubscription = {
      id: 'sub_existing',
      customer: 'cus_existing',
      status: 'active',
      created: 1760000000,
      metadata: { user_id: 'user-1', ppp: '0' },
      pending_update: null,
      items: {
        data: [
          {
            id: 'si_current',
            current_period_end: 1800000000,
            price: { id: 'price_current', lookup_key: 'premium_monthly' },
          },
        ],
      },
    };
    mockState.updatedSubscription = {
      ...mockState.retrievedSubscription,
      metadata: { user_id: 'user-1', sku: 'annual', ppp: '0' },
      latest_invoice: { id: 'in_upgrade', hosted_invoice_url: null },
      items: {
        data: [
          {
            id: 'si_current',
            current_period_end: 1800000000,
            price: { id: 'price_mock_1', lookup_key: 'premium_annual' },
          },
        ],
      },
    };
    vi.restoreAllMocks();
  });

  async function callChangePlan(body = {}) {
    const { default: handler } = await import('../pages/api/billing/change-plan');
    const res = makeRes();
    const prorationDate = Math.floor(Date.now() / 1000);
    const quoteToken = createHmac('sha256', process.env.STRIPE_SECRET_KEY)
      .update(JSON.stringify({
        userId: 'user-1',
        subscriptionId: 'sub_existing',
        currentPriceId: 'price_current',
        targetPriceId: 'price_mock_1',
        targetSku: 'annual',
        amountDue: 3200,
        currency: 'usd',
        targetAmount: 4999,
        interval: 'year',
        intervalCount: 1,
        prorationDate,
      }))
      .digest('hex');
    const requestBody = {
      sku: 'annual',
      action: 'confirm',
      acceptedAmount: 3200,
      acceptedCurrency: 'usd',
      prorationDate,
      quoteToken,
      ...body,
    };
    await handler(
      makeReq({ headers: { authorization: 'Bearer tok' }, body: requestBody }),
      res
    );
    return res;
  }

  it('previews the exact prorated charge without changing the subscription', async () => {
    const res = await callChangePlan({ action: 'preview' });

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toMatchObject({
      changed: false,
      requiresConfirmation: true,
      quote: {
        targetSku: 'annual',
        amountDue: 3200,
        currency: 'usd',
        targetAmount: 4999,
        interval: 'year',
        intervalCount: 1,
        token: expect.any(String),
      },
    });
    expect(mockState.stripeCalls.invoicePreview).toMatchObject({
      subscription: 'sub_existing',
      subscription_details: {
        items: [{ id: 'si_current', price: 'price_mock_1', quantity: 1 }],
        proration_behavior: 'always_invoice',
      },
    });
    expect(mockState.stripeCalls.subscriptionUpdate).toBeUndefined();
  });

  it('replaces the current item and immediately invoices only the proration', async () => {
    const res = await callChangePlan();
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.changed).toBe(true);
    expect(mockState.stripeCalls.pricesList).toEqual({
      lookup_keys: ['premium_annual'],
      active: true,
      limit: 2,
    });
    expect(mockState.stripeCalls.subscriptionUpdate).toMatchObject({
      id: 'sub_existing',
      args: {
        items: [{ id: 'si_current', price: 'price_mock_1', quantity: 1 }],
        proration_behavior: 'always_invoice',
        proration_date: expect.any(Number),
        payment_behavior: 'pending_if_incomplete',
        cancel_at_period_end: false,
      },
    });
  });

  it.each([
    ['amount', { acceptedAmount: 3199 }],
    ['currency', { acceptedCurrency: 'cad' }],
  ])('requires a fresh quote when the signed %s is altered', async (_field, override) => {
    const res = await callChangePlan(override);

    expect(res.statusCode).toBe(409);
    expect(res.jsonBody).toMatchObject({
      changed: false,
      requiresConfirmation: true,
      quote: { amountDue: 3200, currency: 'usd' },
    });
    expect(res.jsonBody.error).toMatch(/changed or expired/i);
    expect(mockState.stripeCalls.subscriptionUpdate).toBeUndefined();
  });

  it('defaults a legacy SKU-only request to preview instead of charging', async () => {
    const res = await callChangePlan({ action: undefined });

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.requiresConfirmation).toBe(true);
    expect(mockState.stripeCalls.subscriptionUpdate).toBeUndefined();
  });

  it('refreshes an expired quote instead of charging it', async () => {
    const res = await callChangePlan({
      prorationDate: Math.floor(Date.now() / 1000) - 301,
    });

    expect(res.statusCode).toBe(409);
    expect(res.jsonBody.quote.prorationDate).toBeGreaterThan(
      Math.floor(Date.now() / 1000) - 5
    );
    expect(mockState.stripeCalls.subscriptionUpdate).toBeUndefined();
  });

  it('fails closed when Stripe returns an invalid invoice preview', async () => {
    mockState.previewInvoice = { amount_due: -1, currency: 'usd' };
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await callChangePlan();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody.error).toMatch(/confirm the upgrade price/i);
    expect(mockState.stripeCalls.subscriptionUpdate).toBeUndefined();
  });

  it('lets a legacy 6-month subscriber upgrade to annual', async () => {
    mockState.retrievedSubscription.items.data[0].price = {
      id: 'price_legacy_6month',
      lookup_key: 'premium_6month',
    };
    const res = await callChangePlan({ action: 'preview' });
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.quote.targetSku).toBe('annual');
  });

  it('resolves the current plan from subscription metadata when the old price lost its lookup key', async () => {
    // transfer_lookup_key moves the key to the replacement price; superseded
    // prices keep billing but have lookup_key null.
    mockState.retrievedSubscription.items.data[0].price = {
      id: 'price_superseded_monthly',
      lookup_key: null,
    };
    mockState.retrievedSubscription.metadata = {
      user_id: 'user-1',
      sku: 'monthly',
      ppp: '0',
    };
    const res = await callChangePlan({ action: 'preview' });
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.quote.targetSku).toBe('annual');
  });

  it('preserves PPP pricing from Stripe instead of trusting request geography', async () => {
    mockState.retrievedSubscription.metadata.ppp = '1';
    mockState.retrievedSubscription.items.data[0].price.lookup_key =
      'premium_monthly_ppp';
    await callChangePlan({ sku: 'annual' });
    expect(mockState.stripeCalls.pricesList.lookup_keys).toEqual([
      'premium_annual_ppp',
    ]);
  });

  it('refuses a retired plan as an upgrade target', async () => {
    // The 3-month plan still bills its existing subscribers, but it is no
    // longer sold, so nobody may move onto it.
    for (const sku of ['3month', '6month', 'exam_pass']) {
      mockState.stripeCalls = {};
      const res = await callChangePlan({ sku });
      expect(res.statusCode).toBe(400);
      expect(mockState.stripeCalls.subscriptionUpdate).toBeUndefined();
    }
  });

  it.each([
    ['amount', { unit_amount: 9999 }],
    ['currency', { currency: 'cad' }],
    ['active state', { active: false }],
    ['billing scheme', { billing_scheme: 'tiered' }],
    ['price type', { type: 'one_time', recurring: null }],
    ['billing interval', { recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' } }],
    ['interval count', { recurring: { interval: 'year', interval_count: 2, usage_type: 'licensed' } }],
    ['usage type', { recurring: { interval: 'year', interval_count: 1, usage_type: 'metered' } }],
  ])('stops before changing the subscription when target %s drifts', async (_field, override) => {
    mockState.priceOverride = override;
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await callChangePlan();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody.error).toMatch(/pricing is being updated/i);
    expect(mockState.stripeCalls.subscriptionUpdate).toBeUndefined();
  });

  it('stops before changing the subscription when a lookup key is ambiguous', async () => {
    const annual = priceForLookupKey('premium_annual');
    mockState.priceList = [annual, { ...annual, id: 'price_duplicate' }];
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await callChangePlan();

    expect(res.statusCode).toBe(500);
    expect(res.jsonBody.error).toMatch(/pricing unavailable/i);
    expect(mockState.stripeCalls.subscriptionUpdate).toBeUndefined();
  });

  it('leaves the old plan active while an upgrade invoice needs payment', async () => {
    mockState.updatedSubscription = {
      ...mockState.updatedSubscription,
      pending_update: { expires_at: 1800000000 },
      latest_invoice: {
        id: 'in_pending',
        hosted_invoice_url: 'https://invoice.stripe.com/i/pending',
      },
    };
    const res = await callChangePlan();
    expect(res.statusCode).toBe(202);
    expect(res.jsonBody).toMatchObject({
      changed: false,
      requiresPayment: true,
      url: 'https://invoice.stripe.com/i/pending',
      currentSku: 'monthly',
      targetSku: 'annual',
    });
  });

  it('rejects same-term and downgrade requests before modifying Stripe', async () => {
    // Monthly is not a valid target at all now that annual is the only upgrade.
    const same = await callChangePlan({ sku: 'monthly' });
    expect(same.statusCode).toBe(400);
    expect(mockState.stripeCalls.subscriptionUpdate).toBeUndefined();

    // Already annual: asking for annual again is not an upgrade.
    mockState.retrievedSubscription.items.data[0].price.lookup_key =
      'premium_annual';
    mockState.stripeCalls = {};
    const alreadyAnnual = await callChangePlan({ sku: 'annual' });
    expect(alreadyAnnual.statusCode).toBe(409);
    expect(alreadyAnnual.jsonBody.code).toBe('not_an_upgrade');
    expect(mockState.stripeCalls.subscriptionUpdate).toBeUndefined();
  });

  it('reports a declined proration without claiming the plan changed', async () => {
    mockState.subscriptionUpdateError = Object.assign(new Error('declined'), {
      type: 'StripeCardError',
      code: 'card_declined',
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callChangePlan();
    expect(res.statusCode).toBe(402);
    expect(res.jsonBody.error).toMatch(/unchanged/i);
  });

  it('does not misreport a confirmed Stripe upgrade when local sync is delayed', async () => {
    mockState.userUpdateError = new Error('database unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callChangePlan();
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toMatchObject({
      changed: true,
      syncPending: true,
      currentSku: 'monthly',
      targetSku: 'annual',
    });
    expect(res.jsonBody.message).toMatch(/may take a moment/i);
  });
});
