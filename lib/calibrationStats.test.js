import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MIN_PUBLISHABLE_N,
  calibrationDateModified,
  calibrationUpdatedLabel,
  formatBandError,
  formatBias,
  formatPct,
} from './calibrationStats';
import shipped from './calibrationStats.json';

// Load the module against a substituted stats file, so both the "pending" and
// "published" states are covered without waiting on a real OpenAI run.
async function loadWith(statsJson) {
  vi.resetModules();
  vi.doMock('./calibrationStats.json', () => ({ default: statsJson }));
  return import('./calibrationStats');
}

const PUBLISHED = {
  version: 1,
  status: 'published',
  reviewedAt: '2026-09-02',
  generatedAt: '2026-09-02',
  promptVersion: 'abc1234',
  corpus: { name: 'Example expert-scored corpus' },
  primary: {
    model: 'gpt-5.1',
    n: 212,
    mae: 0.42,
    bias: -0.08,
    withinHalfPct: 78.3,
    withinOnePct: 94,
    exactPct: 41.5,
    maxError: 2,
  },
  comparison: [],
};

afterEach(() => {
  vi.doUnmock('./calibrationStats.json');
  vi.resetModules();
});

describe('the committed stats file', () => {
  it('is a valid, versioned shape the page can render either way', () => {
    expect(shipped.version).toBe(1);
    expect(['pending', 'published']).toContain(shipped.status);
    expect(shipped.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Array.isArray(shipped.comparison)).toBe(true);
  });

  it('never claims "published" without a primary run big enough to quote', () => {
    if (shipped.status !== 'published') return;
    expect(shipped.primary?.n).toBeGreaterThanOrEqual(MIN_PUBLISHABLE_N);
    expect(typeof shipped.primary?.withinHalfPct).toBe('number');
    expect(typeof shipped.primary?.mae).toBe('number');
    expect(shipped.corpus?.name).toBeTruthy();
    expect(shipped.corpus?.licence).toBeTruthy();
  });
});

describe('hasCalibrationStats / calibrationHeadline', () => {
  it('reports nothing to publish while calibration is pending', async () => {
    const mod = await loadWith({ version: 1, status: 'pending', reviewedAt: '2026-09-02', primary: null });
    expect(mod.hasCalibrationStats()).toBe(false);
    expect(mod.calibrationHeadline()).toBeNull();
    expect(mod.calibrationPricingLine()).toBeNull();
  });

  it('publishes the headline once a real run exists', async () => {
    const mod = await loadWith(PUBLISHED);
    expect(mod.hasCalibrationStats()).toBe(true);
    expect(mod.calibrationHeadline()).toMatchObject({
      n: 212,
      mae: 0.42,
      withinHalfPct: 78.3,
      model: 'gpt-5.1',
      corpusName: 'Example expert-scored corpus',
    });
  });

  it('refuses a headline from a sample too small to mean anything', async () => {
    const mod = await loadWith({
      ...PUBLISHED,
      primary: { ...PUBLISHED.primary, n: MIN_PUBLISHABLE_N - 1 },
    });
    expect(mod.hasCalibrationStats()).toBe(false);
    expect(mod.calibrationPricingLine()).toBeNull();
  });

  it('refuses a headline when the run finished but produced no metrics', async () => {
    const mod = await loadWith({
      ...PUBLISHED,
      primary: { ...PUBLISHED.primary, withinHalfPct: null, mae: null },
    });
    expect(mod.hasCalibrationStats()).toBe(false);
  });
});

describe('calibrationPricingLine', () => {
  it('states the agreement rate and the sample size, and nothing else', async () => {
    const mod = await loadWith(PUBLISHED);
    expect(mod.calibrationPricingLine()).toBe(
      'Scorer accuracy: within 0.5 of the human band on 78.3% of 212 human-scored essays'
    );
  });

  it('groups thousands so a big sample stays readable', async () => {
    const mod = await loadWith({ ...PUBLISHED, primary: { ...PUBLISHED.primary, n: 1240 } });
    expect(mod.calibrationPricingLine()).toContain('1,240 human-scored essays');
  });
});

describe('formatters', () => {
  it('drops a trailing .0 from percentages but keeps a real half', () => {
    expect(formatPct(94)).toBe('94%');
    expect(formatPct(78.3)).toBe('78.3%');
    expect(formatPct(null)).toBeNull();
    expect(formatPct(Number.NaN)).toBeNull();
  });

  it('always shows two decimals for a band error', () => {
    expect(formatBandError(0.3)).toBe('0.30');
    expect(formatBandError(1)).toBe('1.00');
    expect(formatBandError(undefined)).toBeNull();
  });

  it('spells out which way the scorer leans', () => {
    expect(formatBias(0.21)).toBe('0.21 bands higher than the human score, on average');
    expect(formatBias(-0.21)).toBe('0.21 bands lower than the human score, on average');
    expect(formatBias(0)).toBe('no measurable lean');
    expect(formatBias(null)).toBeNull();
  });
});

describe('dates', () => {
  it('labels the month of the run, falling back to the review date', () => {
    expect(calibrationUpdatedLabel()).toBe('September 2026');
    expect(calibrationDateModified()).toBe('2026-09-02');
  });

  it('prefers the run date over the review date once a run exists', async () => {
    const mod = await loadWith({ ...PUBLISHED, reviewedAt: '2026-01-01', generatedAt: '2026-11-04' });
    expect(mod.calibrationUpdatedLabel()).toBe('November 2026');
    expect(mod.calibrationDateModified()).toBe('2026-11-04');
  });

  it('returns null rather than "Invalid Date" for a broken date', async () => {
    const mod = await loadWith({ version: 1, status: 'pending', reviewedAt: 'not-a-date' });
    expect(mod.calibrationUpdatedLabel()).toBeNull();
  });
});
