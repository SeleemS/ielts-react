// scripts/calibration/metrics.mjs
// Pure scoring-accuracy maths for the Writing-scorer calibration. Kept free of
// I/O so every number published on /ai-band-score-accuracy is unit-tested
// (scripts/calibration/metrics.test.js) rather than computed inline in a script
// that nobody runs twice.
//
// Vocabulary used throughout:
//   human  - the band assigned by the corpus' human rater(s)
//   ai     - the band our scorer returned for the same essay
//   error  - ai - human (SIGNED: positive means the AI marked too generously)

// IELTS bands only exist in half steps. Anything we compare or bucket is
// snapped to the same grid so a 6.4999999 never lands in its own column.
export function roundHalf(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.round(value * 2) / 2;
}

// Floating-point safe "is the gap no bigger than `limit`". 0.30000000000000004
// style drift must never flip a within-0.5 verdict.
function withinTolerance(diff, limit) {
  return Math.abs(diff) <= limit + 1e-9;
}

function mean(values) {
  if (!values.length) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// Round a reported metric to 2dp (MAE, bias) or 1dp (percentages) so the JSON
// we commit is stable and diffable rather than full of 17-digit floats.
// Math.round breaks ties toward +Infinity, which would quietly shrink a
// NEGATIVE bias (-0.125 -> -0.12) while growing a positive one. Bias is the
// number that says whether we over- or under-mark, so ties round AWAY from zero
// and the magnitude is never flattered by the rounding.
function roundTo(value, places) {
  if (value === null) return null;
  const factor = 10 ** places;
  return (Math.sign(value) * Math.round(Math.abs(value) * factor)) / factor;
}

function round2(value) {
  return roundTo(value, 2);
}

function round1(value) {
  return roundTo(value, 1);
}

// Keep only rows where BOTH a human label and an AI band exist and are numbers.
// A failed scoring call must shrink n, never quietly count as a perfect match.
export function usablePairs(rows) {
  return (rows || []).filter(
    (r) =>
      r &&
      typeof r.humanBand === 'number' &&
      Number.isFinite(r.humanBand) &&
      typeof r.aiBand === 'number' &&
      Number.isFinite(r.aiBand)
  );
}

// The headline block: n, MAE, agreement rates and bias.
export function agreementMetrics(rows) {
  const pairs = usablePairs(rows);
  const n = pairs.length;
  if (!n) {
    return {
      n: 0,
      mae: null,
      bias: null,
      withinHalfPct: null,
      withinOnePct: null,
      exactPct: null,
      maxError: null,
    };
  }
  const errors = pairs.map((r) => r.aiBand - r.humanBand);
  const abs = errors.map((e) => Math.abs(e));
  return {
    n,
    mae: round2(mean(abs)),
    bias: round2(mean(errors)),
    withinHalfPct: round1((errors.filter((e) => withinTolerance(e, 0.5)).length / n) * 100),
    withinOnePct: round1((errors.filter((e) => withinTolerance(e, 1)).length / n) * 100),
    exactPct: round1((errors.filter((e) => withinTolerance(e, 0)).length / n) * 100),
    maxError: round2(Math.max(...abs)),
  };
}

// MAE/bias per human-band bucket, so the page can be honest about WHERE the
// scorer is weak instead of hiding it inside one average. Buckets are the human
// band snapped to the half-band grid, ordered low to high.
export function perBandBuckets(rows) {
  const pairs = usablePairs(rows);
  const buckets = new Map();
  pairs.forEach((r) => {
    const band = roundHalf(r.humanBand);
    if (!buckets.has(band)) buckets.set(band, []);
    buckets.get(band).push(r);
  });
  return [...buckets.keys()]
    .sort((a, b) => a - b)
    .map((band) => {
      const metrics = agreementMetrics(buckets.get(band));
      return {
        band,
        n: metrics.n,
        mae: metrics.mae,
        bias: metrics.bias,
        withinHalfPct: metrics.withinHalfPct,
      };
    });
}

// Human band (row) x AI band (column) counts, both snapped to half bands.
// Returned as explicit axes + a dense matrix so the page can render a table
// without re-deriving the axis order.
export function confusionTable(rows) {
  const pairs = usablePairs(rows);
  const humanBands = [...new Set(pairs.map((r) => roundHalf(r.humanBand)))].sort((a, b) => a - b);
  const aiBands = [...new Set(pairs.map((r) => roundHalf(r.aiBand)))].sort((a, b) => a - b);
  const index = new Map();
  humanBands.forEach((h, i) => index.set(`h${h}`, i));
  aiBands.forEach((a, j) => index.set(`a${a}`, j));

  const matrix = humanBands.map(() => aiBands.map(() => 0));
  pairs.forEach((r) => {
    const i = index.get(`h${roundHalf(r.humanBand)}`);
    const j = index.get(`a${roundHalf(r.aiBand)}`);
    matrix[i][j] += 1;
  });
  return { humanBands, aiBands, matrix };
}

// Per-criterion MAE, only for criteria the corpus actually labels. `criteria`
// is a list of { key, label }; rows carry humanCriteria/aiCriteria objects.
export function perCriterionMetrics(rows, criteria) {
  return (criteria || [])
    .map(({ key, label }) => {
      const pairs = (rows || [])
        .map((r) => ({
          humanBand: r?.humanCriteria?.[key],
          aiBand: r?.aiCriteria?.[key],
        }))
        .filter((p) => typeof p.humanBand === 'number' && typeof p.aiBand === 'number');
      const metrics = agreementMetrics(pairs);
      return { key, label, n: metrics.n, mae: metrics.mae, bias: metrics.bias, withinHalfPct: metrics.withinHalfPct };
    })
    .filter((c) => c.n > 0);
}

// Everything the page needs for ONE model run.
export function summarizeRun(rows, { model, criteria } = {}) {
  const metrics = agreementMetrics(rows);
  return {
    model: model || null,
    ...metrics,
    byBand: perBandBuckets(rows),
    confusion: confusionTable(rows),
    byCriterion: perCriterionMetrics(rows, criteria),
  };
}
