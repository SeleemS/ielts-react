// lib/billing.js
// Stripe billing core: price resolution (incl. server-side PPP), subscription
// state → users.plan mapping, and the webhook event handler. Route files stay
// thin; everything here is pure or dependency-injected so vitest can cover it.
// See docs/MONETIZATION.md §4 (Stripe), §5.3 (limits), §9.3 (realtime meter).

import Stripe from 'stripe';
import { sendGa4Event, sendGa4Purchase } from './ga4mp';
import {
  couponFromSession,
  queueCheckoutRecoveryEmail,
  safeRecoveryUrl,
  upgradeContextFromSession,
} from './checkoutRecovery';
import { examPassDays, examPassDaysFromMetadata } from '../src/lib/saleConfig';
import { BILLING_USER_COLUMNS, billingOwnership } from './checkoutEligibility';

// ---------------------------------------------------------------------------
// SKUs and PPP
// ---------------------------------------------------------------------------
// New purchases are limited to the three plans advertised on /pricing: Monthly,
// Annual, and the one-time Exam Pass. The retired 3-month and 6-month lookup
// keys remain below so existing subscriptions, historical webhook events, and
// account-only upgrades continue to map correctly.
// 'week_pass' is a 7-day one-time pass (no live-examiner minutes). It is
// fulfilled exactly like the Exam Pass — users.plan_sku = 'exam_pass', the
// one-time-pass entitlement class — and differs only in its Stripe price,
// checkout metadata (sku, pass_days = 7) and the database's _pass_product
// allowlist. Checkout sells it only when NEXT_PUBLIC_WEEK_PASS=1.
export const CHECKOUT_SKUS = ['monthly', 'annual', 'exam_pass', 'week_pass'];
export const ONE_TIME_SKUS = ['exam_pass', 'week_pass'];
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
  week_pass: 'premium_week_pass',
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

// Markets where the one-time Exam Pass leads every upgrade surface: all PPP
// countries (Indian cards need RBI e-mandates for renewals and routinely
// decline them) plus mainland China and Hong Kong, where wallet payments are
// one-time only. Display-only: it changes emphasis and copy, never price
// (price stays PPP-or-global via resolveLookupKey on the server).
export const PASS_FIRST_EXTRA_COUNTRIES = new Set(['CN', 'HK']);

