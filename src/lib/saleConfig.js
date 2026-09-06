// src/lib/saleConfig.js
// Single source of truth for Pro pricing and the (currently inactive) promo.
//
// IMPORTANT — how prices actually get charged:
//   The `price` amounts below are the REAL list prices. Stripe charges whatever
//   its prices (resolved by lookup_key in lib/billing.js) are set to, NOT these
//   numbers. For the charged amount to match what the page shows, the Stripe
//   prices must be:
//     premium_monthly        -> $8.99    /month
//     premium_monthly_ppp    -> $3.99    /month
//     premium_annual         -> $49.99   /year
//     premium_annual_ppp     -> $19.99   /year
//     premium_exam_pass      -> $14.99   one-time (30 days)
//     premium_exam_pass_ppp  -> $5.99    one-time (30 days)
//   pages/api/billing/checkout.js re-verifies every one of those against the
//   live Stripe Price before a Checkout Session is created (PRICE MISMATCH).
//
// There are NO struck-through "regular" anchors in this file, and none may be
// reintroduced: a discount is only ever shown when a REAL Stripe coupon is
// attached to the checkout (see PROMO below), so any crossed-out number a
// visitor sees is a price we would genuinely charge without that coupon.

// One-time Exam Pass entitlement window, in days. lib/billing.js stamps
// plan_expires_at = now + this, and the Terms billing section states it.
export const EXAM_PASS_DAYS = 30;

// ---------------------------------------------------------------------------
// Promo — a REAL Stripe coupon, or nothing at all.
// ---------------------------------------------------------------------------
// To run a promotion:
//   1. create the coupon in Stripe (percent_off, duration, redeem-by),
//   2. set couponId/percentOff/endsAt/appliesTo below and active = true.
// Checkout then attaches `discounts: [{ coupon: PROMO.couponId }]` and refuses
// to create the session unless Stripe reports the same percent_off. Leaving
// `active: false` removes every trace of the promo from the UI.
export const PROMO = {
  active: false,
  name: 'September offer',
  // Stripe coupon id (Coupons -> API ID), e.g. 'IELTSBANK_SEPT30'.
  couponId: '',
  // Whole-number percentage; must equal the Stripe coupon's percent_off.
  percentOff: 0,
  // Explicit offset so the deadline is unambiguous across timezones.
  endsAt: '',
  // SKUs the coupon may be applied to. Empty = no plan is discounted.
  appliesTo: [],
};

export function promoEndsAtMs() {
  const ms = new Date(PROMO.endsAt).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

// Whether the promo treatment should render / the coupon should be attached.
// A promo without a coupon id or a positive percentage is never live: the page
// must not advertise a discount that checkout cannot actually apply.
export function isPromoLive(now = Date.now()) {
  return Boolean(
    PROMO.active
    && PROMO.couponId
    && PROMO.percentOff > 0
    && promoEndsAtMs() > now
  );
}

export function promoAppliesTo(sku, now = Date.now()) {
  return isPromoLive(now) && PROMO.appliesTo.includes(sku);
}

// Stripe applies a percentage coupon to the amount in minor units and rounds
// to the nearest cent. Mirror that here so the advertised "with the offer"
// price is exactly what the card is charged.
export function discountedPrice(list, percentOff) {
  const cents = Math.round(Number(list) * 100);
  return Math.round(cents * (1 - Number(percentOff) / 100)) / 100;
}

// ---------------------------------------------------------------------------
// Plans — the single "Pro" tier, sold three ways.
// Amounts are USD numbers so per-month math computes without string drift.
// ---------------------------------------------------------------------------
// '3month' and '6month' are NOT here: they are retired from sale. Their lookup
// keys live on in lib/billing.js so existing subscribers keep renewing and keep
// mapping correctly.
export const PLANS = {
  monthly: {
    sku: 'monthly',
    name: 'Monthly',
    type: 'subscription',
    cadence: 'per month',
    // Billing cadence contract, re-verified against Stripe at checkout.
    interval: 'month',
    intervalCount: 1,
    // Months of access one purchase buys — drives the effective monthly rate.
    months: 1,
    blurb: 'Month-to-month while you decide.',
    global: { price: 8.99 },
    ppp: { price: 3.99 },
  },
  annual: {
    sku: 'annual',
    name: 'Annual',
    type: 'subscription',
    cadence: 'per year',
    interval: 'year',
    intervalCount: 1,
    months: 12,
    best: true,
    blurb: 'A full year — your prep and a retake cycle.',
    global: { price: 49.99 },
    ppp: { price: 19.99 },
  },
  exam_pass: {
    sku: 'exam_pass',
    name: 'Exam Pass',
    type: 'one_time',
    cadence: 'one-time',
    days: EXAM_PASS_DAYS,
    months: 1,
    blurb: 'One payment for your exam month. Never renews.',
    global: { price: 14.99 },
    ppp: { price: 5.99 },
  },
};

// Lead with the same fixed 30-day commitment in every region. Regional
// eligibility changes prices, not which plan is featured.
export function planOrder() {
  return ['exam_pass', 'monthly', 'annual'];
}

export function highlightedSku() {
  return 'exam_pass';
}

export const money = (value) => `$${Number(value).toFixed(2)}`;

// Resolve the display numbers for one plan in one region.
//   list      — the price we charge with no coupon (never a fictitious anchor)
//   price     — what this visitor pays right now (list, or coupon-discounted)
//   perMonth  — effective monthly rate for multi-month plans, else null
export function planPricing(planKey, ppp = false, now = Date.now()) {
  const plan = PLANS[planKey];
  if (!plan) return null;
  const list = (ppp ? plan.ppp : plan.global).price;
  const promo = promoAppliesTo(planKey, now);
  const price = promo ? discountedPrice(list, PROMO.percentOff) : list;
  const savings = Math.round((list - price) * 100) / 100;
  return {
    sku: plan.sku,
    name: plan.name,
    type: plan.type,
    isOneTime: plan.type === 'one_time',
    cadence: plan.cadence,
    interval: plan.interval || null,
    intervalCount: plan.intervalCount || null,
    days: plan.days || null,
    months: plan.months,
    blurb: plan.blurb,
    best: Boolean(plan.best),
    list,
    price,
    savings,
    promo,
    percentOff: promo ? PROMO.percentOff : 0,
    perMonth: plan.months > 1 ? price / plan.months : null,
  };
}

// Lowest effective per-month rate across the region's plans — used by upsell
// copy ("from $4.17/mo") that has no plan context of its own.
export function cheapestMonthlyRate(ppp = false, now = Date.now()) {
  return Object.keys(PLANS).reduce((min, key) => {
    const p = planPricing(key, ppp, now);
    if (!p) return min;
    const rate = p.perMonth == null ? p.price / p.months : p.perMonth;
    return min == null || rate < min ? rate : min;
  }, null);
}
