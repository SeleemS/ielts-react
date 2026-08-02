import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAnonId,
  getSessionId,
  ensureGoogleAnalytics,
  isInternalAnalyticsPath,
  resetAnalyticsForTests,
  track,
  trackPageView,
} from './analytics';

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key) => values.get(key) ?? null),
    setItem: vi.fn((key, value) => values.set(key, String(value))),
  };
}

describe('dual analytics tracking', () => {
  let uuid;

  beforeEach(() => {
    let sequence = 0;
    uuid = vi.fn(() => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`);
    global.window = {
      crypto: { randomUUID: uuid },
      localStorage: storage({ 'ib_consent_v1': 'granted' }),
      sessionStorage: storage(),
      location: {
        origin: 'https://ielts-bank.com',
        hostname: 'ielts-bank.com',
        pathname: '/readingquestion/demo',
        search: '?utm_source=search',
      },
      fetch: vi.fn(() => Promise.resolve({ ok: true })),
      gtag: vi.fn(),
      __ieltsGaConfigured: true,
      __ieltsConsentDefaulted: true,
      __ieltsOptionalConsent: 'granted',
    };
    global.document = {
      referrer: '',
      title: 'Reading practice',
    };
    resetAnalyticsForTests();
  });

  afterEach(() => {
    delete global.window;
    delete global.document;
  });

  it('persists stable anonymous and per-tab session IDs', () => {
    expect(getAnonId()).toBe(getAnonId());
    expect(getSessionId()).toBe(getSessionId());
    expect(window.localStorage.setItem).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.setItem).toHaveBeenCalled();
  });

  it('keeps a stable functional anonymous ID when local storage is denied', () => {
    window.localStorage = {
      getItem: vi.fn(() => {
        throw new Error('storage denied');
      }),
      setItem: vi.fn(() => {
        throw new Error('storage denied');
      }),
    };

    const first = getAnonId();
    const second = getAnonId();

    expect(first).toMatch(/^[0-9a-f-]{36}$/i);
    expect(second).toBe(first);
    expect(uuid).toHaveBeenCalledTimes(1);
  });

  it('replaces a corrupted stored anonymous ID with a valid UUID', () => {
    window.localStorage = storage({ 'ielts-anon-id': 'not-a-uuid' });

    const value = getAnonId();

    expect(value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(window.localStorage.setItem).toHaveBeenCalledWith('ielts-anon-id', value);
  });

  it('sends the same enriched event to GA4 and the first-party endpoint', () => {
    track('ui_interaction', { element_id: 'pricing_cta' });

    expect(window.gtag).toHaveBeenCalledTimes(1);
    const [, gaEvent, gaPayload] = window.gtag.mock.calls[0];
    const request = window.fetch.mock.calls[0][1];
    const body = JSON.parse(request.body);

    expect(gaEvent).toBe('ui_interaction');
    expect(request.keepalive).toBe(true);
    expect(body.event).toBe('ui_interaction');
    expect(body.element_id).toBe('pricing_cta');
    expect(body.client_event_id).toBe(gaPayload.client_event_id);
    expect(body.session_id).toBe(gaPayload.session_id);
    expect(body.page_view_id).toBe(gaPayload.page_view_id);
    expect(body.event_sequence).toBe(1);
    expect(body.occurred_at).toMatch(/Z$/);
  });

  it('self-heals the GA queue when inline bootstrap scripts did not execute', () => {
    delete window.gtag;
    delete window.dataLayer;
    window.__ieltsGaConfigured = false;
    window.__ieltsConsentDefaulted = false;

    ensureGoogleAnalytics();

    expect(typeof window.gtag).toBe('function');
    expect(window.__ieltsGaConfigured).toBe(true);
    expect(window.__ieltsConsentDefaulted).toBe(true);
    expect(window.dataLayer.map((entry) => entry[0])).toEqual([
      'consent',
      'set',
      'js',
      'config',
    ]);
    expect(window.dataLayer[1]).toEqual(
      expect.objectContaining({
        0: 'set',
        1: 'ads_data_redaction',
        2: true,
      })
    );
  });

  it('still delivers the first-party event when the GA tag throws', () => {
    // The GA fan-out executes third-party code (real gtag, ad-block shims,
    // extension replacements). A throwing tag must neither sever the
    // /api/track stream nor propagate into the caller (heartbeat interval,
    // delegated click listener).
    window.gtag = vi.fn(() => {
      throw new Error('tag exploded');
    });

    expect(() => track('ui_interaction', { element_id: 'pricing_cta' })).not.toThrow();

    expect(window.fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(window.fetch.mock.calls[0][1].body);
    expect(body.event).toBe('ui_interaction');
  });

  it('does not let a synchronous fetch failure escape to the caller', () => {
    window.fetch = vi.fn(() => {
      throw new TypeError('keepalive quota exceeded');
    });

    expect(() => track('ui_interaction', { element_id: 'pricing_cta' })).not.toThrow();
  });

  it('rotates page-view IDs while retaining the session journey', () => {
    trackPageView('/one');
    track('ui_interaction', { element_id: 'first' });
    trackPageView('/two');

    const bodies = window.fetch.mock.calls.map(([, options]) => JSON.parse(options.body));
    expect(bodies[0].page_view_id).toBe(bodies[1].page_view_id);
    expect(bodies[2].page_view_id).not.toBe(bodies[1].page_view_id);
    expect(new Set(bodies.map((body) => body.session_id)).size).toBe(1);
    expect(bodies.map((body) => body.event_sequence)).toEqual([1, 2, 3]);
  });

  it('keeps acquisition attribution separate from UI placement', () => {
    track('product_cta_click', { source: 'blog', product: 'writing_checker' });

    const body = JSON.parse(window.fetch.mock.calls[0][1].body);
    expect(body.acquisition_source).toBe('search');
    expect(body.source).toBe('blog');
  });

  it('drops internal API, Next.js, and Google-tag iframe paths', () => {
    for (const path of [
      '/api/track',
      '/_next/static/chunk.js',
      '/gt/_/service_worker/iframe.html',
    ]) {
      window.location.pathname = path;
      track('page_view');
    }

    expect(window.gtag).not.toHaveBeenCalled();
    expect(window.fetch).not.toHaveBeenCalled();
    expect(isInternalAnalyticsPath('/gt/js?id=G-1KRYZZY68X')).toBe(true);
    expect(isInternalAnalyticsPath('/pricing?upgrade=writing')).toBe(false);
  });

  it('tracks by default in an opt-out region when the visitor has not opted out', () => {
    window.__ieltsOptionalConsent = null;
    window.__ieltsConsentDefault = 'granted';
    window.localStorage = storage();
    window.sessionStorage = storage();

    track('ui_interaction', { element_id: 'pricing_cta' });

    expect(window.gtag).toHaveBeenCalled();
    expect(window.fetch).toHaveBeenCalled();
  });

  it('does not create identifiers or send analytics after an explicit opt-out', () => {
    window.__ieltsOptionalConsent = 'denied';
    window.localStorage = storage();
    window.sessionStorage = storage();

    track('ui_interaction', { element_id: 'pricing_cta' });
    trackPageView('/pricing');

    expect(window.localStorage.setItem).not.toHaveBeenCalled();
    expect(window.sessionStorage.setItem).not.toHaveBeenCalled();
    expect(window.gtag).not.toHaveBeenCalled();
    expect(window.fetch).not.toHaveBeenCalled();
  });
});
