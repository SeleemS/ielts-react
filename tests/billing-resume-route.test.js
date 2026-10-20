// tests/billing-resume-route.test.js
// POST /api/billing/resume — the recovery email's "Finish my checkout" link.
// It must never hand out Stripe's raw recovery URL: it requires the same
// signed-in account, re-runs the shared checkout guards, and opens a NEW
// session through the normal checkout handler. No live Stripe / DB calls.
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_for_vitest';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-dummy';

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345';
const RECOVERY_URL = 'https://buy.stripe.com/r/live_asAb1724';
const DAY = 86400000;
const iso = (offsetDays) => new Date(Date.now() + offsetDays * DAY).toISOString();

const state = {
  authUser: null,
  userRow: null,
  resumeRow: null,
  resumeFilters: [],
  activity: [],
  stripeCalls: {},
};

function freeUser(overrides = {}) {
  return {
    id: 'user-1', email: 'learner@example.com', is_anonymous: false, plan: 'free', plan_status: 'inactive',
    plan_renews_at: null, plan_expires_at: null, billing_pause_until: null, canceled_at: null,
    stripe_customer_id: 'cus_1', stripe_subscription_id: null, ...overrides,
  };
}

function resumeRow({ payload = {}, ...overrides } = {}) {
  return {
    id: 'email-1',
    user_id: 'user-1',
    created_at: iso(-1),
    payload: {
      upgrade: 'writing', stage: 'saved', sku: 'exam_pass', session_id: 'cs_live_expired', coupon: null,
      resume_token: TOKEN, resume_expires_at: iso(29), recovery_url: RECOVERY_URL,
      recovery_expires_at: iso(29), ...payload,
    },
    ...overrides,
  };
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => (state.authUser
        ? { data: { user: state.authUser }, error: null }
        : { data: null, error: { message: 'invalid token' } }),
    },
    from: (table) => {
      const query = {
        select: () => query,
        eq: (column, value) => {
          if (table === 'lifecycle_emails') state.resumeFilters.push({ column, value });
          return query;
        },
        limit: () => query,
        maybeSingle: async () => {
          if (table === 'lifecycle_emails') {
            const row = state.resumeRow;
            const token = state.resumeFilters.find((f) => f.column === 'payload->>resume_token')?.value;
            return { data: row && row.payload.resume_token === token ? row : null, error: null };
          }
          if (table === 'users') {
            return { data: typeof state.userRow === 'function' ? state.userRow() : state.userRow, error: null };
          }
          return { data: null, error: null };
        },
        update: () => ({ eq: async () => ({ error: null }) }),
        insert: async (row) => {
          if (table === 'activity_events') state.activity.push(row);
          return { error: null };
        },
      };
      return query;
    },
    rpc: async () => ({ data: true, error: null }),
  }),
}));

vi.mock('../lib/billing', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getStripe: () => ({
      prices: {
        list: async (args) => {
          state.stripeCalls.pricesList = args;
          const oneTime = args.lookup_keys[0].startsWith('premium_exam_pass');
          return { data: [{
            id: 'price_1', lookup_key: args.lookup_keys[0], active: true, currency: 'usd',
            ...(oneTime
              ? { unit_amount: 1999, type: 'one_time', recurring: null }
              : { unit_amount: 899, type: 'recurring', recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' } }),
          }] };
        },
      },
      coupons: { retrieve: async () => { throw new Error('no promo in these tests'); } },
      customers: { create: async () => ({ id: 'cus_new' }) },
      checkout: {
        sessions: {
          create: async (args) => {
            state.stripeCalls.sessionCreate = args;
            return { id: 'cs_live_fresh', url: 'https://checkout.stripe.com/c/pay/cs_live_fresh' };
          },
        },
      },
    }),
  };
});

function makeReq({ body = { c: TOKEN }, headers = { authorization: 'Bearer tok' } } = {}) {
  return { method: 'POST', headers, body, socket: { remoteAddress: '127.0.0.1' } };
}

