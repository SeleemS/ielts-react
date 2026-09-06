// lib/billing.js
// Stripe billing core: price resolution (incl. server-side PPP), subscription
// state → users.plan mapping, and the webhook event handler. Route files stay
// thin; everything here is pure or dependency-injected so vitest can cover it.
// See docs/MONETIZATION.md §4 (Stripe), §5.3 (limits), §9.3 (realtime meter).

import Stripe from 'stripe';
import { sendGa4Purchase } from './ga4mp';

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

// Both webhook delivery and authenticated return reconciliation use the same
// transaction. Never fall back to separate writes when the RPC is unavailable.
async function fulfillCheckout(admin, session, userId, fields, quota) {
  if (!session.id || !Number.isFinite(session.created) || session.created <= 0) {
    throw new Error('checkout fulfillment requires a Stripe session id and creation timestamp');
  }
  const { data, error } = await admin.rpc('fulfill_checkout', {
    p_session_id: session.id,
    p_user_id: userId,
    p_session_created_at: new Date(session.created * 1000).toISOString(),
    p_fields: fields,
    p_realtime_quota: quota,
  });
  if (error || !data?.status) {
    throw new Error(`checkout fulfillment failed: ${error?.message || 'missing result'}`);
  }
  return data;
}

function invoiceSubscriptionId(invoice) {
  const value = invoice.subscription || invoice.parent?.subscription_details?.subscription;
  return typeof value === 'string' ? value : value?.id || null;
}

async function invoiceCoversCurrentPeriod(invoice, sub, stripe) {
  const periodStart = sub.current_period_start || sub.items?.data?.[0]?.current_period_start;
  if (!Number.isFinite(periodStart)) throw new Error('subscription current period is unavailable');
  let lines = invoice.lines?.data;
  if (!Array.isArray(lines) || invoice.lines?.has_more) {
    lines = await stripe.invoices.listLineItems(invoice.id, { limit: 100 })
      .autoPagingToArray({ limit: 1000 });
  }
  const subscriptionLines = lines.filter(line => {
    const details = line.parent?.subscription_item_details;
    const lineSub = details?.subscription || line.subscription;
    const lineSubId = typeof lineSub === 'string' ? lineSub : lineSub?.id;
    return (line.type === 'subscription' || details)
      && !line.proration && !details?.proration
      && (!lineSubId || lineSubId === sub.id);
  });
  if (!subscriptionLines.length || subscriptionLines.some(line =>
    !Number.isFinite(line.period?.start) || !Number.isFinite(line.period?.end))) {
    throw new Error('invoice subscription service period is unavailable');
  }
  // Invoice.period_end is the invoice-item collection window, not the service
  // period. Match the actual subscription line, excluding proration items.
  return subscriptionLines.some(line => line.period.start <= periodStart && line.period.end > periodStart);
}

async function applySubscriptionEvent(admin, event, userId, sub, {
  eventKey = event.id, allowReplace = false, quota = null, invoiceCreated = null,
  purchaseInvoiceId = null, purchaseRequiresRefill = false,
} = {}) {
  if (!eventKey || !Number.isFinite(event.created) || !Number.isFinite(sub.created)) {
    throw new Error('subscription event requires immutable Stripe identity/timestamps');
  }
  const fields = mapSubscriptionToPlanFields(sub);
  const { data, error } = await admin.rpc('apply_subscription_billing_event', {
    p_event_key: eventKey,
    p_user_id: userId,
    p_subscription_created_at: new Date(sub.created * 1000).toISOString(),
    p_event_created_at: new Date(event.created * 1000).toISOString(),
    p_fields: { ...fields, _invoice_id: purchaseInvoiceId || stripeId(sub.latest_invoice),
      _paid_purchase: Boolean(purchaseInvoiceId), _purchase_requires_refill: purchaseRequiresRefill },
    p_allow_replace: allowReplace,
    p_realtime_quota: fields.plan === 'free' ? 0 : quota,
    p_invoice_created_at: invoiceCreated ? new Date(invoiceCreated * 1000).toISOString() : null,
  });
  if (error || !data?.status) {
    throw new Error(`subscription event application failed: ${error?.message || 'missing result'}`);
  }
  return { ...data, fields };
}

