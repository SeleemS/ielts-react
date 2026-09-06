import { afterEach, describe, expect, it, vi } from 'vitest';
import { disableReminders } from '../src/lib/push';

function browser(subscription) {
  vi.stubGlobal('window', { PushManager: {}, Notification: {} });
  vi.stubGlobal('navigator', {
    serviceWorker: {
      getRegistration: vi.fn().mockResolvedValue({
        pushManager: { getSubscription: vi.fn().mockResolvedValue(subscription) },
      }),
    },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('disableReminders', () => {
  it('keeps the subscription available and rejects when server disable fails', async () => {
    const subscription = { endpoint: 'https://push.example.test/1', unsubscribe: vi.fn() };
    browser(subscription);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(disableReminders({ accessToken: 'test-token' })).rejects.toThrow('unsubscribe-503');
    expect(subscription.unsubscribe).not.toHaveBeenCalled();
  });

  it('disables the owner-scoped endpoint before removing it from the browser', async () => {
    const calls = [];
    const subscription = {
      endpoint: 'https://push.example.test/1',
      unsubscribe: vi.fn(async () => calls.push('browser')),
    };
    browser(subscription);
    const fetchMock = vi.fn(async () => { calls.push('server'); return { ok: true }; });
    vi.stubGlobal('fetch', fetchMock);
    await expect(disableReminders({ accessToken: 'test-token' })).resolves.toEqual({ ok: true });
    expect(calls).toEqual(['server', 'browser']);
    expect(fetchMock).toHaveBeenCalledWith('/api/push/subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
  });

  it('is safely off after server disable even if browser unsubscribe fails', async () => {
    browser({ endpoint: 'https://push.example.test/1', unsubscribe: vi.fn().mockRejectedValue(new Error('offline')) });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    await expect(disableReminders({ accessToken: 'test-token' })).resolves.toEqual({ ok: true });
  });

  it('does not send a request when this browser has no subscription', async () => {
    browser(null);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(disableReminders({ accessToken: 'test-token' })).resolves.toEqual({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