function makeRes() {
  return {
    statusCode: null,
    jsonBody: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.jsonBody = body; return this; },
    setHeader(name, value) { this.headers[name] = value; },
  };
}

async function callResume(options) {
  const { default: handler } = await import('../pages/api/billing/resume');
  const res = makeRes();
  await handler(makeReq(options), res);
  return res;
}

const resumeEvents = () => state.activity.filter((row) => row.event === 'checkout_resume');

beforeEach(() => {
  state.authUser = { id: 'user-1' };
  state.userRow = freeUser();
  state.resumeRow = resumeRow();
  state.resumeFilters = [];
  state.activity = [];
  state.stripeCalls = {};
  vi.restoreAllMocks();
});

describe('POST /api/billing/resume', () => {
  it('requires sign-in before touching the checkout', async () => {
    state.authUser = null;
    const res = await callResume({ headers: {} });
    expect(res.statusCode).toBe(401);
    expect(res.jsonBody.outcome).toBe('sign_in_required');
    expect(state.stripeCalls).toEqual({});
  });

  it('rejects a malformed token without a lookup', async () => {
    const res = await callResume({ body: { c: RECOVERY_URL } });
    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toEqual({ outcome: 'not_found', redirect: '/pricing?resume=unavailable' });
    expect(state.resumeFilters).toEqual([]);
  });

  it('sends an unknown token to pricing', async () => {
    const res = await callResume({ body: { c: 'ZZZZEfGhIjKlMnOpQrStUvWxYz012345' } });
    expect(res.statusCode).toBe(409);
    expect(res.jsonBody).toMatchObject({ outcome: 'not_found', redirect: '/pricing?resume=unavailable' });
    expect(state.stripeCalls).toEqual({});
  });

  it('refuses a link that belongs to a different account', async () => {
    state.authUser = { id: 'user-2' };
    state.userRow = freeUser({ id: 'user-2' });
    const res = await callResume();
    expect(res.statusCode).toBe(403);
    expect(res.jsonBody.outcome).toBe('wrong_user');
    expect(res.jsonBody.error).toMatch(/different IELTS Bank account/);
    expect(JSON.stringify(res.jsonBody)).not.toContain('learner@example.com');
    expect(state.stripeCalls).toEqual({});
    expect(resumeEvents()).toHaveLength(1);
    expect(resumeEvents()[0]).toMatchObject({ user_id: 'user-2', props: expect.objectContaining({ outcome: 'wrong_user' }) });
    expect(resumeEvents()[0].props.original_session_id).toBeUndefined();
  });

  it('sends a learner who already has Pro to the dashboard instead of charging again', async () => {
    state.resumeRow = resumeRow({ payload: { sku: 'monthly' } });
    state.userRow = freeUser({
      plan: 'premium', plan_status: 'active', plan_renews_at: iso(20), stripe_subscription_id: 'sub_1',
    });
    const res = await callResume();
    expect(res.statusCode).toBe(409);
    expect(res.jsonBody).toMatchObject({
      outcome: 'already_premium',
      redirect: '/dashboard?resume=already_premium&upgrade=writing&stage=saved',
    });
    expect(state.stripeCalls).toEqual({});
    expect(resumeEvents()[0].props).toMatchObject({ outcome: 'already_premium', sku: 'monthly', original_session_id: 'cs_live_expired' });
  });

  it('never opens a second Exam Pass over an active one', async () => {
    state.userRow = freeUser({ plan: 'premium', plan_status: 'active', plan_expires_at: iso(10) });
    const res = await callResume();
    expect(res.statusCode).toBe(409);
    expect(res.jsonBody.outcome).toBe('already_exam_pass');
    expect(res.jsonBody.redirect).toMatch(/^\/dashboard\?resume=already_exam_pass/);
    expect(state.stripeCalls).toEqual({});
  });

  it('sends a lapsed link to pricing', async () => {
    state.resumeRow = resumeRow({ payload: { resume_expires_at: iso(-1) } });
    const res = await callResume();
    expect(res.jsonBody).toMatchObject({ outcome: 'expired' });
    expect(res.jsonBody.redirect).toMatch(/^\/pricing\?resume=expired/);
    expect(state.stripeCalls).toEqual({});
  });

  it('does not reopen a checkout whose promo coupon has ended', async () => {
    state.resumeRow = resumeRow({ payload: { coupon: 'IELTSBANK_SEPT30' } });
    const res = await callResume();
    expect(res.jsonBody).toMatchObject({ outcome: 'offer_ended' });
    expect(res.jsonBody.redirect).toMatch(/^\/pricing\?resume=offer_ended/);
    expect(state.stripeCalls).toEqual({});
  });

  it('sends a retired plan to pricing', async () => {
    state.resumeRow = resumeRow({ payload: { sku: '6month' } });
    const res = await callResume();
    expect(res.jsonBody).toMatchObject({ outcome: 'plan_unavailable', redirect: expect.stringMatching(/resume=plan_changed/) });
  });

  it('opens a brand-new session for the same plan through the normal checkout path', async () => {
    const res = await callResume({ body: { c: TOKEN, ga_cid: '123.456' } });
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ outcome: 'new_session', url: 'https://checkout.stripe.com/c/pay/cs_live_fresh' });
    // Fresh session, priced by today's catalogue — never Stripe's recovery URL.
    const created = state.stripeCalls.sessionCreate;
    expect(created.mode).toBe('payment');
    expect(state.stripeCalls.pricesList.lookup_keys).toEqual(['premium_exam_pass']);
    expect(created.metadata).toMatchObject({ user_id: 'user-1', sku: 'exam_pass', resumed_from: 'cs_live_expired' });
    expect(created.success_url).toContain('upgrade=writing');
    expect(JSON.stringify(created)).not.toContain('buy.stripe.com');
    expect(resumeEvents().map((row) => row.props.outcome)).toEqual(['new_session']);
    expect(JSON.stringify(state.activity)).not.toContain(TOKEN);
  });

  it('asks an anonymous session to sign in with a real account', async () => {
    state.userRow = freeUser({ is_anonymous: true });
    const res = await callResume();
    expect(res.statusCode).toBe(403);
    expect(res.jsonBody.outcome).toBe('anonymous_user');
    expect(state.stripeCalls).toEqual({});
  });

  it('keeps checkout\'s own guard as the last word when a purchase lands mid-resume', async () => {
    // resolveResume sees a free account; by the time the checkout handler
    // re-reads the row, a purchase in another tab has made it Pro.
    let reads = 0;
    state.resumeRow = resumeRow({ payload: { sku: 'monthly' } });
    state.userRow = () => (++reads === 1
      ? freeUser()
      : freeUser({ plan: 'premium', plan_status: 'active', plan_renews_at: iso(30), stripe_subscription_id: 'sub_2' }));
    const res = await callResume();
    expect(res.statusCode).toBe(409);
    expect(res.jsonBody).toMatchObject({
      outcome: 'checkout_refused', code: 'already_premium', redirect: '/dashboard?resume=already_premium',
    });
    expect(state.stripeCalls.sessionCreate).toBeUndefined();
    expect(resumeEvents()[0].props).toMatchObject({ outcome: 'checkout_refused', http_status: 409, code: 'already_premium' });
  });
});

describe('POST /api/billing/checkout (resume stamp)', () => {
  it('ignores a client-supplied resumed_from — only the resume route can set it', async () => {
    const { default: checkout } = await import('../pages/api/billing/checkout');
    const res = makeRes();
    await checkout(makeReq({ body: { sku: 'monthly', resumed_from: 'cs_live_forged' } }), res);
    expect(res.statusCode).toBe(200);
    expect(state.stripeCalls.sessionCreate.metadata.resumed_from).toBeUndefined();
  });
});
