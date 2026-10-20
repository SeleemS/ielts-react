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

// Persist the two sign-up checkboxes once the new account has a session.
// Never overwrites an earlier answer (email_consent already present) and never
// throws: a failed save leaves the prefs unanswered, which the server resolves
// per region (lib/emailPrefs.js). Returns true when the answer was stored.
export async function saveSignupEmailConsent(supabase, { studyPlan, marketing, source = 'signup' }) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return false;
    // The public.users row is created by a trigger on sign-up; allow it a
    // moment to appear before giving up.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { data: row } = await supabase.from('users').select('prefs').eq('id', userId).maybeSingle();
      if (row) {
        if (row.prefs?.email_consent) return false;
        const prefs = withEmailConsent(row.prefs, { studyPlan, marketing, source });
        const { data, error } = await supabase
          .from('users')
          .update({ prefs })
          .eq('id', userId)
          .select('id')
          .maybeSingle();
        return Boolean(data && !error);
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  } catch {
    // Fall through: unanswered.
  }
  return false;
}
