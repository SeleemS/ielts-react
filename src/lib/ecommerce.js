// src/lib/ecommerce.js
// GA4 ecommerce events for the Pro purchase funnel, derived from saleConfig so
// analytics can never drift from the advertised prices.
//
// Every helper goes through track(), which fans out to BOTH sinks:
//   * GA4 (gtag) receives the full payload including the `items` array —
//     view_item_list / select_item / begin_checkout / purchase populate the
//     Monetization reports (items + value + currency + transaction_id).
//   * /api/track (activity_events) stores the scalar props only (its
//     safeProps drops arrays), so the flat sku/value/currency/transaction_id
//     fields below are what the /data dashboard queries.
//
// GA4 deduplicates purchase events by transaction_id, which lets the
// client-side purchase event and the webhook Measurement Protocol backstop
// (lib/billing.js) both report the same checkout session safely.

import { track } from './analytics';
import { PLANS, PROMO, isPromoLive, planOrder, planPricing, promoAppliesTo } from './saleConfig';

export const ITEM_LIST_ID = 'pricing_pro_plans';

// GA4 promotion id for the current promo. Falls back to a stable literal so
// promotion events never emit `undefined` while no promo is configured.
export function promotionId() {
  return PROMO.couponId || 'pro_promo';
}

const ITEM_IDS = {
  monthly: 'pro_monthly',
  annual: 'pro_annual',
  exam_pass: 'pro_exam_pass',
};

// GA4 item for one plan in one region. `price` is what the visitor actually
// pays; `discount` is the real coupon delta (0 unless a promo is live), never
// a marketing anchor.
export function planItem(sku, ppp = false) {
  const pricing = planPricing(sku, ppp);
  if (!pricing) return null;
  return {
    item_id: ITEM_IDS[sku] || `pro_${sku}`,
    item_name: `Pro ${pricing.name}`,
    item_category: pricing.isOneTime ? 'one_time' : 'subscription',
    item_variant: ppp ? 'ppp' : 'global',
    price: pricing.price,
    discount: pricing.savings,
    quantity: 1,
  };
}

// GA4 `coupon` for a plan: present only when a real coupon is attached.
function planCoupon(sku) {
  return promoAppliesTo(sku) ? promotionId() : undefined;
}

// The scalar mirror of one item for the first-party sink.
function flatPlanProps(sku, ppp) {
  const pricing = planPricing(sku, ppp);
  return {
    sku,
    ppp: Boolean(ppp),
    value: pricing ? pricing.price : null,
    currency: 'USD',
  };
}

export function trackViewItemList(ppp = false, source = 'pricing') {
  track('view_item_list', {
    item_list_id: ITEM_LIST_ID,
    item_list_name: 'Pro plans',
    items: planOrder(ppp).map((sku) => planItem(sku, ppp)),
    ppp: Boolean(ppp),
    source,
  });
}

export function trackSelectItem(sku, ppp = false) {
  if (!PLANS[sku]) return;
  track('select_item', {
    item_list_id: ITEM_LIST_ID,
    item_list_name: 'Pro plans',
    items: [planItem(sku, ppp)],
    ...flatPlanProps(sku, ppp),
  });
}

export function trackBeginCheckout(sku, ppp = false, source = 'pricing') {
  track('begin_checkout', {
    coupon: planCoupon(sku),
    items: [planItem(sku, ppp)],
    ...flatPlanProps(sku, ppp),
    source,
  });
}

// transactionId should be the Stripe Checkout Session id (or another id that
// is stable across retries) so GA4 deduplication works. amountMinor/currency
// come from the verified session when available so the reported revenue is
// what Stripe actually charged (promo codes included), not the display price.
export function trackPurchase({
  transactionId,
  sku,
  ppp = false,
  amountMinor = null,
  currency = 'USD',
  source = 'pricing',
}) {
  if (!transactionId || !sku) return;
  const pricing = planPricing(sku, ppp);
  const value =
    amountMinor != null && Number.isFinite(Number(amountMinor))
      ? Math.round(Number(amountMinor)) / 100
      : pricing
        ? pricing.price
        : null;
  if (value == null) return;
  track('purchase', {
    transaction_id: transactionId,
    value,
    currency: String(currency || 'USD').toUpperCase(),
    coupon: planCoupon(sku),
    items: [{ ...planItem(sku, ppp), price: value }],
    sku,
    ppp: Boolean(ppp),
    source,
  });
}

// Promotion impressions/clicks for the promo chrome (banner, reminder modal).
// These only fire while a real coupon-backed promo is live.
export function trackViewPromotion(creativeSlot) {
  if (!isPromoLive()) return;
  track('view_promotion', {
    promotion_id: promotionId(),
    promotion_name: PROMO.name,
    creative_slot: creativeSlot,
  });
}

export function trackSelectPromotion(creativeSlot) {
  if (!isPromoLive()) return;
  track('select_promotion', {
    promotion_id: promotionId(),
    promotion_name: PROMO.name,
    creative_slot: creativeSlot,
  });
}
