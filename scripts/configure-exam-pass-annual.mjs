#!/usr/bin/env node
// scripts/configure-exam-pass-annual.mjs
//
// Moves the live Stripe catalogue to the pricing in src/lib/saleConfig.js:
//   premium_annual         $44.99 -> $49.99  (recurring, year)
//   premium_exam_pass_ppp   $6.99 ->  $5.99  (one-time)
// and verifies every other advertised price is already correct.
//
// Stripe price amounts are immutable, so a price change is: create a NEW price
// carrying the same lookup_key (`transfer_lookup_key: true`, which moves the
// key off the old price), then archive the old one. Existing subscriptions keep
// billing on the archived price — that is deliberate. Nobody is re-priced by
// this script; only NEW checkouts resolve to the new price.
//
//   node scripts/configure-exam-pass-annual.mjs             # audit + plan
//   node scripts/configure-exam-pass-annual.mjs --dry-run   # same, explicit
//   node scripts/configure-exam-pass-annual.mjs --apply     # perform changes
//   node scripts/configure-exam-pass-annual.mjs --apply --rename-product
//
// Idempotent: a second --apply run finds everything in the desired state and
// writes nothing. Reads STRIPE_SECRET_KEY from .env.local at the repo ROOT,
// the same way scripts/configure-stripe-monetization.mjs does.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Product identity. The catalogue was created as "IELTS Bank Premium"; the
// product is now marketed as Pro, and the name appears on Stripe receipts and
// the Checkout page, so a mismatch is reported loudly and only renamed behind
// an explicit flag.
export const PRODUCT_NAME = 'IELTS Bank Pro';
export const PRODUCT_METADATA_MARKER = 'premium';

// The advertised catalogue. Amounts are in minor units and MUST equal
// src/lib/saleConfig.js PLANS (scripts/configure-exam-pass-annual.test.js
// asserts that, so the two cannot drift).
export const DESIRED_PRICES = [
  {
    lookupKey: 'premium_monthly',
    unitAmount: 899,
    interval: 'month',
    intervalCount: 1,
    nickname: 'Pro Monthly (global)',
  },
  {
    lookupKey: 'premium_monthly_ppp',
    unitAmount: 399,
    interval: 'month',
    intervalCount: 1,
    nickname: 'Pro Monthly (PPP)',
  },
  {
    lookupKey: 'premium_annual',
    unitAmount: 4999,
    interval: 'year',
    intervalCount: 1,
    nickname: 'Pro Annual (global)',
  },
  {
    lookupKey: 'premium_annual_ppp',
    unitAmount: 1999,
    interval: 'year',
    intervalCount: 1,
    nickname: 'Pro Annual (PPP)',
  },
  {
    lookupKey: 'premium_exam_pass',
    unitAmount: 1499,
    nickname: 'Pro Exam Pass — 30 days (global)',
  },
  {
    lookupKey: 'premium_exam_pass_ppp',
    unitAmount: 599,
    nickname: 'Pro Exam Pass — 30 days (PPP)',
  },
];

// Retired from sale but still billing existing subscribers. This script must
// never create, re-price, or archive them.
export const RETIRED_LOOKUP_KEYS = [
  'premium_3month',
  'premium_3month_ppp',
  'premium_6month',
  'premium_6month_ppp',
];

const money = (minor) => `$${(minor / 100).toFixed(2)}`;

function cadenceLabel(spec) {
  if (!spec.interval) return 'one-time';
  return spec.intervalCount === 1
    ? `per ${spec.interval}`
    : `every ${spec.intervalCount} ${spec.interval}s`;
}

function priceCadenceLabel(price) {
  if (price.type !== 'recurring' || !price.recurring) return 'one-time';
  const { interval, interval_count: count } = price.recurring;
  return count === 1 ? `per ${interval}` : `every ${count} ${interval}s`;
}

// ---------------------------------------------------------------------------
// Pure planning — no network, no side effects. Unit-tested.
// ---------------------------------------------------------------------------

