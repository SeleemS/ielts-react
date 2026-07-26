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
import { PLANS, SALE, isSaleLive, planPricing } from './saleConfig';

export const ITEM_LIST_ID = 'pricing_pro_plans';
export const PROMOTION_ID = 'summer_sale_2026';

const ITEM_IDS = { monthly: 'pro_monthly', '3month': 'pro_3month' };

// GA4 item for one plan in one region. `price` is the real charged price;
// `discount` is the struck-anchor delta so promo reporting matches the page.
export function planItem(sku, ppp = false) {
  const pricing = planPricing(sku, ppp);
  if (!pricing) return null;
  return {
    item_id: ITEM_IDS[sku] || `pro_${sku}`,
    item_name: `Pro ${pricing.name}`,
    item_category: 'subscription',
    item_variant: ppp ? 'ppp' : 'global',
    price: pricing.sale,
    discount: pricing.savings,
    quantity: 1,
  };
}

function saleCoupon() {
  return isSaleLive() ? PROMOTION_ID : undefined;
}

// The scalar mirror of one item for the first-party sink.
function flatPlanProps(sku, ppp) {
  const pricing = planPricing(sku, ppp);
  return {
    sku,
    ppp: Boolean(ppp),
    value: pricing ? pricing.sale : null,
    currency: 'USD',
  };
}

export function trackViewItemList(ppp = false, source = 'pricing') {
  track('view_item_list', {
    item_list_id: ITEM_LIST_ID,
    item_list_name: 'Pro plans',
    items: Object.keys(PLANS).map((sku) => planItem(sku, ppp)),
    ppp: Boolean(ppp),
    source,
  });
}

export function trackSelectItem(sku, ppp = false) {
  track('select_item', {
    item_list_id: ITEM_LIST_ID,
    item_list_name: 'Pro plans',
    items: [planItem(sku, ppp)],
    ...flatPlanProps(sku, ppp),
  });
}

export function trackBeginCheckout(sku, ppp = false, source = 'pricing') {
  track('begin_checkout', {
    coupon: saleCoupon(),
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
        ? pricing.sale
        : null;
  if (value == null) return;
  track('purchase', {
    transaction_id: transactionId,
    value,
    currency: String(currency || 'USD').toUpperCase(),
    coupon: saleCoupon(),
    items: [{ ...planItem(sku, ppp), price: value }],
    sku,
    ppp: Boolean(ppp),
    source,
  });
}

// Promotion impressions/clicks for the sale chrome (banner, reminder modal).
export function trackViewPromotion(creativeSlot) {
  track('view_promotion', {
    promotion_id: PROMOTION_ID,
    promotion_name: SALE.name,
    creative_slot: creativeSlot,
  });
}

export function trackSelectPromotion(creativeSlot) {
  track('select_promotion', {
    promotion_id: PROMOTION_ID,
    promotion_name: SALE.name,
    creative_slot: creativeSlot,
  });
}
