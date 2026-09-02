import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const ENV_KEYS = [
  'CRON_SECRET',
  'SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
];
const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]])
);

const state = {
  clientCreations: 0,
  clientError: null,
  fromCalls: [],
  rateError: null,
  rateReject: null,
  rateDeletes: [],
  estimatorError: null,
  estimatorReject: null,
  estimatorCount: 0,
  estimatorDeletes: [],
  cleanupRpcError: null,
  cleanupRpcReject: null,
  cleanupRpcCount: 0,
  rollupResult: { days: 3, rows: {} },
  rollupError: null,
  rollupReject: null,
  rollupArgs: null,
  rpcCalls: [],
  listResponses: {},
  listRejects: {},
  listCalls: [],
  removeResponses: [],
  removeRejects: [],
  removeCalls: [],
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => {
    state.clientCreations += 1;
    if (state.clientError) throw state.clientError;
    return {
      async rpc(name, args) {
        state.rpcCalls.push(name);
        if (name === 'refresh_activity_daily') {
          state.rollupArgs = args;
          if (state.rollupReject) throw state.rollupReject;
          return { data: state.rollupResult, error: state.rollupError };
        }
        if (name !== 'cleanup_realtime_score_requests') {
          throw new Error(`unexpected-rpc:${name}`);
        }
        if (state.cleanupRpcReject) throw state.cleanupRpcReject;
        return { data: state.cleanupRpcCount, error: state.cleanupRpcError };
      },
      from(table) {
        state.fromCalls.push(table);
        if (table === 'rate_limits') {
          return {
            delete: () => ({
              lt: async (column, cutoff) => {
                state.rateDeletes.push({ column, cutoff });
                if (state.rateReject) throw state.rateReject;
                return { error: state.rateError };
              },
            }),
          };
        }
        if (table === 'estimator_writing_scores') {
          return {
            delete: (options) => ({
              lt: async (column, cutoff) => {
                state.estimatorDeletes.push({ options, column, cutoff });
                if (state.estimatorReject) throw state.estimatorReject;
                return { count: state.estimatorCount, error: state.estimatorError };
              },
            }),
          };
        }
        throw new Error(`unexpected-table:${table}`);
      },
      storage: {
        from(bucket) {
          return {
            async list(prefix, options) {
              state.listCalls.push({ bucket, prefix, options });
              if (state.listRejects[prefix]) throw state.listRejects[prefix];
              const responses = state.listResponses[prefix];
              if (Array.isArray(responses)) {
                return responses.shift() || { data: [], error: null };
              }
              return responses || { data: [], error: null };
            },
            async remove(paths) {
              state.removeCalls.push({ bucket, paths });
              const rejection = state.removeRejects.shift();
              if (rejection) throw rejection;
              return state.removeResponses.shift() || { data: paths, error: null };
            },
          };
        },
      },
    };
  },
}));

import handler from '../pages/api/cron/cleanup';

function makeReq({ method = 'GET', authorization = 'Bearer cron-test' } = {}) {
  return { method, headers: authorization ? { authorization } : {} };
}

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

async function callRoute(options) {
  const res = makeRes();
  await handler(makeReq(options), res);
  return res;
}

function folder(name) {
  return { id: null, name };
}

