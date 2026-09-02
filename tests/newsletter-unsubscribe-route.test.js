import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { unsubscribeToken } from '../lib/lifecycleEmail';
import { MARKETING_PREF, STUDY_PLAN_PREF } from '../lib/emailPrefs';
import { prefUnsubscribeToken, prefUnsubscribeUrl } from '../lib/emailTokens';

const originalEnv = {
  EMAIL_UNSUBSCRIBE_SECRET: process.env.EMAIL_UNSUBSCRIBE_SECRET,
  SUPABASE_URL: process.env.SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

const state = {
  clientCreates: 0,
  updates: [],
  updateError: null,
  updateReject: null,
  userRow: null,
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => {
    state.clientCreates += 1;
    return {
      from: (table) => ({
        update: (fields) => ({
          eq: async (field, value) => {
            state.updates.push({ table, fields, field, value });
            if (state.updateReject) throw state.updateReject;
            return { error: state.updateError };
          },
        }),
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: state.userRow, error: null }),
          }),
        }),
      }),
    };
  },
}));

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function makeReq(options = {}) {
  const email = options.email ?? 'learner@example.com';
  const query = { email };
  if (options.pref !== undefined) query.pref = options.pref;
  query.token =
    options.token ??
    (options.pref ? prefUnsubscribeToken(email, options.pref) : unsubscribeToken(email));
  return { method: options.method ?? 'GET', query };
}

function makeRes() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    ended: false,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

async function callRoute(options) {
  const { default: handler } = await import('../pages/api/newsletter/unsubscribe');
  const res = makeRes();
  await handler(makeReq(options), res);
  return res;
}

const updatesTo = (table) => state.updates.filter((entry) => entry.table === table);

describe('/api/newsletter/unsubscribe', () => {
  beforeEach(() => {
    process.env.EMAIL_UNSUBSCRIBE_SECRET = 'unsubscribe-test-secret';
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-dummy';
    state.clientCreates = 0;
    state.updates = [];
    state.updateError = null;
    state.updateReject = null;
    state.userRow = {
      id: 'user-1',
      prefs: { study_plan_emails: true, marketing_emails: true, goal: 'study' },
    };
    vi.restoreAllMocks();
  });

  afterAll(() => {
    restoreEnv('EMAIL_UNSUBSCRIBE_SECRET', originalEnv.EMAIL_UNSUBSCRIBE_SECRET);
    restoreEnv('SUPABASE_URL', originalEnv.SUPABASE_URL);
    restoreEnv('NEXT_PUBLIC_SUPABASE_URL', originalEnv.NEXT_PUBLIC_SUPABASE_URL);
    restoreEnv('SUPABASE_SERVICE_ROLE_KEY', originalEnv.SUPABASE_SERVICE_ROLE_KEY);
  });

  it('allows GET and the RFC 8058 one-click POST, and nothing else', async () => {
    const res = await callRoute({ method: 'PUT' });

    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET, POST');
    expect(res.ended).toBe(true);
    expect(state.clientCreates).toBe(0);
  });

  it('rejects an invalid signed link before creating an admin client', async () => {
    const res = await callRoute({ token: '0'.repeat(64) });

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatch(/invalid or expired/i);
    expect(state.clientCreates).toBe(0);
    expect(state.updates).toEqual([]);
  });

  it('returns a controlled service error when admin configuration is missing', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.body).toMatch(/temporarily unavailable/i);
    expect(state.clientCreates).toBe(0);
  });

  it('marks the normalized signed address unsubscribed on a legacy link', async () => {
    const res = await callRoute({ email: ' Learner@Example.com ' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatch(/have been unsubscribed/i);
    const newsletter = updatesTo('newsletter_subscribers');
    expect(newsletter).toHaveLength(1);
    expect(newsletter[0]).toMatchObject({ field: 'email', value: 'learner@example.com' });
    expect(Number.isNaN(Date.parse(newsletter[0].fields.unsubscribed_at))).toBe(false);
    // A legacy link is the marketing promise, so it also flips the pref.
    expect(updatesTo('users')[0].fields.prefs).toMatchObject({ [MARKETING_PREF]: false });
  });

  it('flips only the study-plan pref for a study-plan link, keeping other prefs', async () => {
    const res = await callRoute({ pref: STUDY_PLAN_PREF });

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatch(/study-plan/i);
    expect(updatesTo('newsletter_subscribers')).toHaveLength(0);
    const { prefs } = updatesTo('users')[0].fields;
    expect(prefs[STUDY_PLAN_PREF]).toBe(false);
    expect(prefs[MARKETING_PREF]).toBe(true);
    expect(prefs.goal).toBe('study');
    expect(Number.isNaN(Date.parse(prefs[`${STUDY_PLAN_PREF}_at`]))).toBe(false);
    expect(prefs.email_consent.source).toBe('unsubscribe_link');
  });

  it('also drops the newsletter row when the marketing pref is turned off', async () => {
    const res = await callRoute({ method: 'POST', pref: MARKETING_PREF });

    expect(res.statusCode).toBe(200);
    expect(updatesTo('users')[0].fields.prefs[MARKETING_PREF]).toBe(false);
    expect(updatesTo('newsletter_subscribers')).toHaveLength(1);
  });

  it('refuses a token minted for the other pref, and an unknown pref name', async () => {
    const crossed = await callRoute({
      pref: MARKETING_PREF,
      token: prefUnsubscribeToken('learner@example.com', STUDY_PLAN_PREF),
    });
    expect(crossed.statusCode).toBe(400);

    const unknown = await callRoute({ pref: 'everything', token: '0'.repeat(64) });
    expect(unknown.statusCode).toBe(400);
    expect(state.updates).toEqual([]);
  });

  it('round-trips the URL built for an email footer', async () => {
    const url = prefUnsubscribeUrl('Learner@Example.com', STUDY_PLAN_PREF);
    const parsed = new URL(url);

    expect(parsed.pathname).toBe('/api/newsletter/unsubscribe');
    const res = await callRoute({
      email: parsed.searchParams.get('email'),
      pref: parsed.searchParams.get('pref'),
      token: parsed.searchParams.get('token'),
    });

    expect(res.statusCode).toBe(200);
    expect(updatesTo('users')[0].fields.prefs[STUDY_PLAN_PREF]).toBe(false);
  });

  it('succeeds for a newsletter-only recipient with no account row', async () => {
    state.userRow = null;

    const res = await callRoute({ pref: MARKETING_PREF });

    expect(res.statusCode).toBe(200);
    expect(updatesTo('users')).toHaveLength(0);
    expect(updatesTo('newsletter_subscribers')).toHaveLength(1);
  });

  it('returns a controlled service error for a resolved update failure', async () => {
    state.updateError = new Error('database unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.body).toMatch(/temporarily unavailable/i);
    expect(state.updates).toHaveLength(1);
  });

  it('returns a controlled service error when the update rejects', async () => {
    state.updateReject = new Error('network unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.body).toMatch(/temporarily unavailable/i);
    expect(state.updates).toHaveLength(1);
  });
});
