-- 20260901030000_weekly_scorecard.sql
-- weekly_scorecard(): the eight numbers the Monday email and the /data
-- scorecard card are built from (report item 45). Last 7 days vs the 7 before
-- it, one row per metric, each with its 90-day target.
--
-- Metric definitions (this function is the only place they live):
--
--  1 visitors_per_day     engaged visitors / 7. "Engaged" is the dashboard's
--                         own bot-resistant definition: >= 3 events in the
--                         window (obvious crawlers are already dropped by the
--                         UA filter at ingest). Read through
--                         activity_window_visitors, so closed days come from
--                         the rollups.
--  2 ai_google_per_day    the same engaged visitors whose modal channel is
--                         'AI assistants' (chatgpt|openai|perplexity|claude|
--                         gemini|copilot, via activity_channel) or whose modal
--                         acquisition_source mentions google, / 7.
--  3 free_reports_per_day AI writing reports delivered to non-paying users, / 7.
--                         Source: the AI credit ledger (ai_usage_costs,
--                         skill='writing', feature='writing_score', succeeded),
--                         which is written by the score route we must not
--                         touch. "Free" is decided as-of the call:
--                         premium_since is null or later than occurred_at, so
--                         a user who upgraded afterwards still counts as free
--                         for the reports they got before upgrading.
--  4 week2_pct            dashboard_retention()'s newest MEASURABLE cohort;
--                         prev is the cohort before it. Null while no cohort
--                         has finished its 14 days.
--  5 paywall_paid_pct     visitors who saw a gate (paywall_view, premium_gate,
--                         free_limit_gate, mock_paywall_shown) in the window
--                         and also purchased in the window / all gate viewers.
--  6 new_payers           distinct users with a subscription_activated row.
--  7 mrr_usd              METHOD: current entitlement state x the charged
--                         price of the SKU (mirrors src/lib/saleConfig.js —
--                         monthly $8.99, 3month $19.99, PPP $3.99 / $8.99,
--                         retired 6month $49.99; an unknown or absent
--                         plan_sku is valued at the global monthly price).
--                         A row counts when it satisfies the recurring half of
--                         lib/premium.isPremiumRow: plan='premium', not
--                         paused, plan_expires_at is null (a non-null expiry is
--                         a one-time Exam Pass, not recurring revenue), and
--                         status active/trialing/past_due, or canceled but
--                         still inside a paid period. PPP is read from the
--                         user's most recent subscription_activated event
--                         (props->>'ppp'), because users has no PPP column.
--                         PREV is the same calculation restricted to
--                         subscriptions that had already started 7 days ago,
--                         so the delta reads as "MRR added", not net movement:
--                         churn that happened since is not subtracted, because
--                         current state cannot reconstruct a past roster.
--  8 failed_renewal_pct   renewal_failed / (renewal_failed +
--                         subscription_payment_succeeded). renewal_failed is
--                         written by lib/billing.js on invoice.payment_failed.
--                         Lower is better (invert = true).
--
-- Targets are the 90-day distribution plan's numbers and are returned with the
-- data so the email, the card, and this function can never disagree.
--
-- Service-role only. Safe to re-run.

