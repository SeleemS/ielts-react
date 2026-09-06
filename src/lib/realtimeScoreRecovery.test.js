import { describe, expect, it, vi } from 'vitest';
import {
  clearPendingRealtimeScore,
  createRealtimeScoreRequestId,
  loadPendingRealtimeScore,
  savePendingRealtimeScore,
  submitPendingRealtimeScore,
} from './realtimeScoreRecovery';

function pendingScore(overrides = {}) {
  return {
    version: 1,
    requestId: '11111111-1111-4111-8111-111111111111',
    userId: 'user-1',
    mode: 'mock',
    createdAt: 1784671200000,
    transcript: [
      { role: 'examiner', text: 'Tell me about your hometown.' },
      {
        role: 'candidate',
        text: Array.from({ length: 40 }, (_, index) => `answer${index}`).join(' '),
      },
    ],
    ...overrides,
  };
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem: vi.fn((key) => values.get(key) ?? null),
    setItem: vi.fn((key, value) => values.set(key, value)),
    removeItem: vi.fn((key) => values.delete(key)),
  };
}

function sessionClient({ token = 'examiner-token', error = null, reject = false } = {}) {
  return () => ({
    auth: {
      getSession: async () => {
        if (reject) throw error;
        return {
          data: { session: token ? { access_token: token } : null },
          error,
        };
      },
    },
  });
}

