import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const scorecard = readFileSync(
  new URL('../supabase/migrations/20260901030000_weekly_scorecard.sql', import.meta.url),
  'utf8'
).toLowerCase();

describe('weekly_scorecard migration', () => {
  it('returns the eight rows the email and the card render, in order', () => {
    const keys = [
      'visitors_per_day',
      'ai_google_per_day',
      'free_reports_per_day',
      'week2_pct',
      'paywall_paid_pct',
      'new_payers',
      'mrr_usd',
      'failed_renewal_pct',
    ];
    let cursor = -1;
    for (const key of keys) {
      const at = scorecard.indexOf(`'key', '${key}'`);
      expect(at, key).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  it('carries the 90-day targets with the data', () => {
    for (const target of ["'target', 500", "'target', 250", "'target', 40", "'target', 20",
      "'target', 12", "'target', 6", "'target', 450", "'target', 5"]) {
      expect(scorecard).toContain(target);
    }
    expect(scorecard).toContain("'invert', true");
  });

  it('reuses the rollup window and the retention RPC instead of re-deriving them', () => {
    expect(scorecard).toContain('public.activity_window_visitors(w.w_from, w.w_to)');
    expect(scorecard).toContain('public.dashboard_retention(8)');
  });

  it('uses the engaged (>= 3 events) definition for real visitors', () => {
    expect(scorecard).toContain('count(*) filter (where vis.n >= 3)');
  });

  it('counts AI assistants plus Google for the acquisition target', () => {
    expect(scorecard).toContain("vis.channel = 'ai assistants' or vis.source ~* 'google'");
  });

  it('derives free writing reports from the AI credit ledger, as-of the call', () => {
    expect(scorecard).toContain('public.ai_usage_costs');
    expect(scorecard).toContain("c.skill = 'writing'");
    expect(scorecard).toContain("c.feature = 'writing_score'");
    expect(scorecard).toContain('u.premium_since is null or u.premium_since > c.occurred_at');
  });

  it('documents and implements the MRR method', () => {
    expect(scorecard).toContain('method: current entitlement state x the charged');
    expect(scorecard).toContain("('monthly', 8.99::numeric,      3.99::numeric)");
    expect(scorecard).toContain("('annual',  49.99::numeric / 12, 19.99::numeric / 12)");
    expect(scorecard).toContain("('3month',  19.99::numeric / 3,  8.99::numeric / 3)");
    // the only live 6-month subscription was charged $29.99, never $49.99
    expect(scorecard).toContain("('6month',  29.99::numeric / 6,  14.99::numeric / 6)");
    // the recurring half of lib/premium.isPremiumRow
    expect(scorecard).toContain('u.plan_expires_at is null');
    expect(scorecard).toContain("u.plan_status in ('active', 'trialing', 'past_due')");
    expect(scorecard).toContain("u.plan_status = 'canceled' and u.plan_renews_at > now()");
    expect(scorecard).toContain('u.billing_pause_until is null or u.billing_pause_until <= now()');
  });

  it('reads failed renewals from the renewal_failed activity row', () => {
    expect(scorecard).toContain("e.event = 'renewal_failed'");
    expect(scorecard).toContain("e.event in ('renewal_failed', 'subscription_payment_succeeded')");
  });

  it('stays service-role only', () => {
    expect(scorecard).toContain('revoke all on function public.weekly_scorecard() from public, anon, authenticated;');
    expect(scorecard).toContain('grant execute on function public.weekly_scorecard() to service_role;');
    expect(scorecard).toContain("set search_path = ''");
  });
});
