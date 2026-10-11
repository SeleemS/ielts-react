import { checkoutAttribution } from '../../../lib/monetizationExperiment';
// pages/api/billing/checkout.js
// Creates a Stripe Checkout Session for a currently advertised plan: the
// Monthly or Annual subscription, the one-time Exam Pass (EXAM_PASS_DAYS), or
// the 7-day one-time Week Pass (only while NEXT_PUBLIC_WEEK_PASS=1).
//   * signed-in, NON-anonymous users only (receipts + portal need an email);
//   * price resolved server-side by lookup_key — PPP variant when the request
//     geo (x-vercel-ip-country) is in the PPP list. Never client-chosen.
//   * an account that already owns a recurring subscription cannot buy a
//     second one (409 already_premium); an Exam Pass holder may subscribe but
//     cannot stack a second pass (409 already_exam_pass). These guards live in
//     lib/checkoutEligibility.js, shared with the resume route and webhook.
//   * promotion codes allowed; card collection skipped for 100%-off checkouts.
//   * sessions expire after 3 hours; the webhook turns an expiry into one
//     checkout_abandoned email linking to OUR /billing/resume route, which
//     re-runs these guards and comes back through this handler for a fresh
//     session (never Stripe's raw recovery URL — see lib/checkoutResume.js).
//   * when saleConfig's PROMO is live, its REAL Stripe coupon is attached and
//     its percent_off is verified against saleConfig before the session opens.
export const config = { runtime: 'nodejs' };

import { randomUUID } from 'node:crypto';
import { recordCheckoutOperation } from '../../../lib/checkoutOperations';
import { checkoutReturnUrls, normalizeUpgradeContext } from '../../../lib/upgradeContext';
import { checkoutExpiryParams } from '../../../lib/checkoutRecovery';
import { createClient } from '@supabase/supabase-js';
import { clientIp, originAllowed } from '../../../lib/apiSecurity';
import {
  CHECKOUT_SKUS,
  getStripe,
  isOneTimeSku,
  resolveLookupKey,
  isPppCountry,
} from '../../../lib/billing';
import { BILLING_USER_COLUMNS, checkoutEligibility } from '../../../lib/checkoutEligibility';
import { sanitizeGaClientId } from '../../../lib/ga4mp';
import {
  LEGACY_EXAM_PASS_DAYS,
  WEEK_PASS_DAYS,
  examPassDays,
  weekPassEnabled,
  PROMO,
  planPricing,
  promoAppliesTo,
} from '../../../src/lib/saleConfig';

// Length a one-time checkout advertises and the webhook will grant.
function passDaysForSku(sku) {
  return sku === 'week_pass' ? WEEK_PASS_DAYS : examPassDays();
}

const CHECKOUT_WINDOW_SECONDS = 10 * 60;
const CHECKOUT_MAX_PER_WINDOW = 10;

// Stripe charges the resolved Price, not the amount rendered from saleConfig.
// The advertised contract covers the amount, the currency, and the billing
// cadence — including one-time vs recurring, which is what separates the Exam
// Pass from a subscription.
function advertisedPriceMismatch(price, sku, ppp) {
  const expected = planPricing(sku, ppp);
  const expectedMinor = expected ? Math.round(expected.list * 100) : null;
  const cadenceValid = expected?.isOneTime
    ? price?.type === 'one_time' && !price?.recurring
    : price?.type === 'recurring'
      && price?.recurring?.interval === expected?.interval
      && price?.recurring?.interval_count === expected?.intervalCount
      && price?.recurring?.usage_type === 'licensed';
  const valid =
    Boolean(expected) &&
    price?.active === true &&
    price?.currency === 'usd' &&
    price?.unit_amount === expectedMinor &&
    cadenceValid;
  return valid
    ? null
    : {
        expectedMinor,
        expectedType: expected?.isOneTime ? 'one_time' : 'recurring',
        expectedInterval: expected?.interval ?? null,
        expectedIntervalCount: expected?.intervalCount ?? null,
        actualMinor: price?.unit_amount ?? null,
        actualCurrency: price?.currency ?? null,
        actualType: price?.type ?? null,
        actualInterval: price?.recurring?.interval ?? null,
        actualIntervalCount: price?.recurring?.interval_count ?? null,
        actualUsageType: price?.recurring?.usage_type ?? null,
        active: price?.active ?? null,
      };
}

// The promo coupon is the only way a discount is ever advertised, so the page
// copy is only honest if Stripe's coupon really takes off the same percentage.
// Anything else (wrong percentage, amount_off coupon, expired, deleted) fails
// closed exactly like a price mismatch.
function promoCouponMismatch(coupon) {
  const valid =
    coupon?.valid === true &&
    coupon?.deleted !== true &&
    coupon?.percent_off === PROMO.percentOff;
  return valid
    ? null
    : {
        couponId: PROMO.couponId,
        expectedPercentOff: PROMO.percentOff,
        actualPercentOff: coupon?.percent_off ?? null,
        actualAmountOff: coupon?.amount_off ?? null,
        valid: coupon?.valid ?? null,
      };
}

