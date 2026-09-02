import { describe, expect, it } from 'vitest';
import {
  SCORECARD_KEYS,
  formatScorecardValue,
  scorecardDelta,
  deltaIsGood,
  scorecardOnTarget,
  scorecardPace,
  scorecardRows,
  scorecardSubject,
  scorecardWeekLabel,
  renderScorecardEmail,
} from '../lib/weeklyScorecard';

function scorecard(overrides = {}) {
  const rows = [
    { key: 'visitors_per_day', label: 'Real visitors / day', unit: 'number', value: 62.4, prev: 51, target: 500, invert: false },
    { key: 'ai_google_per_day', label: 'From AI assistants + Google / day', unit: 'number', value: 30, prev: 30, target: 250, invert: false },
    { key: 'free_reports_per_day', label: 'Free writing reports / day', unit: 'number', value: 4.1, prev: 0, target: 40, invert: false },
    { key: 'week2_pct', label: 'Sign-ups active in week 2', unit: 'percent', value: null, prev: null, target: 20, invert: false },
    { key: 'paywall_paid_pct', label: 'Paywall views to paid', unit: 'percent', value: 3.5, prev: 5, target: 12, invert: false },
    { key: 'new_payers', label: 'New paying customers', unit: 'number', value: 1, prev: 0, target: 6, invert: false },
    { key: 'mrr_usd', label: 'MRR', unit: 'usd', value: 24.97, prev: 24.97, target: 450, invert: false },
    { key: 'failed_renewal_pct', label: 'Failed renewals', unit: 'percent', value: 8.3, prev: 4, target: 5, invert: true },
  ];
  return {
    generated_at: '2026-09-07T06:00:00.000Z',
    from: '2026-08-31T06:00:00.000Z',
    to: '2026-09-07T06:00:00.000Z',
    prev_from: '2026-08-24T06:00:00.000Z',
    context: { paywall_views: 57, cohort: null },
    rows,
    ...overrides,
  };
}

describe('scorecard formatting', () => {
  it('formats each unit the way the founder reads it', () => {
    expect(formatScorecardValue(62.4, 'number')).toBe('62.4');
    expect(formatScorecardValue(500, 'number')).toBe('500');
    expect(formatScorecardValue(1234, 'number')).toBe('1,234');
    expect(formatScorecardValue(20, 'percent')).toBe('20%');
    expect(formatScorecardValue(8.3, 'percent')).toBe('8.3%');
    expect(formatScorecardValue(24.97, 'usd')).toBe('$24.97');
    expect(formatScorecardValue(450, 'usd')).toBe('$450');
  });

  it('renders a missing metric as a dash, never as zero', () => {
    expect(formatScorecardValue(null, 'percent')).toBe('–');
    expect(formatScorecardValue(undefined, 'number')).toBe('–');
    expect(formatScorecardValue('', 'usd')).toBe('–');
    expect(formatScorecardValue('not-a-number', 'number')).toBe('–');
  });

  it('computes week-over-week movement only when there is a baseline', () => {
    expect(scorecardDelta({ value: 60, prev: 50, unit: 'number' })).toEqual({ dir: 'up', label: '20%' });
    expect(scorecardDelta({ value: 40, prev: 50, unit: 'number' })).toEqual({ dir: 'down', label: '20%' });
    expect(scorecardDelta({ value: 50, prev: 50, unit: 'number' })).toEqual({ dir: 'flat', label: '±0%' });
    expect(scorecardDelta({ value: 0, prev: 0, unit: 'number' })).toEqual({ dir: 'flat', label: '±0' });
    expect(scorecardDelta({ value: 3, prev: 0, unit: 'number' })).toEqual({ dir: 'up', label: '+3' });
    expect(scorecardDelta({ value: null, prev: 10, unit: 'number' })).toBeNull();
    expect(scorecardDelta({ value: 10, prev: null, unit: 'number' })).toBeNull();
  });

  it('knows that rising failed renewals is bad news', () => {
    const row = { key: 'failed_renewal_pct', value: 8, prev: 4, invert: true };
    expect(deltaIsGood(row, scorecardDelta(row))).toBe(false);
    const good = { key: 'failed_renewal_pct', value: 2, prev: 4, invert: true };
    expect(deltaIsGood(good, scorecardDelta(good))).toBe(true);
    const visitors = { key: 'visitors_per_day', value: 8, prev: 4, invert: false };
    expect(deltaIsGood(visitors, scorecardDelta(visitors))).toBe(true);
  });

  it('scores against the target in the right direction', () => {
    expect(scorecardOnTarget({ value: 500, target: 500 })).toBe(true);
    expect(scorecardOnTarget({ value: 499, target: 500 })).toBe(false);
    expect(scorecardOnTarget({ value: 4, target: 5, invert: true })).toBe(true);
    expect(scorecardOnTarget({ value: 6, target: 5, invert: true })).toBe(false);
    expect(scorecardOnTarget({ value: null, target: 20 })).toBeNull();
  });

  it('clamps pace to 0..1 and treats an inverted metric under its ceiling as full', () => {
    expect(scorecardPace({ value: 250, target: 500 })).toBe(0.5);
    expect(scorecardPace({ value: 900, target: 500 })).toBe(1);
    expect(scorecardPace({ value: 2, target: 5, invert: true })).toBe(1);
    expect(scorecardPace({ value: 10, target: 5, invert: true })).toBe(0.5);
    expect(scorecardPace({ value: null, target: 5 })).toBeNull();
  });

  it('orders rows canonically and drops anything unknown', () => {
    const shuffled = scorecard();
    shuffled.rows = [...shuffled.rows].reverse().concat([{ key: 'mystery_metric', value: 1 }]);
    expect(scorecardRows(shuffled).map((row) => row.key)).toEqual(SCORECARD_KEYS);
  });

  it('survives an empty or malformed payload', () => {
    expect(scorecardRows(null)).toEqual([]);
    expect(scorecardRows({ rows: 'nope' })).toEqual([]);
  });
});

