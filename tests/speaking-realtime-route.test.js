import { issueAssessmentTicket } from '../lib/realtimeAssessmentTicket';
import { normalizeAudioAssessment } from '../lib/speakingAudioAssessment';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-dummy';

const state = {
  audioCalls: [],
  authUser: null,
  authReject: null,
  planRow: { plan: 'free', plan_status: 'inactive' },
  planError: null,
  planReject: null,
  rateLimits: {},
  rateLimitError: null,
  rateLimitReject: null,
  rpcCalls: [],
  idempotencyClaimResponses: [],
  idempotencyCompleteResponses: [],
  idempotencyFailResponses: [],
  tableCalls: [],
  scoreError: null,
  scoreReject: null,
  deletedAttemptIds: [],
};

vi.mock('../lib/realtimeAudioScorer', () => ({ loadAssessmentAudio: async args => { state.audioCalls.push(args); return { parts: [], durationSeconds: 60 }; }, scoreRecordedInterview: async () => ({ result: normalizeAudioAssessment({ criteria: Object.fromEntries(['fluencyCoherence','lexicalResource','grammaticalRange','pronunciation'].map(k=>[k,{band:6,strengths:['Evidence'],improvements:['Action']}])), summary:'Practice', improvements:['One','Two','Three'], limitations:[], confidence:'medium',audioEvidence:[{startSeconds:1,endSeconds:3,observation:'Stress'}] },60), response: {} }) }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    storage: { from: () => ({ remove: async () => ({error:null}) }) },
    auth: {
      getUser: async () => {
        if (state.authReject) throw state.authReject;
        return state.authUser
          ? { data: { user: state.authUser }, error: null }
          : { data: null, error: { message: 'invalid token' } };
      },
    },
    from: (table) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (state.planReject) throw state.planReject;
            return { data: state.planRow, error: state.planError };
          },
        }),
      }),
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
    rpc: async (name, args) => {
      state.rpcCalls.push({ name, args });
      if (name === 'claim_realtime_score_request') {
        return state.idempotencyClaimResponses.shift() || {
          data: [{ action: 'claimed', replay_result: null, claim_lease_id: 'lease-1' }],
          error: null,
        };
      }
      if (name === 'complete_realtime_score_request') {
        return state.idempotencyCompleteResponses.shift() || { data: true, error: null };
      }
      if (name === 'fail_realtime_score_request') {
        return state.idempotencyFailResponses.shift() || { data: true, error: null };
      }
      if (state.rateLimitReject) throw state.rateLimitReject;
      return {
        data: Object.hasOwn(state.rateLimits, args.p_bucket)
          ? state.rateLimits[args.p_bucket]
          : true,
        error: state.rateLimitError,
      };
    },
  }),
}));

