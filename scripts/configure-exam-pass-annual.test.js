// Unit tests for the Exam Pass / Annual catalogue script. The planning helpers
// are pure; execution is exercised against a fake Stripe client so the real
// catalogue is never touched.
import { describe, expect, it, vi } from 'vitest';
import {
  DESIRED_PRICES,
  PRODUCT_NAME,
  applyCatalogPlan,
  describePlan,
  planCatalogChanges,
  priceMatchesSpec,
} from './configure-exam-pass-annual.mjs';
import { PLANS } from '../src/lib/saleConfig';

const product = (overrides = {}) => ({
  id: 'prod_Uu1zOteWhf7k0G',
  name: PRODUCT_NAME,
  metadata: { ieltsbank: 'premium' },
  ...overrides,
});

function priceFor(lookupKey, overrides = {}) {
  const spec = DESIRED_PRICES.find((item) => item.lookupKey === lookupKey);
  return {
    id: `price_${lookupKey}`,
    lookup_key: lookupKey,
    active: true,
    currency: 'usd',
    unit_amount: spec.unitAmount,
    type: spec.interval ? 'recurring' : 'one_time',
    recurring: spec.interval
      ? { interval: spec.interval, interval_count: spec.intervalCount, usage_type: 'licensed' }
      : null,
    ...overrides,
  };
}

const currentCatalogue = () => [
  priceFor('premium_monthly'),
  priceFor('premium_monthly_ppp'),
  // The two prices this script exists to replace.
  priceFor('premium_annual', { id: 'price_annual_old', unit_amount: 4499 }),
  priceFor('premium_annual_ppp'),
  priceFor('premium_exam_pass'),
  priceFor('premium_exam_pass_ppp', { id: 'price_pass_ppp_old', unit_amount: 699 }),
];

function fakeStripe() {
  const calls = { created: [], updated: [], products: [] };
  return {
    calls,
    products: {
      update: async (id, params) => {
        calls.products.push({ id, params });
        return { id, ...params };
      },
    },
    prices: {
      create: async (params) => {
        calls.created.push(params);
        return { id: `price_new_${params.lookup_key}`, lookup_key: params.lookup_key };
      },
      update: async (id, params) => {
        calls.updated.push({ id, params });
        return { id, ...params };
      },
    },
  };
}

describe('desired catalogue', () => {
  it('matches src/lib/saleConfig.js exactly, so the two cannot drift', () => {
    const expected = {
      premium_monthly: Math.round(PLANS.monthly.global.price * 100),
      premium_monthly_ppp: Math.round(PLANS.monthly.ppp.price * 100),
      premium_annual: Math.round(PLANS.annual.global.price * 100),
      premium_annual_ppp: Math.round(PLANS.annual.ppp.price * 100),
      premium_exam_pass: Math.round(PLANS.exam_pass.global.price * 100),
      premium_exam_pass_ppp: Math.round(PLANS.exam_pass.ppp.price * 100),
    };
    expect(
      Object.fromEntries(DESIRED_PRICES.map((spec) => [spec.lookupKey, spec.unitAmount]))
    ).toEqual(expected);
    // Founder decision: annual $49.99 global / $19.99 PPP, pass $14.99 / $5.99.
    expect(expected).toMatchObject({
      premium_annual: 4999,
      premium_annual_ppp: 1999,
      premium_exam_pass: 1499,
      premium_exam_pass_ppp: 599,
    });
  });

  it('bills the Exam Pass once and the subscriptions on their own cadence', () => {
    const bySku = Object.fromEntries(DESIRED_PRICES.map((spec) => [spec.lookupKey, spec]));
    expect(bySku.premium_exam_pass.interval).toBeUndefined();
    expect(bySku.premium_exam_pass_ppp.interval).toBeUndefined();
    expect(bySku.premium_annual).toMatchObject({ interval: 'year', intervalCount: 1 });
    expect(bySku.premium_monthly).toMatchObject({ interval: 'month', intervalCount: 1 });
  });
});

