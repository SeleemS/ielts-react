// lib/billing.js
// Stripe billing core: price resolution (incl. server-side PPP), subscription
// state → users.plan mapping, and the webhook event handler. Route files stay
// thin; everything here is pure or dependency-injected so vitest can cover it.
// See docs/MONETIZATION.md §4 (Stripe), §5.3 (limits), §9.3 (realtime meter).

import Stripe from 'stripe';
import { sendGa4Purchase } from './ga4mp';
import { EXAM_PASS_DAYS } from '../src/lib/saleConfig';

// ---------------------------------------------------------------------------
// SKUs and PPP
// ---------------------------------------------------------------------------
// New purchases are limited to the three plans advertised on /pricing: Monthly,
// Annual, and the one-time Exam Pass. The retired 3-month and 6-month lookup
// keys remain below so existing subscriptions, historical webhook events, and
// account-only upgrades continue to map correctly.
export const CHECKOUT_SKUS = ['monthly', 'annual', 'exam_pass'];
export const ONE_TIME_SKUS = ['exam_pass'];
export const RECURRING_SKUS = ['monthly', '3month', '6month', 'annual'];

export function isOneTimeSku(sku) {
  return ONE_TIME_SKUS.includes(sku);
}

const RECURRING_SKU_RANK = {
  monthly: 1,
  '3month': 2,
  '6month': 3,
  annual: 4,
};

const LOOKUP_BY_SKU = {
  monthly: 'premium_monthly',
  '3month': 'premium_3month',
  '6month': 'premium_6month',
  annual: 'premium_annual',
  exam_pass: 'premium_exam_pass',
};

// India / MENA / SEA per docs/MONETIZATION.md §3.2 (~55% off list prices).
export const PPP_COUNTRIES = new Set([
  // South Asia
  'IN', 'PK', 'BD', 'LK', 'NP', 'BT', 'MV', 'AF',
  // Africa (major IELTS markets)
  'NG', 'EG', 'KE', 'GH', 'ET', 'MA', 'DZ', 'TN', 'LY',
  // Middle East
  'JO', 'LB', 'PS', 'IQ', 'YE',
  // Southeast Asia
  'PH', 'VN', 'ID', 'TH', 'KH', 'MM', 'LA', 'MY',
  // Central Asia
  'UZ', 'KZ', 'KG', 'TJ', 'TM',
]);

// Realtime examiner allowance in seconds (§9.3): 60 min global, 30 min PPP.
export const REALTIME_SECONDS_GLOBAL = 3600;
export const REALTIME_SECONDS_PPP = 1800;

// Stripe's true subscription-pause lifecycle is currently exposed on the
// preview API for flexible-billing subscriptions. Keep the version and app
// metadata key centralized so the user action, webhook mapper, and resume cron
// cannot drift apart.
export const STRIPE_PAUSE_API_VERSION = '2026-06-24.preview';
export const STRIPE_PAUSE_RESUMES_AT_METADATA = 'ielts_pause_resumes_at';

export function isPppCountry(countryCode) {
  return PPP_COUNTRIES.has(String(countryCode || '').toUpperCase());
}

export function resolveLookupKey(sku, countryCode) {
  const base = LOOKUP_BY_SKU[sku];
  if (!base) return null;
  return isPppCountry(countryCode) ? `${base}_ppp` : base;
}

export function isRecurringPlanUpgrade(currentSku, targetSku) {
  const currentRank = RECURRING_SKU_RANK[currentSku];
  const targetRank = RECURRING_SKU_RANK[targetSku];
  return Boolean(currentRank && targetRank && targetRank > currentRank);
}

// ---------------------------------------------------------------------------
// Stripe client (lazy singleton)
// ---------------------------------------------------------------------------
let _stripe = null;
export function getStripe() {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('stripe-not-configured');
  // Fetch-based HTTP client: the SDK's default node:https client fails to
  // connect from Vercel's serverless runtime; global fetch (same path the
  // OpenAI scoring calls use) works reliably there.
  _stripe = new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
  return _stripe;
}