function makeReq({
  method = 'POST',
  origin = 'https://www.ielts-bank.com',
  authorization = 'Bearer token',
  body = {},
} = {}) {
  return {
    method,
    headers: { origin, authorization },
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

async function callRoute(options) {
  const { default: handler } = await import('../pages/api/score/speaking-realtime');
  const res = makeRes();
  await handler(makeReq(options), res);
  return res;
}

describe('POST /api/score/speaking-realtime access gate', () => {
  beforeEach(() => {
    state.audioCalls = [];
    state.authUser = null;
    state.authReject = null;
    state.planRow = { plan: 'free', plan_status: 'inactive' };
    state.planError = null;
    state.planReject = null;
    state.rateLimits = {};
    state.rateLimitError = null;
    state.rateLimitReject = null;
    state.rpcCalls = [];
    state.idempotencyClaimResponses = [];
    state.idempotencyCompleteResponses = [];
    state.idempotencyFailResponses = [];
    state.tableCalls = [];
    state.scoreError = null;
    state.scoreReject = null;
    state.deletedAttemptIds = [];
    delete process.env.OPENAI_API_KEY;
    vi.restoreAllMocks();
  });

  it('requires a paid signed audio ticket before loading recordings or calling a model', async () => {
    state.authUser={id:'user-1'};state.planRow={plan:'premium',plan_status:'active'};
    const res=await callRoute({body:{mode:'part1',requestId:'22222222-2222-4222-8222-222222222222',audioAssessment:{ticket:'forged',count:1}}});
    expect(res.statusCode).toBe(400);expect(state.audioCalls).toHaveLength(0);expect(state.rpcCalls).toHaveLength(0);
  });
  it('scores signed candidate audio on four criteria and persists the actual model', async () => {
    process.env.REALTIME_ASSESSMENT_SECRET='x'.repeat(40);process.env.OPENAI_API_KEY='test';
    state.authUser={id:'user-1'};state.planRow={plan:'premium',plan_status:'active'};
    const issued=issueAssessmentTicket({userId:'user-1',mode:'part1',durationSeconds:300});
    const res=await callRoute({body:{mode:'part1',requestId:issued.requestId,transcript:[{role:'candidate',text:Array(45).fill('word').join(' ')}],audioAssessment:{ticket:issued.ticket,count:1}}});
    expect(res.statusCode).toBe(200);expect(res.jsonBody.criteria.pronunciation.band).toBe(6);
    expect(res.jsonBody.overallBand).toBe(6);expect(res.jsonBody.assessmentBasis).toBe('candidate_audio');
    expect(state.tableCalls.find(c=>c.table==='scores').values.model).toBe('gpt-realtime-2.1');
    expect(state.rpcCalls.filter(c=>c.name==='consume_realtime_seconds')).toHaveLength(0);
    delete process.env.REALTIME_ASSESSMENT_SECRET;
  });
  it('enforces POST and same-origin requests before authentication', async () => {
    let res = await callRoute({ method: 'GET' });
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('POST');

    res = await callRoute({ origin: 'https://attacker.example' });
    expect(res.statusCode).toBe(403);
    expect(state.rpcCalls).toEqual([]);
  });

  it('requires authentication', async () => {
    const res = await callRoute({ authorization: '' });

    expect(res.statusCode).toBe(401);
    expect(state.rpcCalls).toEqual([]);
  });

  it('fails safely when auth verification rejects', async () => {
    state.authReject = new Error('auth service unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody.error).toMatch(/temporarily unavailable/i);
    expect(state.rpcCalls).toEqual([]);
  });

  it('reserves the Premium response for a verified Free account', async () => {
    state.authUser = { id: 'user-1' };
    const res = await callRoute();

    expect(res.statusCode).toBe(402);
    expect(res.jsonBody.reason).toBe('not_premium');
    expect(state.rpcCalls).toEqual([]);
  });

  it('does not misreport a resolved entitlement error as non-premium', async () => {
    state.authUser = { id: 'user-1' };
    state.planRow = null;
    state.planError = new Error('database unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody.reason).toBeUndefined();
    expect(state.rpcCalls).toEqual([]);
  });

  it('recovers when the entitlement query rejects', async () => {
    state.authUser = { id: 'user-1' };
    state.planReject = new Error('network unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody.reason).toBeUndefined();
    expect(state.rpcCalls).toEqual([]);
  });

  it('fails closed when a limiter returns an infrastructure error', async () => {
    state.authUser = { id: 'user-1' };
    state.planRow = { plan: 'premium', plan_status: 'active' };
    state.rateLimitError = new Error('limiter unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callRoute({ body: validTranscriptBody() });

    expect(res.statusCode).toBe(503);
    expect(state.rpcCalls).toHaveLength(1);
  });

  it('fails closed when a limiter RPC rejects', async () => {
    state.authUser = { id: 'user-1' };
    state.planRow = { plan: 'premium', plan_status: 'active' };
    state.rateLimitReject = new Error('network unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callRoute({ body: validTranscriptBody() });

    expect(res.statusCode).toBe(503);
    expect(state.rpcCalls).toHaveLength(1);
  });

  it('fails closed when global scoring capacity is exhausted', async () => {
    state.authUser = { id: 'user-1' };
    state.planRow = { plan: 'premium', plan_status: 'active' };
    state.rateLimits['realtime-score-global'] = false;
    const res = await callRoute({ body: validTranscriptBody() });

    expect(res.statusCode).toBe(503);
    expect(state.rpcCalls.map(({ args }) => args.p_bucket)).toEqual([
      'realtime-score-ip',
      'realtime-score-global',
    ]);
  });

  it('returns 429 only for a verified per-IP limit', async () => {
    state.authUser = { id: 'user-1' };
    state.planRow = { plan: 'premium', plan_status: 'active' };
    state.rateLimits['realtime-score-ip'] = false;
    const res = await callRoute({ body: validTranscriptBody() });

    expect(res.statusCode).toBe(429);
    expect(state.rpcCalls.map(({ args }) => args.p_bucket)).toEqual([
      'realtime-score-ip',
    ]);
  });

  it('rejects an unscorable transcript before consuming limiter allowance', async () => {
    state.authUser = { id: 'user-1' };
    state.planRow = { plan: 'premium', plan_status: 'active' };

    const res = await callRoute({
      body: {
        transcript: [{ role: 'candidate', text: 'This answer is too short.' }],
      },
    });

    expect(res.statusCode).toBe(422);
    expect(state.rpcCalls).toEqual([]);
  });

  it('rejects an unknown session mode before consuming limiter allowance', async () => {
    state.authUser = { id: 'user-1' };
    state.planRow = { plan: 'premium', plan_status: 'active' };

    const res = await callRoute({
      body: {
        ...validTranscriptBody(),
        mode: 'karaoke',
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody.error).toMatch(/unknown session mode/i);
    expect(state.rpcCalls).toEqual([]);
    expect(state.tableCalls).toEqual([]);
  });

  it('rejects a malformed request ID before claiming or consuming limits', async () => {
    state.authUser = { id: 'user-1' };
    state.planRow = { plan: 'premium', plan_status: 'active' };

    const res = await callRoute({
      body: { ...validTranscriptBody(), requestId: 'not-a-uuid' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody.error).toMatch(/request reference/i);
    expect(state.rpcCalls).toEqual([]);
  });

  it('rejects an oversized transcript before claiming or consuming limits', async () => {
    state.authUser = { id: 'user-1' };
    state.planRow = { plan: 'premium', plan_status: 'active' };

    const res = await callRoute({
      body: {
        requestId: '11111111-1111-4111-8111-111111111111',
        mode: 'mock',
        transcript: [{ role: 'candidate', text: 'word '.repeat(12001) }],
      },
    });

    expect(res.statusCode).toBe(413);
    expect(res.jsonBody.error).toMatch(/too long/i);
    expect(state.rpcCalls).toEqual([]);
  });

  it('fails safely when the request ledger cannot claim work', async () => {
    state.authUser = { id: 'user-1' };
    state.planRow = { plan: 'premium', plan_status: 'active' };
    state.idempotencyClaimResponses.push({
      data: null,
      error: new Error('ledger unavailable'),
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await callRoute({ body: idempotentTranscriptBody() });

    expect(res.statusCode).toBe(503);
    expect(state.rpcCalls).toHaveLength(1);
    expect(state.rpcCalls[0].name).toBe('claim_realtime_score_request');
  });

  it.each([
    ['busy', 202],
    ['conflict', 409],
  ])('stops duplicate request action %s before limits or provider work', async (action, status) => {
    state.authUser = { id: 'user-1' };
    state.planRow = { plan: 'premium', plan_status: 'active' };
    state.idempotencyClaimResponses.push({
      data: [{ action, replay_result: null, claim_lease_id: null }],
      error: null,
    });

    const res = await callRoute({ body: idempotentTranscriptBody() });

    expect(res.statusCode).toBe(status);
    expect(state.rpcCalls.map(({ name }) => name)).toEqual([
      'claim_realtime_score_request',
    ]);
    expect(state.tableCalls).toEqual([]);
  });

  it('replays a completed request without limits, provider work, or persistence', async () => {
    state.authUser = { id: 'user-1' };
    state.planRow = { plan: 'premium', plan_status: 'active' };
    const replay = {
      mode: 'mock',
      candidateWords: 40,
      overallBand: 7,
      criteria: {},
      summary: 'Previously completed.',
    };
    state.idempotencyClaimResponses.push({
      data: [{ action: 'replay', replay_result: replay, claim_lease_id: null }],
      error: null,
    });
    const provider = vi.spyOn(global, 'fetch');

    const res = await callRoute({ body: idempotentTranscriptBody() });

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual(replay);
    expect(state.rpcCalls.map(({ name }) => name)).toEqual([
      'claim_realtime_score_request',
    ]);
    expect(provider).not.toHaveBeenCalled();
    expect(state.tableCalls).toEqual([]);
  });

  it('completes a claimed request once and persists its request reference', async () => {
    state.authUser = { id: 'user-1' };
    state.planRow = { plan: 'premium', plan_status: 'active' };
    mockSuccessfulRealtimeScore();

    const res = await callRoute({ body: idempotentTranscriptBody() });

    expect(res.statusCode).toBe(200);
    expect(state.rpcCalls.map(({ name }) => name)).toEqual([
      'claim_realtime_score_request',
      'check_rate_limit',
      'check_rate_limit',
      'complete_realtime_score_request',
    ]);
    expect(
      state.tableCalls.find(({ table }) => table === 'attempts').values.responses
        .realtime_request_id
    ).toBe('11111111-1111-4111-8111-111111111111');
    expect(state.rpcCalls.at(-1).args).toMatchObject({
      p_request_id: '11111111-1111-4111-8111-111111111111',
      p_user_id: 'user-1',
      p_lease_id: 'lease-1',
    });
    expect(state.rpcCalls.at(-1).args.p_result.overallBand).toBe(7.5);
  });

  it('retries an ambiguous completion RPC once without repeating provider work', async () => {
    state.authUser = { id: 'user-1' };
    state.planRow = { plan: 'premium', plan_status: 'active' };
    state.idempotencyCompleteResponses.push(
      { data: null, error: new Error('response lost') },
      { data: true, error: null }
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const provider = mockSuccessfulRealtimeScore();

    const res = await callRoute({ body: idempotentTranscriptBody() });

    expect(res.statusCode).toBe(200);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(
      state.rpcCalls.filter(({ name }) => name === 'complete_realtime_score_request')
    ).toHaveLength(2);
  });

  it('withholds a result when its idempotency completion cannot be confirmed', async () => {
    state.authUser = { id: 'user-1' };
    state.planRow = { plan: 'premium', plan_status: 'active' };
    state.idempotencyCompleteResponses.push(
      { data: false, error: null },
      { data: false, error: null }
    );
    const provider = mockSuccessfulRealtimeScore();

    const res = await callRoute({ body: idempotentTranscriptBody() });

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody.error).toMatch(/confirmation is delayed/i);
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it('releases a claimed request after a provider failure', async () => {
    state.authUser = { id: 'user-1' };
    state.planRow = { plan: 'premium', plan_status: 'active' };
    process.env.OPENAI_API_KEY = 'sk-test-dummy';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ error: { message: 'provider unavailable' } }),
    });

    const res = await callRoute({ body: idempotentTranscriptBody() });

    expect(res.statusCode).toBe(502);
    expect(state.rpcCalls.at(-1)).toEqual({
      name: 'fail_realtime_score_request',
      args: {
        p_request_id: '11111111-1111-4111-8111-111111111111',
        p_user_id: 'user-1',
        p_lease_id: 'lease-1',
      },
    });
  });

  it('computes and persists the overall from the three criterion bands', async () => {
    state.authUser = { id: 'user-1' };
    state.planRow = { plan: 'premium', plan_status: 'active' };
    process.env.OPENAI_API_KEY = 'sk-test-dummy';
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                overallBand: 3,
                criteria: {
                  fluencyCoherence: criterion(6.5),
                  lexicalResource: criterion(7.5),
                  grammaticalRange: criterion(8),
                },
                summary: 'A clear interview.',
                improvements: ['Develop longer answers.'],
              }),
            },
          },
        ],
      }),
    });

    const res = await callRoute({ body: validTranscriptBody() });

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.overallBand).toBe(7.5);
    expect(
      state.tableCalls.find(({ table }) => table === 'attempts').values.band
    ).toBe(7.5);
    expect(
      state.tableCalls.find(({ table }) => table === 'scores').values
        .overall_band
    ).toBe(7.5);
  });

  it('rejects malformed criterion bands without persisting a score', async () => {
    state.authUser = { id: 'user-1' };
    state.planRow = { plan: 'premium', plan_status: 'active' };
    process.env.OPENAI_API_KEY = 'sk-test-dummy';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                overallBand: 7,
                criteria: {
                  fluencyCoherence: criterion(6.5),
                  lexicalResource: criterion(7.5),
                },
                summary: 'Incomplete provider result.',
                improvements: [],
              }),
            },
          },
        ],
      }),
    });

    const res = await callRoute({ body: validTranscriptBody() });

    expect(res.statusCode).toBe(502);
    expect(state.tableCalls).toHaveLength(1);
    expect(state.tableCalls[0]).toMatchObject({
      table: 'ai_usage_costs',
      values: {
        user_id: 'user-1',
        skill: 'speaking',
        feature: 'speaking_realtime_score',
        operation: 'rubric_score',
        pricing_known: false,
      },
    });
  });

  it('removes the attempt when score persistence returns an error', async () => {
    state.authUser = { id: 'user-1' };
    state.planRow = { plan: 'premium', plan_status: 'active' };
    state.scoreError = new Error('score insert failed');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockSuccessfulRealtimeScore();

    const res = await callRoute({ body: validTranscriptBody() });

    expect(res.statusCode).toBe(200);
    expect(state.deletedAttemptIds).toEqual(['attempt-id']);
  });

  it('removes the attempt when score persistence rejects', async () => {
    state.authUser = { id: 'user-1' };
    state.planRow = { plan: 'premium', plan_status: 'active' };
    state.scoreReject = new Error('score network failure');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockSuccessfulRealtimeScore();

    const res = await callRoute({ body: validTranscriptBody() });

    expect(res.statusCode).toBe(200);
    expect(state.deletedAttemptIds).toEqual(['attempt-id']);
  });
});

function validTranscriptBody() {
  return {
    mode: 'mock',
    transcript: [
      {
        role: 'candidate',
        text: Array.from(
          { length: 40 },
          (_, index) => `candidate${index}`
        ).join(' '),
      },
    ],
  };
}

function idempotentTranscriptBody() {
  return {
    ...validTranscriptBody(),
    requestId: '11111111-1111-4111-8111-111111111111',
  };
}

function criterion(band) {
  return {
    band,
    strengths: ['Clear organization.'],
    improvements: ['Add more detail.'],
  };
}

function mockSuccessfulRealtimeScore() {
  process.env.OPENAI_API_KEY = 'sk-test-dummy';
  return vi.spyOn(global, 'fetch').mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              overallBand: 7,
              criteria: {
                fluencyCoherence: criterion(6.5),
                lexicalResource: criterion(7.5),
                grammaticalRange: criterion(8),
              },
              summary: 'A clear interview.',
              improvements: ['Develop longer answers.'],
            }),
          },
        },
      ],
    }),
  });
}
