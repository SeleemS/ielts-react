// scripts/setup-stripe-catalog.mjs
// Idempotently creates the Stripe catalog for docs/MONETIZATION.md §3:
//   * one product: "IELTS Bank Premium"
//   * six USD prices for the plans on sale, addressed by lookup_key
//     (3 global + 3 PPP). The retired 3-month/6-month prices are deliberately
//     absent: they still bill existing subscribers and must never be recreated.
//   * optional 100%-off coupon + promotion code used ONLY for E2E verification
//
//   node scripts/setup-stripe-catalog.mjs                    # read-only audit
//   node scripts/setup-stripe-catalog.mjs --apply            # create missing catalog entries
//   node scripts/setup-stripe-catalog.mjs --apply --with-e2e-promo
//   node scripts/setup-stripe-catalog.mjs --apply --deactivate-e2e-promo
//
// Reads STRIPE_SECRET_KEY from .env.local (same pattern as apply-rate-limits.mjs).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { planE2EPromotionChange } from './stripe-e2e-promo-policy.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function loadEnvLocal() {
  const raw = readFileSync(path.join(ROOT, '.env.local'), 'utf8');
  const env = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[m[1]] = val;
  }
  return env;
}

const env = loadEnvLocal();
const KEY = env.STRIPE_SECRET_KEY;
const APPLY = process.argv.includes('--apply');
const WITH_E2E_PROMO = process.argv.includes('--with-e2e-promo');
const DEACTIVATE_E2E_PROMO = process.argv.includes('--deactivate-e2e-promo');
if (!KEY) {
  console.error('STRIPE_SECRET_KEY missing from .env.local');
  process.exit(1);
}
if (WITH_E2E_PROMO && DEACTIVATE_E2E_PROMO) {
  console.error('--with-e2e-promo and --deactivate-e2e-promo are mutually exclusive');
  process.exit(1);
}
if ((WITH_E2E_PROMO || DEACTIVATE_E2E_PROMO) && !APPLY) {
  console.error('E2E promotion changes require --apply');
  process.exit(1);
}

const API = 'https://api.stripe.com/v1';

function form(params, prefix = '') {
  // Flatten nested objects/arrays into Stripe's form encoding.
  const out = [];
  for (const [k, v] of Object.entries(params)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === undefined || v === null) continue;
    if (typeof v === 'object' && !Array.isArray(v)) out.push(form(v, key));
    else if (Array.isArray(v)) v.forEach((item, i) => out.push(form({ [i]: item }, key)));
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
  }
  return out.filter(Boolean).join('&');
}

