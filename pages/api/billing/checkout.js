// pages/api/billing/checkout.js
// Creates a Stripe Checkout Session for a currently advertised subscription.
//   * signed-in, NON-anonymous users only (receipts + portal need an email);
//   * price resolved server-side by lookup_key — PPP variant when the request
//     geo (x-vercel-ip-country) is in the PPP list. Never client-chosen.
//   * promotion codes allowed; card collection skipped for 100%-off checkouts.
export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import { clientIp, originAllowed } from '../../../lib/apiSecurity';
import {
  CHECKOUT_SKUS,
  getStripe,
  resolveLookupKey,
  isPppCountry,
} from '../../../lib/billing';
import { isPremiumRow } from '../../../lib/premium';
import { planPricing } from '../../../src/lib/saleConfig';

const CHECKOUT_WINDOW_SECONDS = 10 * 60;
const CHECKOUT_MAX_PER_WINDOW = 10;

function advertisedPriceMismatch(price, sku, ppp) {
  const expected = planPricing(sku, ppp);
  const expectedIntervalCount = sku === '3month' ? 3 : 1;
  const expectedMinor = expected ? Math.round(expected.sale * 100) : null;
  const valid =
    Boolean(expected) &&
    price?.active === true &&
    price?.currency === 'usd' &&
    price?.unit_amount === expectedMinor &&
    price?.type === 'recurring' &&
    price?.recurring?.interval === 'month' &&
    price?.recurring?.interval_count === expectedIntervalCount &&
    price?.recurring?.usage_type === 'licensed';
  return valid
    ? null
    : {
        expectedMinor,
        expectedIntervalCount,
        actualMinor: price?.unit_amount ?? null,
        actualCurrency: price?.currency ?? null,
        actualType: price?.type ?? null,
        actualInterval: price?.recurring?.interval ?? null,
        actualIntervalCount: price?.recurring?.interval_count ?? null,
        actualUsageType: price?.recurring?.usage_type ?? null,
        active: price?.active ?? null,
      };
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
  if (!CHECKOUT_SKUS.includes(sku)) {
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
      .select('id, email, is_anonymous, plan, plan_status, plan_renews_at, plan_expires_at, billing_pause_until, canceled_at, stripe_customer_id, stripe_subscription_id')
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
  if (!userRow) return res.status(401).json({ error: 'Account not found.' });
  if (userRow.is_anonymous || !userRow.email) {
    return res.status(403).json({
      error: 'Link an email or Google account before upgrading.',
      code: 'anonymous_user',
    });
  }
  // A billing pause intentionally blocks product access, so isPremiumRow on
  // the stored row returns false. It must not make the learner eligible to buy
  // a second recurring subscription. Ignore only the access-pause timestamp
  // when deciding whether an existing paid commitment still owns this account.
  const hasTruePausedSubscription = Boolean(
    userRow.stripe_subscription_id
    && userRow.plan === 'premium'
    && userRow.plan_status === 'paused'
  );
  if (
    isPremiumRow({ ...userRow, billing_pause_until: null })
    || hasTruePausedSubscription
  ) {
    return res.status(409).json({ error: 'You already have Premium.', code: 'already_premium' });
  }
  const winBackEligible =
    offer === 'winback' &&
    sku === 'monthly' &&
    userRow.canceled_at &&
    new Date(userRow.canceled_at).getTime() <= Date.now() - 30 * 86400000;
  if (offer === 'winback' && !winBackEligible) {
    return res.status(403).json({ error: 'This returning-subscriber offer is not available for this account.' });
  }
  if (winBackEligible && !process.env.STRIPE_WINBACK_COUPON_ID) {
    return res.status(503).json({ error: 'The returning-subscriber offer is temporarily unavailable.' });
  }

  try {
    const { data: allowed, error } = await admin.rpc('check_rate_limit', {
      p_bucket: 'billing-checkout',
      p_identifier: userRow.id,
      p_window_seconds: CHECKOUT_WINDOW_SECONDS,
      p_max: CHECKOUT_MAX_PER_WINDOW,
    });
    if (error) throw error;
    if (!allowed) {
      return res.status(429).json({
        error: 'Too many checkout attempts. Please wait a few minutes and try again.',
      });
    }
  } catch (error) {
    console.error('checkout rate-limit error:', error.message);
    return res.status(503).json({
      error: 'Could not start checkout. Please try again.',
    });
  }

  const country = String(req.headers['x-vercel-ip-country'] || '').toUpperCase();
  const lookupKey = resolveLookupKey(sku, country);

  let stripe;
  let unpersistedCustomerId = null;
  try {
    stripe = getStripe();

    const prices = await stripe.prices.list({
      lookup_keys: [lookupKey],
      active: true,
      limit: 2,
    });
    const price = prices.data[0];
    if (!price || prices.data.length !== 1) {
      console.error('checkout: missing price for lookup key', lookupKey);
      return res.status(500).json({ error: 'Pricing unavailable. Please try again later.' });
    }

    // Stripe charges the resolved Price, not the amount rendered from
    // saleConfig. Fail closed before customer/session creation unless amount,
    // currency, and billing cadence match the advertised plan exactly.
    const mismatch = advertisedPriceMismatch(price, sku, isPppCountry(country));
    if (mismatch) {
      console.error('checkout PRICE MISMATCH:', {
        sku,
        lookupKey,
        ...mismatch,
      });
      return res.status(503).json({
        error: 'Pricing is being updated. Please try again later.',
      });
    }

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
    const metadata = {
      user_id: userRow.id,
      sku,
      ppp: isPppCountry(country) ? '1' : '0',
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

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: price.id, quantity: 1 }],
      allow_promotion_codes: !winBackEligible,
      ...(winBackEligible
        ? { discounts: [{ coupon: process.env.STRIPE_WINBACK_COUPON_ID }] }
        : {}),
      payment_method_collection: 'if_required',
      client_reference_id: userRow.id,
      metadata,
      ...tosConsent,
      subscription_data: { metadata },
      ...(process.env.STRIPE_AUTOMATIC_TAX === '1' ? { automatic_tax: { enabled: true } } : {}),
      success_url: `${origin}/pricing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing?checkout=canceled`,
    });

    return res.status(200).json({ url: session.url });
  } catch (e) {
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
