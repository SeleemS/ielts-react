import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WRITING_PROMPT_MAX_CHARS } from '../lib/writingLimits';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-dummy';
process.env.OPENAI_API_KEY = 'sk-test-dummy';

const state = {
  authUser: null,
  authReject: null,
  tableCalls: [],
  rateLimitResponses: [],
  rpcCalls: [],
  scoreError: null,
  scoreReject: null,
  deletedAttemptIds: [],
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => {
        if (state.authReject) throw state.authReject;
        return state.authUser
          ? { data: { user: state.authUser }, error: null }
          : { data: null, error: { message: 'invalid token' } };
      },
    },
    rpc: async (name, args) => {
      state.rpcCalls.push({ name, args });
      if (name === 'check_rate_limit') {
        const response = state.rateLimitResponses.shift() || {
          data: true,
          error: null,
        };
        if (response instanceof Error) throw response;
        return response;
      }
      if (name === 'consume_ai_score') {
        return {
          data: {
            allowed: true,
            free: true,
            remaining: 0,
            consumedAt: '2026-07-19T12:00:00.000Z',
          },
          error: null,
        };
      }
      if (name === 'refund_ai_score') return { data: true, error: null };
      return { data: null, error: { message: `unexpected RPC ${name}` } };
    },
    from: (table) => ({
      insert: (values) => {
        state.tableCalls.push({ table, values });
        if (table === 'attempts') {
          return {
            select: () => ({
              single: async () => ({
                data: { id: 'attempt-id' },
                error: null,
              }),
            }),
          };
        }
        if (table === 'scores' && state.scoreReject) {
          return Promise.reject(state.scoreReject);
        }
        return Promise.resolve({
          data: null,
          error: table === 'scores' ? state.scoreError : null,
        });
      },
      delete: () => ({
        eq: async (column, value) => {
          if (table === 'attempts' && column === 'id') {
            state.deletedAttemptIds.push(value);
          }
          return { data: null, error: null };
        },
      }),
    }),
  }),
}));

vi.mock('../lib/openaiChat', () => ({
  chatCompletionWithFallback: vi.fn(async () => ({
    ok: false,
    status: 503,
    detail: 'provider unavailable',
  })),
}));

function makeReq({ userToken = 'token', body = {} } = {}) {
  return {
    method: 'POST',
    headers: {
      origin: 'https://www.ielts-bank.com',
      ...(userToken ? { authorization: `Bearer ${userToken}` } : {}),
    },
    body,
    socket: { remoteAddress: '127.0.0.1' },
  };
}

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