function stripeId(value) {
  return typeof value === 'string' ? value : value?.id || null;
}

async function revokePurchase(admin, userId, { purchaseKey, subscriptionId = null, chargeId, reason, providerCurrentKey = null }) {
  const { data, error } = await admin.rpc('revoke_billing_purchase', {
    p_user_id: userId, p_purchase_key: purchaseKey, p_subscription_id: subscriptionId,
    p_charge_id: chargeId, p_reason: reason, p_provider_current_key: providerCurrentKey,
  });
  if (error || !data?.status) throw new Error(`purchase revocation failed: ${error?.message || 'missing result'}`);
  if (data.status === 'needs_reconciliation') {
    throw new Error('purchase revocation requires exact legacy purchase reconciliation');
  }
  return data.status;
}

async function checkExamPassPayment(session, userId, admin, stripe) {
  const paymentIntentId = stripeId(session.payment_intent);
  if (!paymentIntentId) {
    if (session.amount_total === 0) return true;
    throw new Error('paid checkout PaymentIntent is unavailable');
  }
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] });
  if (intent.status !== 'succeeded') throw new Error('checkout PaymentIntent is not settled');
  const charge = typeof intent.latest_charge === 'string'
    ? await stripe.charges.retrieve(intent.latest_charge) : intent.latest_charge;
  if (!charge?.id || stripeId(charge.payment_intent) !== paymentIntentId) {
    throw new Error('checkout charge relationship is unavailable');
  }
  if (charge.refunded || Number(charge.amount_refunded) > 0 || charge.disputed) {
    await revokePurchase(admin, userId, { purchaseKey: `checkout:${session.id}`,
      chargeId: charge.id, reason: charge.disputed ? 'dispute' : 'refund' });
    return false;
  }
  return true;
}

async function purchaseForCharge(charge, admin, stripe) {
  const paymentIntentId = stripeId(charge.payment_intent);
  if (!paymentIntentId && !stripeId(charge.invoice)) {
    throw new Error('refund charge requires payment relationship reconciliation');
  }
  if (paymentIntentId) {
    const sessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntentId, limit: 2 });
    const passes = sessions.data.filter(session => session.mode === 'payment');
    if (passes.length > 1 || sessions.has_more) throw new Error('ambiguous refund checkout relationship');
    if (passes.length === 1) {
      const session = passes[0];
      if (stripeId(session.payment_intent) !== paymentIntentId || session.metadata?.sku !== 'exam_pass'
        || stripeId(session.customer) !== stripeId(charge.customer)) {
        throw new Error('refund checkout relationship mismatch');
      }
      const userId = await findUserId(admin, {
        userId: session.client_reference_id || session.metadata?.user_id,
      });
      if (!userId) throw new Error('refund checkout user requires reconciliation');
      return { userId, purchaseKey: `checkout:${session.id}`, subscriptionId: null };
    }
  }
  let invoiceId = stripeId(charge.invoice);
  if (!invoiceId) {
    const payments = await stripe.invoicePayments.list({
      payment: { type: 'payment_intent', payment_intent: paymentIntentId }, limit: 2,
    });
    const ids = [...new Set(payments.data.map(payment => stripeId(payment.invoice)).filter(Boolean))];
    if (ids.length !== 1 || payments.has_more) throw new Error('refund invoice requires relationship reconciliation');
    invoiceId = ids[0];
  }
  const invoice = await stripe.invoices.retrieve(invoiceId);
  const subscriptionId = invoiceSubscriptionId(invoice);
  if (!subscriptionId || stripeId(invoice.customer) !== stripeId(charge.customer)) {
    throw new Error('refund invoice subscription relationship mismatch');
  }
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  // Customer may locate the owner of an old retired subscription, but never
  // authorizes revocation: the RPC compares exact purchase/subscription keys.
  const userId = await findUserId(admin, { userId: sub.metadata?.user_id,
    subscriptionId, customerId: stripeId(charge.customer) });
  if (!userId) throw new Error('refund subscription user requires reconciliation');
  if (stripeId(sub.customer) !== stripeId(charge.customer) || !stripeId(sub.latest_invoice)) {
    throw new Error('refund current subscription invoice requires reconciliation');
  }
  const latestInvoice = stripeId(sub.latest_invoice) === invoiceId ? invoice
    : await stripe.invoices.retrieve(stripeId(sub.latest_invoice));
  // latest_invoice can be open/unpaid. Only verified paid replacement evidence
  // may override an otherwise matching local funded-purchase pointer.
  const providerCurrentKey = latestInvoice.status === 'paid'
    ? `invoice:${latestInvoice.id}` : null;
  return { userId, purchaseKey: `invoice:${invoiceId}`, subscriptionId, providerCurrentKey };
}

