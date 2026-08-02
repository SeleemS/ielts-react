import React, { useEffect, useRef, useState } from 'react';
import NextLink from 'next/link';
import {
  readOptionalConsent,
  writeOptionalConsent,
  consentDecided,
  optionalDefaultsOn,
} from '../lib/consent';
import { track } from '../lib/analytics';

// Consent banner mirroring the geo-aware Google Consent Mode defaults set in
// pages/_document.js. In opt-out regions optional analytics/ads are ON by
// default and this discloses that + offers a one-click opt-out; in
// EU/EEA/UK/Switzerland or when geo is unavailable (opt-in), they are off until
// the visitor accepts. GPC is always honored.
// Choice persists in localStorage and the banner reopens via the floating
// "Privacy choices" button.

function updateConsent(choice) {
  const gtag = window.gtag;
  if (typeof gtag !== 'function') return;
  const optional = choice === 'granted' ? 'granted' : 'denied';
  gtag('consent', 'update', {
    analytics_storage: optional,
    ad_storage: optional,
    ad_user_data: optional,
    ad_personalization: optional,
    functionality_storage: 'granted',
    security_storage: 'granted',
  });
}

const MODAL_SELECTOR = '[role="dialog"][aria-modal="true"]';

// A consent choice is PERMANENT (localStorage, 'denied' silences every client
// analytics event forever), so it must never ride on a click the visitor did
// not aim at this banner. The banner sits fixed at the bottom of the viewport,
// under app modals (sign-in/onboarding dialog, z-2000 vs z-100): when such a
// modal closes, its call-to-action disappears from over these buttons, and the
// visitor's next tap — aimed at UI that was there a moment ago — lands here.
// That is exactly how buyers' analytics streams were dying at onboarding
// completion (Jul 2026): an unintended "Reject optional cookies" leaves no
// trace and permanently kills tracking. Ignore choices while a modal is open
// or within this grace window of a modal closing / the banner (re)appearing.
const ACCIDENT_GUARD_MS = 750;

export default function ConsentManager({ onConsentChange }) {
  const [open, setOpen] = useState(false);
  const guardRef = useRef({ modalOpen: false, modalClosedAt: 0, bannerShownAt: 0 });

  useEffect(() => {
    // Push the effective region-aware state into Consent Mode and show the
    // notice until the visitor has decided.
    updateConsent(readOptionalConsent());
    if (!consentDecided()) setOpen(true);
  }, []);

  useEffect(() => {
    if (open) guardRef.current.bannerShownAt = Date.now();
  }, [open]);

  // Track whether an app modal is (or just was) covering the page, so a tap
  // aimed at a closing modal can never register as a privacy decision.
  useEffect(() => {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return undefined;
    const sync = () => {
      const present = Boolean(document.querySelector(MODAL_SELECTOR));
      const state = guardRef.current;
      if (present && !state.modalOpen) {
        state.modalOpen = true;
      } else if (!present && state.modalOpen) {
        state.modalOpen = false;
        state.modalClosedAt = Date.now();
      }
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const choose = (choice) => {
    const state = guardRef.current;
    const now = Date.now();
    if (
      state.modalOpen ||
      now - state.modalClosedAt < ACCIDENT_GUARD_MS ||
      now - state.bannerShownAt < ACCIDENT_GUARD_MS
    ) {
      // Almost certainly not a considered choice — keep the banner up; a real
      // decision a moment later goes through untouched.
      return;
    }
    // Record the opt-out while consent is still in effect: a 'denied' choice
    // silences every later client event, so without this final marker a
    // visitor's stream just stops dead with no explanation in activity_events
    // (Art. 7 GDPR also requires being able to demonstrate consent state).
    if (choice === 'denied') {
      track('consent_updated', { choice: 'denied' }, { firstPartyOnly: true });
    }
    const resolvedChoice = writeOptionalConsent(choice);
    updateConsent(resolvedChoice);
    if (resolvedChoice === 'granted') {
      track('consent_updated', { choice: 'granted' }, { firstPartyOnly: true });
    }
    onConsentChange?.(resolvedChoice);
    setOpen(false);
  };
  return (
    <>
      {open && (
        <aside
          className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-2xl rounded-2xl border border-border bg-background p-5 shadow-2xl"
          aria-label="Cookie consent"
          data-nosnippet
          data-analytics-popup="cookie_consent"
          data-analytics-label="Cookie consent"
        >
          <h2 className="font-bold text-foreground">Your privacy choices</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {optionalDefaultsOn()
              ? 'We use analytics and advertising to improve the site and keep practice free — these are on by default. You can opt out of optional analytics and personalized-ad storage anytime. Essential storage always stays on.'
              : 'We’d like to use optional analytics and advertising to improve the site and keep practice free. They stay off until you accept — you can accept or reject below. Essential storage always stays on.'}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={() => choose('granted')}
              className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Accept optional cookies
            </button>
            <button
              onClick={() => choose('denied')}
              className="rounded-lg border border-border bg-background px-5 py-2.5 text-sm font-semibold text-foreground"
            >
              Reject optional cookies
            </button>
            <NextLink href="/privacypolicy" className="px-2 py-2.5 text-sm font-medium text-primary underline">
              Privacy policy
            </NextLink>
          </div>
        </aside>
      )}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-3 left-3 z-40 rounded-full border border-border bg-background px-3 py-2 text-xs text-muted-foreground shadow"
          data-nosnippet
          data-analytics-id="privacy_choices_open"
        >
          Privacy choices
        </button>
      )}
    </>
  );
}
