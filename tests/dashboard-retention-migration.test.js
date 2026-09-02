import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const retention = readFileSync(
  new URL('../supabase/migrations/20260901020000_dashboard_retention.sql', import.meta.url),
  'utf8'
).toLowerCase();

describe('dashboard_retention migration', () => {
  it('counts verified sign-ups per ISO week in UTC', () => {
    expect(retention).toContain("date_trunc('week', (u.created_at at time zone 'utc'))::date as week");
    expect(retention).toContain('u.is_anonymous = false');
    expect(retention).toContain('u.email is not null');
  });

  it('measures days 1-7 and days 8-14 from each user\'s own signup moment', () => {
    expect(retention).toContain("and e.created_at > c.created_at\n        and e.created_at <= c.created_at + interval '7 days'");
    expect(retention).toContain("and e.created_at > c.created_at + interval '7 days'\n        and e.created_at <= c.created_at + interval '14 days'");
  });

  it('refuses to score a cohort younger than 21 days', () => {
    expect(retention).toContain('((f.week + 21) <= (select today from bounds)) as measurable');
    expect(retention).toContain("'pending_weeks'");
  });

  it('returns sample size alongside both rates', () => {
    for (const key of ["'signups'", "'week1'", "'week2'", "'week1_pct'", "'week2_pct'", "'measurable'"]) {
      expect(retention).toContain(key);
    }
    expect(retention).toContain("'weeks'");
    expect(retention).toContain("'current'");
    expect(retention).toContain("'latest'");
  });

  it('clamps p_weeks and stays service-role only', () => {
    expect(retention).toContain('greatest(1, least(coalesce(p_weeks, 8), 52))');
    expect(retention).toContain('revoke all on function public.dashboard_retention(int) from public, anon, authenticated;');
    expect(retention).toContain('grant execute on function public.dashboard_retention(int) to service_role;');
    expect(retention).toContain("set search_path = ''");
    expect(retention).toContain('security definer');
  });
});
