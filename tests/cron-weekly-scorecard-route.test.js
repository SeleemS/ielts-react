import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const ENV_KEYS = [
  'CRON_SECRET',
  'SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'RESEND_API_KEY',
  'REPORT_EMAIL',
  'EMAIL_FROM',
];
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

const state = {
  rpcCalls: [],
  rpcResponse: { data: null, error: null },
  rpcThrows: null,
  clientThrows: null,
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => {
    if (state.clientThrows) throw state.clientThrows;
    return {
      async rpc(name, args) {
        state.rpcCalls.push({ name, args });
        if (state.rpcThrows) throw state.rpcThrows;
        return state.rpcResponse;
      },
    };
  },
}));

const SCORECARD = {
  generated_at: '2026-09-07T06:00:00.000Z',
  from: '2026-08-31T06:00:00.000Z',
  to: '2026-09-07T06:00:00.000Z',
  context: { paywall_views: 12, cohort: null },
  rows: [
    { key: 'visitors_per_day', label: 'Real visitors / day', unit: 'number', value: 62, prev: 51, target: 500, invert: false },
    { key: 'mrr_usd', label: 'MRR', unit: 'usd', value: 24.97, prev: 24.97, target: 450, invert: false },
    { key: 'failed_renewal_pct', label: 'Failed renewals', unit: 'percent', value: 0, prev: 0, target: 5, invert: true },
  ],
};

function makeRes() {
  return {
    statusCode: null,
    jsonBody: null,
    headers: {},
    ended: false,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.jsonBody = body;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

async function run({ method = 'GET', auth = 'Bearer cron-secret', query = {} } = {}) {
  const { default: handler } = await import('../pages/api/cron/weekly-scorecard');
  const res = makeRes();
  await handler({ method, headers: auth ? { authorization: auth } : {}, query }, res);
  return res;
}

beforeEach(() => {
  process.env.CRON_SECRET = 'cron-secret';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-dummy';
  process.env.RESEND_API_KEY = 'resend-dummy';
  process.env.REPORT_EMAIL = 'founder@example.com';
  process.env.EMAIL_FROM = 'IELTS Bank <hello@ielts-bank.com>';
  state.rpcCalls = [];
  state.rpcResponse = { data: SCORECARD, error: null };
  state.rpcThrows = null;
  state.clientThrows = null;
  vi.unstubAllGlobals();
});

afterAll(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.unstubAllGlobals();
});

describe('/api/cron/weekly-scorecard guard', () => {
  it('requires the cron bearer secret', async () => {
    const res = await run({ auth: 'Bearer wrong' });
    expect(res.statusCode).toBe(401);
    expect(state.rpcCalls).toEqual([]);
  });

  it('refuses when no secret is configured at all', async () => {
    delete process.env.CRON_SECRET;
    const res = await run({ auth: null });
    expect(res.statusCode).toBe(401);
  });

  it('rejects non-GET', async () => {
    const res = await run({ method: 'POST' });
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET');
  });

  it('503s when Supabase is not configured', async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const res = await run();
    expect(res.statusCode).toBe(503);
  });
});

describe('/api/cron/weekly-scorecard email', () => {
  it('emails the rendered scorecard to the daily-report recipient', async () => {
    const sent = [];
    vi.stubGlobal('fetch', async (url, init) => {
      sent.push({ url, body: JSON.parse(init.body), headers: init.headers });
      return { ok: true, status: 200 };
    });
    const res = await run();
    expect(res.statusCode).toBe(200);
    expect(state.rpcCalls).toEqual([{ name: 'weekly_scorecard', args: undefined }]);
    expect(res.jsonBody.email).toEqual({ sent: true });
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe('https://api.resend.com/emails');
    expect(sent[0].headers.Authorization).toBe('Bearer resend-dummy');
    expect(sent[0].body.to).toEqual(['founder@example.com']);
    expect(sent[0].body.from).toBe('IELTS Bank <hello@ielts-bank.com>');
    expect(sent[0].body.subject).toContain('Monday scorecard');
    expect(sent[0].body.html).toContain('Real visitors / day');
    expect(sent[0].body.html).toContain('$450');
  });

  it('still returns the scorecard when email is not configured', async () => {
    delete process.env.RESEND_API_KEY;
    const res = await run();
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.email).toEqual({ sent: false, reason: 'email-not-configured' });
    expect(res.jsonBody.scorecard.rows).toHaveLength(3);
  });

  it('reports a Resend failure without failing the run', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 429 }));
    const res = await run();
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.email).toEqual({ sent: false, reason: 'resend-429' });
  });

  it('supports a manual dry run with ?send=0', async () => {
    const sent = [];
    vi.stubGlobal('fetch', async (url) => {
      sent.push(url);
      return { ok: true, status: 200 };
    });
    const res = await run({ query: { send: '0' } });
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.email).toEqual({ sent: false, reason: 'send-disabled' });
    expect(sent).toEqual([]);
  });

  it('503s when the RPC fails, and never emails a half-built scorecard', async () => {
    const sent = [];
    vi.stubGlobal('fetch', async (url) => {
      sent.push(url);
      return { ok: true, status: 200 };
    });
    state.rpcResponse = { data: null, error: new Error('statement timeout') };
    const res = await run();
    expect(res.statusCode).toBe(503);
    expect(res.jsonBody).toEqual({ error: 'Scorecard generation failed.' });
    expect(sent).toEqual([]);
  });
});

describe('vercel cron registration', () => {
  it('runs Mondays at 06:00 UTC', async () => {
    const { readFileSync } = await import('node:fs');
    const config = JSON.parse(
      readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')
    );
    const entry = config.crons.find((cron) => cron.path === '/api/cron/weekly-scorecard');
    expect(entry).toBeTruthy();
    expect(entry.schedule).toBe('0 6 * * 1');
  });
});
