import { beforeEach, describe, expect, it, vi } from 'vitest';

const trackMock = vi.fn();
vi.mock('./analytics', () => ({
  track: (...args) => trackMock(...args),
}));

import {
  ITEM_LIST_ID,
  PROMOTION_ID,
  planItem,
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
      discount: 6,
      quantity: 1,
    });
    expect(planItem('3month', false)).toMatchObject({
      item_id: 'pro_3month',
      price: 19.99,
      discount: 15,
    });
  });

  it('derives PPP variants and rejects unknown SKUs', () => {
    expect(planItem('3month', true)).toMatchObject({
      item_variant: 'ppp',
      price: 8.99,
      discount: 3,
    });
    expect(planItem('6month', false)).toBeNull();
  });
});

describe('funnel events', () => {
  it('view_item_list carries every sellable plan', () => {
    trackViewItemList(false);
    const [event, params] = trackMock.mock.calls[0];
    expect(event).toBe('view_item_list');
    expect(params.item_list_id).toBe(ITEM_LIST_ID);
    expect(params.items.map((item) => item.item_id)).toEqual([
      'pro_monthly',
      'pro_3month',
    ]);
  });

  it('select_item and begin_checkout carry value + currency scalars for the first-party sink', () => {
    trackSelectItem('3month', false);
    trackBeginCheckout('3month', false, 'pricing');
    for (const [, params] of trackMock.mock.calls) {
      expect(params.value).toBe(19.99);
      expect(params.currency).toBe('USD');
      expect(params.sku).toBe('3month');
      expect(params.items).toHaveLength(1);
    }
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
    trackPurchase({ transactionId: 'cs_live_456', sku: '3month' });
    expect(trackMock.mock.calls[0][1].value).toBe(19.99);

    trackMock.mockClear();
    trackPurchase({ sku: 'monthly' });
    trackPurchase({ transactionId: 'cs_live_789', sku: 'retired_plan' });
    expect(trackMock).not.toHaveBeenCalled();
  });

  it('promotion events name the sale and slot', () => {
    trackViewPromotion('pricing_banner');
    trackSelectPromotion('reminder_modal');
    expect(trackMock.mock.calls[0]).toEqual([
      'view_promotion',
      expect.objectContaining({
        promotion_id: PROMOTION_ID,
        promotion_name: 'Summer Sale',
        creative_slot: 'pricing_banner',
      }),
    ]);
    expect(trackMock.mock.calls[1][0]).toBe('select_promotion');
  });
});
