import { afterEach, describe, expect, it, vi } from 'vitest';
import { sanitizeGaClientId, sendGa4Purchase } from './ga4mp';

afterEach(() => {
  delete process.env.GA4_MP_API_SECRET;
  vi.unstubAllGlobals();
});

describe('sanitizeGaClientId', () => {
  it('accepts only the GA client id shape', () => {
    expect(sanitizeGaClientId('1234567890.1712345678')).toBe('1234567890.1712345678');
    expect(sanitizeGaClientId('GA1.1.1234.5678')).toBeNull();
    expect(sanitizeGaClientId('<script>')).toBeNull();
    expect(sanitizeGaClientId('')).toBeNull();
    expect(sanitizeGaClientId(null)).toBeNull();
  });
});

describe('sendGa4Purchase', () => {
  it('is a silent no-op without the API secret or client id', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(
      await sendGa4Purchase({
        clientId: '1.2',
        transactionId: 'cs_x',
        amountMinor: 899,
        currency: 'usd',
        sku: 'monthly',
      })
    ).toContain('no api secret');

    process.env.GA4_MP_API_SECRET = 'secret';
    expect(
      await sendGa4Purchase({
        clientId: null,
        transactionId: 'cs_x',
        amountMinor: 899,
        currency: 'usd',
        sku: 'monthly',
      })
    ).toContain('no client id');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts a deduplicatable purchase event and never throws', async () => {
    process.env.GA4_MP_API_SECRET = 'secret';
    const fetchMock = vi.fn().mockResolvedValue({ status: 204 });
    vi.stubGlobal('fetch', fetchMock);

    const outcome = await sendGa4Purchase({
      clientId: '1234567890.1712345678',
      userId: 'user-1',
      transactionId: 'cs_live_abc',
      amountMinor: 1999,
      currency: 'usd',
      sku: '3month',
      ppp: false,
    });

    expect(outcome).toBe('ga4mp: sent (204)');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('measurement_id=G-1KRYZZY68X');
    expect(url).toContain('api_secret=secret');
    const body = JSON.parse(init.body);
    expect(body.client_id).toBe('1234567890.1712345678');
    expect(body.events[0].name).toBe('purchase');
    expect(body.events[0].params).toMatchObject({
      transaction_id: 'cs_live_abc',
      value: 19.99,
      currency: 'USD',
    });
    expect(body.events[0].params.items[0]).toMatchObject({
      item_id: 'pro_3month',
      price: 19.99,
    });

    fetchMock.mockRejectedValueOnce(new Error('network down'));
    await expect(
      sendGa4Purchase({
        clientId: '1.2',
        transactionId: 'cs_live_def',
        amountMinor: 899,
        currency: 'usd',
        sku: 'monthly',
      })
    ).resolves.toContain('failed (network down)');
  });
});