describe('priceMatchesSpec', () => {
  const annual = DESIRED_PRICES.find((spec) => spec.lookupKey === 'premium_annual');

  it('accepts an exact active USD price on the right cadence', () => {
    expect(priceMatchesSpec(priceFor('premium_annual'), annual)).toBe(true);
  });

  it('rejects a wrong amount, currency, cadence, archived or metered price', () => {
    expect(priceMatchesSpec(priceFor('premium_annual', { unit_amount: 4499 }), annual)).toBe(false);
    expect(priceMatchesSpec(priceFor('premium_annual', { currency: 'cad' }), annual)).toBe(false);
    expect(priceMatchesSpec(priceFor('premium_annual', { active: false }), annual)).toBe(false);
    expect(
      priceMatchesSpec(
        priceFor('premium_annual', {
          recurring: { interval: 'month', interval_count: 12, usage_type: 'licensed' },
        }),
        annual
      )
    ).toBe(false);
    expect(
      priceMatchesSpec(
        priceFor('premium_annual', {
          recurring: { interval: 'year', interval_count: 1, usage_type: 'metered' },
        }),
        annual
      )
    ).toBe(false);
    expect(priceMatchesSpec(null, annual)).toBe(false);
  });

  it('requires the Exam Pass to be one-time, never recurring', () => {
    const pass = DESIRED_PRICES.find((spec) => spec.lookupKey === 'premium_exam_pass');
    expect(priceMatchesSpec(priceFor('premium_exam_pass'), pass)).toBe(true);
    expect(
      priceMatchesSpec(
        priceFor('premium_exam_pass', {
          type: 'recurring',
          recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' },
        }),
        pass
      )
    ).toBe(false);
  });
});

describe('planCatalogChanges', () => {
  it('replaces only the two superseded prices and leaves the rest alone', () => {
    const plan = planCatalogChanges({ product: product(), prices: currentCatalogue() });

    expect(plan.changeCount).toBe(2);
    expect(
      plan.prices.filter((item) => item.action !== 'none').map((item) => [
        item.spec.lookupKey,
        item.action,
        item.current.id,
      ])
    ).toEqual([
      ['premium_annual', 'replace', 'price_annual_old'],
      ['premium_exam_pass_ppp', 'replace', 'price_pass_ppp_old'],
    ]);
    expect(plan.blocked).toBe(false);
  });

  it('is idempotent: a catalogue already at the desired prices needs no change', () => {
    const plan = planCatalogChanges({
      product: product(),
      prices: DESIRED_PRICES.map((spec) => priceFor(spec.lookupKey)),
    });
    expect(plan.changeCount).toBe(0);
    expect(plan.prices.every((item) => item.action === 'none')).toBe(true);
  });

  it('creates a price whose lookup key is absent entirely', () => {
    const prices = currentCatalogue().filter(
      (price) => price.lookup_key !== 'premium_exam_pass_ppp'
    );
    const plan = planCatalogChanges({ product: product(), prices });
    const pass = plan.prices.find((item) => item.spec.lookupKey === 'premium_exam_pass_ppp');
    expect(pass).toMatchObject({ action: 'create', current: null });
  });

  it('never plans a change to a retired plan that still bills subscribers', () => {
    const retired = {
      id: 'price_3month',
      lookup_key: 'premium_3month',
      active: true,
      currency: 'usd',
      unit_amount: 1999,
      type: 'recurring',
      recurring: { interval: 'month', interval_count: 3, usage_type: 'licensed' },
    };
    const plan = planCatalogChanges({
      product: product(),
      prices: [...currentCatalogue(), retired],
    });
    expect(plan.untouched).toEqual(['premium_3month']);
    expect(plan.prices.some((item) => item.spec.lookupKey === 'premium_3month')).toBe(false);
  });

  it('warns about a product-name mismatch but only renames when asked', () => {
    const stale = product({ name: 'IELTS Bank Premium' });
    expect(planCatalogChanges({ product: stale, prices: currentCatalogue() }).product).toMatchObject(
      { action: 'warn', name: 'IELTS Bank Premium', expected: PRODUCT_NAME }
    );
    const renaming = planCatalogChanges({
      product: stale,
      prices: currentCatalogue(),
      renameProduct: true,
    });
    expect(renaming.product.action).toBe('rename');
    expect(renaming.changeCount).toBe(3);
    expect(describePlan(renaming)).toContain('"IELTS Bank Premium" -> "IELTS Bank Pro"');
  });

  it('blocks everything when the product is missing', () => {
    const plan = planCatalogChanges({ product: null, prices: currentCatalogue() });
    expect(plan.blocked).toBe(true);
    expect(describePlan(plan)).toContain('product: MISSING');
  });
});