export async function handleStripeEvent(event, { admin, stripe }) {
  const obj = event.data?.object || {};

  switch (event.type) {
    case 'checkout.session.completed': {
      // Completed no-cost orders have no PaymentIntent. Only accept the
      // no-payment status for a confirmed zero total, never an unpaid order.
      const examPassSettled = obj.payment_status === 'paid'
        || (obj.payment_status === 'no_payment_required' && obj.amount_total === 0);
      if (obj.mode === 'payment' && examPassSettled && obj.metadata?.sku === 'exam_pass') {
        const userId = await findUserId(admin, {
          userId: obj.client_reference_id || obj.metadata?.user_id,
          customerId: typeof obj.customer === 'string' ? obj.customer : obj.customer?.id,
        });
        if (!userId) return 'error: no user mapping for exam pass checkout';
        if (!await checkExamPassPayment(obj, userId, admin, stripe)) {
          return 'ignored: checkout payment revoked';
        }
        // The database starts the full 30-day pass once, inside the same
        // transaction as its receipt. Retries reuse that recorded expiration.
        const fulfillment = await fulfillCheckout(admin, obj, userId, {
          plan: 'premium',
          plan_status: 'active',
          plan_renews_at: null,
          plan_sku: 'exam_pass',
          stripe_customer_id:
            typeof obj.customer === 'string' ? obj.customer : obj.customer?.id || null,
          stripe_subscription_id: null,
          canceled_at: null,
          billing_pause_until: null,
        }, obj.metadata?.ppp === '1' ? REALTIME_SECONDS_PPP : REALTIME_SECONDS_GLOBAL);
        if (!['applied', 'already_applied'].includes(fulfillment.status)) {
          return `ignored: checkout ${fulfillment.status}`;
        }
        const expiresAt = fulfillment.access_expires_at;
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
      // Do not record a terminal fulfillment for incomplete/unpaid checkout.
      // A later delivery must be able to grant access and seed its first quota.
      if (fields.plan !== 'premium') {
        return 'error: checkout subscription is not entitled yet';
      }
      const fulfillment = await fulfillCheckout(admin, obj, userId, {
        ...fields,
        _invoice_id: stripeId(sub.latest_invoice),
        plan_started_at: fields.premium_since || new Date(obj.created * 1000).toISOString(),
        canceled_at: null,
      }, fields.plan === 'premium'
        ? subscriptionIsPpp(sub) ? REALTIME_SECONDS_PPP : REALTIME_SECONDS_GLOBAL
        : 0);
      if (!['applied', 'already_applied'].includes(fulfillment.status)) {
        return `ignored: checkout ${fulfillment.status}`;
      }
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
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const deleted = event.type === 'customer.subscription.deleted';
      // Retrieve the current provider snapshot, not an out-of-order event's
      // stale payload. Transient provider failures throw before any receipt.
      const sub = await stripe.subscriptions.retrieve(obj.id);
      const userId = await findUserId(admin, {
        userId: sub.metadata?.user_id,
        subscriptionId: sub.id,
      });
      if (!userId) return deleted
        ? 'ignored: no user mapping for subscription.deleted'
        : 'ignored: no user mapping for subscription event';
      const result = await applySubscriptionEvent(admin, event, userId, sub, {
        allowReplace: !deleted,
      });
      if (deleted) {
        await recordBillingEvent(admin, {
          billingEventId: event.id,
          event: 'subscription_canceled', userId,
          sku: subscriptionSku(sub), ppp: subscriptionIsPpp(sub) ? '1' : '0',
          extra: { access_ends_at: subscriptionPeriodEnd(sub), subscription_id: sub.id },
        });
      }
      if (result.status === 'stale' || result.status === 'revoked') return `ignored: ${result.status} subscription event`;
      return deleted ? `downgraded user ${userId}`
        : `synced user ${userId} -> ${result.fields.plan}/${result.fields.plan_status}`;
    }

    case 'invoice.paid':
    case 'invoice.payment_failed': {
      const paid = event.type === 'invoice.paid';
      if (paid && obj.billing_reason === 'subscription_create') {
        return 'ignored: activation handled by checkout';
      }
      const subId = invoiceSubscriptionId(obj);
      if (!subId) return 'ignored: invoice has no subscription';
      // Customer identity is insufficient: one customer can have multiple old
      // and current subscriptions. The RPC only mutates the exact current one.
      const sub = await stripe.subscriptions.retrieve(subId);
      const userId = await findUserId(admin, {
        userId: sub.metadata?.user_id, subscriptionId: subId,
      });
      if (!userId) return 'ignored: no user mapping for invoice';
      if (!obj.id || (paid && !Number.isFinite(obj.created))) {
        throw new Error('invoice requires immutable Stripe identity/timestamp');
      }
      const eventKey = `${paid ? 'invoice' : 'invoice_failed'}:${obj.id}`;
      const refill = paid && obj.billing_reason === 'subscription_cycle'
        && await invoiceCoversCurrentPeriod(obj, sub, stripe);
      const result = await applySubscriptionEvent(admin, event, userId, sub, {
        eventKey: paid ? eventKey : event.id,
        quota: refill
          ? subscriptionIsPpp(sub) ? REALTIME_SECONDS_PPP : REALTIME_SECONDS_GLOBAL
          : null,
        invoiceCreated: paid ? obj.created : null,
        purchaseInvoiceId: paid && (refill || (obj.billing_reason === 'subscription_update'
          && obj.id === stripeId(sub.latest_invoice))) ? obj.id : null,
        purchaseRequiresRefill: obj.billing_reason === 'subscription_cycle',
      });
      await recordBillingEvent(admin, {
        billingEventId: eventKey,
        event: paid ? 'subscription_payment_succeeded' : 'renewal_failed',
        userId, sku: subscriptionSku(sub), ppp: subscriptionIsPpp(sub) ? '1' : '0',
        amount: paid ? obj.amount_paid : Number(obj.amount_due) || null,
        extra: {
          currency: obj.currency || null,
          invoice_id: obj.id || null,
          subscription_id: subId,
          billing_reason: obj.billing_reason || null,
          ...(!paid ? { attempt_count: Number(obj.attempt_count) || null } : {}),
        },
      });
      if (result.status === 'stale' || result.status === 'revoked') return `ignored: ${result.status} invoice entitlement`;
      return paid ? `renewed user ${userId}` : `synced user ${userId} -> ${result.fields.plan_status}`;
    }

    case 'charge.refunded':
    case 'charge.dispute.created': {
      const chargeId = event.type === 'charge.refunded' ? obj.id : stripeId(obj.charge);
      if (!chargeId) throw new Error('refund/dispute charge is unavailable');
      const charge = await stripe.charges.retrieve(chargeId);
      const purchase = await purchaseForCharge(charge, admin, stripe);
      const { userId } = purchase;
      const revocation = await revokePurchase(admin, userId, {
        ...purchase, chargeId, reason: event.type === 'charge.refunded' ? 'refund' : 'dispute',
      });
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
      return `refunded purchase ${purchase.purchaseKey} (${revocation})`;
    }

    default:
      return `ignored: ${event.type}`;
  }
}
