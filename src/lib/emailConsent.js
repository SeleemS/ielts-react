// src/lib/emailConsent.js
// Client side of the email-consent contract (server side: lib/emailPrefs.js).
//
// Region rule, mirroring the analytics consent flow in src/lib/consent.js:
// visitors geolocated to an opt-in region (EU/EEA/UK/CH, and any request where
// geo is missing — it fails closed) see NOTHING pre-ticked. Everywhere else the
// study-plan box — a service the learner is signing up for — starts ticked,
// while the marketing box starts unticked in every region, always.
//
// Every write records what was agreed, when, and on which legal basis, so the
// consent record can be reconstructed from public.users.prefs alone.

import { MARKETING_PREF, STUDY_PLAN_PREF } from '../../lib/emailPrefs';
import { optionalConsentDefault } from './consent';

export { MARKETING_PREF, STUDY_PLAN_PREF };

// True in the EU/EEA/UK/Switzerland (and when geo is unknown).
export function emailConsentOptInRegion() {
  return optionalConsentDefault() !== 'granted';
}

// The default tick state offered at onboarding.
export function defaultEmailOptIns(optInRegion = emailConsentOptInRegion()) {
  return { studyPlan: !optInRegion, marketing: false };
}

// Two-letter country resolved by middleware.js into the `ib_country` cookie.
// Display/audit only — never a gate on its own.
export function consentRegionCode() {
  if (typeof document === 'undefined') return '';
  try {
    const match = document.cookie.match(/(?:^|;\s*)ib_country=([^;]*)/);
    const value = match ? decodeURIComponent(match[1]).toUpperCase() : '';
    return /^[A-Z]{2}$/.test(value) ? value : '';
  } catch {
    return '';
  }
}

// Merge the two answers, their timestamps, and the audit block into an
// existing prefs object. Pure — callers persist the result.
export function withEmailConsent(prefs, { studyPlan, marketing, source, at = new Date() }) {
  const stamp = at instanceof Date ? at.toISOString() : new Date(at).toISOString();
  const optInRegion = emailConsentOptInRegion();
  return {
    ...(prefs && typeof prefs === 'object' ? prefs : {}),
    [STUDY_PLAN_PREF]: Boolean(studyPlan),
    [`${STUDY_PLAN_PREF}_at`]: stamp,
    [MARKETING_PREF]: Boolean(marketing),
    [`${MARKETING_PREF}_at`]: stamp,
    email_consent: {
      basis: optInRegion ? 'opt_in' : 'opt_out',
      region: consentRegionCode() || null,
      source,
      at: stamp,
    },
  };
}
