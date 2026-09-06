import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ rpc: vi.fn(), insert: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ rpc: state.rpc, from: () => ({ insert: state.insert }) }),
}));
import handler from '../pages/api/contact';

function request() {
  return { method: 'POST', headers: { origin: 'https://www.ielts-bank.com' },
    socket: { remoteAddress: '127.0.0.1' },
    body: { name: '<Learner>', email: 'learner@example.test', message: '<script>test</script>' } };
}
async function call(req = request()) {
  const res = { setHeader: vi.fn(), status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await handler(req, res);
  return res;
}

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-only');
  vi.stubEnv('RESEND_API_KEY', 'test-only');
  vi.stubEnv('CONTACT_EMAIL', 'support@example.test');
  state.rpc.mockResolvedValue({ data: true, error: null });
  state.insert.mockResolvedValue({ error: null });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe('contact persistence and provider boundary', () => {
  it('persists before notification and escapes visitor content in email', async () => {
    expect((await call()).code).toBe(200);
    expect(state.insert.mock.invocationCallOrder[0]).toBeLessThan(fetch.mock.invocationCallOrder[0]);
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.to).toEqual(['support@example.test']);
    expect(body.reply_to).toBe('learner@example.test');
    expect(body.html).toContain('&lt;script&gt;test&lt;/script&gt;');
    expect(body.html).toContain('&lt;Learner&gt;');
  });
  it('does not contact the provider when persistence fails', async () => {
    state.insert.mockResolvedValue({ error: { message: 'unavailable' } });
    expect((await call()).code).toBe(502);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('fails closed before persistence or email when the limiter fails', async () => {
    state.rpc.mockResolvedValue({ error: { message: 'unavailable' } });
    expect((await call()).code).toBe(503);
    expect(state.insert).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('retains accepted durable submissions when the provider rejects', async () => {
    fetch.mockResolvedValue({ ok: false, status: 503, text: async () => 'unavailable' });
    expect((await call()).body).toEqual({ ok: true });
    expect(state.insert).toHaveBeenCalledTimes(1);
  });
  it('retains accepted durable submissions when the provider throws', async () => {
    fetch.mockRejectedValue(new Error('offline'));
    expect((await call()).body).toEqual({ ok: true });
  });
});