export function pauseStripeSubscription(stripe, subscriptionId) {
  return stripe.rawRequest(
    'POST',
    `/v1/subscriptions/${encodeURIComponent(subscriptionId)}/pause`,
    {
      bill_for: {
        unused_time_from: { type: 'now' },
        outstanding_usage_through: { type: 'now' },
      },
      invoicing_behavior: 'pending_invoice_item',
    },
    { apiVersion: STRIPE_PAUSE_API_VERSION }
  );
}

export function resumeStripeSubscription(stripe, subscriptionId) {
  return stripe.rawRequest(
    'POST',
    `/v1/subscriptions/${encodeURIComponent(subscriptionId)}/resume`,
    {
      payment_behavior: 'resume_on_payment_success',
      billing_cycle_anchor: 'now',
      proration_behavior: 'create_prorations',
    },
    { apiVersion: STRIPE_PAUSE_API_VERSION }
  );
}

// ---------------------------------------------------------------------------
// Subscription → users.* mapping
// ---------------------------------------------------------------------------

// Newer Stripe API versions moved current_period_end from the subscription to
// its items; support both shapes.
export function subscriptionPeriodEnd(sub) {
  const ts =
    sub?.current_period_end ||
    sub?.items?.data?.[0]?.current_period_end ||
    null;
  return ts ? new Date(ts * 1000).toISOString() : null;
}

export function subscriptionCancellationAt(sub) {
  if (sub?.cancel_at) return new Date(sub.cancel_at * 1000).toISOString();
  if (sub?.cancel_at_period_end) return subscriptionPeriodEnd(sub);
  return null;
}

export function subscriptionIsPpp(sub) {
  if (sub?.metadata?.ppp === '1') return true;
  const lookup = sub?.items?.data?.[0]?.price?.lookup_key || '';
  return lookup.endsWith('_ppp');
}

export function skuFromLookupKey(lookupKey) {
  const normalized = String(lookupKey || '').replace(/_ppp$/, '');
  const match = Object.entries(LOOKUP_BY_SKU).find(([, lookup]) => lookup === normalized);
  return match?.[0] || null;
}

// Resolve a subscription's SKU. Prices superseded by transfer_lookup_key keep
// billing existing subscriptions but lose their lookup_key (it moves to the
// replacement price), so fall back to the sku stamped into subscription
// metadata at checkout. Only known SKUs are trusted from metadata.
export function subscriptionSku(sub) {
  const fromLookup = skuFromLookupKey(sub?.items?.data?.[0]?.price?.lookup_key);
  if (fromLookup) return fromLookup;
  const fromMetadata = String(sub?.metadata?.sku || '');
  return RECURRING_SKUS.includes(fromMetadata) || fromMetadata === 'exam_pass'
    ? fromMetadata
    : null;
}

// Map a Stripe subscription object to the users-table billing fields.
export function mapSubscriptionToPlanFields(sub) {
  const periodEnd = subscriptionPeriodEnd(sub);
  const cancellationAt = subscriptionCancellationAt(sub);
  const lookupKey = sub?.items?.data?.[0]?.price?.lookup_key || '';
  const startedAt = sub?.start_date || sub?.created || null;
  const truePauseResumeTimestamp = Number(
    sub?.metadata?.[STRIPE_PAUSE_RESUMES_AT_METADATA]
  );
  const pauseUntil = sub?.pause_collection?.resumes_at
    ? new Date(sub.pause_collection.resumes_at * 1000).toISOString()
    : sub?.status === 'paused'
      && Number.isFinite(truePauseResumeTimestamp)
      && truePauseResumeTimestamp > 0
      ? new Date(truePauseResumeTimestamp * 1000).toISOString()
      : null;
  const base = {
    stripe_customer_id:
      typeof sub.customer === 'string' ? sub.customer : sub.customer?.id || null,
    stripe_subscription_id: sub.id,
    // plan_renews_at doubles as the access-end timestamp after a scheduled
    // cancellation. Stripe can represent that with either cancel_at or
    // cancel_at_period_end depending on the Customer Portal configuration.
    plan_renews_at: cancellationAt || periodEnd,
    plan_expires_at: null,
    plan_sku: subscriptionSku(sub),
    premium_since: startedAt ? new Date(startedAt * 1000).toISOString() : null,
    billing_pause_until: pauseUntil,
  };
  if (sub.pause_collection) {
    // Keep the underlying entitlement active; billing_pause_until blocks
    // access while collection is paused and automatically restores it after.
    return { ...base, plan: 'premium', plan_status: 'active' };
  }
  switch (sub.status) {
    case 'active':
    case 'trialing':
      return {
        ...base,
        plan: 'premium',
        // A scheduled cancellation keeps access through plan_renews_at, but
        // must not be displayed or treated as a future renewal.
        plan_status: cancellationAt ? 'canceled' : sub.status === 'trialing' ? 'trialing' : 'active',
      };
    case 'past_due':
      return { ...base, plan: 'premium', plan_status: 'past_due' };
    case 'paused':
      // A requested true pause keeps the billing relationship but blocks
      // entitlement until the resume cron successfully reactivates payment.
      return pauseUntil
        ? { ...base, plan: 'premium', plan_status: 'paused' }
        : { ...base, plan: 'free', plan_status: 'inactive' };
    case 'canceled':
    case 'unpaid':
    case 'incomplete_expired':
      return { ...base, plan: 'free', plan_status: 'canceled' };
    default:
      // incomplete / paused: not entitled yet
      return { ...base, plan: 'free', plan_status: 'inactive' };
  }
}

