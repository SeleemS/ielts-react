import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from '../pages/api/push/key';
function call(method = 'GET') {
  const res = { setHeader: vi.fn(), status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  handler({ method }, res);
  return res;
}
afterEach(() => vi.unstubAllEnvs());
describe('public VAPID key contract', () => {
  it('returns only the public key and public cache policy', () => {
    vi.stubEnv('WEB_PUSH_PUBLIC_KEY', 'synthetic-public');
    vi.stubEnv('WEB_PUSH_PRIVATE_KEY', 'synthetic-private');
    vi.stubEnv('WEB_PUSH_SUBJECT', 'mailto:test@example.test');
    const res = call();
    expect(res.code).toBe(200);
    expect(res.body).toEqual({ key: 'synthetic-public' });
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=3600');
  });
  it('does not advertise a usable key when the private half is unconfigured', () => {
    vi.stubEnv('WEB_PUSH_PUBLIC_KEY', 'synthetic-public');
    vi.stubEnv('WEB_PUSH_PRIVATE_KEY', '');
    expect(call().code).toBe(503);
  });
  it('accepts GET only', () => {
    const res = call('POST');
    expect(res.code).toBe(405);
    expect(res.setHeader).toHaveBeenCalledWith('Allow', 'GET');
  });
});