export function isPassFirstMarket(countryCode) {
  const code = String(countryCode || '').toUpperCase();
  return isPppCountry(code) || PASS_FIRST_EXTRA_COUNTRIES.has(code);
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

// Copy and grant are driven by one value, but the grant happens in the
// database. If an out-of-date database function ever granted less than the
// checkout promised, say so loudly in the webhook logs (the entitlement itself
// is never rewritten outside the fulfillment transaction).
function warnIfPassShort(fulfillment, passDays, sessionId) {
  if (fulfillment?.status !== 'applied' || !fulfillment.access_expires_at) return;
  const grantedDays = (new Date(fulfillment.access_expires_at).getTime() - Date.now()) / 86400000;
  if (Number.isFinite(grantedDays) && grantedDays < passDays - 1) {
    console.error('EXAM PASS LENGTH MISMATCH:', {
      sessionId, promisedDays: passDays, grantedDays: Math.round(grantedDays * 10) / 10,
    });
  }
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
      if (stripeId(session.payment_intent) !== paymentIntentId || !isOneTimeSku(session.metadata?.sku)
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

// A session opened from a Stripe recovery link is a copy of the expired one.
// Stripe copies its parameters, but fulfillment must never depend on that: if
// the copy arrives without our user/SKU stamps, take them from the original
// session — only when both belong to the same Stripe customer.
async function withRecoveredContext(session, stripe) {
  const recoveredFrom = session?.recovered_from;
  if (!recoveredFrom) return session;
  const hasUser = Boolean(session.client_reference_id || session.metadata?.user_id);
  if (hasUser && session.metadata?.sku) return session;
  const original = await stripe.checkout.sessions.retrieve(recoveredFrom);
  if (!original?.id || stripeId(original.customer) !== stripeId(session.customer)) {
    throw new Error('recovered checkout does not match its original session');
  }
  return {
    ...session,
    client_reference_id: session.client_reference_id || original.client_reference_id || null,
    metadata: { ...(original.metadata || {}), ...(session.metadata || {}) },
  };
}

// The expired session a checkout replaced: Stripe's `recovered_from` (a raw
// recovery URL was opened) or our metadata.resumed_from (the recovery email's
// guarded /billing/resume link opened a fresh session).
function recoveredFromSession(session) {
  if (session?.recovered_from) return { id: session.recovered_from, path: 'stripe_recovery_url' };
  const resumed = session?.metadata?.resumed_from;
  if (typeof resumed === 'string' && /^cs_[A-Za-z0-9_]{1,200}$/.test(resumed)) {
    return { id: resumed, path: 'resume_link' };
  }
  return null;
}

// Durable record + GA4 backstop for a purchase completed from a recovery link.
async function recordRecoveredCheckout(admin, session, userId, { sku, ppp }) {
  const recovered = recoveredFromSession(session);
  if (!recovered) return;
  await recordBillingEvent(admin, {
    billingEventId: `recovered:${session.id}`,
    event: 'checkout_recovered',
    userId,
    sku,
    ppp,
    amount: session.amount_total,
    extra: {
      currency: session.currency || null,
      transaction_id: session.id,
      recovered_from: recovered.id,
      recovery_path: recovered.path,
    },
  });
  await sendGa4Event({
    clientId: session.metadata?.ga_cid,
    userId,
    name: 'checkout_recovered',
    params: { transaction_id: session.id, recovered_from: recovered.id, sku: sku || '' },
  });
}

// ---------------------------------------------------------------------------
// Duplicate-purchase backstop. Checkout refuses a second subscription or a
// stacked Exam Pass (lib/checkoutEligibility), but a purchase can still slip
// past it — a raw Stripe recovery URL, two tabs racing, an old session link.
// When a completed checkout lands on an account that ALREADY owned a live
// subscription (or, for a pass, a live pass) before this session, shout in the
// logs and record `duplicate_purchase` so the founder can refund by hand. The
// code never cancels or refunds anything itself.
// ---------------------------------------------------------------------------
const LIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid', 'paused']);

// The account's billing columns BEFORE fulfillment overwrites them. Fail-soft:
// the backstop must never block a legitimate fulfillment.
async function priorBillingState(admin, userId) {
  try {
    const { data, error } = await admin
      .from('users')
      .select(`${BILLING_USER_COLUMNS}, plan_sku`)
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  } catch (error) {
    console.warn('duplicate-purchase check skipped (billing state unavailable):', error?.message || error);
    return null;
  }
}

// Other live subscriptions on the same Stripe customer: the authoritative
// double-billing signal, independent of webhook ordering (a
// customer.subscription.created event may already have pointed the account
// row at the NEW subscription).
async function otherLiveSubscriptions(stripe, customerId, currentSubscriptionId) {
  if (!customerId || typeof stripe?.subscriptions?.list !== 'function') return [];
  try {
    const list = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 20 });
    return (list?.data || [])
      .filter((sub) => sub?.id && sub.id !== currentSubscriptionId && LIVE_SUBSCRIPTION_STATUSES.has(sub.status))
      .map((sub) => sub.id);
  } catch (error) {
    console.warn('duplicate-purchase check: subscription list unavailable:', error?.message || error);
    return [];
  }
}

// Pure. Why this completed purchase duplicates something the account already
// had, or [] when it does not. `accessExpiresAt` is the pass expiry the
// fulfillment recorded, used to recognise a webhook retry of the same pass.
export function duplicatePurchaseReasons(prior, {
  sku, subscriptionId = null, accessExpiresAt = null, otherSubscriptionIds = [], nowMs = Date.now(),
}) {
  const reasons = [];
  if (otherSubscriptionIds.length) reasons.push('customer_has_other_live_subscription');
  if (!prior) return reasons;
  const ownership = billingOwnership(prior, nowMs);
  const priorIsThisSubscription = Boolean(subscriptionId) && prior.stripe_subscription_id === subscriptionId;
  if (ownership.ownsRecurringPlan && !priorIsThisSubscription) {
    reasons.push('account_had_subscription');
  }
  const priorIsThisPass = Boolean(accessExpiresAt) && Boolean(prior.plan_expires_at)
    && Date.parse(prior.plan_expires_at) === Date.parse(accessExpiresAt);
  if (isOneTimeSku(sku) && ownership.holdsExamPass && !priorIsThisPass) {
    reasons.push('account_had_exam_pass');
  }
  return reasons;
}

async function flagDuplicatePurchase(admin, stripe, session, userId, prior, {
  sku, ppp, subscriptionId = null, accessExpiresAt = null,
}) {
  const customerId = stripeId(session.customer);
  const otherSubscriptionIds = await otherLiveSubscriptions(stripe, customerId, subscriptionId);
  const reasons = duplicatePurchaseReasons(prior, { sku, subscriptionId, accessExpiresAt, otherSubscriptionIds });
  if (!reasons.length) return false;
  const recovered = recoveredFromSession(session);
  const details = {
    transaction_id: session.id,
    customer_id: customerId,
    subscription_id: subscriptionId,
    reasons,
    other_live_subscription_ids: otherSubscriptionIds,
    prior_subscription_id: prior?.stripe_subscription_id || null,
    prior_plan_sku: prior?.plan_sku || null,
    prior_plan_status: prior?.plan_status || null,
    prior_expires_at: prior?.plan_expires_at || null,
    recovered_from: recovered?.id || null,
    recovery_path: recovered?.path || null,
    currency: session.currency || null,
    action: 'manual refund review — nothing was canceled or refunded automatically',
  };
  console.error('DUPLICATE PURCHASE:', { userId, sku, amount: session.amount_total, ...details });
  try {
    await recordBillingEvent(admin, {
      billingEventId: `duplicate:${session.id}`,
      event: 'duplicate_purchase',
      userId,
      sku,
      ppp,
      amount: session.amount_total,
      extra: details,
    });
  } catch (error) {
    // The log line above is the alert; a failed analytics row must not make
    // Stripe retry an already-granted purchase.
    console.error('DUPLICATE PURCHASE record failed:', session.id, error?.message || error);
  }
  return true;
}

export async function handleStripeEvent(event, { admin, stripe }) {
  let obj = event.data?.object || {};
  if (event.type === 'checkout.session.completed') {
    obj = await withRecoveredContext(obj, stripe);
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      // Completed no-cost orders have no PaymentIntent. Only accept the
      // no-payment status for a confirmed zero total, never an unpaid order.
      const examPassSettled = obj.payment_status === 'paid'
        || (obj.payment_status === 'no_payment_required' && obj.amount_total === 0);
      if (obj.mode === 'payment' && examPassSettled && isOneTimeSku(obj.metadata?.sku)) {
        // The product actually bought (Exam Pass or Week Pass). Both grant the
        // same one-time-pass entitlement; the product picks the length and
        // whether live-examiner minutes are included.
        const passSku = obj.metadata.sku;
        const weekPass = passSku === 'week_pass';
        const userId = await findUserId(admin, {
          userId: obj.client_reference_id || obj.metadata?.user_id,
          customerId: typeof obj.customer === 'string' ? obj.customer : obj.customer?.id,
        });
        if (!userId) return 'error: no user mapping for exam pass checkout';
        if (!await checkExamPassPayment(obj, userId, admin, stripe)) {
          return 'ignored: checkout payment revoked';
        }
        // The database starts the full pass once, inside the same transaction
        // as its receipt. Retries reuse that recorded expiration. The length
        // is the one this checkout advertised (stamped at session creation);
        // sessions created before the stamp existed get today's length.
        const passDays = examPassDaysFromMetadata(obj.metadata) ?? (weekPass ? null : examPassDays());
        if (passDays == null) return 'error: week pass checkout without a valid pass length';
        const priorPassState = await priorBillingState(admin, userId);
        const fulfillment = await fulfillCheckout(admin, obj, userId, {
          _exam_pass_days: passDays,
          ...(weekPass ? { _pass_product: 'week_pass' } : {}),
          plan: 'premium',
          plan_status: 'active',
          plan_renews_at: null,
          plan_sku: 'exam_pass',
          stripe_customer_id:
            typeof obj.customer === 'string' ? obj.customer : obj.customer?.id || null,
          stripe_subscription_id: null,
          canceled_at: null,
          billing_pause_until: null,
        }, weekPass ? 0 : obj.metadata?.ppp === '1' ? REALTIME_SECONDS_PPP : REALTIME_SECONDS_GLOBAL);
        if (!['applied', 'already_applied'].includes(fulfillment.status)) {
          return `ignored: checkout ${fulfillment.status}`;
        }
        const expiresAt = fulfillment.access_expires_at;
        warnIfPassShort(fulfillment, passDays, obj.id);
        await flagDuplicatePurchase(admin, stripe, obj, userId, priorPassState, {
          sku: passSku, ppp: obj.metadata?.ppp, accessExpiresAt: expiresAt,
        });
        await recordBillingEvent(admin, {
          billingEventId: `checkout:${obj.id}`,
          event: 'subscription_activated',
          userId,
          sku: passSku,
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
          sku: passSku,
          ppp: obj.metadata?.ppp,
          amount: obj.amount_total,
          extra: {
            currency: obj.currency || null,
            billing_mode: 'payment',
            transaction_id: obj.id,
            recovered_from: obj.recovered_from || null,
          },
        });
        await recordRecoveredCheckout(admin, obj, userId, { sku: passSku, ppp: obj.metadata?.ppp });
        await queuePurchaseWelcome(admin, userId, {
          sku: passSku,
          purchaseId: obj.id,
          accessExpiresAt: expiresAt,
        });
        await sendGa4Purchase({
          clientId: obj.metadata?.ga_cid,
          userId,
          transactionId: obj.id,
          amountMinor: obj.amount_total,
          currency: obj.currency,
          sku: passSku,
          ppp: obj.metadata?.ppp === '1',
          recoveredFrom: obj.recovered_from,
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
      const priorSubscriptionState = await priorBillingState(admin, userId);
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
      await flagDuplicatePurchase(admin, stripe, obj, userId, priorSubscriptionState, {
        sku: fields.plan_sku, ppp: subscriptionIsPpp(sub) ? '1' : '0', subscriptionId: sub.id,
      });
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
            recovered_from: obj.recovered_from || null,
          },
        });
        await recordRecoveredCheckout(admin, obj, userId, {
          sku: fields.plan_sku,
          ppp: subscriptionIsPpp(sub) ? '1' : '0',
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
          recoveredFrom: obj.recovered_from,
        });
        if (!ga4Outcome.includes('skipped')) console.log(ga4Outcome);
      }
      return `activated user ${userId} (${fields.plan_status})`;
    }

    case 'checkout.session.expired': {
      // An abandoned checkout (sessions live 3h; see lib/checkoutRecovery).
      // Nothing is granted or revoked here: record the expiry, then queue one
      // checkout_abandoned email linking to our guarded /billing/resume route
      // (never Stripe's raw recovery URL, which would bypass checkout guards).
      const userId = await findUserId(admin, {
        userId: obj.client_reference_id || obj.metadata?.user_id,
        customerId: stripeId(obj.customer),
      });
      if (!userId) return 'ignored: no user mapping for expired checkout';
      const recovery = obj.after_expiration?.recovery || null;
      const recoveryUrl = safeRecoveryUrl(recovery?.url);
      const recoveryExpiresAt = Number.isFinite(recovery?.expires_at)
        ? new Date(recovery.expires_at * 1000).toISOString()
        : null;
      const sku = CHECKOUT_SKUS.includes(obj.metadata?.sku) ? obj.metadata.sku : null;
      await recordBillingEvent(admin, {
        billingEventId: `expired:${obj.id}`,
        event: 'checkout_expired',
        userId,
        sku,
        ppp: obj.metadata?.ppp,
        amount: obj.amount_total,
        extra: {
          currency: obj.currency || null,
          billing_mode: obj.mode || null,
          transaction_id: obj.id,
          recovery_available: Boolean(recoveryUrl),
          recovery_expires_at: recoveryExpiresAt,
          recovered_from: obj.recovered_from || null,
        },
      });
      await sendGa4Event({
        clientId: obj.metadata?.ga_cid,
        userId,
        name: 'checkout_expired',
        params: { transaction_id: obj.id, sku: sku || '', recovery_available: Boolean(recoveryUrl) },
      });
      const emailOutcome = await queueCheckoutRecoveryEmail(admin, userId, {
        sessionId: obj.id,
        sessionCreated: obj.created,
        recoveryUrl,
        recoveryExpiresAt,
        sku,
        upgradeContext: upgradeContextFromSession(obj),
        coupon: couponFromSession(obj),
      });
      return `recorded expired checkout for user ${userId} (${emailOutcome})`;
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