// ---------------------------------------------------------------------------
// Webhook event handling (idempotent: pure state upserts keyed on user row)
// deps = { admin: supabase service-role client, stripe }
// Returns a short string describing what happened (for logs/tests).
// ---------------------------------------------------------------------------

async function findUserId(admin, { userId, customerId, subscriptionId }) {
  const candidates = [
    ['id', userId],
    ['stripe_subscription_id', subscriptionId],
    ['stripe_customer_id', customerId],
  ];
  for (const [column, value] of candidates) {
    if (!value) continue;
    const { data, error } = await admin
      .from('users')
      .select('id')
      .eq(column, value)
      .maybeSingle();
    if (error) {
      throw new Error(`user mapping ${column} lookup failed: ${error.message}`);
    }
    if (data?.id) return data.id;
  }
  return null;
}

async function applyPlanFields(admin, userId, fields) {
  const { error } = await admin.from('users').update(fields).eq('id', userId);
  if (error) throw new Error(`users update failed: ${error.message}`);
}

async function recordBillingEvent(admin, {
  billingEventId,
  event,
  userId,
  sku = null,
  ppp = null,
  amount = null,
  extra = {},
}) {
  const { error } = await admin.from('activity_events').insert({
    anon_id: `billing:${userId}`,
    billing_event_id: billingEventId || null,
    user_id: userId,
    event,
    props: {
      sku,
      ppp: ppp == null ? null : String(ppp),
      amount,
      amount_minor: amount,
      ...extra,
    },
  });
  // Stripe retries are expected. The unique billing_event_id makes the
  // analytics insert idempotent without weakening the entitlement update.
  if (error && error.code !== '23505') {
    throw new Error(`activity_events insert failed: ${error.message}`);
  }
}

async function queuePurchaseWelcome(
  admin,
  userId,
  { sku, purchaseId, accessExpiresAt = null }
) {
  const { data: user, error: userError } = await admin
    .from('users')
    .select('email')
    .eq('id', userId)
    .maybeSingle();
  if (userError) throw new Error(`purchase welcome user lookup failed: ${userError.message}`);
  if (!user?.email) return;
  const { error } = await admin.from('lifecycle_emails').insert({
    user_id: userId,
    recipient_email: String(user.email).toLowerCase(),
    email_type: 'welcome_purchase',
    idempotency_key: `welcome_purchase:${purchaseId || userId}`,
    payload: { sku, access_expires_at: accessExpiresAt },
  });
  if (error && error.code !== '23505') {
    throw new Error(`lifecycle_emails insert failed: ${error.message}`);
  }
}

