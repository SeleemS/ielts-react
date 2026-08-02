// /api/referral/redeem: method/auth/validation guards (the crediting logic
// itself lives in the redeem_referral RPC, exercised against the live schema).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ rpcCalls: [], authUser: { id: 'referred-user' } }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: state.authUser }, error: null }),
    },
    rpc: async (name, args) => {
      state.rpcCalls.push({ name, args });
      return { data: { ok: true, credited: true }, error: null };
    },
  }),
}));

import handler from '../pages/api/referral/redeem';

function makeRes() {
  return {
    statusCode: null,
    jsonBody: null,
    headers: {},
    setHeader(key, value) {
      this.headers[key] = value;
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

async function call({ method = 'POST', authorization = 'Bearer token', body = { code: 'abcd1234' } } = {}) {
  const res = makeRes();
  await handler(
    {
      method,
      headers: { authorization, origin: 'https://www.ielts-bank.com' },
      body,
    },
    res
  );
  return res;
}

describe('POST /api/referral/redeem', () => {
  beforeEach(() => {
    state.rpcCalls = [];
    state.authUser = { id: 'referred-user' };
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  });

  it('rejects non-POST', async () => {
    const res = await call({ method: 'GET' });
    expect(res.statusCode).toBe(405);
    expect(state.rpcCalls).toEqual([]);
  });

  it('requires authentication', async () => {
    const res = await call({ authorization: '' });
    expect(res.statusCode).toBe(401);
    expect(state.rpcCalls).toEqual([]);
  });

  it('rejects malformed codes before any RPC', async () => {
    for (const code of ['', 'short', 'TOOLONGCODE123', 'abc!1234', null]) {
      const res = await call({ body: { code } });
      expect(res.statusCode).toBe(400);
    }
    expect(state.rpcCalls).toEqual([]);
  });

  it('normalizes the code and passes the verified user to the RPC', async () => {
    const res = await call({ body: { code: '  ABCD1234 ' } });
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ ok: true, credited: true });
    expect(state.rpcCalls).toEqual([
      { name: 'redeem_referral', args: { p_code: 'abcd1234', p_referred: 'referred-user' } },
    ]);
  });
});
