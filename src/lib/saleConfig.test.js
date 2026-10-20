import { describe, expect, it } from 'vitest';
import {
  EXAM_PASS_DAYS,
  LEGACY_EXAM_PASS_DAYS,
  SUPPORTED_EXAM_PASS_DAYS,
  examPassDaysFromMetadata,
  resolveExamPassDays,
  PLANS,
  PROMO,
  cheapestMonthlyRate,
  discountedPrice,
  highlightedSku,
  isPromoLive,
  money,
  PASS_FIRST_LABEL,
  planLayout,
  planOrder,
  planPricing,
  promoAppliesTo,
  promoEndsAtMs,
} from './saleConfig';

describe('saleConfig money formatting', () => {
  it('always renders two decimals with a leading $', () => {
    expect(money(8.99)).toBe('$8.99');
    expect(money(49.99)).toBe('$49.99');
    expect(money(3)).toBe('$3.00');
  });
});

describe('saleConfig honesty guarantees', () => {
  it('exposes no struck-through anchor anywhere in the plan table', () => {
    // Item 39: fictitious "was" prices are gone for good. A plan may only ever
    // carry the price we would really charge.
    for (const plan of Object.values(PLANS)) {
      expect(plan.global).toEqual({ price: expect.any(Number) });
      expect(plan.ppp).toEqual({ price: expect.any(Number) });
    }
    for (const ppp of [false, true]) {
      for (const sku of Object.keys(PLANS)) {
        const pricing = planPricing(sku, ppp);
        expect(pricing.price).toBe(pricing.list);
        expect(pricing.savings).toBe(0);
        expect(pricing.promo).toBe(false);
      }
    }
  });

  it('ships with the promo switched off', () => {
    expect(PROMO.active).toBe(false);
    expect(isPromoLive()).toBe(false);
    expect(promoAppliesTo('monthly')).toBe(false);
  });

  it('never treats a promo without a real coupon as live', () => {
    const withField = (overrides) => {
      const saved = { ...PROMO };
      Object.assign(PROMO, overrides);
      try {
        return isPromoLive(Date.parse('2026-09-10T00:00:00Z'));
      } finally {
        Object.assign(PROMO, saved);
      }
    };
    const live = {
      active: true,
      couponId: 'IELTSBANK_SEPT30',
      percentOff: 30,
      endsAt: '2026-09-30T23:59:59-04:00',
      appliesTo: ['monthly'],
    };
    expect(withField(live)).toBe(true);
    expect(withField({ ...live, couponId: '' })).toBe(false);
    expect(withField({ ...live, percentOff: 0 })).toBe(false);
    expect(withField({ ...live, active: false })).toBe(false);
    // A past end date closes the promo without a code change.
    expect(withField({ ...live, endsAt: '2026-08-31T23:59:59-04:00' })).toBe(false);
    // An unparseable date fails closed rather than running forever.
    expect(withField({ ...live, endsAt: 'not-a-date' })).toBe(false);
    expect(promoEndsAtMs()).toBe(0);
  });

  it('discounts the way Stripe does — on the minor-unit amount', () => {
    expect(discountedPrice(8.99, 30)).toBe(6.29);
    expect(discountedPrice(49.99, 20)).toBe(39.99);
    expect(discountedPrice(14.99, 100)).toBe(0);
    expect(discountedPrice(14.99, 0)).toBe(14.99);
  });

  it('applies a live promo only to the SKUs it names', () => {
    const saved = { ...PROMO };
    Object.assign(PROMO, {
      active: true,
      couponId: 'IELTSBANK_SEPT30',
      percentOff: 30,
      endsAt: '2026-09-30T23:59:59-04:00',
      appliesTo: ['annual'],
    });
    const now = Date.parse('2026-09-10T00:00:00Z');
    try {
      const annual = planPricing('annual', false, now);
      expect(annual.promo).toBe(true);
      expect(annual.list).toBe(49.99);
      expect(annual.price).toBe(34.99);
      expect(annual.savings).toBe(15);
      expect(annual.percentOff).toBe(30);

      const monthly = planPricing('monthly', false, now);
      expect(monthly.promo).toBe(false);
      expect(monthly.price).toBe(8.99);
    } finally {
      Object.assign(PROMO, saved);
    }
  });
});

