import { beforeEach, describe, expect, it, vi } from 'vitest';

const nextResponse = vi.hoisted(() => ({
  next: vi.fn(),
}));

vi.mock('next/server', () => ({
  NextResponse: nextResponse,
}));

import { middleware } from './middleware';

function request({ country, cookie, countryCookie } = {}) {
  const jar = {
    ib_consent_default: cookie,
    ib_country: countryCookie,
  };
  return {
    headers: {
      get: vi.fn(() => country ?? null),
    },
    cookies: {
      get: vi.fn((name) => (jar[name] ? { value: jar[name] } : undefined)),
    },
  };
}

describe('geo-aware consent middleware', () => {
  beforeEach(() => {
    nextResponse.next.mockReset();
    nextResponse.next.mockImplementation(() => ({
      cookies: { set: vi.fn() },
    }));
  });

  it.each(['DE', 'GB', 'NO', 'CH'])(
    'sets denied for consent-required country %s',
    (country) => {
      const response = middleware(request({ country }));

      expect(response.cookies.set).toHaveBeenCalledWith(
        'ib_consent_default',
        'denied',
        expect.objectContaining({ path: '/', sameSite: 'lax' })
      );
    }
  );

  it('sets granted for a known non-required country', () => {
    const response = middleware(request({ country: 'CA' }));

    expect(response.cookies.set).toHaveBeenCalledWith(
      'ib_consent_default',
      'granted',
      expect.objectContaining({ path: '/', sameSite: 'lax' })
    );
  });

  it.each([undefined, '', 'unknown'])(
    'fails closed when geo is unavailable or malformed (%s)',
    (country) => {
      const response = middleware(request({ country }));

      expect(response.cookies.set).toHaveBeenCalledWith(
        'ib_consent_default',
        'denied',
        expect.any(Object)
      );
    }
  );

  it('does not rewrite unchanged consent-default and country cookies', () => {
    const response = middleware(
      request({ country: 'CH', cookie: 'denied', countryCookie: 'CH' })
    );

    expect(nextResponse.next).toHaveBeenCalledTimes(1);
    expect(response.cookies.set).not.toHaveBeenCalled();
  });

  it('sets the ib_country cookie for statically generated pages', () => {
    const response = middleware(request({ country: 'IN' }));

    expect(response.cookies.set).toHaveBeenCalledWith(
      'ib_country',
      'IN',
      expect.objectContaining({ path: '/', sameSite: 'lax', httpOnly: false })
    );
  });

  it('writes an empty ib_country when geo is malformed', () => {
    const response = middleware(request({ country: 'unknown', countryCookie: 'IN' }));

    expect(response.cookies.set).toHaveBeenCalledWith(
      'ib_country',
      '',
      expect.any(Object)
    );
  });
});

describe('AI crawler telemetry', () => {
  beforeEach(() => {
    nextResponse.next.mockReset();
    nextResponse.next.mockImplementation(() => ({ cookies: { set: vi.fn() } }));
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    global.fetch = vi.fn(() => Promise.resolve({ ok: true }));
  });

  function crawlerRequest(userAgent, path = '/readingquestion/foo') {
    return {
      headers: {
        get: vi.fn((name) => (name === 'user-agent' ? userAgent : 'US')),
      },
      cookies: { get: vi.fn(() => undefined) },
      nextUrl: { pathname: path },
    };
  }

  it('records a hit for a known AI agent without blocking the response', () => {
    const event = { waitUntil: vi.fn() };
    middleware(crawlerRequest('Mozilla/5.0; compatible; ChatGPT-User/1.0; +https://openai.com/bot'), event);

    expect(event.waitUntil).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.supabase.co/rest/v1/crawler_hits',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ agent: 'ChatGPT-User', path: '/readingquestion/foo' }),
      })
    );
  });

  it('distinguishes Claude-User from ClaudeBot', () => {
    const event = { waitUntil: vi.fn() };
    middleware(crawlerRequest('Mozilla/5.0 Claude-User/1.0'), event);
    expect(global.fetch.mock.calls[0][1].body).toContain('"agent":"Claude-User"');
  });

  it('ignores ordinary browsers', () => {
    const event = { waitUntil: vi.fn() };
    middleware(crawlerRequest('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/605.1'), event);
    expect(event.waitUntil).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
