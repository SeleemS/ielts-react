// lib/emailPrefs.js
// One source of truth for WHICH lifecycle emails a person has agreed to
// receive.
//
// Two independent consents, both stored on public.users.prefs (jsonb):
//
//   * prefs.study_plan_emails  — the study plan the learner asked for: exam
//     countdown, weekly progress, streak reminders, and the follow-up on a
//     checkout they themselves started. Pre-ticked at onboarding ONLY outside
//     opt-in regions (EU/EEA/UK/CH get an empty box — see src/lib/emailConsent.js).
//   * prefs.marketing_emails   — tips, offers, and win-back. NEVER pre-ticked
//     anywhere, in any region.
//
// Each write also stores `<pref>_at` (ISO timestamp) and an `email_consent`
// audit block ({ basis, region, source, at }) so the record of consent can be
// reconstructed later — basis is 'opt_in' in consent-required regions and
// 'opt_out' elsewhere, region is the resolved two-letter country.
//
// This module is dependency-free so the browser bundle (dashboard preference
// block) and the cron/API routes can share one gate table. The signed
// unsubscribe links live in lib/emailTokens.js, which is server-only.

import { CONSENT_REQUIRED_COUNTRIES } from '../src/lib/consentRegions';

export const STUDY_PLAN_PREF = 'study_plan_emails';
export const MARKETING_PREF = 'marketing_emails';
export const EMAIL_PREFS = [STUDY_PLAN_PREF, MARKETING_PREF];
// Email-first signup defers the preference form; unanswered is not consent.
export const EMAIL_FIRST_SIGNUP_AT = '2026-09-18T22:00:00Z';

// How a missing (never-answered) pref is resolved for legacy accounts, per
// email type. New/unknown-age accounts need explicit study-plan consent:
//   'allow'      — keep sending, exactly as before this pref existed. Used for
//                  the two types whose trigger IS the user's own action: they
//                  handed us an exam date, or they started a checkout.
//   'newsletter' — fall back to the historical basis, an explicit confirmed
//                  newsletter subscription. No regression, no new sending.
// An explicit true/false in prefs always wins over the fallback, in both
// directions, so an unsubscribe click is honored immediately.
export const LIFECYCLE_EMAIL_GATES = {
  // Transactional / service — no marketing gate. Sent because the account
  // exists or a purchase happened.
  welcome_signup: { pref: null },
  welcome_purchase: { pref: null },

  // Study plan.
  exam_countdown: { pref: STUDY_PLAN_PREF, missing: 'allow' },
  weekly_progress: { pref: STUDY_PLAN_PREF, missing: 'newsletter' },
  streak_at_risk: { pref: STUDY_PLAN_PREF, missing: 'newsletter' },
  // Onboarding day-2 plan: the same "here is your study plan" promise, so an
  // explicit study-plan opt-out silences it. Legacy rows keep today's
  // behaviour (this email was never gated).
  day2_first_week_plan: { pref: STUDY_PLAN_PREF, missing: 'allow' },
  // checkout_abandoned is a follow-up on a transaction the USER started
  // minutes earlier: it restates the money-back guarantee and offers no
  // discount. That is a service message about their own initiated action
  // (soft opt-in), not a broadcast offer, so it rides on the study-plan
  // consent rather than the marketing one — and legacy rows keep receiving it.
  checkout_abandoned: { pref: STUDY_PLAN_PREF, missing: 'allow' },

  // Marketing. paywall_followup is deliberately NOT study-plan: its trigger is
  // merely seeing a paywall, and its content is an upgrade pitch, so it is a
  // promotional message and needs the marketing consent (this also matches the
  // pre-existing MARKETING_EMAIL_TYPES classification).
  // Unanswered resolves like free_report_offer: opt-out regions only (Oct 20
  // 2026, founder-approved — 125 of 129 follow-ups in the prior 14 days were
  // suppressed because almost nobody ever answers the preference form).
  paywall_followup: { pref: MARKETING_PREF, missing: 'region_opt_out' },
  // One email, once per learner, after their first free Writing report: a
  // real 40%-off Week Pass coupon valid 48h from the report. Promotional, so
  // marketing consent; an unanswered pref is treated as opt-out consent ONLY
  // where commercial email may be sent on that basis (see
  // MARKETING_OPT_IN_COUNTRIES). Explicit opt-outs always win, and the email
  // carries a one-click unsubscribe (Oct 18 2026, founder-approved).
  free_report_offer: { pref: MARKETING_PREF, missing: 'region_opt_out' },
  weekly_digest: { pref: MARKETING_PREF, missing: 'newsletter' },
  win_back: { pref: MARKETING_PREF, missing: 'newsletter' },
};

