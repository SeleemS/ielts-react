-- scripts/verify-dashboard-perf.sql
-- Read-only checks for 20260901010000_dashboard_perf.sql. Nothing here writes;
-- run it in the Supabase SQL editor or with psql after applying the migration.
--
--   psql "$SUPABASE_DB_SESSION_URL" -f scripts/verify-dashboard-perf.sql

\echo '== 1. objects exist =='
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('activity_daily', 'activity_daily_visitor', 'activity_daily_dim',
                     'activity_daily_session', 'activity_daily_state')
order by 1;

select p.proname, pg_get_function_identity_arguments(p.oid) as args, d.description
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
left join pg_description d on d.objoid = p.oid
where n.nspname = 'public'
  and p.proname in ('dashboard_overview', 'refresh_activity_daily', 'activity_channel',
                    'activity_rollup_events', 'activity_rollup_visitors', 'activity_rollup_dims',
                    'activity_rollup_sessions', 'activity_rollup_boundary',
                    'activity_window_events', 'activity_window_visitors',
                    'activity_window_dims', 'activity_window_sessions')
order by 1;

\echo '== 2. dashboard_overview must be v8 =='
select (d.description like '%v8%') as is_v8, d.description
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
left join pg_description d on d.objoid = p.oid
where n.nspname = 'public' and p.proname = 'dashboard_overview';

\echo '== 3. no anon/authenticated execute on any rollup function (expect 0 rows) =='
select p.proname, a.grantee
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
join pg_roles r on r.oid = a.grantee
where n.nspname = 'public'
  and r.rolname in ('anon', 'authenticated', 'public')
  and p.proname in ('dashboard_overview', 'refresh_activity_daily', 'activity_channel',
                    'activity_rollup_events', 'activity_rollup_visitors', 'activity_rollup_dims',
                    'activity_rollup_sessions', 'activity_rollup_boundary',
                    'activity_window_events', 'activity_window_visitors',
                    'activity_window_dims', 'activity_window_sessions',
                    'dashboard_retention', 'weekly_scorecard');

\echo '== 4. RLS on, no client grants on the rollup tables (expect 0 rows) =='
select c.relname, c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('activity_daily', 'activity_daily_visitor', 'activity_daily_dim',
                    'activity_daily_session', 'activity_daily_state')
  and c.relrowsecurity = false;

select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'PUBLIC')
  and table_name in ('activity_daily', 'activity_daily_visitor', 'activity_daily_dim',
                     'activity_daily_session', 'activity_daily_state');

\echo '== 5. indexes the RPCs depend on =='
select indexname
from pg_indexes
where schemaname = 'public'
  and tablename = 'activity_events'
  and indexname in ('activity_events_visitor_created_idx',
                    'activity_events_event_created_visitor_idx',
                    'activity_events_user_created_idx',
                    'activity_events_created_idx')
order by 1;

\echo '== 6. watermark coverage: any missing day before today is a gap (expect 0) =='
select count(*)::int as missing_days
from generate_series(
       (select min(day) from public.activity_daily_state),
       current_date - 1,
       interval '1 day') g(d)
where not exists (select 1 from public.activity_daily_state s where s.day = g.d::date);

\echo '== 7. rollup size vs raw (the whole point) =='
select
  (select count(*) from public.activity_events)         as raw_events,
  (select count(*) from public.activity_daily)          as daily_rows,
  (select count(*) from public.activity_daily_visitor)  as visitor_rows,
  (select count(*) from public.activity_daily_dim)      as dim_rows,
  (select count(*) from public.activity_daily_session)  as session_rows,
  (select count(*) from public.activity_daily_state)    as days_covered;

\echo '== 8. rollup vs raw for the last 7 CLOSED days (differences must be 0) =='
with bounds as (
  select (current_date - 7)::timestamptz as w_from, current_date::timestamptz as w_to
),
raw as (
  select
    count(*) as events,
    count(distinct coalesce(e.user_id::text, e.anon_id)) as visitors,
    count(distinct coalesce(e.user_id::text, e.anon_id))
      filter (where e.event = 'signup_verified') as signups,
    count(*) filter (where e.event = 'question_answer') as questions_answered
  from public.activity_events e, bounds b
  where e.created_at >= b.w_from and e.created_at < b.w_to
),
rolled as (
  select
    (select coalesce(sum(w.events), 0) from bounds b,
      lateral public.activity_window_events(b.w_from, b.w_to) w) as events,
    (select count(distinct w.visitor) from bounds b,
      lateral public.activity_window_visitors(b.w_from, b.w_to) w) as visitors,
    (select count(distinct w.visitor) from bounds b,
      lateral public.activity_window_visitors(b.w_from, b.w_to) w where w.signed_up) as signups,
    (select coalesce(sum(w.events), 0) from bounds b,
      lateral public.activity_window_events(b.w_from, b.w_to) w
      where w.event = 'question_answer') as questions_answered
)
select
  raw.events - rolled.events                         as d_events,
  raw.visitors - rolled.visitors                     as d_visitors,
  raw.signups - rolled.signups                       as d_signups,
  raw.questions_answered - rolled.questions_answered as d_questions_answered
from raw, rolled;

\echo '== 9. the shape /data destructures =='
select
  data ?& array['totals','prev_totals','series','countries','breakdowns','funnel',
                'areas','hour_heatmap','session_buckets','returning'] as top_level_ok,
  (data->'totals') ?& array['events','visitors','engaged_visitors','signups','submits',
                            'questions_answered','purchases','purchasers','payments',
                            'login_sessions','revenue_minor','sessions_total',
                            'bounce_sessions','median_session_secs','avg_session_secs'] as totals_ok,
  (data->'breakdowns') ?& array['channels','referrers','campaigns','pages_top','pages_entry',
                                'pages_exit','browsers','oses','devices'] as breakdowns_ok
from (select public.dashboard_overview(now() - interval '7 days', now(), 'day') as data) s;

\echo '== 10. retention + scorecard smoke (shape only) =='
select
  (public.dashboard_retention(8)) ?& array['weeks','current','latest','pending_weeks'] as retention_ok,
  (public.weekly_scorecard()) ?& array['rows','generated_at','from','to','context'] as scorecard_ok,
  jsonb_array_length((public.weekly_scorecard())->'rows') as scorecard_rows;
