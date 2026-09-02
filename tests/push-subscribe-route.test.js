// /api/push/subscribe: authenticated, origin-checked, and strict about what
// it will store.
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const originalEnv = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  NODE_ENV: process.env.NODE_ENV,
};

const state = { user: { id: 'user-1' }, authError: null, upserts: [], updates: [] };

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({
        data: state.authError ? null : { user: state.user },
        error: state.authError,
      }),
    },
    from: () => ({
      upsert: (row, options) => ({
        select: () => ({
          maybeSingle: async () => {
            state.upserts.push({ row, options });
            return { data: { endpoint: row.endpoint, enabled: true }, error: null };
          },
        }),
      }),
      update: (fields) => {
        const filters = [];
        const query = {
          eq: (field, value) => {
            filters.push([field, value]);
            if (filters.length === 2) {
              state.updates.push({ fields, filters });
              return Promise.resolve({ error: null });
            }
            return query;
          },
        };
        return query;
      },
    }),
  }),
}));

function makeRes() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
  };
}

async function call(req) {
  const { default: handler } = await import('../pages/api/push/subscribe');
  const res = makeRes();
  await handler(
    {
      method: 'POST',
      headers: { origin: 'https://www.ielts-bank.com', authorization: 'Bearer token' },
      ...req,
    },
    res
  );
  return res;
}

const validSubscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
  keys: { p256dh: 'key', auth: 'secret' },
};

describe('/api/push/subscribe', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-dummy';
    state.user = { id: 'user-1' };
    state.authError = null;
    state.upserts = [];
    state.updates = [];
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('rejects other methods and disallowed origins', async () => {
    const method = await call({ method: 'GET' });
    expect(method.statusCode).toBe(405);
    expect(method.headers.Allow).toBe('POST, DELETE');

    const origin = await call({ headers: { origin: 'https://evil.example' } });
    expect(origin.statusCode).toBe(403);
  });

  it('requires a valid Supabase bearer token', async () => {
    const missing = await call({ headers: { origin: 'https://www.ielts-bank.com' } });
    expect(missing.statusCode).toBe(401);

    state.authError = new Error('bad token');
    const invalid = await call({ body: { subscription: validSubscription } });
    expect(invalid.statusCode).toBe(401);
    expect(state.upserts).toHaveLength(0);
  });

  it('stores the endpoint, keys, zone, and hour for the signed-in user', async () => {
    const res = await call({
      body: {
        subscription: validSubscription,
        reminder_hour_local: 7,
        time_zone: 'Asia/Karachi',
        tz_offset_minutes: 300,
      },
    });

    expect(res.statusCode).toBe(200);
    const { row, options } = state.upserts[0];
    expect(options).toMatchObject({ onConflict: 'endpoint' });
    expect(row).toMatchObject({
      user_id: 'user-1',
      endpoint: validSubscription.endpoint,
      keys: { p256dh: 'key', auth: 'secret' },
      time_zone: 'Asia/Karachi',
      tz_offset_minutes: 300,
      reminder_hour_local: 7,
      enabled: true,
      failures: 0,
    });
  });

  it('defaults a bad hour to 7pm and drops an unusable zone or offset', async () => {
    await call({
      body: {
        subscription: validSubscription,
        reminder_hour_local: 42,
        time_zone: 'Nowhere/Fake',
        tz_offset_minutes: 99999,
      },
    });

    expect(state.upserts[0].row).toMatchObject({
      reminder_hour_local: 19,
      time_zone: null,
      tz_offset_minutes: null,
    });
  });

  it('refuses a malformed or non-https subscription', async () => {
    const noKeys = await call({ body: { subscription: { endpoint: validSubscription.endpoint } } });
    expect(noKeys.statusCode).toBe(400);

    const insecure = await call({
      body: { subscription: { ...validSubscription, endpoint: 'http://push.example.com/abc' } },
    });
    expect(insecure.statusCode).toBe(400);
    expect(state.upserts).toHaveLength(0);
  });

  it('disables only the caller’s own endpoint on DELETE', async () => {
    const res = await call({
      method: 'DELETE',
      body: { endpoint: validSubscription.endpoint },
    });

    expect(res.statusCode).toBe(200);
    expect(state.updates[0].fields).toMatchObject({
      enabled: false,
      disabled_reason: 'user-disabled',
    });
    expect(state.updates[0].filters).toEqual([
      ['endpoint', validSubscription.endpoint],
      ['user_id', 'user-1'],
    ]);
  });
});
