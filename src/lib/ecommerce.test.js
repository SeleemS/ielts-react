import { beforeEach, describe, expect, it, vi } from 'vitest';

const trackMock = vi.fn();
vi.mock('./analytics', () => ({
  track: (...args) => trackMock(...args),
}));

import { PROMO } from './saleConfig';
import {
  ITEM_LIST_ID,
  planItem,
  promotionId,
  trackBeginCheckout,
  trackPurchase,
  trackSelectItem,
  trackSelectPromotion,
  trackViewItemList,
  trackViewPromotion,
} from './ecommerce';

beforeEach(() => {
  trackMock.mockClear();
});

describe('planItem', () => {
  it('derives the GA4 item from saleConfig (global)', () => {
    expect(planItem('monthly', false)).toEqual({
      item_id: 'pro_monthly',
      item_name: 'Pro Monthly',
      item_category: 'subscription',
      item_variant: 'global',
      price: 8.99,
      // No promo is configured, so there is no discount to report. This is the
      // regression guard for the removed fictitious anchors: `discount` must
      // never carry a marketing "was" delta again.
      discount: 0,
      quantity: 1,
    });
    expect(planItem('annual', false)).toMatchObject({
      item_id: 'pro_annual',
      price: 49.99,
      discount: 0,
    });
  });

  it('categorises the one-time Exam Pass separately from subscriptions', () => {
    expect(planItem('exam_pass', false)).toMatchObject({
      item_id: 'pro_exam_pass',
      item_name: 'Pro Exam Pass',
      item_category: 'one_time',
      price: 14.99,
    });
  });

  it('derives PPP variants and rejects retired or unknown SKUs', () => {
    expect(planItem('annual', true)).toMatchObject({
      item_variant: 'ppp',
      price: 19.99,
    });
    expect(planItem('exam_pass', true)).toMatchObject({ price: 5.99 });
    expect(planItem('3month', false)).toBeNull();
    expect(planItem('6month', false)).toBeNull();
  });
});

describe('funnel events', () => {
  it('view_item_list carries every sellable plan in card order', () => {
    trackViewItemList(false);
    const [event, params] = trackMock.mock.calls[0];
    expect(event).toBe('view_item_list');
    expect(params.item_list_id).toBe(ITEM_LIST_ID);
    expect(params.items.map((item) => item.item_id)).toEqual([
      'pro_monthly',
      'pro_annual',
      'pro_exam_pass',
    ]);
  });

  it('view_item_list follows the PPP card order', () => {
    trackViewItemList(true);
    expect(trackMock.mock.calls[0][1].items.map((item) => item.item_id)).toEqual([
      'pro_monthly',
      'pro_exam_pass',
      'pro_annual',
    ]);
  });

  it('select_item and begin_checkout carry value + currency scalars for the first-party sink', () => {
    trackSelectItem('annual', false);
    trackBeginCheckout('annual', false, 'pricing');
    expect(trackMock).toHaveBeenCalledTimes(2);
    for (const [, params] of trackMock.mock.calls) {
      expect(params.value).toBe(49.99);
      expect(params.currency).toBe('USD');
      expect(params.sku).toBe('annual');
      expect(params.items).toHaveLength(1);
    }
  });

  it('begin_checkout reports the Exam Pass as a one-time purchase', () => {
    trackBeginCheckout('exam_pass', true, 'pricing');
    const [, params] = trackMock.mock.calls[0];
    expect(params.value).toBe(5.99);
    expect(params.items[0].item_category).toBe('one_time');
    // No promo is configured, so no coupon may be claimed on the event.
    expect(params.coupon).toBeUndefined();
  });

  it('ignores a select_item for a retired plan', () => {
    trackSelectItem('3month', false);
    expect(trackMock).not.toHaveBeenCalled();
  });

  it('purchase prefers the charged Stripe amount over the display price', () => {
    trackPurchase({
      transactionId: 'cs_live_123',
      sku: 'monthly',
      ppp: false,
      amountMinor: 539, // e.g. winback coupon applied
      currency: 'usd',
    });
    const [event, params] = trackMock.mock.calls[0];
    expect(event).toBe('purchase');
    expect(params.transaction_id).toBe('cs_live_123');
    expect(params.value).toBe(5.39);
    expect(params.currency).toBe('USD');
    expect(params.items[0].price).toBe(5.39);
  });

  it('purchase falls back to the advertised price and requires identifiers', () => {
    trackPurchase({ transactionId: 'cs_live_456', sku: 'annual' });
    expect(trackMock.mock.calls[0][1].value).toBe(49.99);

    trackMock.mockClear();
    trackPurchase({ sku: 'monthly' });
    trackPurchase({ transactionId: 'cs_live_789', sku: 'retired_plan' });
    expect(trackMock).not.toHaveBeenCalled();
  });

  it('reports the real coupon on the funnel once a promo is live', () => {
    const saved = { ...PROMO };
    Object.assign(PROMO, {
      active: true,
      couponId: 'IELTSBANK_SEPT30',
      percentOff: 30,
      endsAt: new Date(Date.now() + 86400000).toISOString(),
      appliesTo: ['annual'],
    });
    try {
      trackBeginCheckout('annual', false, 'pricing');
      trackViewPromotion('pricing_banner');
      const [, checkout] = trackMock.mock.calls[0];
      expect(checkout.coupon).toBe('IELTSBANK_SEPT30');
      expect(checkout.value).toBe(34.99);
      expect(checkout.items[0].discount).toBe(15);
      expect(trackMock.mock.calls[1]).toEqual([
        'view_promotion',
        expect.objectContaining({
          promotion_id: 'IELTSBANK_SEPT30',
          promotion_name: PROMO.name,
          creative_slot: 'pricing_banner',
        }),
      ]);
    } finally {
      Object.assign(PROMO, saved);
    }
  });

  it('emits no promotion events while no real coupon-backed promo is live', () => {
    trackViewPromotion('pricing_banner');
    trackSelectPromotion('reminder_modal');
    expect(trackMock).not.toHaveBeenCalled();
    expect(promotionId()).toBe('pro_promo');
  });
});
