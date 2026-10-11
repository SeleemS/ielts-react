import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SUPPORTED_EXAM_PASS_DAYS } from '../src/lib/saleConfig';

const sql = readFileSync(
  new URL('../supabase/migrations/20260923130000_exam_pass_length.sql', import.meta.url),
  'utf8'
).toLowerCase();

describe('exam pass length migration', () => {
  it('replaces the private implementation, not the public wrapper', () => {
    expect(sql).toContain('create or replace function billing_private.fulfill_checkout(');
    expect(sql).not.toMatch(/create or replace function public\.fulfill_checkout/);
  });

  it('only grants allowlisted lengths and keeps 30 days as the default', () => {
    expect(sql).toContain("nullif(p_fields->>'_exam_pass_days', '')");
    expect(sql).toContain("v_pass_days_raw not in ('30', '45')");
    expect(sql).toContain('v_pass_days integer := 30');
    expect(sql).toContain('make_interval(days => v_pass_days)');
    expect(sql).not.toContain("plan_expires_at := now() + interval '30 days'");
  });

  it('keeps replay idempotency and the service-role-only grants', () => {
    expect(sql).toContain("'already_applied'");
    expect(sql).toContain('for update');
    expect(sql).toMatch(/revoke all on function billing_private\.fulfill_checkout\([^)]*\)\s+from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.billing_exam_pass_days_supported\(\) to service_role/);
    expect(sql).toMatch(/revoke all on function public\.billing_exam_pass_days_supported\(\) from public, anon, authenticated/);
  });

  it('exposes exactly the lengths the app may advertise', () => {
    // Superseded by 20261011120000 (adds the 7-day Week Pass); see week-pass-migration.test.js.
    expect(sql).toContain(`select array[${SUPPORTED_EXAM_PASS_DAYS.join(', ')}]`);
  });
});
