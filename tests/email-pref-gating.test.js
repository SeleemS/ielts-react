// Consent gating for every lifecycle email type (2026-09 study-plan opt-in).
// The table below is the contract: email type x stored prefs x legacy
// newsletter state -> send or skip.
import { describe, expect, it, vi } from 'vitest';
import {
  LIFECYCLE_EMAIL_GATES,
  MARKETING_PREF,
  STUDY_PLAN_PREF,
  emailPrefFor,
  lifecycleEmailAllowed,
} from '../lib/emailPrefs';
import { lifecycleGateFor } from '../pages/api/cron/lifecycle-emails';
import { renderLifecycleEmail } from '../lib/lifecycleEmail';

const YES = { [STUDY_PLAN_PREF]: true, [MARKETING_PREF]: true };
const NO = { [STUDY_PLAN_PREF]: false, [MARKETING_PREF]: false };
const STUDY_ONLY = { [STUDY_PLAN_PREF]: true, [MARKETING_PREF]: false };
const MARKETING_ONLY = { [STUDY_PLAN_PREF]: false, [MARKETING_PREF]: true };

// [emailType, prefs, newsletterSubscribed, expectedAllowed]
const CASES = [
  // Transactional: always sent, whatever the prefs say.
  ['welcome_signup', NO, false, true],
  ['welcome_purchase', NO, false, true],

  // Study-plan types with an explicit answer.
  ['exam_countdown', STUDY_ONLY, false, true],
  ['exam_countdown', NO, true, false],
  ['weekly_progress', STUDY_ONLY, false, true],
  ['weekly_progress', NO, true, false],
  ['streak_at_risk', STUDY_ONLY, false, true],
  ['streak_at_risk', NO, true, false],
  ['checkout_abandoned', STUDY_ONLY, false, true],
  ['checkout_abandoned', NO, true, false],
  ['day2_first_week_plan', STUDY_ONLY, false, true],
  ['day2_first_week_plan', NO, false, false],

  // Marketing types with an explicit answer.
  ['weekly_digest', MARKETING_ONLY, false, true],
  ['weekly_digest', NO, true, false],
  ['win_back', MARKETING_ONLY, false, true],
  ['win_back', NO, true, false],
  ['paywall_followup', MARKETING_ONLY, false, true],
  ['paywall_followup', NO, true, false],

  // A study-plan opt-in never unlocks marketing, and vice versa.
  ['weekly_digest', STUDY_ONLY, false, false],
  ['exam_countdown', MARKETING_ONLY, false, false],

  // Legacy rows (pref never answered): service types keep sending, marketing
  // and progress types fall back to the confirmed newsletter subscription.
  ['exam_countdown', {}, false, true],
  ['checkout_abandoned', {}, false, true],
  ['day2_first_week_plan', {}, false, true],
  ['weekly_progress', {}, false, false],
  ['weekly_progress', {}, true, true],
  ['streak_at_risk', {}, true, true],
  ['weekly_digest', null, false, false],
  ['weekly_digest', null, true, true],
  ['win_back', undefined, true, true],
  ['paywall_followup', {}, true, true],

  // Everything is allowed when both boxes are ticked.
  ...Object.keys(LIFECYCLE_EMAIL_GATES).map((type) => [type, YES, false, true]),
];

describe('lifecycleEmailAllowed', () => {
  it.each(CASES)('%s with %o (newsletter: %s) -> allowed %s', (type, prefs, subscribed, expected) => {
    expect(lifecycleEmailAllowed(type, { prefs, newsletterSubscribed: subscribed, accountCreatedAt: '2026-09-01T00:00:00Z' }).allowed).toBe(
      expected
    );
  });

  it('refuses an unrecognised email type instead of defaulting to send', () => {
    expect(lifecycleEmailAllowed('brand_new_blast', { prefs: YES }).allowed).toBe(false);
    expect(lifecycleEmailAllowed('brand_new_blast', { prefs: YES }).reason).toBe(
      'unknown-email-type'
    );
  });

  it('treats a non-boolean pref value as unanswered', () => {
    expect(
      lifecycleEmailAllowed('weekly_digest', {
        prefs: { [MARKETING_PREF]: 'yes' },
        newsletterSubscribed: false,
      }).allowed
    ).toBe(false);
  });

  it('covers every type the renderer can produce', () => {
    for (const type of Object.keys(LIFECYCLE_EMAIL_GATES)) {
      expect(() =>
        renderLifecycleEmail({ email_type: type, recipient_email: 'a@b.com', payload: {} })
      ).not.toThrow();
    }
  });
});