async function seedRealtimeQuota(admin, userId, isPpp) {
  const quota = isPpp ? REALTIME_SECONDS_PPP : REALTIME_SECONDS_GLOBAL;
  const { error } = await admin
    .from('user_quotas')
    .update({
      realtime_seconds_quota: quota,
      realtime_seconds_remaining: quota,
      realtime_period_resets_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    })
    .eq('user_id', userId);
  if (error) throw new Error(`user_quotas update failed: ${error.message}`);
}

async function revokeRealtimeQuota(admin, userId) {
  const { error } = await admin
    .from('user_quotas')
    .update({ realtime_seconds_quota: 0, realtime_seconds_remaining: 0 })
    .eq('user_id', userId);
  if (error) throw new Error(`user_quotas update failed: ${error.message}`);
}

export async function handleStripeEvent(event, { admin, stripe }) {
  const obj = event.data?.object || {};

  switch (event.type) {
    case 'checkout.session.completed': {
      if (obj.mode === 'payment' && obj.payment_status === 'paid' && obj.metadata?.sku === 'exam_pass') {
        const userId = await findUserId(admin, {
          userId: obj.client_reference_id || obj.metadata?.user_id,
          customerId: typeof obj.customer === 'string' ? obj.customer : obj.customer?.id,
        });
        if (!userId) return 'error: no user mapping for exam pass checkout';
        const now = new Date();
        const expiresAt = new Date(
          now.getTime() + EXAM_PASS_DAYS * 24 * 3600 * 1000
        ).toISOString();
        await applyPlanFields(admin, userId, {
          plan: 'premium',
          plan_status: 'active',
          plan_started_at: now.toISOString(),
          premium_since: now.toISOString(),
          plan_renews_at: null,
          plan_expires_at: expiresAt,
          plan_sku: 'exam_pass',
          stripe_customer_id:
            typeof obj.customer === 'string' ? obj.customer : obj.customer?.id || null,
          stripe_subscription_id: null,
          canceled_at: null,
          billing_pause_until: null,
        });
        await seedRealtimeQuota(admin, userId, obj.metadata?.ppp === '1');
        await recordBillingEvent(admin, {
          billingEventId: `checkout:${obj.id}`,
          event: 'subscription_activated',
          userId,
          sku: 'exam_pass',
          ppp: obj.metadata?.ppp,
          amount: obj.amount_total,
          extra: {
            access_expires_at: expiresAt,
            billing_mode: 'payment',
            currency: obj.currency || null,
          },
        });
        // Server-side purchase event: the /data dashboard's revenue/funnel
        // queries count 'purchase_success' rows, and the client-side event
        // only fires when the buyer returns to /pricing signed in WITH
        // analytics consent intact — which cannot be relied on. Webhook rows
        // are billing records, independent of the client path. transaction_id
        // is the Checkout Session id, the same key GA4 dedupes on.
        await recordBillingEvent(admin, {
          billingEventId: `purchase:${obj.id}`,
          event: 'purchase_success',
          userId,
          sku: 'exam_pass',
          ppp: obj.metadata?.ppp,
          amount: obj.amount_total,
          extra: {
            currency: obj.currency || null,
            billing_mode: 'payment',
            transaction_id: obj.id,
          },
        });
        await queuePurchaseWelcome(admin, userId, {
          sku: 'exam_pass',
          purchaseId: obj.id,
          accessExpiresAt: expiresAt,
        });
        await sendGa4Purchase({
          clientId: obj.metadata?.ga_cid,
          userId,
          transactionId: obj.id,
          amountMinor: obj.amount_total,
          currency: obj.currency,
          sku: 'exam_pass',
          ppp: obj.metadata?.ppp === '1',
        });
        return `activated exam pass user ${userId}`;
      }
      if (obj.mode !== 'subscription' || !obj.subscription) return 'ignored: unsupported checkout';
      const sub =
        typeof obj.subscription === 'string'
          ? await stripe.subscriptions.retrieve(obj.subscription)
          : obj.subscription;
      const userId = await findUserId(admin, {
        userId: obj.client_reference_id || sub.metadata?.user_id,
        customerId: typeof obj.customer === 'string' ? obj.customer : obj.customer?.id,
      });
      if (!userId) return 'error: no user mapping for checkout.session.completed';
      const fields = mapSubscriptionToPlanFields(sub);
      await applyPlanFields(admin, userId, {
        ...fields,
        plan_started_at: fields.premium_since || new Date().toISOString(),
        canceled_at: null,
      });
      if (fields.plan === 'premium') await seedRealtimeQuota(admin, userId, subscriptionIsPpp(sub));
      if (fields.plan === 'premium') {
        await recordBillingEvent(admin, {
          billingEventId: `checkout:${obj.id}`,
          event: 'subscription_activated',
          userId,
          sku: fields.plan_sku,
          ppp: subscriptionIsPpp(sub) ? '1' : '0',
          amount: obj.amount_total,
          extra: {
            billing_mode: 'subscription',
            currency: obj.currency || null,
          },
        });
        // Server-side purchase event (see the exam-pass branch above): keeps
        // the /data dashboard's 'purchase_success' revenue/funnel queries fed
        // even when the buyer's client analytics never reports the purchase.
        // Idempotent via billing_event_id; GA4 dedup is untouched (GA only
        // receives the client purchase + the ga4mp backstop, both keyed on
        // this same transaction_id).
        await recordBillingEvent(admin, {
          billingEventId: `purchase:${obj.id}`,
          event: 'purchase_success',
          userId,
          sku: fields.plan_sku,
          ppp: subscriptionIsPpp(sub) ? '1' : '0',
          amount: obj.amount_total,
          extra: {
            currency: obj.currency || null,
            billing_mode: 'subscription',
            transaction_id: obj.id,
          },
        });
        await queuePurchaseWelcome(admin, userId, {
          sku: fields.plan_sku,
          purchaseId: obj.id,
        });
        // GA4 purchase backstop; dedupes against the client-side event by
        // transaction_id (the session id). No-op without consent/env secret.
        const ga4Outcome = await sendGa4Purchase({
          clientId: obj.metadata?.ga_cid,
          userId,
          transactionId: obj.id,
          amountMinor: obj.amount_total,
          currency: obj.currency,
          sku: fields.plan_sku,
          ppp: subscriptionIsPpp(sub),
        });
        if (!ga4Outcome.includes('skipped')) console.log(ga4Outcome);
      }
      return `activated user ${userId} (${fields.plan_status})`;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const userId = await findUserId(admin, {
        userId: obj.metadata?.user_id,
        subscriptionId: obj.id,
        customerId: typeof obj.customer === 'string' ? obj.customer : obj.customer?.id,
      });
      if (!userId) return 'ignored: no user mapping for subscription event';
      const fields = mapSubscriptionToPlanFields(obj);
      await applyPlanFields(admin, userId, fields);
      if (fields.plan === 'free') await revokeRealtimeQuota(admin, userId);
      return `synced user ${userId} -> ${fields.plan}/${fields.plan_status}`;
    }

    case 'customer.subscription.deleted': {
      const userId = await findUserId(admin, {
        userId: obj.metadata?.user_id,
        subscriptionId: obj.id,
        customerId: typeof obj.customer === 'string' ? obj.customer : obj.customer?.id,
      });
      if (!userId) return 'ignored: no user mapping for subscription.deleted';
      await applyPlanFields(admin, userId, {
        plan: 'free',
        plan_status: 'canceled',
        plan_renews_at: subscriptionPeriodEnd(obj),
        plan_expires_at: null,
        canceled_at: new Date().toISOString(),
      });
      await revokeRealtimeQuota(admin, userId);
      await recordBillingEvent(admin, {
        billingEventId: event.id,
        event: 'subscription_canceled',
        userId,
        sku: subscriptionSku(obj),
        ppp: subscriptionIsPpp(obj) ? '1' : '0',
        extra: { access_ends_at: subscriptionPeriodEnd(obj) },
      });
      return `downgraded user ${userId}`;
    }

    case 'invoice.paid': {
      if (obj.billing_reason === 'subscription_create') return 'ignored: activation handled by checkout';
      const nestedSubscription = obj.parent?.subscription_details?.subscription;
      const subId =
        typeof obj.subscription === 'string'
          ? obj.subscription
          : obj.subscription?.id ||
            (typeof nestedSubscription === 'string'
              ? nestedSubscription
              : nestedSubscription?.id);
      const userId = await findUserId(admin, {
        subscriptionId: subId,
        customerId: typeof obj.customer === 'string' ? obj.customer : obj.customer?.id,
      });
      if (!userId) return 'ignored: no user mapping for invoice.paid';
      let sub = null;
      if (subId) {
        sub = await stripe.subscriptions.retrieve(subId);
        await applyPlanFields(admin, userId, mapSubscriptionToPlanFields(sub));
        await seedRealtimeQuota(admin, userId, subscriptionIsPpp(sub));
      }
      await recordBillingEvent(admin, {
        billingEventId: `invoice:${obj.id || event.id}`,
        event: 'subscription_payment_succeeded',
        userId,
        sku: sub ? subscriptionSku(sub) : null,
        ppp: sub ? (subscriptionIsPpp(sub) ? '1' : '0') : null,
        amount: obj.amount_paid,
        extra: {
          currency: obj.currency || null,
          invoice_id: obj.id || null,
          billing_reason: obj.billing_reason || null,
        },
      });
      return `renewed user ${userId}`;
    }

    case 'invoice.payment_failed': {
      const userId = await findUserId(admin, {
        customerId: typeof obj.customer === 'string' ? obj.customer : obj.customer?.id,
      });
      if (!userId) return 'ignored: no user mapping for payment_failed';
      await applyPlanFields(admin, userId, { plan_status: 'past_due' });
      // Analytics row for the failed-renewal rate on the Monday scorecard
      // (weekly_scorecard: renewal_failed / renewal attempts). Idempotent via
      // billing_event_id, keyed on the invoice so Stripe's retries of the same
      // failure collapse into one row.
      await recordBillingEvent(admin, {
        billingEventId: `invoice_failed:${obj.id || event.id}`,
        event: 'renewal_failed',
        userId,
        amount: Number(obj.amount_due) || null,
        extra: {
          currency: obj.currency || null,
          invoice_id: obj.id || null,
          billing_reason: obj.billing_reason || null,
          attempt_count: Number(obj.attempt_count) || null,
        },
      });
      return `past_due user ${userId}`;
    }

    case 'charge.refunded':
    case 'charge.dispute.created': {
      let customerId =
        typeof obj.customer === 'string' ? obj.customer : obj.customer?.id;
      if (!customerId && event.type === 'charge.dispute.created' && obj.charge) {
        const charge =
          typeof obj.charge === 'string'
            ? await stripe.charges.retrieve(obj.charge)
            : obj.charge;
        customerId =
          typeof charge?.customer === 'string' ? charge.customer : charge?.customer?.id;
      }
      const userId = await findUserId(admin, { customerId });
      if (!userId) return 'ignored: no user mapping for refund/dispute';
      await applyPlanFields(admin, userId, {
        plan: 'free',
        plan_status: 'refunded',
        plan_expires_at: null,
        billing_pause_until: null,
      });
      await revokeRealtimeQuota(admin, userId);
      if (event.type === 'charge.refunded') {
        const previousRefunded =
          Number(event.data?.previous_attributes?.amount_refunded) || 0;
        const totalRefunded = Number(obj.amount_refunded) || 0;
        await recordBillingEvent(admin, {
          billingEventId: `refund:${event.id}`,
          event: 'payment_refunded',
          userId,
          amount: Math.max(totalRefunded - previousRefunded, 0),
          extra: {
            currency: obj.currency || null,
            charge_id: obj.id || null,
          },
        });
      } else {
        await recordBillingEvent(admin, {
          billingEventId: `dispute:${event.id}`,
          event: 'payment_disputed',
          userId,
          amount: Number(obj.amount) || 0,
          extra: {
            currency: obj.currency || null,
            dispute_id: obj.id || null,
            charge_id:
              typeof obj.charge === 'string' ? obj.charge : obj.charge?.id || null,
          },
        });
      }
      return `refunded user ${userId}`;
    }

    default:
      return `ignored: ${event.type}`;
  }
}
