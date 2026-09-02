import { describe, expect, it } from 'vitest';
import {
  agreementMetrics,
  confusionTable,
  perBandBuckets,
  perCriterionMetrics,
  roundHalf,
  summarizeRun,
  usablePairs,
} from './metrics.mjs';

// A hand-checked fixture. Errors (ai - human), in order:
//   +0.5, 0, -0.5, +1.0, -1.5, +0.5, 0, -1.0
// => |e| sum = 5.0 over 8 rows -> MAE 0.625 -> 0.63
// => signed sum = -1.0 over 8 -> bias -0.125 -> -0.13
// => within 0.5: 5/8 = 62.5%   within 1.0: 7/8 = 87.5%   exact: 2/8 = 25%
const ROWS = [
  { id: 'a', humanBand: 5.0, aiBand: 5.5 },
  { id: 'b', humanBand: 5.5, aiBand: 5.5 },
  { id: 'c', humanBand: 6.0, aiBand: 5.5 },
  { id: 'd', humanBand: 6.0, aiBand: 7.0 },
  { id: 'e', humanBand: 6.5, aiBand: 5.0 },
  { id: 'f', humanBand: 7.0, aiBand: 7.5 },
  { id: 'g', humanBand: 7.0, aiBand: 7.0 },
  { id: 'h', humanBand: 8.0, aiBand: 7.0 },
];

describe('roundHalf', () => {
  it('snaps to the half-band grid', () => {
    expect(roundHalf(6.24)).toBe(6);
    expect(roundHalf(6.25)).toBe(6.5);
    expect(roundHalf(6.74)).toBe(6.5);
    expect(roundHalf(7)).toBe(7);
  });

  it('returns null for non-numbers', () => {
    expect(roundHalf(null)).toBeNull();
    expect(roundHalf('7')).toBeNull();
    expect(roundHalf(Number.NaN)).toBeNull();
  });
});

describe('usablePairs', () => {
  it('drops rows missing either side of the comparison', () => {
    const rows = [
      { humanBand: 6, aiBand: 6 },
      { humanBand: 6, aiBand: null }, // scoring failed
      { humanBand: null, aiBand: 6 }, // unlabelled essay
      { humanBand: 6 },
      null,
    ];
    expect(usablePairs(rows)).toHaveLength(1);
  });

  it('treats an empty or missing list as zero pairs', () => {
    expect(usablePairs([])).toEqual([]);
    expect(usablePairs(undefined)).toEqual([]);
  });
});

describe('agreementMetrics', () => {
  it('computes n, MAE, bias, agreement rates and worst case', () => {
    expect(agreementMetrics(ROWS)).toEqual({
      n: 8,
      mae: 0.63,
      bias: -0.13,
      withinHalfPct: 62.5,
      withinOnePct: 87.5,
      exactPct: 25,
      maxError: 1.5,
    });
  });

  it('counts an exactly-0.5 gap as within half a band despite float drift', () => {
    const metrics = agreementMetrics([{ humanBand: 6.6, aiBand: 7.1 }]);
    expect(metrics.withinHalfPct).toBe(100);
  });

  it('reports an all-null shape rather than NaN when there is no data', () => {
    expect(agreementMetrics([])).toEqual({
      n: 0,
      mae: null,
      bias: null,
      withinHalfPct: null,
      withinOnePct: null,
      exactPct: null,
      maxError: null,
    });
  });

  it('reports a positive bias when the scorer marks too generously', () => {
    const metrics = agreementMetrics([
      { humanBand: 6, aiBand: 7 },
      { humanBand: 6, aiBand: 6.5 },
    ]);
    expect(metrics.bias).toBe(0.75);
  });
});

describe('perBandBuckets', () => {
  it('buckets by human band, ordered low to high', () => {
    const buckets = perBandBuckets(ROWS);
    expect(buckets.map((b) => b.band)).toEqual([5, 5.5, 6, 6.5, 7, 8]);
    const band6 = buckets.find((b) => b.band === 6);
    // band 6 rows: -0.5 and +1.0 -> MAE 0.75, bias 0.25, within-half 50%
    expect(band6).toEqual({ band: 6, n: 2, mae: 0.75, bias: 0.25, withinHalfPct: 50 });
  });
});

describe('confusionTable', () => {
  it('cross-tabulates human band against AI band on the half-band grid', () => {
    const { humanBands, aiBands, matrix } = confusionTable(ROWS);
    expect(humanBands).toEqual([5, 5.5, 6, 6.5, 7, 8]);
    expect(aiBands).toEqual([5, 5.5, 7, 7.5]);
    // human 6 (row index 2) -> one AI 5.5, one AI 7.0
    expect(matrix[2]).toEqual([0, 1, 1, 0]);
    // every essay lands in exactly one cell
    expect(matrix.flat().reduce((a, b) => a + b, 0)).toBe(8);
  });
});

describe('perCriterionMetrics', () => {
  const CRITERIA = [
    { key: 'taskResponse', label: 'Task Response' },
    { key: 'coherenceCohesion', label: 'Coherence & Cohesion' },
    { key: 'pronunciation', label: 'Not in this corpus' },
  ];

  it('scores only the criteria the corpus actually labels', () => {
    const rows = [
      {
        humanCriteria: { taskResponse: 6, coherenceCohesion: 6 },
        aiCriteria: { taskResponse: 6.5, coherenceCohesion: 6 },
      },
      {
        humanCriteria: { taskResponse: 7 },
        aiCriteria: { taskResponse: 6, coherenceCohesion: 6.5 },
      },
    ];
    const out = perCriterionMetrics(rows, CRITERIA);
    expect(out.map((c) => c.key)).toEqual(['taskResponse', 'coherenceCohesion']);
    expect(out[0]).toEqual({
      key: 'taskResponse',
      label: 'Task Response',
      n: 2,
      mae: 0.75,
      bias: -0.25,
      withinHalfPct: 50,
    });
    // only the first row labels coherence
    expect(out[1].n).toBe(1);
  });

  it('returns an empty list when no criteria are labelled', () => {
    expect(perCriterionMetrics([{ humanBand: 6, aiBand: 6 }], CRITERIA)).toEqual([]);
    expect(perCriterionMetrics(ROWS, undefined)).toEqual([]);
  });
});

describe('summarizeRun', () => {
  it('bundles the headline metrics, buckets, confusion table and criteria', () => {
    const summary = summarizeRun(ROWS, { model: 'gpt-test', criteria: [] });
    expect(summary.model).toBe('gpt-test');
    expect(summary.n).toBe(8);
    expect(summary.withinHalfPct).toBe(62.5);
    expect(summary.byBand).toHaveLength(6);
    expect(summary.confusion.matrix).toHaveLength(6);
    expect(summary.byCriterion).toEqual([]);
  });

  it('survives an empty run so the page can render a pending state', () => {
    const summary = summarizeRun([], {});
    expect(summary.n).toBe(0);
    expect(summary.mae).toBeNull();
    expect(summary.byBand).toEqual([]);
    expect(summary.confusion).toEqual({ humanBands: [], aiBands: [], matrix: [] });
  });
});