describe('unsubscribe link per email type', () => {
  const render = (type) =>
    renderLifecycleEmail({ email_type: type, recipient_email: 'learner@example.com', payload: {} });

  it('puts a pref-scoped one-click link in every gated email', () => {
    process.env.EMAIL_UNSUBSCRIBE_SECRET = 'gating-test-secret';
    for (const [type, gate] of Object.entries(LIFECYCLE_EMAIL_GATES)) {
      const { html } = render(type);
      if (!gate.pref) {
        expect(html).not.toContain('/api/newsletter/unsubscribe');
        expect(html).toContain('/dashboard?tab=settings#email-preferences');
        continue;
      }
      expect(html).toContain(`pref=${gate.pref}`);
      expect(html).toMatch(/\/api\/newsletter\/unsubscribe\?email=learner%40example\.com/);
    }
  });

  it('maps the streak and progress emails to the study-plan pref', () => {
    expect(emailPrefFor('streak_at_risk')).toBe(STUDY_PLAN_PREF);
    expect(emailPrefFor('weekly_progress')).toBe(STUDY_PLAN_PREF);
    expect(emailPrefFor('paywall_followup')).toBe(MARKETING_PREF);
  });

  it('shows current and best streak in the streak_at_risk copy', () => {
    const { html, subject } = renderLifecycleEmail({
      email_type: 'streak_at_risk',
      recipient_email: 'learner@example.com',
      payload: { streak: 5, best_streak: 12 },
    });
    expect(subject).toBe('Your 5-day streak ends tonight');
    expect(html).toContain('Current streak: 5 days');
    expect(html).toContain('Your best: 12 days');
    expect(html).toContain('Practise today to keep it.');
  });
});

