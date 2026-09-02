import { analyticsConsentGranted } from './consent';
import { recordPracticeActivity } from './practiceActivity';

const ANON_ID_KEY = 'ielts-anon-id';
const ATTRIBUTION_KEY = 'ielts-attribution';
const SESSION_ID_KEY = 'ielts-analytics-session-id';
const SEQUENCE_KEY = 'ielts-analytics-sequence';
export const GA_MEASUREMENT_ID = 'G-1KRYZZY68X';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let analyticsAccessToken = null;
let pageViewId = null;
let volatileAnonId = null;
const INTERNAL_PATH_RE = /^\/(?:api|_next|gt|data)(?:\/|$)/;

function fallbackUuid() {
  const bytes = new Uint8Array(16);
  if (window.crypto?.getRandomValues) window.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function getAnonId() {
  if (typeof window === 'undefined') return null;
  try {
    let value = window.localStorage.getItem(ANON_ID_KEY);
    if (!UUID_RE.test(value || '')) {
      value = volatileAnonId || window.crypto?.randomUUID?.() || fallbackUuid();
      volatileAnonId = value;
      window.localStorage.setItem(ANON_ID_KEY, value);
    }
    volatileAnonId = value;
    return value;
  } catch {
    // This ID is also the functional key for anonymous estimator scoring, so a
    // storage-denied browser must retain a stable in-page fallback rather than
    // silently turning the scorer request into anon_id: null.
    if (!volatileAnonId) {
      volatileAnonId = window.crypto?.randomUUID?.() || fallbackUuid();
    }
    return volatileAnonId;
  }
}

export function getSessionId() {
  if (typeof window === 'undefined') return null;
  try {
    let value = window.sessionStorage.getItem(SESSION_ID_KEY);
    if (!value) {
      value = window.crypto?.randomUUID?.() || fallbackUuid();
      window.sessionStorage.setItem(SESSION_ID_KEY, value);
    }
    return value;
  } catch {
    return null;
  }
}

function nextSequence() {
  if (typeof window === 'undefined') return null;
  try {
    const current = Number(window.sessionStorage.getItem(SEQUENCE_KEY) || 0);
    const next = Number.isSafeInteger(current) && current >= 0 ? current + 1 : 1;
    window.sessionStorage.setItem(SEQUENCE_KEY, String(next));
    return next;
  } catch {
    return null;
  }
}

function getPageViewId() {
  if (typeof window === 'undefined') return null;
  if (!pageViewId) pageViewId = window.crypto?.randomUUID?.() || fallbackUuid();
  return pageViewId;
}

function rotatePageViewId() {
  if (typeof window === 'undefined') return null;
  pageViewId = window.crypto?.randomUUID?.() || fallbackUuid();
  return pageViewId;
}

export function ensureGoogleAnalytics() {
  if (typeof window === 'undefined') return null;
  if (!analyticsConsentGranted()) return null;
  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== 'function') {
    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
    };
  }
  if (!window.__ieltsConsentDefaulted) {
    window.gtag('consent', 'default', {
      analytics_storage: 'granted',
      ad_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'granted',
      functionality_storage: 'granted',
      security_storage: 'granted',
      wait_for_update: 500,
    });
    window.gtag('set', 'ads_data_redaction', true);
    window.__ieltsConsentDefaulted = true;
  }
  if (!window.__ieltsGaConfigured) {
    window.gtag('js', new Date());
    window.gtag('config', GA_MEASUREMENT_ID, {
      transport_url: window.location.origin + '/gt',
      first_party_collection: true,
      send_page_view: false,
    });
    window.__ieltsGaConfigured = true;
  }
  return window.gtag;
}

export function isInternalAnalyticsPath(value) {
  if (typeof value !== 'string') return false;
  const path = value.split(/[?#]/, 1)[0];
  return INTERNAL_PATH_RE.test(path);
}

// First-touch attribution: captured once, on the first track() call of the
// user's first visit, then persisted. `source` resolves to utm_source, else
// the external referrer host, else 'direct'.
export function getAttribution() {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(ATTRIBUTION_KEY);
    if (stored) return JSON.parse(stored);

    const params = new URLSearchParams(window.location.search);
    const referrer = document.referrer || '';
    let referrerHost = '';
    try {
      referrerHost = referrer ? new URL(referrer).hostname : '';
    } catch {
      referrerHost = '';
    }
    if (referrerHost === window.location.hostname) referrerHost = '';

    const attribution = {
      source: (params.get('utm_source') || referrerHost || 'direct').slice(0, 200),
      referrer: referrerHost ? referrer.slice(0, 300) : '',
      landing: window.location.pathname.slice(0, 200),
      utm_source: (params.get('utm_source') || '').slice(0, 200),
      utm_medium: (params.get('utm_medium') || '').slice(0, 200),
      utm_campaign: (params.get('utm_campaign') || '').slice(0, 200),
    };
    window.localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(attribution));
    return attribution;
  } catch {
    return null;
  }
}

