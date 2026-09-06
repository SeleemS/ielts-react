import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { billingStatusHeading, billingStatusMessage, canOfferBillingPause } from './billingStatus';

const NOW = Date.parse('2026-07-19T04:35:48.000Z');
beforeEach(() => vi.spyOn(Date, 'now').mockReturnValue(NOW));
afterEach(() => vi.restoreAllMocks());

describe('billing status display', () => {
  it('describes a scheduled cancellation as access that will not renew', () => {
    const message = billingStatusMessage({
      planStatus: 'canceled',
      renewsAt: '2026-08-19T04:35:48.000Z',
      isPremium: true,
    });

    expect(message).toContain('Premium access continues until');
    expect(message).toContain('It will not renew.');
    expect(message).not.toContain('next renewal');
  });

  it('keeps renewal, Exam Pass, and active-pause messages distinct', () => {
    expect(billingStatusMessage({
      planStatus: 'active',
      renewsAt: '2026-08-19T04:35:48.000Z',
      isPremium: true,
    })).toContain('next renewal');

    expect(billingStatusMessage({
      expiresAt: '2026-08-16T04:35:48.000Z',
      isPremium: true,
    })).toContain('Exam Pass ends');

    expect(billingStatusMessage({
      pauseUntil: '2026-07-25T04:35:48.000Z',
      isPremium: false,
      now: new Date('2026-07-19T04:35:48.000Z').getTime(),
    })).toContain('current pause ends');

    expect(billingStatusMessage({
      planStatus: 'paused',
      pauseUntil: '2026-07-18T04:35:48.000Z',
      isPremium: false,
      now: new Date('2026-07-19T04:35:48.000Z').getTime(),
    })).toContain('access returns after Stripe confirms payment');
  });

  it('directs a past-due learner to update payment instead of promising a renewal', () => {
    const message = billingStatusMessage({
      planStatus: 'past_due',
      renewsAt: '2026-08-19T04:35:48.000Z',
      isPremium: true,
    });

    expect(message).toContain('payment is past due');
    expect(message).toContain('Update your payment details');
    expect(message).not.toContain('next renewal');
  });

  it('does not offer another billing pause after cancellation is scheduled', () => {
    const base = {
      isPremium: true,
      renewsAt: '2026-08-19T04:35:48.000Z',
      expiresAt: null,
      pauseUsedAt: null,
    };

    expect(canOfferBillingPause({ ...base, planStatus: 'active' })).toBe(true);
    expect(canOfferBillingPause({ ...base, planStatus: 'trialing' })).toBe(false);
    expect(canOfferBillingPause({ ...base, planStatus: 'canceled' })).toBe(false);
    expect(canOfferBillingPause({ ...base, planStatus: 'past_due' })).toBe(false);
  });
});


describe('billing expiry display boundaries', () => {
  it.each([
    ['expired pass', { expiresAt: '2026-07-19T04:35:48.000Z', planStatus: 'active', isPremium: false }, 'Exam Pass has expired', 'Exam Pass expired'],
    ['future pass', { expiresAt: '2026-07-20T04:35:48.000Z', planStatus: 'active', isPremium: true }, 'Exam Pass is active', 'Exam Pass ends'],
    ['ended cancellation', { renewsAt: '2026-07-19T04:35:48.000Z', planStatus: 'canceled', isPremium: false }, 'Premium has ended', 'Premium access ended'],
    ['paid-through cancellation', { renewsAt: '2026-07-20T04:35:48.000Z', planStatus: 'canceled', isPremium: true }, 'Premium is ending', 'Premium access continues until'],
    ['refunded with retained dates', { expiresAt: '2026-07-20T04:35:48.000Z', planStatus: 'refunded', isPremium: false }, 'Premium is not active', 'refund or dispute'],
    ['pending true pause', { pauseUntil: '2026-07-18T04:35:48.000Z', planStatus: 'paused', isPremium: false }, 'Billing is resuming', 'Stripe confirms payment'],
  ])('%s has truthful heading and detail', (_label, state, heading, detail) => {
    expect(billingStatusHeading({ ...state, now: NOW })).toBe(heading);
    expect(billingStatusMessage({ ...state, now: NOW })).toContain(detail);
  });
});
