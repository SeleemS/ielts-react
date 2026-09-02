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

export const STUDY_PLAN_PREF = 'study_plan_emails';
export const MARKETING_PREF = 'marketing_emails';
export const EMAIL_PREFS = [STUDY_PLAN_PREF, MARKETING_PREF];

// How a missing (never-answered) pref is resolved, per email type:
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
  paywall_followup: { pref: MARKETING_PREF, missing: 'newsletter' },
  weekly_digest: { pref: MARKETING_PREF, missing: 'newsletter' },
  win_back: { pref: MARKETING_PREF, missing: 'newsletter' },
};

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
export function lifecycleEmailAllowed(
  emailType,
  { prefs = null, newsletterSubscribed = false } = {}
) {
  const gate = LIFECYCLE_EMAIL_GATES[emailType];
  if (!gate) return { allowed: false, pref: null, reason: 'unknown-email-type' };
  if (!gate.pref) return { allowed: true, pref: null, reason: 'transactional' };

  const stored = readEmailPref(prefs, gate.pref);
  if (stored === true) return { allowed: true, pref: gate.pref, reason: 'pref-opted-in' };
  if (stored === false) return { allowed: false, pref: gate.pref, reason: 'pref-opted-out' };

  if (gate.missing === 'allow') {
    return { allowed: true, pref: gate.pref, reason: 'legacy-service-basis' };
  }
  return newsletterSubscribed
    ? { allowed: true, pref: gate.pref, reason: 'legacy-newsletter-subscription' }
    : { allowed: false, pref: gate.pref, reason: 'recipient-not-subscribed' };
}
