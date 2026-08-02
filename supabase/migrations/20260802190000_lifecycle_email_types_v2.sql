-- 20260802190000_lifecycle_email_types_v2.sql
-- Widens lifecycle_emails.email_type for the personalized lifecycle suite
-- (2026-08-02 full-site audit, P1):
--   * exam_countdown       — D-30/14/7/2 reminders keyed to users.exam_date
--                            (service email: countdown + practice CTA, no pitch)
--   * checkout_abandoned   — T+2h after a checkout_start with no purchase
--                            (soft-opt-in basis: user initiated the purchase)
--   * paywall_followup     — T+24h after a premium_gate impression, marketing
--   * weekly_progress      — personalized digest for active subscribers, marketing
--   * streak_at_risk       — practiced yesterday, not today, streak >= 3, marketing
--   * day2_first_week_plan — onboarding day-2 plan for users with >= 1 attempt
-- Which types honor the newsletter suppression list is enforced in
-- pages/api/cron/lifecycle-emails.js (MARKETING_EMAIL_TYPES).

alter table public.lifecycle_emails
  drop constraint if exists lifecycle_emails_email_type_check;

alter table public.lifecycle_emails
  add constraint lifecycle_emails_email_type_check check (
    email_type in (
      'welcome_signup',
      'welcome_purchase',
      'weekly_digest',
      'win_back',
      'exam_countdown',
      'checkout_abandoned',
      'paywall_followup',
      'weekly_progress',
      'streak_at_risk',
      'day2_first_week_plan'
    )
  );
