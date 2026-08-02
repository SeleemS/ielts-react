// middleware.js
// Geo-aware consent default. EU/EEA/UK/Switzerland visitors get opt-in
// (analytics/ads denied until they accept); other known countries get opt-out
// (tracked until they opt out). Missing or malformed geo data fails closed.
//
// Most pages are statically generated, so _document.js alone can't see the
// visitor's country. This edge middleware resolves it per request from Vercel's
// geo header and stashes the resulting default in a readable cookie that the
// pre-tag consent script (pages/_document.js) reads BEFORE any analytics/ads
// load. Global Privacy Control and an explicit banner choice still override it.
import { NextResponse } from 'next/server';
import { consentDefaultForCountry } from './src/lib/consentRegions';

const COOKIE = 'ib_consent_default';
// Two-letter country for statically generated pages that need request geo
// client-side (e.g. /pricing PPP display — the checkout API re-resolves geo
// server-side, so this cookie is display-only and safe to trust loosely).
const COUNTRY_COOKIE = 'ib_country';

// AI/search crawler telemetry: one row per page fetch by a known agent, into
// public.crawler_hits (service-role REST, fire-and-forget via waitUntil so no
// latency is added). User-fetch agents (ChatGPT-User etc.) hitting a URL mean
// an assistant is reading that page inside a live answer. Order matters where
// one token contains another (Claude-User before ClaudeBot's plain match).
const AI_CRAWLERS = [
  ['OAI-SearchBot', /OAI-SearchBot/i],
  ['ChatGPT-User', /ChatGPT-User/i],
  ['GPTBot', /GPTBot/i],
  ['Claude-SearchBot', /Claude-SearchBot/i],
  ['Claude-User', /Claude-User/i],
  ['ClaudeBot', /ClaudeBot/i],
  ['Perplexity-User', /Perplexity-User/i],
  ['PerplexityBot', /PerplexityBot/i],
  ['DuckAssistBot', /DuckAssistBot/i],
  ['Bingbot', /bingbot/i],
  ['Googlebot', /Googlebot/i],
  ['Google-Extended', /Google-Extended/i],
  ['Meta-ExternalAgent', /meta-externalagent/i],
  ['Amazonbot', /Amazonbot/i],
  ['Applebot', /Applebot/i],
  ['Bytespider', /Bytespider/i],
  ['CCBot', /CCBot/i],
];

function recordCrawlerHit(request, event) {
  const ua = request.headers.get('user-agent') || '';
  if (!ua) return;
  const match = AI_CRAWLERS.find(([, re]) => re.test(ua));
  if (!match) return;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  event.waitUntil(
    fetch(`${url}/rest/v1/crawler_hits`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ agent: match[0], path: request.nextUrl.pathname.slice(0, 200) }),
    }).catch(() => {})
  );
}

export function middleware(request, event) {
  recordCrawlerHit(request, event);
  const country = request.headers.get('x-vercel-ip-country');
  const value = consentDefaultForCountry(country);
  const countryValue = /^[A-Za-z]{2}$/.test(country || '') ? country.toUpperCase() : '';
  // Only write when something changed, so unchanged responses stay CDN-cacheable.
  const consentUnchanged = request.cookies.get(COOKIE)?.value === value;
  const countryUnchanged =
    (request.cookies.get(COUNTRY_COOKIE)?.value || '') === countryValue;
  if (consentUnchanged && countryUnchanged) return NextResponse.next();
  const res = NextResponse.next();
  const cookieOpts = {
    path: '/',
    httpOnly: false, // read client-side (consent pre-tag script / pricing page)
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 180,
  };
  if (!consentUnchanged) res.cookies.set(COOKIE, value, cookieOpts);
  if (!countryUnchanged) res.cookies.set(COUNTRY_COOKIE, countryValue, cookieOpts);
  return res;
}

export const config = {
  // Page routes only — skip API, Next internals, the GA proxy, and any file.
  matcher: ['/((?!api|_next|gt|.*\\..*).*)'],
};