// The cron-side resolver: it must read prefs first and only fall back to the
// newsletter table when the prefs are silent.
describe('lifecycleGateFor', () => {
  function admin({ prefs = null, subscribed = false, onUsers = () => {}, accountCreatedAt = '2026-09-01T00:00:00Z' } = {}) {
    return {
      from(table) {
        if (table === 'users') {
          onUsers();
          return {
            select: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: { prefs, created_at: accountCreatedAt }, error: null }) }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                is: () => ({
                  maybeSingle: async () => ({
                    data: subscribed ? { email: 'learner@example.com' } : null,
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      },
    };
  }
  const row = {
    email_type: 'weekly_progress',
    recipient_email: 'learner@example.com',
    user_id: 'user-1',
  };

  it('skips the user lookup entirely for transactional email', async () => {
    const onUsers = vi.fn();
    const gate = await lifecycleGateFor(admin({ onUsers }), { ...row, email_type: 'welcome_signup' });
    expect(gate).toMatchObject({ allowed: true, reason: 'transactional' });
    expect(onUsers).not.toHaveBeenCalled();
  });

  it('honours an explicit opt-in without touching the newsletter table', async () => {
    const gate = await lifecycleGateFor(admin({ prefs: STUDY_ONLY }), row);
    expect(gate).toMatchObject({ allowed: true, reason: 'pref-opted-in' });
  });

  it('suppresses an explicit opt-out even for a confirmed newsletter subscriber', async () => {
    const gate = await lifecycleGateFor(admin({ prefs: NO, subscribed: true }), row);
    expect(gate).toMatchObject({ allowed: false, reason: 'pref-opted-out' });
  });

  it('falls back to the newsletter subscription for a legacy account', async () => {
    await expect(lifecycleGateFor(admin({ subscribed: true }), row)).resolves.toMatchObject({
      allowed: true,
      reason: 'legacy-newsletter-subscription',
    });
    await expect(lifecycleGateFor(admin({ subscribed: false }), row)).resolves.toMatchObject({
      allowed: false,
      reason: 'recipient-not-subscribed',
    });
  });

  it('uses the database account date to deny new unanswered study-plan recipients', async () => {
    const gate = await lifecycleGateFor(admin({ subscribed: true, accountCreatedAt: '2026-09-18T22:00:00Z' }), row);
    expect(gate).toMatchObject({ allowed: false, reason: 'study-plan-consent-required' });
  });

  it('keeps sending the exam countdown to legacy accounts that set a date', async () => {
    const gate = await lifecycleGateFor(admin({ subscribed: false }), {
      ...row,
      email_type: 'exam_countdown',
    });
    expect(gate).toMatchObject({ allowed: true, reason: 'legacy-service-basis' });
  });
});


describe('deferred onboarding study-plan consent', () => {
  const types = Object.entries(LIFECYCLE_EMAIL_GATES).filter(([, gate]) => gate.pref === STUDY_PLAN_PREF).map(([type]) => type);
  it.each(types)('%s requires an explicit answer for the new cohort', (type) => {
    const context = { accountCreatedAt: '2026-09-18T22:00:00Z', newsletterSubscribed: true };
    expect(lifecycleEmailAllowed(type, { ...context, prefs: {} })).toMatchObject({ allowed: false, reason: 'study-plan-consent-required' });
    expect(lifecycleEmailAllowed(type, { ...context, prefs: STUDY_ONLY }).allowed).toBe(true);
    expect(lifecycleEmailAllowed(type, { ...context, prefs: NO }).allowed).toBe(false);
  });
  it.each([null, 'invalid-date'])('fails closed for unanswered study-plan prefs with unknown account date %s', (accountCreatedAt) => {
    expect(lifecycleEmailAllowed('checkout_abandoned', { accountCreatedAt, newsletterSubscribed: true }).allowed).toBe(false);
  });
  it('preserves old-account service fallback right before the rollout boundary', () => {
    expect(lifecycleEmailAllowed('checkout_abandoned', { accountCreatedAt: '2026-09-18T21:59:59Z' }).allowed).toBe(true);
  });
  it('keeps transactional and confirmed-newsletter marketing policies unchanged for new accounts', () => {
    const context = { accountCreatedAt: '2026-09-19T00:00:00Z' };
    expect(lifecycleEmailAllowed('welcome_signup', context).allowed).toBe(true);
    expect(lifecycleEmailAllowed('welcome_purchase', context).allowed).toBe(true);
    expect(lifecycleEmailAllowed('weekly_digest', { ...context, newsletterSubscribed: true }).allowed).toBe(true);
    expect(lifecycleEmailAllowed('weekly_digest', context).allowed).toBe(false);
  });
});

describe('unanswered prefs in opt-out regions (Oct 20 2026)', () => {
  const NEW = '2026-10-19T00:00:00Z';
  const studyTypes = Object.entries(LIFECYCLE_EMAIL_GATES).filter(([, gate]) => gate.pref === STUDY_PLAN_PREF).map(([type]) => type);

  it.each(studyTypes)('%s sends to a new account in an opt-out region', (type) => {
    expect(lifecycleEmailAllowed(type, { accountCreatedAt: NEW, region: 'IN', prefs: {} })).toMatchObject({ allowed: true, reason: 'opt-out-region' });
  });

  it.each(['FR', 'GB', 'CH', 'CA', 'AU', 'JP', '', null, 'zz1'])('study plan stays consent-required for region %s', (region) => {
    expect(lifecycleEmailAllowed('day2_first_week_plan', { accountCreatedAt: NEW, region, prefs: {} })).toMatchObject({
      allowed: false,
      reason: 'study-plan-consent-required',
    });
  });

  it('paywall follow-up sends in opt-out regions and fails closed elsewhere', () => {
    expect(lifecycleEmailAllowed('paywall_followup', { accountCreatedAt: NEW, region: 'PK' }).allowed).toBe(true);
    expect(lifecycleEmailAllowed('paywall_followup', { accountCreatedAt: NEW, region: 'DE' }).allowed).toBe(false);
    expect(lifecycleEmailAllowed('paywall_followup', { accountCreatedAt: NEW, region: null }).allowed).toBe(false);
  });

  it('an explicit opt-out always wins over the region default', () => {
    expect(lifecycleEmailAllowed('paywall_followup', { accountCreatedAt: NEW, region: 'IN', prefs: NO }).allowed).toBe(false);
    expect(lifecycleEmailAllowed('day2_first_week_plan', { accountCreatedAt: NEW, region: 'IN', prefs: NO }).allowed).toBe(false);
  });

  it('leaves the weekly digest and win-back on the newsletter basis', () => {
    expect(lifecycleEmailAllowed('weekly_digest', { accountCreatedAt: NEW, region: 'IN' }).allowed).toBe(false);
    expect(lifecycleEmailAllowed('win_back', { accountCreatedAt: NEW, region: 'IN' }).allowed).toBe(false);
  });
});
