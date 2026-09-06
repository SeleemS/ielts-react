import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ rpc: vi.fn(), lookup: vi.fn(), eq: vi.fn(), insert: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  rpc: state.rpc,
  from: (table) => table === 'push_subscriptions'
    ? { select: () => ({ eq: (...args) => { state.eq(...args); return { maybeSingle: state.lookup }; } }) }
    : { insert: state.insert },
}) }));
import handler from '../pages/api/push/event';

const endpoint = 'https://fcm.googleapis.com/wp/synthetic-test-token';
const body = { event: 'push_click', endpoint, notification_id: 'synthetic-notification', streak: 3 };
async function call(payload = body, method = 'POST') {
  const res = { setHeader: vi.fn(), status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
  await handler({ method, body: payload, headers: {}, socket: { remoteAddress: '127.0.0.1' } }, res);
  return res;
}
beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-only');
  state.rpc.mockResolvedValue({ data: true, error: null });
  state.lookup.mockResolvedValue({ data: { user_id: 'resolved-owner' }, error: null });
  state.insert.mockResolvedValue({ error: null });
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('unexpected network dispatch'); }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks();
});

describe('push-click endpoint identity boundary', () => {
  it('resolves the exact endpoint owner and ignores all caller-supplied identity and props', async () => {
    expect((await call({ ...body, user_id: 'forged-owner', anon_id: 'forged-anon', props: { admin: true } })).code).toBe(202);
    expect(state.eq).toHaveBeenCalledWith('endpoint', endpoint);
    expect(state.insert).toHaveBeenCalledWith({ user_id: 'resolved-owner', anon_id: 'push:resolved-owner', event: 'push_click',
      props: { source: 'push_reminder', notification_id: 'synthetic-notification', streak: 3 } });
  });
  it('accepts a stringified service-worker beacon without an Origin or auth header', async () => {
    expect((await call(JSON.stringify(body))).body).toEqual({ ok: true });
    expect(state.insert).toHaveBeenCalledTimes(1);
  });
  it('ignores unknown endpoints without inserting an event', async () => {
    state.lookup.mockResolvedValue({ data: null, error: null });
    expect((await call()).body).toEqual({ ok: true, ignored: true });
    expect(state.insert).not.toHaveBeenCalled();
  });
  it('enforces the IP limiter before owner lookup', async () => {
    state.rpc.mockResolvedValue({ data: false, error: null });
    expect((await call()).code).toBe(429);
    expect(state.lookup).not.toHaveBeenCalled();
    expect(state.insert).not.toHaveBeenCalled();
    expect(state.rpc).toHaveBeenCalledWith('check_rate_limit', expect.objectContaining({ p_bucket: 'push-events', p_max: 30, p_window_seconds: 60 }));
  });
  it.each(['resolved-error', 'rejection'])('fails closed when rate limiting has a %s', async (mode) => {
    if (mode === 'rejection') state.rpc.mockRejectedValue(new Error('unavailable'));
    else state.rpc.mockResolvedValue({ error: new Error('unavailable') });
    expect((await call()).code).toBe(503);
    expect(state.lookup).not.toHaveBeenCalled();
    expect(state.insert).not.toHaveBeenCalled();
  });
  it('reports failed owner lookup without inserting', async () => {
    state.lookup.mockResolvedValue({ error: new Error('unavailable') });
    expect((await call()).code).toBe(503);
    expect(state.insert).not.toHaveBeenCalled();
  });
  it('does not claim accepted persistence on database failure', async () => {
    state.insert.mockResolvedValue({ error: new Error('unavailable') });
    expect((await call()).code).toBe(503);
  });
  it.each(['{broken', 'null', '42', '[]', '{}'])('rejects malformed/non-object beacon %s', async (payload) => {
    expect((await call(payload)).code).toBe(400);
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it('rejects unsupported event names before persistence', async () => {
    expect((await call({ ...body, event: 'purchase' })).code).toBe(400);
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it('restricts the method to POST', async () => {
    const response = await call(body, 'GET');
    expect(response.code).toBe(405);
    expect(response.setHeader).toHaveBeenCalledWith('Allow', 'POST');
  });
});
