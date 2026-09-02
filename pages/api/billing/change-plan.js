// Upgrades an active recurring subscription in place. Stripe credits the
// unused portion of the current price and immediately invoices the prorated
// balance for the longer plan. pending_if_incomplete keeps the existing plan
// unchanged unless that invoice is successfully paid.
export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { originAllowed } from '../../../lib/apiSecurity';
import {
  getStripe,
  isRecurringPlanUpgrade,
  mapSubscriptionToPlanFields,
  resolveLookupKey,
  subscriptionSku,
  subscriptionIsPpp,
} from '../../../lib/billing';
import { planPricing } from '../../../src/lib/saleConfig';

const CHANGE_WINDOW_SECONDS = 10 * 60;
const CHANGE_MAX_PER_WINDOW = 10;
const QUOTE_MAX_AGE_SECONDS = 5 * 60;
// Annual is the only in-place upgrade target now that the 3-month plan is
// retired from sale. Monthly, 3-month and 6-month subscribers can all move up
// to it; the price contract is derived from saleConfig so the two can never
// drift apart. Coupons are never applied to an in-place upgrade, so the
// contract is the list price.
const UPGRADE_TARGET_SKUS = ['annual'];

function upgradePriceContract(targetSku, ppp) {
  const plan = UPGRADE_TARGET_SKUS.includes(targetSku)
    ? planPricing(targetSku, ppp)
    : null;
  if (!plan || plan.isOneTime) return null;
  return {
    amountMinor: Math.round(plan.list * 100),
    interval: plan.interval,
    intervalCount: plan.intervalCount,
  };
}

function upgradePriceMismatch(price, targetSku, ppp) {
  const expected = upgradePriceContract(targetSku, ppp);
  const valid =
    Boolean(expected) &&
    price?.active === true &&
    price?.currency === 'usd' &&
    price?.unit_amount === expected.amountMinor &&
    price?.billing_scheme === 'per_unit' &&
    price?.type === 'recurring' &&
    price?.recurring?.interval === expected.interval &&
    price?.recurring?.interval_count === expected.intervalCount &&
    price?.recurring?.usage_type === 'licensed';
  return valid
    ? null
    : {
        expectedAmountMinor: expected?.amountMinor ?? null,
        expectedInterval: expected?.interval ?? null,
        expectedIntervalCount: expected?.intervalCount ?? null,
        actualAmountMinor: price?.unit_amount ?? null,
        actualCurrency: price?.currency ?? null,
        actualBillingScheme: price?.billing_scheme ?? null,
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
  const match = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || '').trim());
  if (!match) return { user: null, error: null };
  try {
    const { data, error } = await getAdmin().auth.getUser(match[1].trim());
    return { user: error ? null : data?.user || null, error: null };
  } catch (error) {
    return { user: null, error };
  }
}

function invoiceUrl(invoice) {
  if (!invoice || typeof invoice === 'string') return null;
  return invoice.hosted_invoice_url || null;
}

function signQuote(fields) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error('stripe-not-configured');
  return createHmac('sha256', secret)
    .update(JSON.stringify(fields))
    .digest('hex');
}

