-- 20260901020000_dashboard_retention.sql
-- dashboard_retention(p_weeks): weekly sign-up cohorts and their week-2
-- return rate — the one number that says whether the product is worth coming
-- back to (report item 34).
--
-- Definitions, fixed here so the card, the Monday scorecard, and any ad-hoc
-- query can never drift apart:
--   cohort      a verified sign-up: a public.users row that is not anonymous
--               and carries an email. Bucketed by ISO week (Monday) of
--               created_at, in UTC.
--   week 1      >= 1 activity_events row for that user_id in
--               (signup, signup + 7 days].
--   week 2      >= 1 activity_events row in (signup + 7d, signup + 14d].
--               Per user, not per calendar week — a Friday sign-up gets the
--               same 14-day runway as a Monday one.
--   measurable  every member of the cohort has had its full 14 days:
--               week_start + 21 days <= today. Younger cohorts are returned
--               with measurable = false so the UI can say "too young" instead
--               of printing a number that can only go up.
--
-- Per-user look-ups ride activity_events_user_created_idx (user_id, created_at),
-- so this is a few hundred index probes, not a scan.
--
-- Service-role only, like every other dashboard RPC. Safe to re-run.

create or replace function public.dashboard_retention(p_weeks int default 8)
returns jsonb
language sql
security definer
set search_path = ''
as $$
with bounds as (
  select
    greatest(1, least(coalesce(p_weeks, 8), 52)) as weeks,
    date_trunc('week', (now() at time zone 'utc'))::date as this_week,
    (now() at time zone 'utc')::date as today
),
cohort_users as (
  select
    date_trunc('week', (u.created_at at time zone 'utc'))::date as week,
    u.id,
    u.created_at
  from public.users u, bounds b
  where u.is_anonymous = false
    and u.email is not null
    and (u.created_at at time zone 'utc') >= (b.this_week - (b.weeks * 7))::timestamp
    and (u.created_at at time zone 'utc') < (b.this_week + 7)::timestamp
),
flags as (
  select
    c.week,
    exists (
      select 1 from public.activity_events e
      where e.user_id = c.id
        and e.created_at > c.created_at
        and e.created_at <= c.created_at + interval '7 days'
    ) as w1,
    exists (
      select 1 from public.activity_events e
      where e.user_id = c.id
        and e.created_at > c.created_at + interval '7 days'
        and e.created_at <= c.created_at + interval '14 days'
    ) as w2
  from cohort_users c
),
weekly as (
  select
    f.week,
    count(*)::int as signups,
    (count(*) filter (where f.w1))::int as week1,
    (count(*) filter (where f.w2))::int as week2,
    ((f.week + 21) <= (select today from bounds)) as measurable
  from flags f
  group by 1
),
rows_out as (
  select
    w.week,
    w.signups,
    w.week1,
    w.week2,
    round(100.0 * w.week1 / nullif(w.signups, 0), 1) as week1_pct,
    round(100.0 * w.week2 / nullif(w.signups, 0), 1) as week2_pct,
    w.measurable
  from weekly w
)
select jsonb_build_object(
  'weeks', coalesce((
    select jsonb_agg(jsonb_build_object(
      'week', r.week, 'signups', r.signups,
      'week1', r.week1, 'week2', r.week2,
      'week1_pct', r.week1_pct, 'week2_pct', r.week2_pct,
      'measurable', r.measurable
    ) order by r.week)
    from rows_out r), '[]'::jsonb),
  -- The newest cohort that has actually finished its 14 days: the honest
  -- headline number.
  'current', (
    select jsonb_build_object(
      'week', r.week, 'signups', r.signups,
      'week1', r.week1, 'week2', r.week2,
      'week1_pct', r.week1_pct, 'week2_pct', r.week2_pct,
      'measurable', true)
    from rows_out r where r.measurable order by r.week desc limit 1),
  -- The newest cohort of any age, so the card can name what it is waiting on.
  'latest', (
    select jsonb_build_object(
      'week', r.week, 'signups', r.signups,
      'week1', r.week1, 'week2', r.week2,
      'week1_pct', r.week1_pct, 'week2_pct', r.week2_pct,
      'measurable', r.measurable)
    from rows_out r order by r.week desc limit 1),
  'pending_weeks', (select count(*)::int from rows_out r where not r.measurable),
  'generated_at', now()
);
$$;

revoke all on function public.dashboard_retention(int) from public, anon, authenticated;
grant execute on function public.dashboard_retention(int) to service_role;

comment on function public.dashboard_retention(int) is
  'Weekly verified-signup cohorts with day 1-7 and day 8-14 return rates; measurable = cohort has completed its 14-day window.';
