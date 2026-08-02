import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-dummy';

const state = {
  authUser: null,
  authReject: null,
  planRow: {
    plan: 'premium',
    plan_status: 'active',
    plan_renews_at: null,
    plan_expires_at: null,
    billing_pause_until: null,
  },
  planError: null,
  planReject: null,
  rateLimits: {},
  rateLimitErrors: {},
  rateLimitRejects: {},
  quotaResult: {
    allowed: true,
    free: false,
    remaining: 0,
    consumedAt: '2026-07-19T12:00:00.000Z',
  },
  quotaError: null,
  quotaReject: null,
  rpcCalls: [],
  removedPaths: [],
  tableCalls: [],
  passageRow: {
    id: 'passage-id',
    title: 'A memorable journey',
    speaking_details: null,
  },
  passageError: null,
  passageReject: null,
  scoreError: null,
  scoreReject: null,
  deletedAttemptIds: [],
};

const chatCompletionWithFallback = vi.fn();
vi.mock('../lib/openaiChat', () => ({ chatCompletionWithFallback }));

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
        if (state.rateLimitRejects[args.p_bucket]) {
          throw state.rateLimitRejects[args.p_bucket];
        }
        return {
          data: Object.hasOwn(state.rateLimits, args.p_bucket)
            ? state.rateLimits[args.p_bucket]
            : true,
          error: state.rateLimitErrors[args.p_bucket] || null,
        };
      }
      if (name === 'consume_ai_score') {
        if (state.quotaReject) throw state.quotaReject;
        return {
          data: state.quotaResult,
          error: state.quotaError,
        };
      }
      if (name === 'refund_ai_score') return { data: true, error: null };
      return { data: null, error: { message: `unexpected RPC ${name}` } };
    },
    from: (table) => ({
      select: () => {
        const chain = {
          eq: () => chain,
          maybeSingle: async () => {
            if (table === 'users' && state.planReject) throw state.planReject;
            if (table === 'passages' && state.passageReject) {
              throw state.passageReject;
            }
            return {
              data:
                table === 'users'
                  ? state.planRow
                  : table === 'passages'
                    ? state.passageRow
                    : null,
              error:
                table === 'users'
                  ? state.planError
                  : table === 'passages'
                    ? state.passageError
                    : null,
            };
          },
        };
        return chain;
      },
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
    storage: {
      from: () => ({
        remove: async (paths) => {
          state.removedPaths.push(...paths);
          return { error: null };
        },
      }),
    },
  }),
}));

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

function makeReq({
  authorization = 'Bearer token',
  body = {
    passageSlug: 'speaking-question',
    part: 2,
    audioPath: 'premium-user/recording.webm',
  },
} = {}) {
  return {
    method: 'POST',
    headers: {
      origin: 'https://www.ielts-bank.com',
      authorization,
    },
    body,
    socket: { remoteAddress: '127.0.0.1' },
  };
}

function savedRecordingBody(overrides = {}) {
  return {
    passageSlug: 'speaking-question',
    part: 2,
    audioPath: 'premium-user/recording.webm',
    resume_saved: true,
    ...overrides,
  };
}

async function callRoute(options) {
  const { default: handler } = await import('../pages/api/score/speaking');
  const res = makeRes();
  await handler(makeReq(options), res);
  return res;
}