describe('GET /api/cron/cleanup', () => {
  afterAll(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env.CRON_SECRET = 'cron-test';
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-dummy';
    state.clientCreations = 0;
    state.clientError = null;
    state.fromCalls = [];
    state.rateError = null;
    state.rateReject = null;
    state.rateDeletes = [];
    state.estimatorError = null;
    state.estimatorReject = null;
    state.estimatorCount = 0;
    state.estimatorDeletes = [];
    state.cleanupRpcError = null;
    state.cleanupRpcReject = null;
    state.cleanupRpcCount = 0;
    state.rollupResult = { days: 3, rows: {} };
    state.rollupError = null;
    state.rollupReject = null;
    state.rollupArgs = null;
    state.rpcCalls = [];
    state.listResponses = {};
    state.listRejects = {};
    state.listCalls = [];
    state.removeResponses = [];
    state.removeRejects = [];
    state.removeCalls = [];
  });

  it('rejects unsupported methods before authentication or dependencies', async () => {
    const res = await callRoute({ method: 'POST', authorization: null });

    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET');
    expect(res.ended).toBe(true);
    expect(state.clientCreations).toBe(0);
  });

  it('requires the configured bearer secret before creating an admin client', async () => {
    const missing = await callRoute({ authorization: null });
    const wrong = await callRoute({ authorization: 'Bearer wrong' });

    expect([missing.statusCode, wrong.statusCode]).toEqual([401, 401]);
    expect(state.clientCreations).toBe(0);
  });

  it('returns a controlled error when the database client is not configured', async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody).toEqual({ error: 'Cleanup is not configured.' });
    expect(state.clientCreations).toBe(0);
  });

  it('returns a controlled error when admin-client construction throws', async () => {
    state.clientError = new Error('invalid configuration');

    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody).toEqual({ error: 'Cleanup is not configured.' });
    expect(state.clientCreations).toBe(1);
  });

  it('stops before upload work when stale rate-limit deletion fails', async () => {
    state.rateError = { message: 'database unavailable' };

    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody).toEqual({ error: 'Rate-limit cleanup failed.' });
    expect(state.fromCalls).toEqual(['rate_limits']);
    expect(state.listCalls).toEqual([]);
  });

  it('recovers when stale rate-limit deletion rejects', async () => {
    state.rateReject = new Error('network unavailable');

    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody).toEqual({ error: 'Rate-limit cleanup failed.' });
    expect(state.fromCalls).toEqual(['rate_limits']);
    expect(state.listCalls).toEqual([]);
  });

  it('stops before upload work when stale estimator-result deletion fails', async () => {
    state.estimatorError = { message: 'database unavailable' };

    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody).toEqual({ error: 'Estimator result cleanup failed.' });
    expect(state.fromCalls).toEqual(['rate_limits', 'estimator_writing_scores']);
    expect(state.listCalls).toEqual([]);
  });

  it('recovers when stale estimator-result deletion rejects', async () => {
    state.estimatorReject = new Error('network unavailable');

    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody).toEqual({ error: 'Estimator result cleanup failed.' });
    expect(state.listCalls).toEqual([]);
  });

  it('removes estimator results older than 30 days and reports the exact count', async () => {
    state.estimatorCount = 3;
    state.cleanupRpcCount = 4;
    state.listResponses[''] = { data: [], error: null };

    const res = await callRoute();

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({
      ok: true,
      recordingsRemoved: 0,
      estimatorResultsRemoved: 3,
      realtimeScoreRequestsRemoved: 4,
      activityRollup: { days: 3, rows: {} },
    });
    expect(state.estimatorDeletes).toHaveLength(1);
    expect(state.estimatorDeletes[0].options).toEqual({ count: 'exact' });
    expect(state.estimatorDeletes[0].column).toBe('created_at');
    const ageDays = (Date.now() - Date.parse(state.estimatorDeletes[0].cutoff)) / 864e5;
    expect(ageDays).toBeGreaterThanOrEqual(29.99);
    expect(ageDays).toBeLessThanOrEqual(30.01);
  });

  it('stops before upload work when realtime score request cleanup fails', async () => {
    state.cleanupRpcError = { message: 'database unavailable' };

    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody).toEqual({ error: 'Realtime score request cleanup failed.' });
    expect(state.rpcCalls).toEqual(['cleanup_realtime_score_requests']);
    expect(state.listCalls).toEqual([]);
  });

  it('recovers when realtime score request cleanup rejects', async () => {
    state.cleanupRpcReject = new Error('network unavailable');

    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody).toEqual({ error: 'Realtime score request cleanup failed.' });
    expect(state.listCalls).toEqual([]);
  });

  it('refreshes the activity_daily rollups the /data dashboard reads', async () => {
    const res = await callRoute();

    expect(res.statusCode).toBe(200);
    expect(state.rpcCalls).toContain('refresh_activity_daily');
    // null p_from lets the RPC use its own 3-day lookback default.
    expect(state.rollupArgs).toEqual({ p_from: null });
    expect(res.jsonBody.activityRollup).toEqual({ days: 3, rows: {} });
  });

  it('finishes the cleanup even when the rollup refresh fails', async () => {
    state.rollupError = { message: 'deadlock detected' };

    const res = await callRoute();

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.ok).toBe(true);
    expect(res.jsonBody.activityRollup).toEqual({ error: 'refresh-failed' });
  });

  it('finishes the cleanup even when the rollup refresh rejects', async () => {
    state.rollupReject = new Error('connection reset');

    const res = await callRoute();

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.activityRollup).toEqual({ error: 'refresh-failed' });
  });

  it('fails the run when a storage listing fails', async () => {
    state.listResponses[''] = {
      data: null,
      error: { message: 'storage unavailable' },
    };

    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody).toEqual({ error: 'Upload cleanup failed.' });
    expect(state.removeCalls).toEqual([]);
  });

  it('recovers when a storage listing rejects', async () => {
    state.listRejects[''] = new Error('storage network unavailable');

    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody).toEqual({ error: 'Upload cleanup failed.' });
    expect(state.removeCalls).toEqual([]);
  });

  it('does not partially delete a folder when a later storage page fails', async () => {
    state.listResponses[''] = { data: [folder('user-1')], error: null };
    state.listResponses['user-1'] = [
      {
        data: Array.from({ length: 1000 }, (_, index) => ({
          name: `expired-${index}.webm`,
          created_at: '2020-01-01T00:00:00.000Z',
        })),
        error: null,
      },
      { data: null, error: { message: 'second page unavailable' } },
    ];

    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody).toEqual({ error: 'Upload cleanup failed.' });
    expect(state.listCalls).toHaveLength(3);
    expect(state.removeCalls).toEqual([]);
  });

  it('fails the run when removal of an expired recording fails', async () => {
    state.listResponses[''] = { data: [folder('user-1')], error: null };
    state.listResponses['user-1'] = {
      data: [{ name: 'expired.webm', created_at: '2020-01-01T00:00:00.000Z' }],
      error: null,
    };
    state.removeResponses = [
      { data: null, error: { message: 'delete unavailable' } },
    ];

    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody).toEqual({ error: 'Upload cleanup failed.' });
    expect(state.removeCalls).toEqual([
      { bucket: 'speaking-uploads', paths: ['user-1/expired.webm'] },
    ]);
  });

  it('recovers when removal of an expired recording rejects', async () => {
    state.listResponses[''] = { data: [folder('user-1')], error: null };
    state.listResponses['user-1'] = {
      data: [{ name: 'expired.webm', created_at: '2020-01-01T00:00:00.000Z' }],
      error: null,
    };
    state.removeRejects = [new Error('storage network unavailable')];

    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody).toEqual({ error: 'Upload cleanup failed.' });
    expect(state.removeCalls).toHaveLength(1);
  });

  it('removes only expired recordings and reports the exact successful count', async () => {
    state.listResponses[''] = {
      data: [folder('user-1'), folder('user-2')],
      error: null,
    };
    state.listResponses['user-1'] = {
      data: [
        { name: 'old-a.webm', created_at: '2020-01-01T00:00:00.000Z' },
        { name: 'current.webm', created_at: '2099-01-01T00:00:00.000Z' },
      ],
      error: null,
    };
    state.listResponses['user-2'] = {
      data: [{ name: 'old-b.webm', updated_at: '2020-01-01T00:00:00.000Z' }],
      error: null,
    };

    const res = await callRoute();

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({
      ok: true,
      recordingsRemoved: 2,
      estimatorResultsRemoved: 0,
      realtimeScoreRequestsRemoved: 0,
      activityRollup: { days: 3, rows: {} },
    });
    expect(state.rateDeletes).toHaveLength(1);
    expect(state.rateDeletes[0].column).toBe('window_start');
    expect(Date.parse(state.rateDeletes[0].cutoff)).toBeGreaterThan(0);
    expect(state.listCalls).toEqual([
      {
        bucket: 'speaking-uploads',
        prefix: '',
        options: {
          limit: 1000,
          offset: 0,
          sortBy: { column: 'name', order: 'asc' },
        },
      },
      {
        bucket: 'speaking-uploads',
        prefix: 'user-1',
        options: {
          limit: 1000,
          offset: 0,
          sortBy: { column: 'name', order: 'asc' },
        },
      },
      {
        bucket: 'speaking-uploads',
        prefix: 'user-2',
        options: {
          limit: 1000,
          offset: 0,
          sortBy: { column: 'name', order: 'asc' },
        },
      },
    ]);
    expect(state.removeCalls).toEqual([
      {
        bucket: 'speaking-uploads',
        paths: ['user-1/old-a.webm', 'user-2/old-b.webm'],
      },
    ]);
  });

  it('enumerates every Storage owner folder without a profile-table cap', async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) =>
      folder(`owner-${String(index).padStart(4, '0')}`)
    );
    state.listResponses[''] = [
      { data: firstPage, error: null },
      { data: [folder('owner-1000')], error: null },
    ];
    state.listResponses['owner-1000'] = {
      data: [{ name: 'expired.webm', created_at: '2020-01-01T00:00:00.000Z' }],
      error: null,
    };

    const res = await callRoute();

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({
      ok: true,
      recordingsRemoved: 1,
      estimatorResultsRemoved: 0,
      realtimeScoreRequestsRemoved: 0,
      activityRollup: { days: 3, rows: {} },
    });
    expect(state.fromCalls).toEqual(['rate_limits', 'estimator_writing_scores']);
    expect(state.listCalls.filter(({ prefix }) => prefix === '')).toEqual([
      {
        bucket: 'speaking-uploads',
        prefix: '',
        options: {
          limit: 1000,
          offset: 0,
          sortBy: { column: 'name', order: 'asc' },
        },
      },
      {
        bucket: 'speaking-uploads',
        prefix: '',
        options: {
          limit: 1000,
          offset: 1000,
          sortBy: { column: 'name', order: 'asc' },
        },
      },
    ]);
    expect(state.listCalls.some(({ prefix }) => prefix === 'owner-1000')).toBe(true);
    expect(state.removeCalls).toEqual([
      { bucket: 'speaking-uploads', paths: ['owner-1000/expired.webm'] },
    ]);
  });

  it('traverses nested folders and retains no expired root-level objects', async () => {
    state.listResponses[''] = {
      data: [
        folder('user-1'),
        {
          id: 'root-file-id',
          name: 'legacy.webm',
          created_at: '2020-01-01T00:00:00.000Z',
        },
      ],
      error: null,
    };
    state.listResponses['user-1'] = {
      data: [
        folder('nested'),
        {
          id: 'current-file-id',
          name: 'current.webm',
          created_at: '2099-01-01T00:00:00.000Z',
        },
      ],
      error: null,
    };
    state.listResponses['user-1/nested'] = {
      data: [
        {
          id: 'nested-file-id',
          name: 'expired.webm',
          updated_at: '2020-01-01T00:00:00.000Z',
        },
      ],
      error: null,
    };

    const res = await callRoute();

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({
      ok: true,
      recordingsRemoved: 2,
      estimatorResultsRemoved: 0,
      realtimeScoreRequestsRemoved: 0,
      activityRollup: { days: 3, rows: {} },
    });
    expect(state.listCalls.map(({ prefix }) => prefix)).toEqual([
      '',
      'user-1',
      'user-1/nested',
    ]);
    expect(state.removeCalls).toEqual([
      {
        bucket: 'speaking-uploads',
        paths: ['legacy.webm', 'user-1/nested/expired.webm'],
      },
    ]);
  });

  it('lists every storage page and removes expired recordings in bounded batches', async () => {
    state.listResponses[''] = { data: [folder('user-1')], error: null };
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({
      name: `expired-${String(index).padStart(4, '0')}.webm`,
      created_at: '2020-01-01T00:00:00.000Z',
    }));
    state.listResponses['user-1'] = [
      { data: firstPage, error: null },
      {
        data: [
          { name: 'expired-1000.webm', updated_at: '2020-01-01T00:00:00.000Z' },
          { name: 'expired-1001.webm', created_at: '2020-01-01T00:00:00.000Z' },
          { name: 'current.webm', created_at: '2099-01-01T00:00:00.000Z' },
        ],
        error: null,
      },
    ];

    const res = await callRoute();

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({
      ok: true,
      recordingsRemoved: 1002,
      estimatorResultsRemoved: 0,
      realtimeScoreRequestsRemoved: 0,
      activityRollup: { days: 3, rows: {} },
    });
    expect(state.listCalls).toEqual([
      {
        bucket: 'speaking-uploads',
        prefix: '',
        options: {
          limit: 1000,
          offset: 0,
          sortBy: { column: 'name', order: 'asc' },
        },
      },
      {
        bucket: 'speaking-uploads',
        prefix: 'user-1',
        options: {
          limit: 1000,
          offset: 0,
          sortBy: { column: 'name', order: 'asc' },
        },
      },
      {
        bucket: 'speaking-uploads',
        prefix: 'user-1',
        options: {
          limit: 1000,
          offset: 1000,
          sortBy: { column: 'name', order: 'asc' },
        },
      },
    ]);
    expect(state.removeCalls).toHaveLength(2);
    expect(state.removeCalls[0].paths).toHaveLength(1000);
    expect(state.removeCalls[0].paths[0]).toBe('user-1/expired-0000.webm');
    expect(state.removeCalls[0].paths[999]).toBe('user-1/expired-0999.webm');
    expect(state.removeCalls[1]).toEqual({
      bucket: 'speaking-uploads',
      paths: ['user-1/expired-1000.webm', 'user-1/expired-1001.webm'],
    });
  });
});
