import { describe, expect, it } from 'vitest';
import {
  SALE,
  isSaleLive,
  saleEndsAtMs,
  planPricing,
  money,
  maxSavings,
  maxPercentOff,
} from './saleConfig';

describe('saleConfig money formatting', () => {
  it('always renders two decimals with a leading $', () => {
    expect(money(8.99)).toBe('$8.99');
    expect(money(19.99)).toBe('$19.99');
    expect(money(3)).toBe('$3.00');
  });
});

describe('saleConfig isSaleLive', () => {
  it('is live before the end date and dead after it', () => {
    const before = new Date('2026-07-01T00:00:00-04:00').getTime();
    const after = new Date('2026-10-01T00:00:00-04:00').getTime();
    expect(isSaleLive(before)).toBe(true);
    expect(isSaleLive(after)).toBe(false);
    // Sanity: the configured end date parses to a finite instant.
    expect(saleEndsAtMs()).toBeGreaterThan(0);
    expect(SALE.name).toBe('Summer Sale');
  });
});

describe('saleConfig planPricing — global (sale price = real Stripe price)', () => {
  it('prices the monthly Pro plan and its struck anchor', () => {
    const p = planPricing('monthly', false);
    expect(p.sale).toBe(8.99);
    expect(p.regular).toBe(14.99);
    expect(p.savings).toBe(6);
    expect(p.percentOff).toBe(40);
    expect(p.perMonth).toBeNull();
    expect(p.name).toBe('Monthly');
  });

  it('prices the 3-month Pro plan with an effective monthly rate', () => {
    const p = planPricing('3month', false);
    expect(p.sale).toBe(19.99);
    expect(p.regular).toBe(34.99);
    expect(p.savings).toBe(15);
    expect(p.percentOff).toBe(43);
    expect(p.perMonth).toBeCloseTo(6.66, 2);
  });
});

describe('saleConfig planPricing — regional (PPP kept)', () => {
  it('uses the lower regional prices', () => {
    const monthly = planPricing('monthly', true);
    expect(monthly.sale).toBe(3.99);
    expect(monthly.regular).toBe(4.99);
    expect(monthly.percentOff).toBe(20);

    const quarter = planPricing('3month', true);
    expect(quarter.sale).toBe(8.99);
    expect(quarter.regular).toBe(11.99);
    expect(quarter.percentOff).toBe(25);
  });

  it('returns null for an unknown or retired plan key', () => {
    expect(planPricing('annual', false)).toBeNull();
    expect(planPricing('6month', false)).toBeNull();
    expect(planPricing('exam_pass', false)).toBeNull();
  });
});

describe('saleConfig headline helpers', () => {
  it('reports the best savings and percentage per region', () => {
    expect(maxSavings(false)).toBe(15);
    expect(maxPercentOff(false)).toBe(43);
    expect(maxSavings(true)).toBe(3);
    expect(maxPercentOff(true)).toBe(25);
  });
});