// Does an existing Stripe price already satisfy the spec exactly?
export function priceMatchesSpec(price, spec) {
  if (!price) return false;
  if (price.active !== true) return false;
  if (price.currency !== 'usd') return false;
  if (price.unit_amount !== spec.unitAmount) return false;
  if (spec.interval) {
    return (
      price.type === 'recurring' &&
      price.recurring?.interval === spec.interval &&
      price.recurring?.interval_count === spec.intervalCount &&
      price.recurring?.usage_type === 'licensed'
    );
  }
  return price.type === 'one_time' && !price.recurring;
}

// Build the full change plan from a Stripe snapshot.
//   product : the Stripe product object (or null when not found)
//   prices  : active prices returned for the desired lookup keys
export function planCatalogChanges({
  product,
  prices = [],
  desired = DESIRED_PRICES,
  renameProduct = false,
}) {
  const byKey = new Map(
    prices.filter((price) => price?.lookup_key).map((price) => [price.lookup_key, price])
  );

  const productPlan = !product
    ? { action: 'missing', id: null, name: null, expected: PRODUCT_NAME }
    : product.name === PRODUCT_NAME
      ? { action: 'none', id: product.id, name: product.name, expected: PRODUCT_NAME }
      : {
          action: renameProduct ? 'rename' : 'warn',
          id: product.id,
          name: product.name,
          expected: PRODUCT_NAME,
        };

  const pricePlans = desired.map((spec) => {
    const current = byKey.get(spec.lookupKey) || null;
    if (!current) return { spec, current: null, action: 'create' };
    if (priceMatchesSpec(current, spec)) return { spec, current, action: 'none' };
    return { spec, current, action: 'replace' };
  });

  // A retired key showing up in the snapshot is fine and must be left alone;
  // surfacing it makes an accidental targeting mistake visible in the output.
  const untouched = prices
    .filter((price) => RETIRED_LOOKUP_KEYS.includes(price?.lookup_key))
    .map((price) => price.lookup_key);

  return {
    product: productPlan,
    prices: pricePlans,
    untouched,
    changeCount:
      pricePlans.filter((plan) => plan.action !== 'none').length +
      (productPlan.action === 'rename' ? 1 : 0),
    blocked: productPlan.action === 'missing',
  };
}

