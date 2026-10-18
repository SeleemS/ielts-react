-- Allow the one-time 48-hour first-report offer email (lib/reportOffer.js,
-- queueFreeReportOffer in pages/api/cron/lifecycle-emails.js).
alter table public.lifecycle_emails
  drop constraint if exists lifecycle_emails_email_type_check;
alter table public.lifecycle_emails
  add constraint lifecycle_emails_email_type_check check (
    email_type = any (array[
      'welcome_signup', 'welcome_purchase', 'weekly_digest', 'win_back',
      'exam_countdown', 'checkout_abandoned', 'paywall_followup',
      'weekly_progress', 'streak_at_risk', 'day2_first_week_plan',
      'free_report_offer'
    ]::text[])
  );