// A pass of any length other than the legacy 30 days (45-day Exam Pass, 7-day
// Week Pass) is only sold once the database function that grants it is live
// (supabase/migrations/20261011120000_pass_lengths_week_pass.sql).
// Otherwise the page would promise N days and the grant would give 30. A
// positive answer is cached for the life of the function instance.
const verifiedPassDays = new Set();
async function examPassLengthDeployed(admin, days) {
  if (days === LEGACY_EXAM_PASS_DAYS || verifiedPassDays.has(days)) return true;
  try {
    const { data, error } = await admin.rpc('billing_exam_pass_days_supported');
    if (error || !Array.isArray(data)) return false;
    if (!data.map(Number).includes(days)) return false;
    verifiedPassDays.add(days);
    return true;
  } catch {
    return false;
  }
}

let _admin = null;
function getAdmin() {
  if (_admin) return _admin;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('supabase-admin-not-configured');
  _admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}

async function resolveUser(req) {
  const authz = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(String(authz).trim());
  if (!match) return { user: null, error: null };
  try {
    const { data, error } = await getAdmin().auth.getUser(match[1].trim());
    if (error || !data?.user) return { user: null, error: null };
    return { user: data.user, error: null };
  } catch (error) {
    return { user: null, error };
  }
}

// The expired session a resumed checkout replaces. Only the resume route sets
// req.checkoutResume; a client cannot, because it is not part of the body.
function resumedSessionId(req) {
  const id = req.checkoutResume?.sessionId;
  return typeof id === 'string' && /^cs_[A-Za-z0-9_]{1,200}$/.test(id) ? id : null;
}

function siteOrigin(req) {
  if (process.env.NODE_ENV !== 'production') {
    const origin = req.headers.origin;
    if (typeof origin === 'string' && origin.startsWith('http://localhost')) return origin;
  }
  return 'https://www.ielts-bank.com';
}