describe('applyCatalogPlan', () => {
  it('writes nothing in a dry run', async () => {
    const stripe = fakeStripe();
    const plan = planCatalogChanges({ product: product(), prices: currentCatalogue() });
    const performed = await applyCatalogPlan(stripe, plan, { dryRun: true });

    expect(stripe.calls.created).toEqual([]);
    expect(stripe.calls.updated).toEqual([]);
    expect(performed.every((item) => item.dryRun)).toBe(true);
  });

  it('creates each replacement with transfer_lookup_key, then archives the old price', async () => {
    const stripe = fakeStripe();
    const plan = planCatalogChanges({ product: product(), prices: currentCatalogue() });
    await applyCatalogPlan(stripe, plan, { dryRun: false });

    expect(stripe.calls.created).toEqual([
      expect.objectContaining({
        product: 'prod_Uu1zOteWhf7k0G',
        currency: 'usd',
        unit_amount: 4999,
        lookup_key: 'premium_annual',
        transfer_lookup_key: true,
        recurring: { interval: 'year', interval_count: 1 },
      }),
      expect.objectContaining({
        currency: 'usd',
        unit_amount: 599,
        lookup_key: 'premium_exam_pass_ppp',
        transfer_lookup_key: true,
      }),
    ]);
    // The Exam Pass price must not be created as a recurring price.
    expect(stripe.calls.created[1].recurring).toBeUndefined();
    expect(stripe.calls.created[1].metadata.billing_mode).toBe('payment');
    expect(stripe.calls.updated).toEqual([
      { id: 'price_annual_old', params: { active: false } },
      { id: 'price_pass_ppp_old', params: { active: false } },
    ]);
  });

  it('does not archive the old price when the lookup key failed to transfer', async () => {
    const stripe = fakeStripe();
    stripe.prices.create = async (params) => {
      stripe.calls.created.push(params);
      return { id: 'price_new', lookup_key: null };
    };
    const plan = planCatalogChanges({ product: product(), prices: currentCatalogue() });

    await expect(applyCatalogPlan(stripe, plan, { dryRun: false })).rejects.toThrow(
      /did not take lookup key/
    );
    expect(stripe.calls.updated).toEqual([]);
  });

  it('renames the product only when the plan says so', async () => {
    const stripe = fakeStripe();
    const prices = DESIRED_PRICES.map((spec) => priceFor(spec.lookupKey));
    const warnOnly = planCatalogChanges({
      product: product({ name: 'IELTS Bank Premium' }),
      prices,
    });
    await applyCatalogPlan(stripe, warnOnly, { dryRun: false });
    expect(stripe.calls.products).toEqual([]);

    const renaming = planCatalogChanges({
      product: product({ name: 'IELTS Bank Premium' }),
      prices,
      renameProduct: true,
    });
    await applyCatalogPlan(stripe, renaming, { dryRun: false });
    expect(stripe.calls.products).toEqual([
      { id: 'prod_Uu1zOteWhf7k0G', params: { name: PRODUCT_NAME } },
    ]);
  });

  it('refuses to run against a missing product', async () => {
    const stripe = fakeStripe();
    const plan = planCatalogChanges({ product: null, prices: [] });
    await expect(applyCatalogPlan(stripe, plan, { dryRun: true })).rejects.toThrow(
      /product not found/
    );
    expect(stripe.calls.created).toEqual([]);
  });

  it('logs every planned write in a dry run', async () => {
    const log = vi.fn();
    const plan = planCatalogChanges({ product: product(), prices: currentCatalogue() });
    await applyCatalogPlan(fakeStripe(), plan, { dryRun: true, log });
    const lines = log.mock.calls.map(([line]) => line);
    expect(lines).toContain('DRY RUN would create price premium_annual $49.99');
    expect(lines).toContain('DRY RUN would archive superseded price price_annual_old');
  });
});