describe('saleConfig planPricing — global list prices', () => {
  it('prices the monthly plan', () => {
    const p = planPricing('monthly', false);
    expect(p.price).toBe(8.99);
    expect(p.cadence).toBe('per month');
    expect(p.perMonth).toBeNull();
    expect(p.isOneTime).toBe(false);
    expect(p.name).toBe('Monthly');
  });

  it('prices the annual plan with an effective monthly rate', () => {
    const p = planPricing('annual', false);
    expect(p.price).toBe(49.99);
    expect(p.interval).toBe('year');
    expect(p.intervalCount).toBe(1);
    expect(p.perMonth).toBeCloseTo(4.17, 2);
    expect(p.best).toBe(true);
  });

  it('prices the one-time Exam Pass with no billing cadence', () => {
    const p = planPricing('exam_pass', false);
    expect(p.price).toBe(19.99);
    expect(p.isOneTime).toBe(true);
    expect(p.interval).toBeNull();
    expect(p.days).toBe(EXAM_PASS_DAYS);
    expect(EXAM_PASS_DAYS).toBe(30);
    expect(p.perMonth).toBeNull();
  });
});

describe('planLayout', () => {
  it('keeps the standard three-card order outside pass-first markets', () => {
    expect(planLayout(false)).toEqual({ primary: ['exam_pass', 'monthly', 'annual'], secondary: [] });
    expect(planLayout()).toEqual(planLayout(false));
  });

  it('makes the one-time pass the only primary offer in pass-first markets', () => {
    expect(planLayout(true)).toEqual({ primary: ['exam_pass'], secondary: ['monthly', 'annual'] });
    expect(PASS_FIRST_LABEL).toBe('One payment · no auto-renew');
  });
});

describe('Exam Pass length', () => {
  it('only honours the lengths the database can grant, defaulting to 30', () => {
    expect(resolveExamPassDays(undefined)).toBe(30);
    expect(resolveExamPassDays('')).toBe(30);
    expect(resolveExamPassDays('45')).toBe(45);
    expect(resolveExamPassDays(' 45 ')).toBe(45);
    expect(resolveExamPassDays('30')).toBe(30);
    expect(resolveExamPassDays('60')).toBe(30);
    expect(resolveExamPassDays('45days')).toBe(30);
    expect(SUPPORTED_EXAM_PASS_DAYS).toEqual([30, 45]);
    expect(LEGACY_EXAM_PASS_DAYS).toBe(30);
  });

  it('reads the length a checkout promised from its metadata', () => {
    expect(examPassDaysFromMetadata({ pass_days: '45' })).toBe(45);
    expect(examPassDaysFromMetadata({ pass_days: '30' })).toBe(30);
    expect(examPassDaysFromMetadata({ pass_days: '7' })).toBeNull();
    expect(examPassDaysFromMetadata({})).toBeNull();
    expect(examPassDaysFromMetadata(null)).toBeNull();
  });
});

describe('saleConfig planPricing — regional (PPP)', () => {
  it('uses the lower regional prices', () => {
    expect(planPricing('monthly', true).price).toBe(4.99);
    expect(planPricing('annual', true).price).toBe(19.99);
    expect(planPricing('exam_pass', true).price).toBe(5.99);
  });

  it('returns null for a retired or unknown plan key', () => {
    expect(planPricing('3month', false)).toBeNull();
    expect(planPricing('6month', false)).toBeNull();
    expect(planPricing('lifetime', false)).toBeNull();
  });
});

describe('saleConfig card layout', () => {
  it.each([false, true])('features the first-position Exam Pass without changing regional prices (PPP=%s)', (ppp) => {
    expect(Object.keys(PLANS)).toEqual(['monthly', 'annual', 'exam_pass', 'week_pass']);
    expect(planOrder(ppp)).toEqual(['exam_pass', 'monthly', 'annual']);
    expect(highlightedSku(ppp)).toBe('exam_pass');
    expect(planOrder(ppp)[0]).toBe(highlightedSku(ppp));
    expect(planOrder(ppp).map(sku => planPricing(sku, ppp).price))
      .toEqual(ppp ? [5.99, 4.99, 19.99] : [19.99, 8.99, 49.99]);
    expect(planPricing('exam_pass', ppp)).toMatchObject({
      days: 30, isOneTime: true, interval: null, intervalCount: null,
    });
  });
});

describe('cheapestMonthlyRate', () => {
  it('reports the annual plan’s effective monthly rate per region', () => {
    expect(cheapestMonthlyRate(false)).toBeCloseTo(49.99 / 12, 5);
    expect(cheapestMonthlyRate(true)).toBeCloseTo(19.99 / 12, 5);
  });
});