// Countries where promotional email needs prior opt-in consent: the
// EU/EEA/UK/CH set used for onboarding, plus Canada (CASL), Australia and New
// Zealand (Spam Acts), Japan and South Korea. Unknown regions fail closed.
export const MARKETING_OPT_IN_COUNTRIES = new Set([
  ...CONSENT_REQUIRED_COUNTRIES,
  'CA', 'AU', 'NZ', 'JP', 'KR',
]);

export function marketingOptOutRegion(region) {
  const code = String(region || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) && !MARKETING_OPT_IN_COUNTRIES.has(code);
}

// true / false / null ("never answered"). Anything else is treated as
// unanswered rather than as consent.
export function normalizePrefValue(value) {
  if (value === true) return true;
  if (value === false) return false;
  return null;
}

export function readEmailPref(prefs, name) {
  if (!prefs || typeof prefs !== 'object') return null;
  return normalizePrefValue(prefs[name]);
}

// Which consent (if any) an email type needs. Unknown types are refused: a
// template that does not exist cannot be rendered anyway, and defaulting to
// "send" for an unrecognised type is the wrong failure direction.
export function emailPrefFor(emailType) {
  return LIFECYCLE_EMAIL_GATES[emailType]?.pref ?? null;
}

// The decision itself — pure, table-driven, unit-tested in
// tests/email-pref-gating.test.js.
//
//   emailType           lifecycle_emails.email_type
//   prefs               the recipient's public.users.prefs (or null)
//   newsletterSubscribed  confirmed + not unsubscribed in newsletter_subscribers
//   accountCreatedAt      trusted users.created_at, not user-editable metadata
export function lifecycleEmailAllowed(
  emailType,
  { prefs = null, newsletterSubscribed = false, accountCreatedAt = null, region = null } = {}
) {
  const gate = LIFECYCLE_EMAIL_GATES[emailType];
  if (!gate) return { allowed: false, pref: null, reason: 'unknown-email-type' };
  if (!gate.pref) return { allowed: true, pref: null, reason: 'transactional' };

  const stored = readEmailPref(prefs, gate.pref);
  if (stored === true) return { allowed: true, pref: gate.pref, reason: 'pref-opted-in' };
  if (stored === false) return { allowed: false, pref: gate.pref, reason: 'pref-opted-out' };

  const createdAt = Date.parse(accountCreatedAt);
  // Only a known pre-rollout account qualifies for legacy study-plan fallbacks.
  // Newer accounts that never answered get the study plan only where email may
  // be sent on an opt-out basis — the same region rule as the pre-ticked
  // onboarding box, using the stricter marketing country list. Missing/invalid
  // account dates or regions fail closed; explicit answers still win above.
  if (gate.pref === STUDY_PLAN_PREF
    && (!Number.isFinite(createdAt) || createdAt >= Date.parse(EMAIL_FIRST_SIGNUP_AT))) {
    return marketingOptOutRegion(region)
      ? { allowed: true, pref: gate.pref, reason: 'opt-out-region' }
      : { allowed: false, pref: gate.pref, reason: 'study-plan-consent-required' };
  }

  if (gate.missing === 'region_opt_out' && marketingOptOutRegion(region)) {
    return { allowed: true, pref: gate.pref, reason: 'opt-out-region' };
  }
  if (gate.missing === 'allow') {
    return { allowed: true, pref: gate.pref, reason: 'legacy-service-basis' };
  }
  return newsletterSubscribed
    ? { allowed: true, pref: gate.pref, reason: 'legacy-newsletter-subscription' }
    : { allowed: false, pref: gate.pref, reason: 'recipient-not-subscribed' };
}
