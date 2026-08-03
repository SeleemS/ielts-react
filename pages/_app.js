import Script from 'next/script';
import Head from 'next/head';
import * as React from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import { Analytics } from '@vercel/analytics/react';
// Tailwind + shadcn design tokens. Chakra has been fully removed; Tailwind
// Preflight is re-enabled in tailwind.config.js.
import '../src/styles/globals.css';
import { inter } from '../src/lib/fonts';
import { AuthProvider, useAuth } from '../src/lib/auth';
import {
  GA_MEASUREMENT_ID,
  trackPageView,
} from '../src/lib/analytics';
import { startSessionHeartbeat } from '../src/lib/sessionHeartbeat';
// Client-only chrome (consent banner, delegated-click telemetry, sale reminder
// modal): none of it renders meaningful SSR output, so load it as separate
// async chunks instead of inside the critical _app bundle every page parses
// before hydration.
const ConsentManager = dynamic(() => import('../src/components/ConsentManager'), { ssr: false });
const InteractionTelemetry = dynamic(() => import('../src/components/InteractionTelemetry'), {
  ssr: false,
});
const OfferReminderModal = dynamic(() => import('../src/components/OfferReminderModal'), {
  ssr: false,
});
import {
  adsAllowedForConsent,
  adsAllowedForPath,
} from '../src/lib/adPolicy';
import { syncAdSenseScript } from '../src/lib/adsenseLoader';
import {
  consentAwareVercelEvent,
  readOptionalConsent,
} from '../src/lib/consent';
import { captureReferralCode } from '../src/lib/referral';
import { installClientErrorHandlers } from '../src/lib/clientErrors';

function AdSenseScript({ enabled }) {
  React.useEffect(() => {
    syncAdSenseScript(document, enabled);
    return () => syncAdSenseScript(document, false);
  }, [enabled]);
  return null;
}

function AppTelemetry({ router, enabled }) {
  const { user, loading } = useAuth();
  const initialPageTracked = React.useRef(false);
  React.useEffect(() => {
    if (!enabled) return undefined;
    const onRoute = (url) => trackPageView(url, Boolean(user?.id));
    router.events.on('routeChangeComplete', onRoute);
    return () => router.events.off('routeChangeComplete', onRoute);
  }, [enabled, router.events, user?.id]);
  React.useEffect(() => {
    if (!enabled || !router.isReady || loading || initialPageTracked.current) return;
    initialPageTracked.current = true;
    const timer = window.setTimeout(() => trackPageView(router.asPath, Boolean(user?.id)), 500);
    return () => window.clearTimeout(timer);
  }, [enabled, loading, router.asPath, router.isReady, user?.id]);
  // Engaged-time meter for session-duration analytics (see lib/sessionStats.js).
  React.useEffect(() => {
    if (!enabled) return undefined;
    return startSessionHeartbeat();
  }, [enabled]);
  return null;
}

function MyApp({ Component, pageProps }) {
  const router = useRouter();
  const [adsOnPublicHost, setAdsOnPublicHost] = React.useState(false);
  const [optionalConsent, setOptionalConsent] = React.useState(null);
  const adsAllowed = adsAllowedForPath(router.asPath);
  React.useEffect(() => {
    setAdsOnPublicHost(/(^|\.)ielts-bank\.com$/i.test(window.location.hostname));
    setOptionalConsent(readOptionalConsent());
    // Stash a ?ref= referral code from any landing URL (redeemed after
    // sign-in via /api/referral/redeem, validated server-side).
    captureReferralCode();
  }, []);
  // Stale-chunk auto-recovery + rate-limited client_error telemetry: a tab
  // open across a deploy crashes on its next navigation without this (the
  // "Application error" screen GA was recording).
  React.useEffect(() => installClientErrorHandlers(router), [router]);
  const analyticsEnabled = optionalConsent === 'granted';
  const advertisingEnabled = adsAllowedForConsent(optionalConsent);
  return (
    <AuthProvider>
      <Head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
      </Head>
      {/* Inter must live on <html>, not just the wrapper div below: modals and
          drawers render in portals attached to <body>, which otherwise fall
          back to the browser serif font. */}
      <style jsx global>{`
        html {
          font-family: ${inter.style.fontFamily}, ui-sans-serif, system-ui, sans-serif;
        }
      `}</style>
      <AppTelemetry router={router} enabled={analyticsEnabled} />
      <InteractionTelemetry />
      <div className={`${inter.variable} font-sans`}>
      {/* Google AdSense: never load optional advertising before consent. */}
      <AdSenseScript
        enabled={adsAllowed && adsOnPublicHost && advertisingEnabled}
      />

      {/* Google Analytics 4 (gtag.js), proxied first-party via /gt rewrites
          in next.config.js so ad blockers don't drop the script or hits */}
      {analyticsEnabled && (
        <>
          <Script
            id="gtag-src"
            strategy="afterInteractive"
            src={`/gt/js?id=${GA_MEASUREMENT_ID}`}
          />
          <Script id="gtag-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GA_MEASUREMENT_ID}', {
                transport_url: window.location.origin + '/gt',
                first_party_collection: true,
                send_page_view: false
              });
              window.__ieltsGaConfigured = true;
            `}
          </Script>
        </>
      )}

        <Component {...pageProps} />
        {/* Global Summer Sale reminder — self-gates to signed-in, non-premium
            users and only fires every few graded submits (see the component). */}
        <OfferReminderModal />
        {/* The private /data dashboard is operator-only and excluded from
            telemetry — no consent banner there. */}
        {router.pathname !== '/data' && (
          <ConsentManager onConsentChange={setOptionalConsent} />
        )}
        {analyticsEnabled && <Analytics beforeSend={consentAwareVercelEvent} />}
      </div>
    </AuthProvider>
  );
}

export default MyApp;
