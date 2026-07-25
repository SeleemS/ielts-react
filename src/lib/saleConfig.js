// src/lib/saleConfig.js
// Single source of truth for the current Pro pricing + the Summer Sale.
//
// IMPORTANT — how prices actually get charged:
//   The `sale` amounts below are the REAL prices. Stripe charges whatever its
//   prices (resolved by lookup_key in lib/billing.js) are set to, NOT these
//   strings. For the charged amount to match what this page shows, the Stripe
//   prices must be:
//     premium_monthly       -> $8.99    (was $14.99)
//     premium_3month        -> $19.99   (new plan — replaces the $49.99 6-month)
//     premium_monthly_ppp   -> $3.99    (unchanged — regional)
//     premium_3month_ppp    -> $8.99    (new plan — regional)
//   The `regular` amounts ($14.99 / $34.99) are struck-through marketing
//   anchors only; they are never charged. The monthly anchor is the genuine
//   previous list price.
//
// Ending the sale: set SALE.active = false (or let SALE.endsAt pass). The promo
// chrome (badge, countdown, struck price, savings) disappears and the `sale`
// price shows as the plain price — because the sale price IS the real price.

// ---------------------------------------------------------------------------
// Sale window + copy
// ---------------------------------------------------------------------------
export const SALE = {
  active: true,
  name: 'Summer Sale',
  // Editable end date. Explicit offset so the countdown is unambiguous across
  // timezones. Change this one line to extend or end the promotion.
  endsAt: '2026-08-31T23:59:59-04:00',
  // Short line reused on the pricing hero and in the reminder modal.
  tagline: 'Pro at its lowest price of the year.',
  // Marketing headline percentage for the sale banner ("Up to N% off Pro").
  // This is a deliberate promotional figure, NOT the computed per-plan discount
  // (the accurate per-plan "% off" still comes from planPricing() on each card).
  headlinePercentOff: 43,
};

export function saleEndsAtMs() {
  const ms = new Date(SALE.endsAt).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

// Whether the promotional treatment should render. Pass a clock for tests.
export function isSaleLive(now = Date.now()) {
  return Boolean(SALE.active) && now < saleEndsAtMs();
}

// ---------------------------------------------------------------------------
// Plans — the single "Pro" plan, billed monthly or every 3 months.
// Amounts are USD numbers so savings/percentages compute without string drift.
// `sale` = real (charged) price; `regular` = struck anchor.
// ---------------------------------------------------------------------------
export const PLANS = {
  monthly: {
    sku: 'monthly',
    name: 'Monthly',
    cadence: 'per month',
    global: { sale: 8.99, regular: 14.99 },
    ppp: { sale: 3.99, regular: 4.99 },
  },
  '3month': {
    sku: '3month',
    name: '3 months',
    cadence: 'every 3 months',
    best: true,
    global: { sale: 19.99, regular: 34.99 },
    ppp: { sale: 8.99, regular: 11.99 },
  },
};

export const money = (value) => `$${Number(value).toFixed(2)}`;

// Resolve the display numbers for one plan in one region, including derived
// savings and the effective monthly rate for the 3-month option.
export function planPricing(planKey, ppp = false) {
  const plan = PLANS[planKey];
  if (!plan) return null;
  const source = ppp ? plan.ppp : plan.global;
  const sale = source.sale;
  const regular = source.regular;
  const savings = Math.round((regular - sale) * 100) / 100;
  const percentOff = regular > 0 ? Math.round((1 - sale / regular) * 100) : 0;
  const perMonth = planKey === '3month' ? sale / 3 : null;
  return { sku: plan.sku, name: plan.name, cadence: plan.cadence, best: Boolean(plan.best), sale, regular, savings, percentOff, perMonth };
}

// Largest savings across plans in a region — used for headline copy
// ("Save up to $20"). Global-only by default; the modal shows the global line.
export function maxSavings(ppp = false) {
  return Object.keys(PLANS).reduce((max, key) => {
    const p = planPricing(key, ppp);
    return p && p.savings > max ? p.savings : max;
  }, 0);
}

// Largest percentage off across plans in a region ("up to 29% off").
export function maxPercentOff(ppp = false) {
  return Object.keys(PLANS).reduce((max, key) => {
    const p = planPricing(key, ppp);
    return p && p.percentOff > max ? p.percentOff : max;
  }, 0);
}