describe('pending realtime score storage', () => {
  it('creates a version-4 UUID for a new scoring journey', () => {
    expect(createRealtimeScoreRequestId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it('round-trips a valid account-bound transcript and clears it', () => {
    const storage = memoryStorage();
    const pending = pendingScore();

    expect(savePendingRealtimeScore(storage, pending)).toBe(true);
    expect(
      loadPendingRealtimeScore(storage, { now: pending.createdAt + 1000 })
    ).toEqual(pending);

    clearPendingRealtimeScore(storage);
    expect(loadPendingRealtimeScore(storage)).toBeNull();
  });

  it.each([
    ['expired', pendingScore({ createdAt: 1 }), 1784671200000],
    ['unknown mode', pendingScore({ mode: 'karaoke' }), 1784671201000],
    ['missing owner', pendingScore({ userId: '' }), 1784671201000],
    [
      'oversize transcript',
      pendingScore({ transcript: [{ role: 'candidate', text: 'x'.repeat(60001) }] }),
      1784671201000,
    ],
  ])('rejects and removes an invalid pending score: %s', (_case, pending, now) => {
    const storage = memoryStorage();
    storage.setItem('ielts-pending-realtime-score', JSON.stringify(pending));

    expect(loadPendingRealtimeScore(storage, { now })).toBeNull();
    expect(storage.removeItem).toHaveBeenCalled();
  });

  it('contains storage failures without losing the in-memory caller payload', () => {
    const storage = {
      setItem: vi.fn(() => {
        throw new Error('storage denied');
      }),
    };

    expect(savePendingRealtimeScore(storage, pendingScore())).toBe(false);
  });

  it('retains an uploaded audio reference even when transcription was unavailable', () => {
    const storage=memoryStorage();
    const pending={...pendingScore(),transcript:[],audioAssessment:{ticket:'signed-ticket',count:1}};
    expect(savePendingRealtimeScore(storage,pending)).toBe(true);
    expect(loadPendingRealtimeScore(storage,{now:pending.createdAt+1000})).toMatchObject({transcript:[],audioAssessment:pending.audioAssessment});
  });
  it('adds and persists a request ID when loading a pre-idempotency transcript', () => {
    const storage = memoryStorage();
    const legacy = pendingScore();
    delete legacy.requestId;
    storage.setItem('ielts-pending-realtime-score', JSON.stringify(legacy));

    const loaded = loadPendingRealtimeScore(storage, {
      now: legacy.createdAt + 1000,
      requestIdFactory: () => '22222222-2222-4222-8222-222222222222',
    });

    expect(loaded.requestId).toBe('22222222-2222-4222-8222-222222222222');
    expect(JSON.parse(storage.setItem.mock.calls.at(-1)[1])).toEqual(loaded);
  });
});

describe('submitPendingRealtimeScore', () => {
  it.each([
    ['resolved', false],
    ['rejected', true],
  ])('stops before scoring on a %s auth outage', async (_failureType, reject) => {
    const fetchFn = vi.fn();
    const error = new Error('temporary auth outage');

    await expect(
      submitPendingRealtimeScore({
        currentUserId: 'user-1',
        fetchFn,
        getClient: sessionClient({ token: null, error, reject }),
        pending: pendingScore(),
      })
    ).resolves.toEqual({ status: 'auth_error' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('requires the original account before reading or sending the transcript', async () => {
    const fetchFn = vi.fn();
    const getClient = vi.fn();

    await expect(
      submitPendingRealtimeScore({
        currentUserId: 'user-2',
        fetchFn,
        getClient,
        pending: pendingScore(),
      })
    ).resolves.toEqual({ status: 'owner_mismatch' });
    expect(getClient).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('keeps a verified missing session on the sign-in path', async () => {
    const fetchFn = vi.fn();

    await expect(
      submitPendingRealtimeScore({
        currentUserId: 'user-1',
        fetchFn,
        getClient: sessionClient({ token: null }),
        pending: pendingScore(),
      })
    ).resolves.toEqual({ status: 'sign_in' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('sends the original transcript once with the recovered Bearer token', async () => {
    const result = { overallBand: 7, summary: 'A clear interview.' };
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => result,
    });
    const pending = pendingScore();

    await expect(
      submitPendingRealtimeScore({
        currentUserId: 'user-1',
        fetchFn,
        getClient: sessionClient(),
        pending,
      })
    ).resolves.toEqual({ status: 'success', result });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith('/api/score/speaking-realtime', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer examiner-token',
      },
      body: JSON.stringify({
        requestId: pending.requestId,
        mode: pending.mode,
        transcript: pending.transcript,
      }),
    });
  });

  it('retries the same transcript after auth recovers without an earlier API call', async () => {
    const pending = pendingScore();
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ overallBand: 7 }),
    });
    let authError = new Error('temporary auth outage');
    const getClient = () => ({
      auth: {
        getSession: async () =>
          authError
            ? { data: { session: null }, error: authError }
            : {
                data: { session: { access_token: 'recovered-token' } },
                error: null,
              },
      },
    });

    await expect(
      submitPendingRealtimeScore({
        currentUserId: 'user-1',
        fetchFn,
        getClient,
        pending,
      })
    ).resolves.toEqual({ status: 'auth_error' });
    expect(fetchFn).not.toHaveBeenCalled();

    authError = null;
    await expect(
      submitPendingRealtimeScore({
        currentUserId: 'user-1',
        fetchFn,
        getClient,
        pending,
      })
    ).resolves.toEqual({ status: 'success', result: { overallBand: 7 } });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][1].body).toBe(
      JSON.stringify({
        requestId: pending.requestId,
        mode: pending.mode,
        transcript: pending.transcript,
      })
    );
  });

  it('returns the server error without mutating the caller transcript', async () => {
    const pending = pendingScore();
    const original = structuredClone(pending);
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Scoring is temporarily unavailable.' }),
    });

    await expect(
      submitPendingRealtimeScore({
        currentUserId: 'user-1',
        fetchFn,
        getClient: sessionClient(),
        pending,
      })
    ).resolves.toEqual({
      status: 'api_error',
      message: 'Scoring is temporarily unavailable.',
    });
    expect(pending).toEqual(original);
  });

  it('reopens sign-in when the server rejects a formerly valid token', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Please sign in.' }),
    });

    await expect(
      submitPendingRealtimeScore({
        currentUserId: 'user-1',
        fetchFn,
        getClient: sessionClient(),
        pending: pendingScore(),
      })
    ).resolves.toEqual({ status: 'sign_in' });
  });

  it('keeps an in-progress idempotent request retryable instead of treating 202 as a score', async () => {
    await expect(
      submitPendingRealtimeScore({
        currentUserId: 'user-1',
        fetchFn: vi.fn().mockResolvedValue({
          ok: true,
          status: 202,
          json: async () => ({
            error: 'This interview is still being scored. Wait a moment and retry.',
          }),
        }),
        getClient: sessionClient(),
        pending: pendingScore(),
      })
    ).resolves.toEqual({
      status: 'api_error',
      message: 'This interview is still being scored. Wait a moment and retry.',
    });
  });

  it('keeps the transcript retryable when a successful response is incomplete', async () => {
    await expect(
      submitPendingRealtimeScore({
        currentUserId: 'user-1',
        fetchFn: vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({}),
        }),
        getClient: sessionClient(),
        pending: pendingScore(),
      })
    ).resolves.toEqual({
      status: 'api_error',
      message: 'Scoring returned an incomplete result. Please try again.',
    });
  });

  it('contains a rejected scoring request as a retryable network error', async () => {
    await expect(
      submitPendingRealtimeScore({
        currentUserId: 'user-1',
        fetchFn: vi.fn().mockRejectedValue(new Error('offline')),
        getClient: sessionClient(),
        pending: pendingScore(),
      })
    ).resolves.toEqual({ status: 'network_error' });
  });
});