function quoteTokenMatches(token, fields) {
  if (!/^[a-f0-9]{64}$/.test(String(token || ''))) return false;
  const actual = Buffer.from(String(token), 'hex');
  const expected = Buffer.from(signQuote(fields), 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function quotePayload(preview, targetPrice, targetSku, prorationDate, identity) {
  const quote = {
    targetSku,
    amountDue: preview.amount_due,
    currency: preview.currency,
    targetAmount: targetPrice.unit_amount,
    interval: targetPrice.recurring.interval,
    intervalCount: targetPrice.recurring.interval_count,
    prorationDate,
  };
  return {
    ...quote,
    token: signQuote({ ...identity, ...quote }),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!originAllowed(req)) return res.status(403).json({ error: 'Forbidden' });

  const { user, error: authError } = await resolveUser(req);
  if (authError) {
    console.error('change-plan auth lookup error:', authError.message);
    return res.status(503).json({ error: 'Could not verify your account. Please try again.' });
  }
  if (!user) return res.status(401).json({ error: 'Sign in to change your plan.' });

  const targetSku = typeof req.body?.sku === 'string' ? req.body.sku : '';
  if (!UPGRADE_TARGET_SKUS.includes(targetSku)) {
    return res.status(400).json({ error: 'Choose a valid upgrade plan.' });
  }
  const action = req.body?.action == null ? 'preview' : req.body.action;
  if (!['preview', 'confirm'].includes(action)) {
    return res.status(400).json({ error: 'Choose a valid plan-change action.' });
  }

  const admin = getAdmin();
  let userRow;
  try {
    const { data, error } = await admin
      .from('users')
      .select('id, plan, plan_status, stripe_customer_id, stripe_subscription_id')
      .eq('id', user.id)
      .maybeSingle();
    if (error) throw error;
    userRow = data;
  } catch (error) {
    console.error('change-plan account lookup error:', error.message);
    return res.status(503).json({ error: 'Could not verify your billing account. Please try again.' });
  }
  if (!userRow?.stripe_subscription_id || !['active', 'trialing'].includes(userRow.plan_status)) {
    return res.status(409).json({
      error: 'Only an active recurring plan can be upgraded.',
      code: 'no_active_subscription',
    });
  }

  try {
    const { data: allowed, error } = await admin.rpc('check_rate_limit', {
      p_bucket: 'billing-plan-change',
      p_identifier: user.id,
      p_window_seconds: CHANGE_WINDOW_SECONDS,
      p_max: CHANGE_MAX_PER_WINDOW,
    });
    if (error) throw error;
    if (!allowed) {
      return res.status(429).json({
        error: 'Too many plan-change attempts. Please wait a few minutes and try again.',
      });
    }
  } catch (error) {
    console.error('change-plan rate-limit error:', error.message);
    return res.status(503).json({ error: 'Could not change your plan. Please try again.' });
  }

  try {
    const stripe = getStripe();
    const subscription = await stripe.subscriptions.retrieve(
      userRow.stripe_subscription_id,
      { expand: ['items.data.price', 'latest_invoice'] }
    );
    const customerId =
      typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer?.id;
    if (userRow.stripe_customer_id && customerId !== userRow.stripe_customer_id) {
      throw new Error('subscription-customer-mismatch');
    }
    if (!['active', 'trialing'].includes(subscription.status) || subscription.pending_update) {
      return res.status(409).json({
        error: subscription.pending_update
          ? 'A plan change is already awaiting payment.'
          : 'This subscription cannot be upgraded right now.',
        code: subscription.pending_update ? 'pending_update' : 'subscription_inactive',
      });
    }

    const item = subscription.items?.data?.[0];
    const currentSku = subscriptionSku(subscription);
    if (!item?.id || !isRecurringPlanUpgrade(currentSku, targetSku)) {
      return res.status(409).json({
        error:
          currentSku === targetSku
            ? 'That is already your current plan.'
            : 'Choose a plan longer than your current plan.',
        code: 'not_an_upgrade',
      });
    }

    // Preserve the subscription's original pricing region. Request headers
    // cannot be used to switch an existing customer between PPP/global prices.
    const ppp = subscriptionIsPpp(subscription);
    const targetLookupKey = resolveLookupKey(targetSku, ppp ? 'IN' : '');
    const prices = await stripe.prices.list({
      lookup_keys: [targetLookupKey],
      active: true,
      limit: 2,
    });
    const targetPrice = prices.data[0];
    if (!targetPrice || prices.data.length !== 1) {
      console.error('change-plan: expected one active price for lookup key', targetLookupKey);
      return res.status(500).json({ error: 'Pricing unavailable. Please try again later.' });
    }
    const priceMismatch = upgradePriceMismatch(targetPrice, targetSku, ppp);
    if (priceMismatch) {
      console.error('change-plan PRICE MISMATCH:', {
        targetSku,
        targetLookupKey,
        ...priceMismatch,
      });
      return res.status(503).json({
        error: 'Pricing is being updated. Please try again later.',
      });
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const requestedProrationDate = Number(req.body?.prorationDate);
    const quoteTimestampValid =
      Number.isInteger(requestedProrationDate) &&
      requestedProrationDate <= nowSeconds &&
      requestedProrationDate >= nowSeconds - QUOTE_MAX_AGE_SECONDS;
    const acceptedAmount = Number(req.body?.acceptedAmount);
    const acceptedCurrency = String(req.body?.acceptedCurrency || '').toLowerCase();
    const quoteIdentity = {
      userId: user.id,
      subscriptionId: subscription.id,
      currentPriceId: item.price.id,
      targetPriceId: targetPrice.id,
    };
    const submittedQuote = {
      ...quoteIdentity,
      targetSku,
      amountDue: acceptedAmount,
      currency: acceptedCurrency,
      targetAmount: targetPrice.unit_amount,
      interval: targetPrice.recurring.interval,
      intervalCount: targetPrice.recurring.interval_count,
      prorationDate: requestedProrationDate,
    };
    const quoteTokenValid =
      action === 'confirm' &&
      quoteTimestampValid &&
      quoteTokenMatches(req.body?.quoteToken, submittedQuote);
    const prorationDate =
      quoteTokenValid
        ? requestedProrationDate
        : nowSeconds;
    const preview = await stripe.invoices.createPreview({
      subscription: subscription.id,
      subscription_details: {
        items: [{ id: item.id, price: targetPrice.id, quantity: 1 }],
        proration_behavior: 'always_invoice',
        proration_date: prorationDate,
      },
    });
    if (
      !Number.isInteger(preview.amount_due) ||
      preview.amount_due < 0 ||
      preview.currency !== 'usd'
    ) {
      console.error('change-plan: invalid Stripe invoice preview');
      return res.status(503).json({
        error: 'Could not confirm the upgrade price. Please try again.',
      });
    }
    const quote = quotePayload(
      preview,
      targetPrice,
      targetSku,
      prorationDate,
      quoteIdentity
    );
    const quoteAccepted =
      quoteTokenValid &&
      Number.isInteger(acceptedAmount) &&
      acceptedAmount === preview.amount_due &&
      acceptedCurrency === preview.currency;
    if (!quoteAccepted) {
      return res.status(action === 'confirm' ? 409 : 200).json({
        changed: false,
        requiresConfirmation: true,
        quote,
        ...(action === 'confirm'
          ? { error: 'The upgrade estimate changed or expired. Review it and confirm again.' }
          : {}),
      });
    }

    const updated = await stripe.subscriptions.update(
      subscription.id,
      {
        items: [{ id: item.id, price: targetPrice.id, quantity: 1 }],
        proration_behavior: 'always_invoice',
        proration_date: prorationDate,
        payment_behavior: 'pending_if_incomplete',
        cancel_at_period_end: false,
        metadata: {
          ...(subscription.metadata || {}),
          user_id: user.id,
          sku: targetSku,
          ppp: ppp ? '1' : '0',
        },
        expand: ['items.data.price', 'latest_invoice'],
      },
      {
        idempotencyKey: `plan-upgrade:${subscription.id}:${item.price.id}:${targetPrice.id}`,
      }
    );

    if (updated.pending_update) {
      return res.status(202).json({
        changed: false,
        requiresPayment: true,
        url: invoiceUrl(updated.latest_invoice),
        currentSku,
        targetSku,
        message: 'Your current plan is unchanged until the upgrade invoice is paid.',
      });
    }

    const fields = mapSubscriptionToPlanFields(updated);
    const { error: updateError } = await admin.from('users').update(fields).eq('id', user.id);
    const syncPending = Boolean(updateError);
    if (updateError) {
      // Stripe is authoritative and the webhook will retry this synchronization.
      // Never tell a customer their paid upgrade failed after Stripe confirmed it.
      console.error('change-plan account sync pending:', updateError.message);
    }

    const { error: eventError } = await admin.from('activity_events').insert({
      anon_id: `billing:${user.id}`,
      user_id: user.id,
      event: 'subscription_plan_changed',
      props: {
        from_sku: currentSku,
        to_sku: targetSku,
        invoice_id:
          typeof updated.latest_invoice === 'string'
            ? updated.latest_invoice
            : updated.latest_invoice?.id || null,
      },
    });
    if (eventError) {
      console.error('change-plan analytics insert failed:', eventError.message);
    }

    return res.status(200).json({
      changed: true,
      syncPending,
      currentSku,
      targetSku,
      message: syncPending
        ? 'Your plan was upgraded and the prorated difference was charged. Your account display may take a moment to update.'
        : 'Your plan was upgraded and the prorated difference was charged.',
    });
  } catch (error) {
    console.error('change-plan error:', error.message);
    const paymentError =
      error?.type === 'StripeCardError' ||
      error?.code === 'card_declined' ||
      error?.code === 'payment_intent_payment_attempt_failed';
    return res.status(paymentError ? 402 : 500).json({
      error: paymentError
        ? 'The upgrade payment failed, so your current plan was left unchanged.'
        : 'Could not change your plan. Please try again.',
    });
  }
}