async function stripe(method, pathname, params) {
  const res = await fetch(`${API}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: method === 'GET' ? undefined : form(params || {}),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`${method} ${pathname} -> ${res.status}: ${json.error?.message || 'unknown'}`);
  }
  return json;
}

async function stripeGet(pathname, params) {
  const qs = params ? `?${form(params)}` : '';
  const res = await fetch(`${API}${pathname}${qs}`, {
    headers: { Authorization: `Bearer ${KEY}` },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`GET ${pathname} -> ${res.status}: ${json.error?.message || 'unknown'}`);
  }
  return json;
}

// Kept in step with src/lib/saleConfig.js and with
// scripts/configure-exam-pass-annual.mjs, which is the script that MOVES a
// price (create + transfer_lookup_key + archive). This one only ever creates
// what is missing, so an amount here that disagrees with the live catalogue
// makes the audit throw rather than silently re-pricing anything.
const PRICES = [
  { lookup_key: 'premium_monthly',     unit_amount: 899,  interval: 'month', interval_count: 1,  nickname: 'Pro Monthly (global)' },
  { lookup_key: 'premium_annual',      unit_amount: 4999, interval: 'year',  interval_count: 1,  nickname: 'Pro Annual (global)' },
  { lookup_key: 'premium_exam_pass',   unit_amount: 1499, nickname: 'Pro Exam Pass — 30 days (global)' },
  { lookup_key: 'premium_monthly_ppp', unit_amount: 399,  interval: 'month', interval_count: 1,  nickname: 'Pro Monthly (PPP)' },
  { lookup_key: 'premium_annual_ppp',  unit_amount: 1999, interval: 'year',  interval_count: 1,  nickname: 'Pro Annual (PPP)' },
  { lookup_key: 'premium_exam_pass_ppp', unit_amount: 599, nickname: 'Pro Exam Pass — 30 days (PPP)' },
];

async function main() {
  let missing = 0;

  // 1. Product (idempotent via metadata marker)
  const products = await stripeGet('/products', { limit: 100, active: true });
  let product = products.data.find((p) => p.metadata?.ieltsbank === 'premium');
  if (!product) {
    missing += 1;
    if (APPLY) {
      product = await stripe('POST', '/products', {
        name: 'IELTS Bank Premium',
        description:
          'Daily fair-use AI Writing and Speaking scoring, AI examiner minutes, progress analytics, and ad-free practice.',
        metadata: { ieltsbank: 'premium' },
      });
      console.log('created product', product.id);
    } else {
      console.log('MISSING product IELTS Bank Premium');
    }
  } else {
    console.log('product exists', product.id);
  }

  // 2. Prices by lookup_key (idempotent)
  const existing = await stripeGet('/prices', {
    limit: 100,
    lookup_keys: PRICES.map((p) => p.lookup_key),
  });
  const byKey = new Map(existing.data.map((p) => [p.lookup_key, p]));
  for (const spec of PRICES) {
    if (byKey.has(spec.lookup_key)) {
      const current = byKey.get(spec.lookup_key);
      const recurringMatches = spec.interval
        ? current.type === 'recurring'
          && current.recurring?.interval === spec.interval
          && current.recurring?.interval_count === spec.interval_count
        : current.type === 'one_time';
      const amountMatches = current.currency === 'usd' && current.unit_amount === spec.unit_amount;
      if (!recurringMatches || !amountMatches) {
        throw new Error(`lookup key ${spec.lookup_key} exists with unexpected price or cadence`);
      }
      console.log('price exists', spec.lookup_key, current.id);
      continue;
    }
    missing += 1;
    if (!APPLY) {
      console.log('MISSING price', spec.lookup_key);
      continue;
    }
    if (!product) throw new Error('cannot create prices without a Premium product');
    const price = await stripe('POST', '/prices', {
      product: product.id,
      currency: 'usd',
      unit_amount: spec.unit_amount,
      nickname: spec.nickname,
      lookup_key: spec.lookup_key,
      transfer_lookup_key: 'true',
      ...(spec.interval
        ? { recurring: { interval: spec.interval, interval_count: spec.interval_count } }
        : {}),
      metadata: {
        ieltsbank: 'premium',
        billing_mode: spec.interval ? 'subscription' : 'payment',
        ppp: spec.lookup_key.endsWith('_ppp') ? '1' : '0',
      },
    });
    console.log('created price', spec.lookup_key, price.id);
  }

  // 3. Test promotions require an explicit second opt-in and are never part
  // of the ordinary production catalog setup.
  if (WITH_E2E_PROMO) {
    let coupon;
    try {
      coupon = await stripeGet('/coupons/E2E100');
      console.log('coupon exists', coupon.id);
    } catch {
      coupon = await stripe('POST', '/coupons', {
        id: 'E2E100',
        percent_off: 100,
        duration: 'forever',
        name: 'E2E verification (100% off)',
      });
      console.log('created coupon', coupon.id);
    }

    if (!coupon.valid) {
      throw new Error('E2E100 coupon exists but is no longer valid');
    }

    const promos = await stripeGet('/promotion_codes', { code: 'E2EVERIFY100', limit: 100 });
    const change = planE2EPromotionChange(promos.data, {
      mode: 'activate',
      couponValid: coupon.valid,
    });
    if (change.type === 'activate') {
      const promo = await stripe('POST', `/promotion_codes/${change.promotion.id}`, {
        active: true,
      });
      console.log('activated promo code', promo.id, promo.code);
    } else if (change.type === 'create') {
      const promo = await stripe('POST', '/promotion_codes', {
        promotion: { type: 'coupon', coupon: coupon.id },
        code: 'E2EVERIFY100',
        max_redemptions: 5,
      });
      console.log('created promo code', promo.id, promo.code);
    } else {
      console.log('promo code ready', change.promotion.id, change.promotion.code);
    }
  }

  if (DEACTIVATE_E2E_PROMO) {
    const promos = await stripeGet('/promotion_codes', { code: 'E2EVERIFY100', limit: 100 });
    const change = planE2EPromotionChange(promos.data, { mode: 'deactivate' });
    if (change.type === 'deactivate') {
      for (const promotion of change.promotions) {
        const promo = await stripe('POST', `/promotion_codes/${promotion.id}`, {
          active: false,
        });
        console.log('deactivated promo code', promo.id, promo.code);
      }
    } else {
      console.log('promo code already inactive');
    }
  }

  if (!APPLY && missing) {
    console.error(`catalog audit failed: ${missing} required object(s) missing`);
    process.exitCode = 2;
    return;
  }
  console.log(APPLY ? 'catalog ready' : 'catalog audit passed');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
