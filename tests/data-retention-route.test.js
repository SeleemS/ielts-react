import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-dummy';
process.env.DATA_DASHBOARD_PASSWORD = 'correct-horse-battery';

const state = {
  rpcCalls: [],
  rpcResponse: { data: null, error: null },
  rpcThrows: null,
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: async (name, args) => {
      state.rpcCalls.push({ name, args });
      if (state.rpcThrows) throw state.rpcThrows;
      return state.rpcResponse;
    },
  }),
}));

const { issueToken, DATA_SESSION_COOKIE } = await import('../lib/dataDashAuth');

function makeRes() {
  return {
    statusCode: null,
    jsonBody: null,
    headers: {},
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
  };
}

function cookie() {
  return `${DATA_SESSION_COOKIE}=${encodeURIComponent(issueToken())}`;
}

async function call({ method = 'GET', query = {}, authed = true } = {}) {
  const { default: handler } = await import('../pages/api/data/retention');
  const res = makeRes();
  await handler({ method, headers: authed ? { cookie: cookie() } : {}, query }, res);
  return res;
}

beforeEach(() => {
  state.rpcCalls = [];
  state.rpcResponse = { data: null, error: null };
  state.rpcThrows = null;
  delete process.env.DATA_DASH_FIXTURE_DIR;
});

describe('GET /api/data/retention', () => {
  it('asks for 8 weeks by default', async () => {
    state.rpcResponse = { data: { weeks: [], current: null }, error: null };
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(state.rpcCalls).toEqual([{ name: 'dashboard_retention', args: { p_weeks: 8 } }]);
    expect(res.jsonBody.weeks).toBe(8);
  });

  it('clamps the weeks parameter', async () => {
    state.rpcResponse = { data: {}, error: null };
    await call({ query: { weeks: '999' } });
    expect(state.rpcCalls.at(-1).args).toEqual({ p_weeks: 26 });
    await call({ query: { weeks: '0' } });
    expect(state.rpcCalls.at(-1).args).toEqual({ p_weeks: 1 });
    await call({ query: { weeks: 'lots' } });
    expect(state.rpcCalls.at(-1).args).toEqual({ p_weeks: 8 });
  });

  it('rejects an unauthenticated request without calling the database', async () => {
    const res = await call({ authed: false });
    expect(res.statusCode).toBe(401);
    expect(state.rpcCalls).toEqual([]);
  });

  it('rejects non-GET', async () => {
    const res = await call({ method: 'POST' });
    expect(res.statusCode).toBe(405);
  });

  it('degrades to 503 when the RPC throws', async () => {
    state.rpcThrows = new Error('connection reset');
    const res = await call();
    expect(res.statusCode).toBe(503);
    expect(res.jsonBody).toEqual({ error: 'Retention unavailable.' });
  });
});
