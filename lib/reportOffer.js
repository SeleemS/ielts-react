// The 48-hour first-report offer (Oct 18 2026): after a learner's FIRST free
// AI Writing report, one email offers 40% off the Week Pass, valid for 48
// hours from the report. The discount is a real Stripe coupon
// (STRIPE_REPORT_OFFER_COUPON_ID = IELTSBANK_REPORT48_WEEK40) attached by
// /api/billing/checkout only while reportOfferEligible() holds, so the
// deadline in the email is the deadline Stripe enforces.

export const REPORT_OFFER = {
  code: 'report48',
  sku: 'week_pass',
  percentOff: 40,
  hours: 48,
};

const HOUR_MS = 3600000;

export function reportOfferEndsAt(reportCreatedAt) {
  const t = Date.parse(reportCreatedAt);
  return Number.isFinite(t) ? new Date(t + REPORT_OFFER.hours * HOUR_MS).toISOString() : null;
}

export function reportOfferPrice(listPrice) {
  if (!Number.isFinite(listPrice)) return null;
  return Math.round(listPrice * (100 - REPORT_OFFER.percentOff)) / 100;
}

// Server-side rule. `firstReportAt` is the learner's earliest writing_reports
// row; `userRow` the billing columns. Never-paid learners only.
export function reportOfferEligible({ firstReportAt, userRow, now = Date.now() }) {
  if (!userRow || userRow.plan_sku || userRow.premium_since) return false;
  const start = Date.parse(firstReportAt);
  if (!Number.isFinite(start)) return false;
  return now >= start && now < start + REPORT_OFFER.hours * HOUR_MS;
}
