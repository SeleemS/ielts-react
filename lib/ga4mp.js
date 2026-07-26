// lib/ga4mp.js
// GA4 Measurement Protocol purchase backstop (server-side).
//
// The primary purchase event is fired client-side when the buyer returns to
// /pricing?checkout=success (pages/pricing.jsx). Buyers who close the tab on
// Stripe's receipt page never fire it, so the webhook also reports the
// purchase here. Both use the Checkout Session id as transaction_id, which
// GA4 deduplicates, so double-reporting is safe.
//
// Requirements (both must hold, otherwise this is a silent no-op):
//   * env GA4_MP_API_SECRET — created in GA Admin → Data streams → web stream
//     → Measurement Protocol API secrets.
//   * a ga_cid in the Checkout Session metadata — stamped at checkout time
//     from the buyer's _ga cookie, which only exists when the buyer granted
//     analytics consent. No consent → no cookie → no server-side event.

const GA4_MEASUREMENT_ID = 'G-1KRYZZY68X';
const MP_ENDPOINT = 'https://www.google-analytics.com/mp/collect';
const GA_CLIENT_ID_RE = /^\d+\.\d+$/;

export function sanitizeGaClientId(value) {
  const clientId = String(value || '').trim();
  return GA_CLIENT_ID_RE.test(clientId) ? clientId : null;
}

// Fire-and-forget semantics for callers: never throws, returns a short status
// string for webhook logs.
export async function sendGa4Purchase({
  clientId,
  userId = null,
  transactionId,
  amountMinor,
  currency,
  sku,
  ppp = false,
}) {
  const apiSecret = process.env.GA4_MP_API_SECRET;
  if (!apiSecret) return 'ga4mp: skipped (no api secret)';
  const cid = sanitizeGaClientId(clientId);
  if (!cid) return 'ga4mp: skipped (no client id)';
  if (!transactionId || !Number.isFinite(Number(amountMinor))) {
    return 'ga4mp: skipped (missing purchase facts)';
  }
  const value = Math.round(Number(amountMinor)) / 100;
  const body = {
    client_id: cid,
    ...(userId ? { user_id: String(userId) } : {}),
    non_personalized_ads: true,
    events: [
      {
        name: 'purchase',
        params: {
          transaction_id: String(transactionId),
          value,
          currency: String(currency || 'usd').toUpperCase(),
          items: [
            {
              item_id: `pro_${sku || 'unknown'}`,
              item_name: `Pro ${sku || 'unknown'}`,
              item_category: 'subscription',
              item_variant: ppp ? 'ppp' : 'global',
              price: value,
              quantity: 1,
            },
          ],
          source: 'webhook',
          engagement_time_msec: 1,
        },
      },
    ],
  };
  try {
    const url = `${MP_ENDPOINT}?measurement_id=${GA4_MEASUREMENT_ID}&api_secret=${encodeURIComponent(apiSecret)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    // MP returns 2xx even for malformed payloads; status is best-effort.
    return `ga4mp: sent (${response.status})`;
  } catch (error) {
    return `ga4mp: failed (${error.message})`;
  }
}