export function track(event, params = {}, options = {}) {
  if (typeof window === 'undefined' || !event) return;
  // Product-feature counter for the promo reminder. Intentionally runs
  // BEFORE the analytics-consent gate below: the reminder is not analytics, so
  // a user who declined analytics must still get the offer nudge. No-ops for
  // non-submit events. Isolated so a listener/storage failure can never take
  // the analytics pipeline down with it.
  try {
    recordPracticeActivity(event);
  } catch {
    /* product nudge failure must not break telemetry */
  }
  if (!analyticsConsentGranted()) return;
  const currentPath = params.path || window.location.pathname;
  if (isInternalAnalyticsPath(currentPath)) return;
  const clientEventId = window.crypto?.randomUUID?.() || fallbackUuid();
  const sessionId = getSessionId();
  const currentPageViewId = getPageViewId();
  const payload = {
    ...params,
    path: currentPath,
    client_event_id: clientEventId,
    session_id: sessionId,
    page_view_id: currentPageViewId,
    event_sequence: nextSequence(),
    occurred_at: new Date().toISOString(),
  };

  // firstPartyOnly: meter-style events (e.g. session_heartbeat) that belong in
  // activity_events but would only add noise/volume to GA4.
  //
  // The GA fan-out runs third-party code (gtag/dataLayer can be replaced by
  // the real GA library, ad-block shims, or extensions). It must never be able
  // to throw past this point: an exception here would silently sever the
  // first-party /api/track stream below AND propagate into whatever fired the
  // event (heartbeat interval, delegated click listener, submit handler).
  if (!options.firstPartyOnly) {
    try {
      ensureGoogleAnalytics()?.('event', event, payload);
    } catch {
      /* GA sink failure must not sever first-party telemetry */
    }
  }

  const anonId = getAnonId();
  if (!anonId || typeof window.fetch !== 'function') return;
  const headers = { 'Content-Type': 'application/json' };
  const accessToken = options.accessToken || analyticsAccessToken;
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  // Every first-party event carries the resolved acquisition source; the
  // login event carries the full attribution so /api/track can stamp it
  // onto the user's row (first-write-wins server-side).
  const attribution = getAttribution();
  const extra = {};
  if (attribution?.source) extra.acquisition_source = attribution.source;
  if (event === 'login' && attribution) {
    // Legacy login RPC input remains `source`; all event analysis should use
    // `acquisition_source` so UI placement values such as "blog" or
    // "quota_modal" can continue to use `source` without overwriting it.
    extra.source = attribution.source;
    if (attribution.referrer) extra.referrer = attribution.referrer;
    if (attribution.landing) extra.landing = attribution.landing;
    if (attribution.utm_source) extra.utm_source = attribution.utm_source;
    if (attribution.utm_medium) extra.utm_medium = attribution.utm_medium;
    if (attribution.utm_campaign) extra.utm_campaign = attribution.utm_campaign;
  }

  try {
    window.fetch('/api/track', {
      method: 'POST',
      headers,
      keepalive: true,
      body: JSON.stringify({ event, anon_id: anonId, ...extra, ...payload }),
    }).catch(() => {});
  } catch {
    // A synchronous fetch failure (keepalive quota, patched fetch, unstringifiable
    // payload) must not propagate into the caller.
  }
}

// GA4 client id from the _ga cookie ("GA1.1.123456.789" → "123456.789").
// Only present when analytics consent was granted (the cookie doesn't exist
// otherwise). Used to attribute server-side Measurement Protocol purchase
// events (webhook backstop) to the same GA user as the browser session.
export function gaClientId() {
  if (typeof document === 'undefined') return null;
  if (!analyticsConsentGranted()) return null;
  const match = /(?:^|;\s*)_ga=([^;]+)/.exec(document.cookie || '');
  if (!match) return null;
  const parts = match[1].split('.');
  if (parts.length < 4) return null;
  const clientId = `${parts[2]}.${parts[3]}`;
  return /^\d+\.\d+$/.test(clientId) ? clientId : null;
}

export function setAnalyticsUser(userId, accessToken = null) {
  analyticsAccessToken = accessToken || null;
  if (!analyticsConsentGranted()) return;
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  window.gtag('set', { user_id: userId || null });
}

// Coarse UA buckets for the /data dashboard's Browser/OS/Device panel.
// Order matters: Edge/Opera/Samsung UAs also contain "Chrome"; Chrome UAs
// contain "Safari".
export function deviceInfo(ua, maxTouchPoints = 0) {
  const browser = /edg\//i.test(ua)
    ? 'Edge'
    : /opr\/|opera/i.test(ua)
      ? 'Opera'
      : /samsungbrowser/i.test(ua)
        ? 'Samsung Internet'
        : /firefox\//i.test(ua)
          ? 'Firefox'
          : /chrome|crios/i.test(ua)
            ? 'Chrome'
            : /safari/i.test(ua)
              ? 'Safari'
              : 'Other';
  // iPadOS 13+ reports a Mac UA but exposes multi-touch.
  const iPadOs = /macintosh/i.test(ua) && maxTouchPoints > 1;
  const os = /windows/i.test(ua)
    ? 'Windows'
    : /iphone|ipad|ipod/i.test(ua) || iPadOs
      ? 'iOS'
      : /android/i.test(ua)
        ? 'Android'
        : /macintosh|mac os/i.test(ua)
          ? 'macOS'
          : /linux/i.test(ua)
            ? 'Linux'
            : 'Other';
  const device = /ipad|tablet/i.test(ua) || iPadOs
    ? 'Tablet'
    : /mobi|iphone|android.*mobile/i.test(ua)
      ? 'Mobile'
      : 'Desktop';
  return { browser, os, device };
}

export function trackPageView(url, signedIn = false) {
  if (typeof window === 'undefined') return;
  if (!analyticsConsentGranted()) return;
  rotatePageViewId();
  track('page_view', {
    page_location: `${window.location.origin}${url}`,
    page_path: url,
    page_title: document.title,
    signed_in: signedIn,
    ...deviceInfo(window.navigator?.userAgent || '', window.navigator?.maxTouchPoints || 0),
  });
}

export function resetAnalyticsForTests() {
  analyticsAccessToken = null;
  pageViewId = null;
  volatileAnonId = null;
}