create or replace function public.weekly_scorecard()
returns jsonb
language sql
security definer
set search_path = ''
as $$
with w(tag, w_from, w_to) as (
  values
    ('cur',  now() - interval '7 days',  now()),
    ('prev', now() - interval '14 days', now() - interval '7 days')
),
vis as (
  select w.tag,
    v.visitor,
    sum(v.events) as n,
    mode() within group (order by v.channel) as channel,
    mode() within group (order by v.source) filter (where v.source is not null) as source
  from w
  cross join lateral public.activity_window_visitors(w.w_from, w.w_to) v
  group by 1, 2
),
visitors as (
  select vis.tag,
    (count(*) filter (where vis.n >= 3))::numeric as engaged,
    (count(*) filter (where vis.n >= 3
       and (vis.channel = 'AI assistants' or vis.source ~* 'google')))::numeric as ai_google
  from vis group by 1
),
reports as (
  select w.tag, count(*)::numeric as n
  from w
  join public.ai_usage_costs c on c.occurred_at >= w.w_from and c.occurred_at < w.w_to
  join public.users u on u.id = c.user_id
  where c.skill = 'writing'
    and c.feature = 'writing_score'
    and c.succeeded
    and (u.premium_since is null or u.premium_since > c.occurred_at)
  group by 1
),
gate as (
  select w.tag, coalesce(e.user_id::text, e.anon_id) as visitor
  from w
  join public.activity_events e on e.created_at >= w.w_from and e.created_at < w.w_to
  where e.event in ('paywall_view', 'premium_gate', 'free_limit_gate', 'mock_paywall_shown')
  group by 1, 2
),
paid as (
  select w.tag, coalesce(e.user_id::text, e.anon_id) as visitor
  from w
  join public.activity_events e on e.created_at >= w.w_from and e.created_at < w.w_to
  where e.event in ('purchase_success', 'subscription_activated')
  group by 1, 2
),
gate_stats as (
  select g.tag,
    count(*)::numeric as gates,
    (count(*) filter (where exists (
      select 1 from paid p where p.tag = g.tag and p.visitor = g.visitor)))::numeric as converted
  from gate g group by 1
),
payers as (
  select w.tag, count(distinct e.user_id)::numeric as n
  from w
  join public.activity_events e on e.created_at >= w.w_from and e.created_at < w.w_to
  where e.event = 'subscription_activated' and e.user_id is not null
  group by 1
),
renewals as (
  select w.tag,
    (count(*) filter (where e.event = 'renewal_failed'))::numeric as failed,
    count(*)::numeric as attempts
  from w
  join public.activity_events e on e.created_at >= w.w_from and e.created_at < w.w_to
  where e.event in ('renewal_failed', 'subscription_payment_succeeded')
  group by 1
),
prices(sku, monthly_global, monthly_ppp) as (
  values
    ('monthly', 8.99::numeric,     3.99::numeric),
    ('3month',  19.99::numeric / 3, 8.99::numeric / 3),
    ('6month',  49.99::numeric / 6, null::numeric)   -- retired for new sales
),
subs as (
  select
    u.id,
    u.premium_since,
    coalesce((
      select nullif(a.props->>'ppp', '') = '1'
      from public.activity_events a
      where a.user_id = u.id and a.event = 'subscription_activated'
      order by a.created_at desc
      limit 1), false) as ppp,
    u.plan_sku
  from public.users u
  where u.plan = 'premium'
    and (u.billing_pause_until is null or u.billing_pause_until <= now())
    and u.plan_expires_at is null
    and (u.plan_status in ('active', 'trialing', 'past_due')
         or (u.plan_status = 'canceled' and u.plan_renews_at > now()))
),
mrr as (
  select
    coalesce(sum(v.monthly), 0) as cur,
    coalesce(sum(v.monthly) filter (
      where v.premium_since is not null and v.premium_since < now() - interval '7 days'), 0) as prev
  from (
    select s.premium_since,
      coalesce(
        case when s.ppp then coalesce(p.monthly_ppp, p.monthly_global) else p.monthly_global end,
        8.99::numeric) as monthly
    from subs s
    left join prices p on p.sku = s.plan_sku
  ) v
),
ret as (select public.dashboard_retention(8) as data),
ret_rows as (
  select (r->>'week')::date as week, (r->>'week2_pct')::numeric as pct
  from ret, lateral jsonb_array_elements(ret.data->'weeks') r
  where (r->>'measurable')::boolean
),
metric as (
  select
    round(coalesce((select engaged from visitors where tag = 'cur'), 0) / 7.0, 1) as visitors_cur,
    round(coalesce((select engaged from visitors where tag = 'prev'), 0) / 7.0, 1) as visitors_prev,
    round(coalesce((select ai_google from visitors where tag = 'cur'), 0) / 7.0, 1) as ai_cur,
    round(coalesce((select ai_google from visitors where tag = 'prev'), 0) / 7.0, 1) as ai_prev,
    round(coalesce((select n from reports where tag = 'cur'), 0) / 7.0, 1) as reports_cur,
    round(coalesce((select n from reports where tag = 'prev'), 0) / 7.0, 1) as reports_prev,
    (select pct from ret_rows order by week desc limit 1) as week2_cur,
    (select pct from ret_rows order by week desc limit 1 offset 1) as week2_prev,
    (select round(100.0 * converted / nullif(gates, 0), 1) from gate_stats where tag = 'cur') as gate_cur,
    (select round(100.0 * converted / nullif(gates, 0), 1) from gate_stats where tag = 'prev') as gate_prev,
    coalesce((select n from payers where tag = 'cur'), 0) as payers_cur,
    coalesce((select n from payers where tag = 'prev'), 0) as payers_prev,
    round((select cur from mrr), 2) as mrr_cur,
    round((select prev from mrr), 2) as mrr_prev,
    (select round(100.0 * failed / nullif(attempts, 0), 1) from renewals where tag = 'cur') as renew_cur,
    (select round(100.0 * failed / nullif(attempts, 0), 1) from renewals where tag = 'prev') as renew_prev,
    (select gates from gate_stats where tag = 'cur') as gate_views,
    (select data->'current' from ret) as cohort
)
select jsonb_build_object(
  'generated_at', now(),
  'from', (now() - interval '7 days'),
  'to', now(),
  'prev_from', (now() - interval '14 days'),
  'context', jsonb_build_object(
    'paywall_views', coalesce((select gate_views from metric), 0),
    'cohort', (select cohort from metric)),
  'rows', jsonb_build_array(
    jsonb_build_object('key', 'visitors_per_day', 'label', 'Real visitors / day',
      'unit', 'number', 'value', (select visitors_cur from metric),
      'prev', (select visitors_prev from metric), 'target', 500, 'invert', false),
    jsonb_build_object('key', 'ai_google_per_day', 'label', 'From AI assistants + Google / day',
      'unit', 'number', 'value', (select ai_cur from metric),
      'prev', (select ai_prev from metric), 'target', 250, 'invert', false),
    jsonb_build_object('key', 'free_reports_per_day', 'label', 'Free writing reports / day',
      'unit', 'number', 'value', (select reports_cur from metric),
      'prev', (select reports_prev from metric), 'target', 40, 'invert', false),
    jsonb_build_object('key', 'week2_pct', 'label', 'Sign-ups active in week 2',
      'unit', 'percent', 'value', (select week2_cur from metric),
      'prev', (select week2_prev from metric), 'target', 20, 'invert', false),
    jsonb_build_object('key', 'paywall_paid_pct', 'label', 'Paywall views to paid',
      'unit', 'percent', 'value', (select gate_cur from metric),
      'prev', (select gate_prev from metric), 'target', 12, 'invert', false),
    jsonb_build_object('key', 'new_payers', 'label', 'New paying customers',
      'unit', 'number', 'value', (select payers_cur from metric),
      'prev', (select payers_prev from metric), 'target', 6, 'invert', false),
    jsonb_build_object('key', 'mrr_usd', 'label', 'MRR',
      'unit', 'usd', 'value', (select mrr_cur from metric),
      'prev', (select mrr_prev from metric), 'target', 450, 'invert', false),
    jsonb_build_object('key', 'failed_renewal_pct', 'label', 'Failed renewals',
      'unit', 'percent', 'value', (select renew_cur from metric),
      'prev', (select renew_prev from metric), 'target', 5, 'invert', true))
);
$$;

revoke all on function public.weekly_scorecard() from public, anon, authenticated;
grant execute on function public.weekly_scorecard() to service_role;

comment on function public.weekly_scorecard() is
  'Last 7 days vs the prior 7 for the eight distribution metrics, each with its 90-day target. MRR = current entitlement state x saleConfig prices; see the migration header for every definition.';