export function describePlan(plan) {
  const lines = [];
  lines.push(
    plan.product.action === 'missing'
      ? `product: MISSING (expected metadata ieltsbank=${PRODUCT_METADATA_MARKER})`
      : plan.product.action === 'none'
        ? `product: ${plan.product.id} "${plan.product.name}" (ok)`
        : plan.product.action === 'rename'
          ? `product: ${plan.product.id} "${plan.product.name}" -> "${PRODUCT_NAME}"`
          : `product: ${plan.product.id} "${plan.product.name}" != "${PRODUCT_NAME}" (WARNING — pass --rename-product to change it)`
  );
  for (const item of plan.prices) {
    const { spec, current, action } = item;
    const want = `${money(spec.unitAmount)} ${cadenceLabel(spec)}`;
    if (action === 'none') {
      lines.push(`  ${spec.lookupKey}: ${want} (ok, ${current.id})`);
    } else if (action === 'create') {
      lines.push(`  ${spec.lookupKey}: MISSING -> create ${want}`);
    } else {
      lines.push(
        `  ${spec.lookupKey}: ${money(current.unit_amount)} ${priceCadenceLabel(current)}` +
          ` (${current.id}) -> create ${want}, then archive ${current.id}`
      );
    }
  }
  for (const key of plan.untouched) {
    lines.push(`  ${key}: retired from sale — left untouched`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Execution — every write goes through here, and dryRun performs none of them.
// `stripe` is injected so tests can supply a fake client.
// ---------------------------------------------------------------------------
export async function applyCatalogPlan(stripe, plan, { dryRun = true, log = () => {} } = {}) {
  if (plan.blocked) {
    throw new Error(
      'IELTS Bank product not found; run scripts/setup-stripe-catalog.mjs --apply first'
    );
  }
  const performed = [];

  if (plan.product.action === 'rename') {
    if (dryRun) {
      log(`DRY RUN would rename product ${plan.product.id} -> "${PRODUCT_NAME}"`);
    } else {
      await stripe.products.update(plan.product.id, { name: PRODUCT_NAME });
      log(`renamed product ${plan.product.id} -> "${PRODUCT_NAME}"`);
    }
    performed.push({ type: 'rename_product', id: plan.product.id });
  }

  for (const item of plan.prices) {
    if (item.action === 'none') continue;
    const { spec, current } = item;
    const params = {
      product: plan.product.id,
      currency: 'usd',
      unit_amount: spec.unitAmount,
      nickname: spec.nickname,
      lookup_key: spec.lookupKey,
      // Moves the lookup key off the superseded price so checkout resolves the
      // new one. The old price keeps billing its existing subscriptions.
      transfer_lookup_key: true,
      ...(spec.interval
        ? { recurring: { interval: spec.interval, interval_count: spec.intervalCount } }
        : {}),
      metadata: {
        ieltsbank: 'premium',
        billing_mode: spec.interval ? 'subscription' : 'payment',
        ppp: spec.lookupKey.endsWith('_ppp') ? '1' : '0',
      },
    };
    if (dryRun) {
      log(`DRY RUN would create price ${spec.lookupKey} ${money(spec.unitAmount)}`);
      if (current) log(`DRY RUN would archive superseded price ${current.id}`);
      performed.push({ type: 'create_price', lookupKey: spec.lookupKey, dryRun: true });
      continue;
    }
    const created = await stripe.prices.create(params);
    log(`created price ${spec.lookupKey} ${money(spec.unitAmount)} ${created.id}`);
    performed.push({ type: 'create_price', lookupKey: spec.lookupKey, id: created.id });
    if (created.lookup_key !== spec.lookupKey) {
      throw new Error(
        `created price ${created.id} did not take lookup key ${spec.lookupKey}; stopping before archiving ${current?.id}`
      );
    }
    if (current) {
      await stripe.prices.update(current.id, { active: false });
      log(`archived superseded price ${current.id}`);
      performed.push({ type: 'archive_price', id: current.id });
    }
  }

  return performed;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function loadEnvLocal() {
  const raw = readFileSync(path.join(ROOT, '.env.local'), 'utf8');
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const renameProduct = process.argv.includes('--rename-product');
  if (renameProduct && !apply) {
    throw new Error('--rename-product requires --apply');
  }

  const key = loadEnvLocal().STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY missing from .env.local');
  const { default: Stripe } = await import('stripe');
  const stripe = new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });

  const products = await stripe.products.list({ active: true, limit: 100 });
  const product =
    products.data.find((item) => item.metadata?.ieltsbank === PRODUCT_METADATA_MARKER) || null;

  const lookupKeys = [...DESIRED_PRICES.map((spec) => spec.lookupKey), ...RETIRED_LOOKUP_KEYS];
  const prices = await stripe.prices.list({ active: true, limit: 100, lookup_keys: lookupKeys });

  const plan = planCatalogChanges({
    product,
    prices: prices.data,
    renameProduct,
  });

  console.log(apply ? 'MODE: apply' : 'MODE: dry run (no writes)');
  console.log(describePlan(plan));
  console.log(`pending changes: ${plan.changeCount}`);

  if (plan.blocked) {
    throw new Error(
      'IELTS Bank product not found; run scripts/setup-stripe-catalog.mjs --apply first'
    );
  }
  if (!plan.changeCount) {
    console.log('catalogue already matches saleConfig — nothing to do');
    return;
  }

  const performed = await applyCatalogPlan(stripe, plan, {
    dryRun: !apply,
    log: (line) => console.log(line),
  });
  console.log(
    apply
      ? `done: ${performed.length} Stripe write(s)`
      : `dry run complete: ${plan.changeCount} change(s) pending — re-run with --apply`
  );
}

// Only run the CLI when executed directly, so the unit test can import the
// planning helpers without touching Stripe or .env.local.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