describe('POST /api/score/speaking quota safety', () => {
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    state.authReject = null;
    state.authUser = {
      id: 'premium-user',
      email: 'learner@example.com',
      is_anonymous: false,
    };
    state.planRow = {
      plan: 'premium',
      plan_status: 'active',
      plan_renews_at: null,
      plan_expires_at: null,
      billing_pause_until: null,
    };
    state.planError = null;
    state.planReject = null;
    state.rateLimits = {};
    state.rateLimitErrors = {};
    state.rateLimitRejects = {};
    state.quotaResult = {
      allowed: true,
      free: false,
      remaining: 0,
      consumedAt: '2026-07-19T12:00:00.000Z',
    };
    state.quotaError = null;
    state.quotaReject = null;
    state.rpcCalls = [];
    state.removedPaths = [];
    state.tableCalls = [];
    state.passageRow = {
      id: 'passage-id',
      title: 'A memorable journey',
      speaking_details: null,
    };
    state.passageError = null;
    state.passageReject = null;
    state.scoreError = null;
    state.scoreReject = null;
    state.deletedAttemptIds = [];
    chatCompletionWithFallback.mockReset();
    vi.restoreAllMocks();
  });

  it('requires authentication before quota or storage work', async () => {
    state.authUser = null;
    const res = await callRoute({ authorization: '' });

    expect(res.statusCode).toBe(401);
    expect(state.rpcCalls).toEqual([]);
    expect(state.removedPaths).toEqual([]);
  });

  it('returns a service error when auth verification rejects', async () => {
    state.authReject = new Error('auth service unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(state.rpcCalls).toEqual([]);
    expect(state.removedPaths).toEqual([]);
  });

  // Entitlement moved into consume_ai_score (v8, 2026-08-02): the RPC grants
  // free accounts one lifetime sampled score and returns premium_required
  // afterwards. RPC error/reject handling is covered by the quota tests below.
  it('reduces the free-sample response to band + first criterion server-side', async () => {
    process.env.OPENAI_API_KEY = 'openai-test-key';
    state.quotaResult = {
      allowed: true,
      remaining: 0,
      plan: 'free',
      free: true,
      consumedAt: '2026-07-19T12:00:00.000Z',
    };
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'audio/webm' },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            text:
              'I enjoy travelling because it teaches me about different people and cultures while helping me become more independent and adaptable.',
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        )
      );
    chatCompletionWithFallback.mockResolvedValue({
      ok: true,
      status: 200,
      model: 'gpt-5.1',
      payload: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                overallBand: 7,
                criteria: {
                  fluencyCoherence: { band: 6.5, feedback: 'Clear progression.' },
                  lexicalResource: { band: 7, feedback: 'Good range.' },
                  grammaticalRange: { band: 7.5, feedback: 'Varied structures.' },
                },
                summary: 'A capable response.',
                improvements: ['Develop examples further.'],
              }),
            },
          },
        ],
      },
      detail: '',
    });

    const res = await callRoute();

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.free).toBe(true);
    expect(res.jsonBody.overallBand).toBe(7);
    // ONLY the first criterion may leave the server on the free sample.
    expect(Object.keys(res.jsonBody.criteria)).toEqual(['fluencyCoherence']);
    expect(res.jsonBody.lockedCriteriaCount).toBe(2);
    expect(res.jsonBody.summary).toBe('');
    expect(res.jsonBody.improvements).toEqual([]);
    // The FULL result is still persisted for the user's own history.
    expect(state.tableCalls.map(({ table }) => table)).toContain('scores');
  });

  it('refunds the free sample when scoring cannot start', async () => {
    state.quotaResult = {
      allowed: true,
      remaining: 0,
      plan: 'free',
      free: true,
      consumedAt: '2026-07-19T12:00:00.000Z',
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callRoute(); // no OPENAI_API_KEY -> scoring cannot start

    expect(res.statusCode).toBe(502);
    expect(state.rpcCalls.at(-1)).toMatchObject({
      name: 'refund_ai_score',
      args: {
        p_uid: 'premium-user',
        p_skill: 'speaking',
        p_free: true,
        p_consumed_at: '2026-07-19T12:00:00.000Z',
      },
    });
  });

  it('fails closed when the global limiter returns an error', async () => {
    state.rateLimitErrors['speaking-score-global'] = new Error('database unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(state.rpcCalls.map(({ args }) => args.p_bucket)).toEqual([
      'speaking-score',
      'speaking-score-global',
    ]);
    expect(state.removedPaths).toEqual(['premium-user/recording.webm']);
  });

  it('fails closed when the global limiter rejects', async () => {
    state.rateLimitRejects['speaking-score-global'] = new Error('network unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(state.rpcCalls.map(({ args }) => args.p_bucket)).toEqual([
      'speaking-score',
      'speaking-score-global',
    ]);
    expect(state.removedPaths).toEqual(['premium-user/recording.webm']);
  });

  it('returns 429 only for verified global exhaustion', async () => {
    state.rateLimits['speaking-score-global'] = false;
    const res = await callRoute();

    expect(res.statusCode).toBe(429);
    expect(state.rpcCalls.map(({ args }) => args.p_bucket)).toEqual([
      'speaking-score',
      'speaking-score-global',
    ]);
    expect(state.removedPaths).toEqual(['premium-user/recording.webm']);
  });

  it('fails closed instead of opening cost access on a per-user limiter error', async () => {
    state.rateLimitErrors['speaking-score'] = new Error('database unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(state.rpcCalls.map(({ args }) => args.p_bucket)).toEqual([
      'speaking-score',
    ]);
    expect(state.removedPaths).toEqual(['premium-user/recording.webm']);
  });

  it('returns 429 for a verified per-user limit', async () => {
    state.rateLimits['speaking-score'] = false;
    const res = await callRoute();

    expect(res.statusCode).toBe(429);
    expect(state.rpcCalls.map(({ args }) => args.p_bucket)).toEqual([
      'speaking-score',
    ]);
    expect(state.removedPaths).toEqual(['premium-user/recording.webm']);
  });

  it('retains a resumed saved recording after a retryable user limit', async () => {
    state.rateLimits['speaking-score'] = false;
    const res = await callRoute({ body: savedRecordingBody() });

    expect(res.statusCode).toBe(429);
    expect(state.removedPaths).toEqual([]);
  });

  it('rejects a missing practice question before quota or OpenAI work', async () => {
    state.passageRow = null;

    const res = await callRoute();

    expect(res.statusCode).toBe(404);
    expect(state.rpcCalls.map(({ name }) => name)).toEqual([
      'check_rate_limit',
      'check_rate_limit',
    ]);
    expect(state.removedPaths).toEqual(['premium-user/recording.webm']);
    expect(chatCompletionWithFallback).not.toHaveBeenCalled();
  });

  it('still removes a resumed saved recording after a terminal missing-question result', async () => {
    state.passageRow = null;
    const res = await callRoute({ body: savedRecordingBody() });

    expect(res.statusCode).toBe(404);
    expect(state.removedPaths).toEqual(['premium-user/recording.webm']);
  });

  it('rejects a speaking-part mismatch before quota or OpenAI work', async () => {
    state.passageRow.speaking_details = { part: 1 };

    const res = await callRoute();

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody.error).toMatch(/does not match/i);
    expect(state.rpcCalls.map(({ name }) => name)).toEqual([
      'check_rate_limit',
      'check_rate_limit',
    ]);
    expect(state.removedPaths).toEqual(['premium-user/recording.webm']);
    expect(chatCompletionWithFallback).not.toHaveBeenCalled();
  });

  it('fails closed when practice-question lookup returns an error', async () => {
    state.passageError = new Error('database unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(state.rpcCalls.map(({ name }) => name)).toEqual([
      'check_rate_limit',
      'check_rate_limit',
    ]);
    expect(state.removedPaths).toEqual(['premium-user/recording.webm']);
    expect(chatCompletionWithFallback).not.toHaveBeenCalled();
  });

  it('recovers when practice-question lookup rejects', async () => {
    state.passageReject = new Error('network unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(state.rpcCalls.map(({ name }) => name)).toEqual([
      'check_rate_limit',
      'check_rate_limit',
    ]);
    expect(state.removedPaths).toEqual(['premium-user/recording.webm']);
    expect(chatCompletionWithFallback).not.toHaveBeenCalled();
  });

  it('cleans the upload when quota verification returns an error', async () => {
    state.quotaError = new Error('database unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(state.removedPaths).toEqual(['premium-user/recording.webm']);
  });

  it('cleans the upload when quota verification rejects', async () => {
    state.quotaReject = new Error('network unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(state.removedPaths).toEqual(['premium-user/recording.webm']);
  });

  it('cleans the upload when the verified daily quota is exhausted', async () => {
    state.quotaResult = {
      allowed: false,
      remaining: 0,
      reason: 'daily_cap',
      resetsAt: '2026-07-20T00:00:00.000Z',
    };
    const res = await callRoute();

    expect(res.statusCode).toBe(402);
    expect(res.jsonBody.reason).toBe('daily_cap');
    expect(state.removedPaths).toEqual(['premium-user/recording.webm']);
  });

  it('retains a resumed saved recording until a retryable daily quota resets', async () => {
    state.quotaResult = {
      allowed: false,
      remaining: 0,
      reason: 'daily_cap',
      resetsAt: '2026-07-20T00:00:00.000Z',
    };
    const res = await callRoute({ body: savedRecordingBody() });

    expect(res.statusCode).toBe(402);
    expect(res.jsonBody.reason).toBe('daily_cap');
    expect(state.removedPaths).toEqual([]);
  });

  it('preserves the upload only for the Premium checkout handoff', async () => {
    state.quotaResult = {
      allowed: false,
      remaining: 0,
      reason: 'premium_required',
    };
    const res = await callRoute();

    expect(res.statusCode).toBe(402);
    expect(res.jsonBody.reason).toBe('premium_required');
    expect(state.removedPaths).toEqual([]);
  });

  it('refunds the consumed daily unit when scoring cannot start', async () => {
    const res = await callRoute();

    expect(res.statusCode).toBe(502);
    expect(state.rpcCalls.map(({ name }) => name)).toEqual([
      'check_rate_limit',
      'check_rate_limit',
      'consume_ai_score',
      'refund_ai_score',
    ]);
    expect(state.rpcCalls.at(-1).args).toEqual({
      p_uid: 'premium-user',
      p_skill: 'speaking',
      p_free: false,
      p_consumed_at: '2026-07-19T12:00:00.000Z',
    });
    expect(state.removedPaths).toEqual(['premium-user/recording.webm']);
  });

  it('retains a resumed saved recording when scoring cannot start', async () => {
    const res = await callRoute({ body: savedRecordingBody() });

    expect(res.statusCode).toBe(502);
    expect(state.rpcCalls.at(-1)).toMatchObject({
      name: 'refund_ai_score',
      args: { p_uid: 'premium-user', p_skill: 'speaking' },
    });
    expect(state.removedPaths).toEqual([]);
  });

  it('retains a resumed saved recording after a retryable scoring-provider failure', async () => {
    process.env.OPENAI_API_KEY = 'openai-test-key';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'audio/webm' },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            text:
              'I enjoy travelling because it teaches me about different people and cultures while helping me become more independent and adaptable.',
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        )
      );
    chatCompletionWithFallback.mockResolvedValue({
      ok: false,
      status: 503,
      model: 'gpt-5.1',
      payload: null,
      detail: 'provider unavailable',
    });

    const res = await callRoute({ body: savedRecordingBody() });

    expect(res.statusCode).toBe(502);
    expect(state.rpcCalls.at(-1)).toMatchObject({
      name: 'refund_ai_score',
      args: { p_uid: 'premium-user', p_skill: 'speaking' },
    });
    expect(state.removedPaths).toEqual([]);
  });

  it('removes the attempt when its score row cannot be persisted', async () => {
    process.env.OPENAI_API_KEY = 'openai-test-key';
    state.scoreError = new Error('score insert failed');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'audio/webm' },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            text:
              'I enjoy travelling because it teaches me about different people and cultures while helping me become more independent and adaptable.',
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        )
      );
    chatCompletionWithFallback.mockResolvedValue({
      ok: true,
      status: 200,
      model: 'gpt-5.1',
      payload: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                overallBand: 2,
                criteria: {
                  fluencyCoherence: { band: 6.5, feedback: 'Clear progression.' },
                  lexicalResource: { band: 7, feedback: 'Good range.' },
                  grammaticalRange: { band: 7.5, feedback: 'Varied structures.' },
                },
                summary: 'A capable response.',
                improvements: ['Develop examples further.'],
              }),
            },
          },
        ],
      },
      detail: '',
    });

    const res = await callRoute();

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.overallBand).toBe(7);
    expect(state.tableCalls.map(({ table }) => table)).toEqual([
      'ai_usage_costs',
      'ai_usage_costs',
      'attempts',
      'scores',
    ]);
    expect(state.deletedAttemptIds).toEqual(['attempt-id']);
    expect(state.removedPaths).toEqual(['premium-user/recording.webm']);
  });

  it('removes the attempt when score persistence rejects', async () => {
    process.env.OPENAI_API_KEY = 'openai-test-key';
    state.scoreReject = new Error('score network failure');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'audio/webm' },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            text:
              'I enjoy travelling because it teaches me about different people and cultures while helping me become more independent and adaptable.',
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        )
      );
    chatCompletionWithFallback.mockResolvedValue({
      ok: true,
      status: 200,
      model: 'gpt-5.1',
      payload: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                overallBand: 7,
                criteria: {
                  fluencyCoherence: { band: 6.5, feedback: 'Clear progression.' },
                  lexicalResource: { band: 7, feedback: 'Good range.' },
                  grammaticalRange: { band: 7.5, feedback: 'Varied structures.' },
                },
                summary: 'A capable response.',
                improvements: ['Develop examples further.'],
              }),
            },
          },
        ],
      },
      detail: '',
    });

    const res = await callRoute();

    expect(res.statusCode).toBe(200);
    expect(state.deletedAttemptIds).toEqual(['attempt-id']);
    expect(state.removedPaths).toEqual(['premium-user/recording.webm']);
  });
});