describe('scorecard email', () => {
  it('leads the subject with visitors, MRR and how many targets are met', () => {
    const subject = scorecardSubject(scorecard());
    expect(subject).toContain('62.4 visitors/day');
    expect(subject).toContain('$24.97 MRR');
    expect(subject).toContain('0/8 on target');
  });

  it('counts a met target in the subject', () => {
    const hit = scorecard();
    hit.rows = hit.rows.map((row) =>
      row.key === 'failed_renewal_pct' ? { ...row, value: 1 } : row
    );
    expect(scorecardSubject(hit)).toContain('1/8 on target');
  });

  it('labels the week in UTC from the RPC window', () => {
    expect(scorecardWeekLabel(scorecard())).toBe('Aug 31 – Sep 7 · UTC');
  });

  it('renders all eight rows with this week, last week and target', () => {
    const html = renderScorecardEmail(scorecard());
    for (const row of scorecard().rows) {
      expect(html).toContain(row.label);
    }
    expect(html).toContain('62.4');
    expect(html).toContain('$450');
    expect(html).toContain('This week');
    expect(html).toContain('Last week');
    expect(html).toContain('Target');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('prefers-color-scheme: dark');
  });

  it('shows a dash rather than 0% for a cohort that is too young to measure', () => {
    const html = renderScorecardEmail(scorecard());
    expect(html).toContain('Sign-ups active in week 2');
    expect(html).toContain('–');
    expect(html).not.toContain('0%</td>');
  });

  it('escapes anything that arrives as a label', () => {
    const evil = scorecard({
      rows: [{ key: 'visitors_per_day', label: '<script>x</script>', unit: 'number', value: 1, prev: 1, target: 2 }],
    });
    const html = renderScorecardEmail(evil);
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders an empty scorecard without throwing', () => {
    expect(() => renderScorecardEmail({ rows: [] })).not.toThrow();
    expect(renderScorecardEmail({ rows: [] })).toContain('0/0 on target');
  });
});
