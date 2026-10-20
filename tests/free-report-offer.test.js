import { describe, expect, it } from 'vitest';
import { lifecycleEmailAllowed } from '../lib/emailPrefs';
import { renderLifecycleEmail } from '../lib/lifecycleEmail';
import { REPORT_OFFER, reportOfferEligible, reportOfferEndsAt, reportOfferPrice } from '../lib/reportOffer';

const NEW_ACCOUNT = '2026-10-18T08:00:00Z';

describe('free_report_offer consent gate', () => {
  const gate = (opts) => lifecycleEmailAllowed('free_report_offer', { accountCreatedAt: NEW_ACCOUNT, ...opts });

  it('sends on an opt-out basis only where commercial email allows it', () => {
    expect(gate({ region: 'IN' })).toMatchObject({ allowed: true, reason: 'opt-out-region' });
    expect(gate({ region: 'mn' }).allowed).toBe(true);
    expect(gate({ region: 'US' }).allowed).toBe(true);
  });

  it('needs explicit opt-in in EU/EEA/UK/CH, Canada, Australia, NZ, Japan, Korea and unknown regions', () => {
    for (const region of ['DE', 'FR', 'GB', 'CH', 'NO', 'CA', 'AU', 'NZ', 'JP', 'KR', '', null, 'XYZ']) {
      expect(gate({ region }).allowed).toBe(false);
    }
    expect(gate({ region: 'DE', prefs: { marketing_emails: true } }).allowed).toBe(true);
    expect(gate({ region: 'DE', newsletterSubscribed: true }).allowed).toBe(true);
  });

  it('always honours an explicit opt-out', () => {
    expect(gate({ region: 'IN', prefs: { marketing_emails: false } })).toMatchObject({ allowed: false, reason: 'pref-opted-out' });
  });

  it('leaves the digest and win-back emails on their old rule', () => {
    expect(lifecycleEmailAllowed('weekly_digest', { region: 'IN', accountCreatedAt: NEW_ACCOUNT }).allowed).toBe(false);
    expect(lifecycleEmailAllowed('win_back', { region: 'IN', accountCreatedAt: NEW_ACCOUNT }).allowed).toBe(false);
  });
});

describe('report offer rules', () => {
  const now = Date.parse('2026-10-18T12:00:00Z');
  it('is open for 48 hours after the first report, to never-paid learners only', () => {
    const user = { plan_sku: null, premium_since: null };
    expect(reportOfferEligible({ firstReportAt: '2026-10-17T12:00:01Z', userRow: user, now })).toBe(true);
    expect(reportOfferEligible({ firstReportAt: '2026-10-16T12:00:00Z', userRow: user, now })).toBe(false);
    expect(reportOfferEligible({ firstReportAt: null, userRow: user, now })).toBe(false);
    expect(reportOfferEligible({ firstReportAt: '2026-10-18T11:00:00Z', userRow: { plan_sku: 'exam_pass' }, now })).toBe(false);
  });
  it('computes the deadline and price', () => {
    expect(reportOfferEndsAt('2026-10-18T10:00:00Z')).toBe('2026-10-20T10:00:00.000Z');
    expect(reportOfferPrice(4.99)).toBe(2.99);
    expect(REPORT_OFFER.sku).toBe('week_pass');
  });
});

describe('free_report_offer email', () => {
  const row = {
    email_type: 'free_report_offer',
    recipient_email: 'learner@example.com',
    payload: {
      report_id: '10000000-0000-4000-8000-000000000001',
      band: 6.5,
      offer_expires_at: '2026-10-20T10:00:00.000Z',
    },
  };

  it('states the real discount, deadline and terms, and links to the offer', () => {
    const { subject, html } = renderLifecycleEmail(row);
    expect(subject).toContain('Band is 6.5'.replace('Band', 'band'));
    expect(subject).toContain('40% off for 48 hours');
    expect(html).toContain('40% off');
    expect(html).toContain('October 20');
    expect(html).toContain('no auto-renew');
    expect(html).toContain('14-day money-back guarantee');
    const href = html.match(/href="(https:\/\/www\.ielts-bank\.com\/pricing\?[^"]+)"/)[1].replace(/&amp;/g, '&');
    const url = new URL(href);
    expect(url.searchParams.get('offer')).toBe('report48');
    expect(url.searchParams.get('return_to')).toBe('/writing-report/10000000-0000-4000-8000-000000000001');
    expect(url.hash).toBe('#week-pass');
  });

  it('carries a one-click marketing unsubscribe', () => {
    process.env.EMAIL_UNSUBSCRIBE_SECRET = 'test-secret';
    const { html } = renderLifecycleEmail(row);
    delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
    expect(html).toContain('Unsubscribe from tips and offers');
  });
});