describe('POST /api/score/writing account and quota safety', () => {
  beforeEach(() => {
    state.authUser = null;
    state.authReject = null;
    state.tableCalls = [];
    state.rateLimitResponses = [];
    state.rpcCalls = [];
    state.scoreError = null;
    state.scoreReject = null;
    state.deletedAttemptIds = [];
    vi.restoreAllMocks();
  });

  it('rejects missing authentication before consuming quota', async () => {
    const { default: handler } = await import('../pages/api/score/writing');
    const res = makeRes();

    await handler(makeReq({ userToken: '' }), res);

    expect(res.statusCode).toBe(401);
    expect(state.rpcCalls).toEqual([]);
  });

  it('rejects a valid anonymous-auth token before consuming quota', async () => {
    state.authUser = { id: 'anonymous-user', email: null, is_anonymous: true };
    const { default: handler } = await import('../pages/api/score/writing');
    const res = makeRes();

    await handler(makeReq(), res);

    expect(res.statusCode).toBe(401);
    expect(state.rpcCalls).toEqual([]);
  });

  it('returns a service error when auth verification rejects', async () => {
    state.authReject = new Error('auth service unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { default: handler } = await import('../pages/api/score/writing');
    const res = makeRes();

    await handler(makeReq(), res);

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody.error).toMatch(/temporarily unavailable/i);
    expect(state.rpcCalls).toEqual([]);
  });

  it('rejects an oversized task prompt before rate limits or quota', async () => {
    state.authUser = linkedUser();
    const { default: handler } = await import('../pages/api/score/writing');
    const res = makeRes();

    await handler(
      makeReq({
        body: {
          ...validBody(),
          prompt: 'p'.repeat(WRITING_PROMPT_MAX_CHARS + 1),
        },
      }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody.error).toMatch(/prompt is too long/i);
    expect(state.rpcCalls).toEqual([]);
  });

  it('accepts a task prompt exactly at the documented character limit', async () => {
    state.authUser = linkedUser();
    state.rateLimitResponses = [{ data: false, error: null }];
    const { default: handler } = await import('../pages/api/score/writing');
    const res = makeRes();

    await handler(
      makeReq({
        body: {
          ...validBody(),
          prompt: 'p'.repeat(WRITING_PROMPT_MAX_CHARS),
        },
      }),
      res
    );

    expect(res.statusCode).toBe(429);
    expect(state.rpcCalls.map(({ name }) => name)).toEqual(['check_rate_limit']);
  });

  it('returns a service error when the global limiter resolves with an error', async () => {
    state.authUser = linkedUser();
    state.rateLimitResponses = [
      { data: true, error: null },
      { data: null, error: { message: 'rate limiter unavailable' } },
    ];
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { default: handler } = await import('../pages/api/score/writing');
    const res = makeRes();

    await handler(makeReq({ body: validBody() }), res);

    expect(res.statusCode).toBe(503);
    expect(state.rpcCalls.map(({ args }) => args.p_bucket)).toEqual([
      'writing-score',
      'writing-score-global',
    ]);
  });

  it('returns a service error when the global limiter rejects', async () => {
    state.authUser = linkedUser();
    state.rateLimitResponses = [
      { data: true, error: null },
      new Error('rate limiter network failure'),
    ];
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { default: handler } = await import('../pages/api/score/writing');
    const res = makeRes();

    await handler(makeReq({ body: validBody() }), res);

    expect(res.statusCode).toBe(503);
    expect(state.rpcCalls.map(({ args }) => args.p_bucket)).toEqual([
      'writing-score',
      'writing-score-global',
    ]);
  });

  it('returns a demand limit only after verified global exhaustion', async () => {
    state.authUser = linkedUser();
    state.rateLimitResponses = [
      { data: true, error: null },
      { data: false, error: null },
    ];
    const { default: handler } = await import('../pages/api/score/writing');
    const res = makeRes();

    await handler(makeReq({ body: validBody() }), res);

    expect(res.statusCode).toBe(429);
    expect(state.rpcCalls.map(({ args }) => args.p_bucket)).toEqual([
      'writing-score',
      'writing-score-global',
    ]);
  });

  it('returns a service error when the per-IP limiter resolves with an error', async () => {
    state.authUser = linkedUser();
    state.rateLimitResponses = [
      { data: null, error: { message: 'rate limiter unavailable' } },
    ];
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { default: handler } = await import('../pages/api/score/writing');
    const res = makeRes();

    await handler(makeReq({ body: validBody() }), res);

    expect(res.statusCode).toBe(503);
    expect(state.rpcCalls.map(({ args }) => args.p_bucket)).toEqual(['writing-score']);
  });

  it('returns a service error when the per-IP limiter rejects', async () => {
    state.authUser = linkedUser();
    state.rateLimitResponses = [
      new Error('rate limiter network failure'),
    ];
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { default: handler } = await import('../pages/api/score/writing');
    const res = makeRes();

    await handler(makeReq({ body: validBody() }), res);

    expect(res.statusCode).toBe(503);
    expect(state.rpcCalls.map(({ args }) => args.p_bucket)).toEqual(['writing-score']);
  });

  it('returns a client limit only after verified per-IP exhaustion', async () => {
    state.authUser = linkedUser();
    state.rateLimitResponses = [
      { data: false, error: null },
    ];
    const { default: handler } = await import('../pages/api/score/writing');
    const res = makeRes();

    await handler(makeReq({ body: validBody() }), res);

    expect(res.statusCode).toBe(429);
    expect(state.rpcCalls.map(({ args }) => args.p_bucket)).toEqual(['writing-score']);
  });

  it('refunds the exact consumed sample when the scoring provider fails', async () => {
    state.authUser = linkedUser();
    const { default: handler } = await import('../pages/api/score/writing');
    const res = makeRes();

    await handler(makeReq({ body: validBody() }), res);

    expect(res.statusCode).toBe(502);
    expect(state.rpcCalls.map(({ name }) => name)).toEqual([
      'check_rate_limit',
      'check_rate_limit',
      'consume_ai_score',
      'refund_ai_score',
    ]);
    expect(state.rpcCalls.at(-1).args).toEqual({
      p_uid: 'linked-user',
      p_skill: 'writing',
      p_free: true,
      p_consumed_at: '2026-07-19T12:00:00.000Z',
      p_referral: false,
    });
  });

  it.each([
    [1, 'taskAchievement'],
    [2, 'taskResponse'],
  ])(
    'computes and persists the Task %i overall band from the four criteria',
    async (task, firstCriterion) => {
      state.authUser = linkedUser();
      const { chatCompletionWithFallback } = await import('../lib/openaiChat');
      chatCompletionWithFallback.mockResolvedValueOnce({
        ok: true,
        status: 200,
        model: 'gpt-test',
        payload: {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  overallBand: 3,
                  criteria: {
                    [firstCriterion]: criterion(6.5),
                    coherenceCohesion: criterion(7),
                    lexicalResource: criterion(7.5),
                    grammaticalRange: criterion(8),
                  },
                  summary: 'A clear response.',
                  improvements: ['Develop examples further.'],
                  correctedExamples: [],
                }),
              },
            },
          ],
        },
      });
      const { default: handler } = await import('../pages/api/score/writing');
      const res = makeRes();

      await handler(makeReq({ body: { ...validBody(), task } }), res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonBody.overallBand).toBe(7.5);
      expect(
        state.tableCalls.find(({ table }) => table === 'attempts').values.band
      ).toBe(7.5);
      expect(
        state.tableCalls.find(({ table }) => table === 'scores').values
          .overall_band
      ).toBe(7.5);
      expect(state.rpcCalls.map(({ name }) => name)).toEqual([
        'check_rate_limit',
        'check_rate_limit',
        'consume_ai_score',
      ]);
    }
  );

  it('refunds quota when criterion bands cannot produce an overall score', async () => {
    state.authUser = linkedUser();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { chatCompletionWithFallback } = await import('../lib/openaiChat');
    chatCompletionWithFallback.mockResolvedValueOnce({
      ok: true,
      status: 200,
      model: 'gpt-test',
      payload: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                overallBand: 7,
                criteria: {
                  taskResponse: criterion(6.5),
                  coherenceCohesion: criterion(7),
                  lexicalResource: criterion(7.5),
                },
                summary: 'Incomplete provider result.',
                improvements: [],
                correctedExamples: [],
              }),
            },
          },
        ],
      },
    });
    const { default: handler } = await import('../pages/api/score/writing');
    const res = makeRes();

    await handler(makeReq({ body: validBody() }), res);

    expect(res.statusCode).toBe(502);
    expect(state.tableCalls).toHaveLength(1);
    expect(state.tableCalls[0]).toMatchObject({
      table: 'ai_usage_costs',
      values: {
        user_id: 'linked-user',
        skill: 'writing',
        feature: 'writing_score',
        operation: 'rubric_score',
      },
    });
    expect(state.rpcCalls.map(({ name }) => name)).toEqual([
      'check_rate_limit',
      'check_rate_limit',
      'consume_ai_score',
      'refund_ai_score',
    ]);
  });

  it('rolls back the attempt and suppresses activity when score persistence fails', async () => {
    state.authUser = linkedUser();
    state.scoreError = new Error('score insert failed');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await mockSuccessfulWritingScore();
    const { default: handler } = await import('../pages/api/score/writing');
    const res = makeRes();

    await handler(
      makeReq({
        body: {
          ...validBody(),
          anon_id: '123e4567-e89b-42d3-a456-426614174000',
        },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(state.tableCalls.map(({ table }) => table)).toEqual([
      'ai_usage_costs',
      'attempts',
      'scores',
    ]);
    expect(state.deletedAttemptIds).toEqual(['attempt-id']);
  });

  it('rolls back the attempt when score persistence rejects', async () => {
    state.authUser = linkedUser();
    state.scoreReject = new Error('score network failure');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await mockSuccessfulWritingScore();
    const { default: handler } = await import('../pages/api/score/writing');
    const res = makeRes();

    await handler(makeReq({ body: validBody() }), res);

    expect(res.statusCode).toBe(200);
    expect(state.deletedAttemptIds).toEqual(['attempt-id']);
  });
});

function linkedUser() {
  return {
    id: 'linked-user',
    email: 'learner@example.com',
    is_anonymous: false,
  };
}

function validBody() {
  return {
    essay: Array.from({ length: 60 }, (_, index) => `word${index}`).join(' '),
    task: 2,
  };
}

function criterion(band) {
  return {
    band,
    strengths: ['Clear organization.'],
    improvements: ['Add more detail.'],
  };
}

async function mockSuccessfulWritingScore() {
  const { chatCompletionWithFallback } = await import('../lib/openaiChat');
  chatCompletionWithFallback.mockResolvedValueOnce({
    ok: true,
    status: 200,
    model: 'gpt-test',
    payload: {
      choices: [
        {
          message: {
            content: JSON.stringify({
              overallBand: 7,
              criteria: {
                taskResponse: criterion(6.5),
                coherenceCohesion: criterion(7),
                lexicalResource: criterion(7.5),
                grammaticalRange: criterion(8),
              },
              summary: 'A clear response.',
              improvements: ['Develop examples further.'],
              correctedExamples: [],
            }),
          },
        },
      ],
    },
  });
}
