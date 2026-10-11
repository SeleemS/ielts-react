import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SUPPORTED_EXAM_PASS_DAYS, WEEK_PASS_DAYS } from '../src/lib/saleConfig';

const sql = readFileSync(
  new URL('../supabase/migrations/20261011120000_pass_lengths_week_pass.sql', import.meta.url),
  'utf8'
).toLowerCase();

describe('pass lengths + week pass migration', () => {
  it('replaces only the private implementation', () => {
    expect(sql).toContain('create or replace function billing_private.fulfill_checkout(');
    expect(sql).not.toMatch(/create or replace function public\.fulfill_checkout/);
  });

  it('allowlists products and lengths, keeping 30 days as the Exam Pass default', () => {
    expect(sql).toContain("v_pass_product not in ('exam_pass', 'week_pass')");
    expect(sql).toContain("v_pass_days_raw is distinct from '7' or p_realtime_quota <> 0");
    expect(sql).toContain("v_pass_days_raw not in ('30', '45')");
    expect(sql).toContain('v_pass_days integer := 30');
    expect(sql).toContain('make_interval(days => v_pass_days)');
  });

  it('keeps replay idempotency and service-role-only grants', () => {
    expect(sql).toContain("'already_applied'");
    expect(sql).toContain('for update');
    expect(sql).toMatch(/revoke all on function billing_private\.fulfill_checkout\([^)]*\)\s+from public, anon, authenticated/);
    expect(sql).toMatch(/revoke all on function public\.billing_exam_pass_days_supported\(\) from public, anon, authenticated/);
  });

  it('exposes exactly the lengths the app may sell', () => {
    const days = [WEEK_PASS_DAYS, ...SUPPORTED_EXAM_PASS_DAYS].sort((a, b) => a - b);
    expect(sql).toContain(`select array[${days.join(', ')}]`);
  });
});