async function linkStripeCustomer(admin, userId, customerId) {
  try {
    const { error } = await admin
      .from('users')
      .update({ stripe_customer_id: customerId })
      .eq('id', userId);
    if (error) return { linked: false, confirmedUnlinked: true, error };
    return { linked: true, confirmedUnlinked: false, error: null };
  } catch (error) {
    try {
      const { data, error: readError } = await admin
        .from('users')
        .select('stripe_customer_id')
        .eq('id', userId)
        .maybeSingle();
      if (readError) throw readError;
      if (data?.stripe_customer_id === customerId) {
        return { linked: true, confirmedUnlinked: false, error: null };
      }
      return { linked: false, confirmedUnlinked: true, error };
    } catch (readbackError) {
      console.error(
        'checkout: customer link state is ambiguous:',
        readbackError.message
      );
      return { linked: false, confirmedUnlinked: false, error };
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!originAllowed(req)) return res.status(403).json({ error: 'Forbidden' });

  const { user: authUser, error: authError } = await resolveUser(req);
  if (authError) {
    console.error('checkout auth lookup error:', authError.message);
    return res.status(503).json({
      error: 'Could not verify your account. Please try again.',
    });
  }
  if (!authUser) return res.status(401).json({ error: 'Sign in to upgrade.' });

  const sku = typeof req.body?.sku === 'string' ? req.body.sku : 'monthly';
  if (!CHECKOUT_SKUS.includes(sku) || (sku === 'week_pass' && !weekPassEnabled())) {
    return res.status(400).json({ error: 'Unknown plan.' });
  }
  // The winback coupon only applies to the monthly plan. When a returning
  // subscriber picks a different plan, proceed at list price instead of
  // rejecting the purchase.
  const offer =
    req.body?.offer === 'winback' && sku === 'monthly' ? 'winback' : null;

  const admin = getAdmin();
  let userRow;
  try {
    const { data, error } = await admin
      .from('users')
      .select(BILLING_USER_COLUMNS)
      .eq('id', authUser.id)
      .maybeSingle();
    if (error) throw error;
    userRow = data;
  } catch (error) {
    console.error('checkout account lookup error:', error.message);
    return res.status(503).json({
      error: 'Could not verify your account. Please try again.',
    });
  }
  // Missing account / anonymous / already Pro (incl. paused) / second Exam
  // Pass / win-back eligibility: one shared definition (lib/checkoutEligibility)
  // so the emailed resume link and the webhook's duplicate-purchase backstop
  // apply exactly these rules.
  const eligibility = checkoutEligibility(userRow, { sku, offer });
  if (!eligibility.ok) return res.status(eligibility.status).json(eligibility.body);
  const { winBackEligible } = eligibility;
  if (winBackEligible && !process.env.STRIPE_WINBACK_COUPON_ID) {
    return res.status(503).json({ error: 'The returning-subscriber offer is temporarily unavailable.' });
  }

  const operationRequestId = randomUUID();
  const recordOperation = (stage, sessionId = null) => recordCheckoutOperation(admin, {
    userId: userRow.id, sku, requestId: operationRequestId, stage,
    sessionId, created: Boolean(sessionId), attribution: checkoutAttribution(req.body),
  });

  try {
    const { data: allowed, error } = await admin.rpc('check_rate_limit', {
      p_bucket: 'billing-checkout',
      p_identifier: userRow.id,
      p_window_seconds: CHECKOUT_WINDOW_SECONDS,
      p_max: CHECKOUT_MAX_PER_WINDOW,
    });
    if (error) throw error;
    if (!allowed) {
      await recordOperation('rate_limit');
      return res.status(429).json({
        error: 'Too many checkout attempts. Please wait a few minutes and try again.',
      });
    }
  } catch (error) {
    await recordOperation('rate_limit');
    console.error('checkout rate-limit error:', error.message);
    return res.status(503).json({
      error: 'Could not start checkout. Please try again.',
    });
  }

  const reportReturn = normalizeUpgradeContext(req.body).return_to;
  if (reportReturn?.startsWith('/writing-report/')) {
    try {
      const { data, error } = await admin.from('writing_reports').select('attempt_id')
        .eq('attempt_id', reportReturn.split('/').pop()).eq('user_id', authUser.id).maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'This report is not in your account. Open your saved reports before upgrading.', code: 'report_not_found' });
    } catch (error) {
      console.error('checkout report verification failed:', error.message);
      return res.status(503).json({ error: 'Could not verify your saved report. Please try again before paying.' });
    }
  }

  const country = String(req.headers['x-vercel-ip-country'] || '').toUpperCase();
  const lookupKey = resolveLookupKey(sku, country);

  let operationStage = 'catalog';
  let stripe;
  let unpersistedCustomerId = null;
  try {
    if (isOneTimeSku(sku) && !(await examPassLengthDeployed(admin, passDaysForSku(sku)))) {
      await recordOperation('catalog');
      console.error('checkout EXAM PASS LENGTH NOT DEPLOYED:', {
        sku,
        advertisedDays: passDaysForSku(sku),
        fix: sku === 'week_pass'
          ? 'run scripts/apply-exam-pass-length.mjs or unset NEXT_PUBLIC_WEEK_PASS'
          : 'run scripts/apply-exam-pass-length.mjs or unset NEXT_PUBLIC_EXAM_PASS_DAYS',
      });
      return res.status(503).json({
        error: 'Pricing is being updated. Please try again later.',
      });
    }

    stripe = getStripe();

    const prices = await stripe.prices.list({
      lookup_keys: [lookupKey],
      active: true,
      limit: 2,
    });
    const price = prices.data[0];
    if (!price || prices.data.length !== 1) {
      await recordOperation('catalog');
      console.error('checkout: missing price for lookup key', lookupKey);
      return res.status(500).json({ error: 'Pricing unavailable. Please try again later.' });
    }

    // Fail closed before customer/session creation unless amount, currency,
    // and billing cadence match the advertised plan exactly.
    const mismatch = advertisedPriceMismatch(price, sku, isPppCountry(country));
    if (mismatch) {
      await recordOperation('catalog');
      console.error('checkout PRICE MISMATCH:', {
        sku,
        lookupKey,
        ...mismatch,
      });
      return res.status(503).json({
        error: 'Pricing is being updated. Please try again later.',
      });
    }

    // The advertised promo, if any, must be a live Stripe coupon taking off
    // exactly the percentage saleConfig renders. The win-back coupon takes
    // precedence: Stripe accepts only one coupon per session.
    const promoApplies = !winBackEligible && promoAppliesTo(sku);
    let promoCouponId = null;
    if (promoApplies) {
      operationStage = 'coupon';
      const coupon = await stripe.coupons
        .retrieve(PROMO.couponId)
        .catch((error) => ({ error }));
      const couponMismatch = coupon?.error
        ? { couponId: PROMO.couponId, retrieveError: coupon.error.message }
        : promoCouponMismatch(coupon);
      if (couponMismatch) {
        await recordOperation('coupon');
        console.error('checkout PROMO COUPON MISMATCH:', { sku, ...couponMismatch });
        return res.status(503).json({
          error: 'Pricing is being updated. Please try again later.',
        });
      }
      promoCouponId = PROMO.couponId;
    }

    operationStage = 'customer';
    let customerId = userRow.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userRow.email,
        metadata: { user_id: userRow.id },
      });
      customerId = customer.id;
      unpersistedCustomerId = customerId;
      const link = await linkStripeCustomer(admin, userRow.id, customerId);
      if (!link.linked) {
        if (!link.confirmedUnlinked) unpersistedCustomerId = null;
        throw link.error;
      }
      unpersistedCustomerId = null;
    }

    const origin = siteOrigin(req);
    // GA4 client id from the buyer's _ga cookie (present only with analytics
    // consent). Lets the webhook report the purchase to GA4 via Measurement
    // Protocol when the buyer never returns to the success page (lib/ga4mp.js).
    const gaCid = sanitizeGaClientId(req.body?.ga_cid);
    const resumedFrom = resumedSessionId(req);
    const metadata = {
      user_id: userRow.id,
      sku,
      ppp: isPppCountry(country) ? '1' : '0',
      // The pass length this checkout advertised; the webhook grants exactly
      // this, so a later length change never alters what was bought.
      ...(isOneTimeSku(sku) ? { pass_days: String(passDaysForSku(sku)) } : {}),
      ...(gaCid ? { ga_cid: gaCid } : {}),
      ...checkoutAttribution(req.body),
      // Set only by pages/api/billing/resume.js (a request property, never the
      // body), so the webhook can attribute a purchase to the recovery email.
      ...(resumedFrom ? { resumed_from: resumedFrom } : {}),
    };
    // Terms-of-service consent recorded by Stripe on the Checkout Session
    // (session.consent.terms_of_service = 'accepted' + a timestamp). Stripe
    // requires a Terms of Service URL in Dashboard -> Settings -> Public details
    // for this; without it the session create is rejected. Gated behind an env
    // flag so it is enabled deliberately once that URL is configured, and never
    // breaks live checkout by default.
    const tosConsent =
      process.env.STRIPE_TOS_CONSENT === '1'
        ? {
            consent_collection: { terms_of_service: 'required' },
            custom_text: {
              terms_of_service_acceptance: {
                message:
                  'I agree to the [Terms of Service](https://www.ielts-bank.com/termsofservice) and [Privacy Policy](https://www.ielts-bank.com/privacypolicy).',
              },
            },
          }
        : {};

    // The Exam Pass is a single charge, so it opens a `payment` session with
    // no subscription_data: nothing is stored to renew, and the webhook grants
    // a fixed window instead of a billing period. `payment_method_collection`
    // is a subscription/setup-mode field and is omitted for one-time payments.
    const oneTime = isOneTimeSku(sku);
    const couponId = winBackEligible
      ? process.env.STRIPE_WINBACK_COUPON_ID
      : promoCouponId;
    // Promotion codes and an attached coupon are mutually exclusive in
    // Stripe; recovered sessions follow the same rule as the original.
    const allowPromotionCodes = !couponId;
    // Lets the recovery email's resume link tell when the discount this
    // checkout advertised has since ended (lib/checkoutResume.js).
    if (couponId) metadata.discount_coupon = couponId;
    operationStage = 'session';
    const session = await stripe.checkout.sessions.create({
      mode: oneTime ? 'payment' : 'subscription',
      customer: customerId,
      line_items: [{ price: price.id, quantity: 1 }],
      allow_promotion_codes: allowPromotionCodes,
      // Expire after 3h instead of Stripe's 24h so an abandoned checkout is
      // noticed while the learner still cares, and let Stripe mint a 30-day
      // recovery link for the checkout_abandoned email (lib/checkoutRecovery).
      ...checkoutExpiryParams({ allowPromotionCodes }),
      ...(couponId ? { discounts: [{ coupon: couponId }] } : {}),
      ...(oneTime ? {} : { payment_method_collection: 'if_required' }),
      client_reference_id: userRow.id,
      metadata,
      ...tosConsent,
      ...(oneTime ? {} : { subscription_data: { metadata } }),
      ...(process.env.STRIPE_AUTOMATIC_TAX === '1' ? { automatic_tax: { enabled: true } } : {}),
      ...checkoutReturnUrls(origin, req.body),
    });

    await recordOperation('session', session.id);
    return res.status(200).json({ url: session.url });
  } catch (e) {
    await recordOperation(operationStage);
    if (stripe && unpersistedCustomerId) {
      try {
        await stripe.customers.del(unpersistedCustomerId);
      } catch (cleanupError) {
        console.error(
          'checkout: failed to remove unlinked customer:',
          cleanupError.message
        );
      }
    }
    console.error('checkout error:', e.message, 'ip:', clientIp(req));
    return res.status(500).json({ error: 'Could not start checkout. Please try again.' });
  }
}
