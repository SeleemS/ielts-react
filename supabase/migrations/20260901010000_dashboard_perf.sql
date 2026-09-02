-- 20260901010000_dashboard_perf.sql
-- dashboard_overview v8: daily rollups + open-tail raw reads.
--
-- WHY -----------------------------------------------------------------------
-- Since 2026-08-02 /api/data/overview hit the 8s statement timeout (22 logged
-- occurrences) as activity_events grew past ~45k rows. 20260803190000 fixed
-- the worst offender (the returning_share correlated EXISTS) with an
-- expression index on coalesce(user_id::text, anon_id). What remains is
-- structural: every /data load re-scans every raw event in the range, and the
-- CTE `ev` is multiply-referenced so Postgres materialises the whole window
-- before a single number is produced. At 90d/All that cost grows linearly and
-- forever, for days whose numbers can never change again (created_at is the
-- server receipt time, so a closed UTC day is immutable).
--
-- WHAT ----------------------------------------------------------------------
--   * four rollup tables, all keyed by UTC day:
--       activity_daily          (day, country, channel, event)  — additive counts
--       activity_daily_visitor  (day, visitor)                  — distinct-safe
--       activity_daily_dim      (day, dim, label)               — breakdowns
--       activity_daily_session  (day)                           — session stats
--     plus activity_daily_state, the per-day watermark that tells a reader
--     which days are safe to read from the rollups.
--   * activity_rollup_*(from, to): the ONLY definition of each aggregation.
--     refresh_activity_daily() stores their output for closed days;
--     dashboard_overview calls them directly for the open tail. One
--     definition, so a rolled-up day and a live day can never disagree.
--   * activity_window_*(from, to): stored rows for the covered closed days
--     UNION ALL live rows for the head/tail remainder. Coverage is computed
--     per call, so a missing rollup day degrades to "slower but correct",
--     never to "wrong".
--   * dashboard_overview v8 reads only those window functions (+ raw rows for
--     the trailing-7d hour heatmap, the hourly bucket, and the returning-visitor
--     look-back). The JSON shape is byte-for-byte the v7 shape.
--
-- KNOWN, DELIBERATE APPROXIMATIONS (all documented at their site below):
--   * a session that crosses UTC midnight is counted once per day it touches;
--   * per-day distinct counts are summed for the *breakdown* lists (pages,
--     devices, campaigns), so a visitor active on two days counts twice there.
--     Every headline/KPI/funnel number stays exactly distinct-per-range,
--     because it is derived from activity_daily_visitor, whose grain is
--     (day, visitor).
--   * country/source attribution is the mode of the visitor's daily modes.
--
-- Safe to re-run. Service-role only, like every other dashboard RPC.

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
-- Restated from 20260803190000 (already applied to prod 2026-08-03) so a fresh
-- environment that only replays this file still gets the returning-visitor
-- look-back index.
create index if not exists activity_events_visitor_created_idx
  on public.activity_events ((coalesce(user_id::text, anon_id)), created_at);

-- weekly_scorecard and the funnel count DISTINCT visitors for a small set of
-- events over a date range. (event, created_at) already existed as a DESC
-- index; the INCLUDE payload is what lets those counts finish as an index-only
-- scan instead of a heap visit per matching row.
create index if not exists activity_events_event_created_visitor_idx
  on public.activity_events (event, created_at) include (user_id, anon_id);

-- ---------------------------------------------------------------------------
-- Rollup tables
-- ---------------------------------------------------------------------------

-- Additive per-day counts. `channel` here is derived from the *event's own*
-- acquisition_source prop (not the visitor's modal source, which lives in
-- activity_daily_visitor and is what the Channels card reads).
create table if not exists public.activity_daily (
  day              date   not null,
  country          text   not null default '',   -- '' = unknown (PKs reject null)
  channel          text   not null,
  event            text   not null,
  events           bigint not null default 0,
  actors           int    not null default 0,    -- distinct visitors in this cell, that day
  sessions         int    not null default 0,
  engaged_visitors int    not null default 0,    -- actors with >= 3 events that day
  payments         int    not null default 0,    -- billing rows carrying an amount
  revenue_minor    numeric not null default 0,
  primary key (day, country, channel, event)
);

-- One row per visitor per day. This is what keeps every cross-day DISTINCT
-- count exact: summing `events` per visitor reproduces the >=3 engaged rule,
-- and bool_or over the stage flags reproduces the funnel.
create table if not exists public.activity_daily_visitor (
  day             date    not null,
  visitor         text    not null,   -- coalesce(user_id::text, anon_id)
  country         text,
  source          text,
  channel         text    not null,
  events          int     not null default 0,
  signed_up       boolean not null default false,
  revenue_minor   numeric not null default 0,
  f_visited       boolean not null default false,
  f_engaged       boolean not null default false,
  f_submitted     boolean not null default false,
  f_signed_in     boolean not null default false,
  f_saw_gate      boolean not null default false,
  f_upgrade_click boolean not null default false,
  f_checkout      boolean not null default false,
  f_purchased     boolean not null default false,
  primary key (day, visitor)
);

-- Long-tail breakdowns: dim in
-- ('path','entry','exit','browser','os','device','campaign','area').
create table if not exists public.activity_daily_dim (
  day      date   not null,
  dim      text   not null,
  label    text   not null,
  visitors int    not null default 0,
  events   bigint not null default 0,
  secs     bigint not null default 0,
  sessions int    not null default 0,
  primary key (day, dim, label)
);

-- Session shape per day. The duration arrays are tiny (a few hundred ints per
-- day) and buy an EXACT median/percentile across any range, which no
-- pre-bucketed rollup can give back.
create table if not exists public.activity_daily_session (
  day             date  primary key,
  sessions        int   not null default 0,   -- every session with a session_id
  pv_sessions     int   not null default 0,   -- >= 1 page_view
  bounce_sessions int   not null default 0,   -- <= 1 page_view
  login_sessions  int   not null default 0,
  secs            int[] not null default '{}',    -- all sessions
  pv_secs         int[] not null default '{}'     -- page-view sessions only
);

-- Watermark: a day listed here has been rolled up (even if it had no events).
create table if not exists public.activity_daily_state (
  day          date primary key,
  refreshed_at timestamptz not null default now()
);

alter table public.activity_daily         enable row level security;
alter table public.activity_daily_visitor enable row level security;
alter table public.activity_daily_dim     enable row level security;
alter table public.activity_daily_session enable row level security;
alter table public.activity_daily_state   enable row level security;

revoke all on table public.activity_daily         from anon, authenticated;
revoke all on table public.activity_daily_visitor from anon, authenticated;
revoke all on table public.activity_daily_dim     from anon, authenticated;
revoke all on table public.activity_daily_session from anon, authenticated;
revoke all on table public.activity_daily_state   from anon, authenticated;

grant all on table public.activity_daily         to service_role;
grant all on table public.activity_daily_visitor to service_role;
grant all on table public.activity_daily_dim     to service_role;
grant all on table public.activity_daily_session to service_role;
grant all on table public.activity_daily_state   to service_role;

comment on table public.activity_daily is
  'Immutable per-day rollup of activity_events; maintained by refresh_activity_daily().';
comment on table public.activity_daily_visitor is
  'Per-visitor-per-day rollup: the grain that keeps cross-day DISTINCT counts exact.';

-- ---------------------------------------------------------------------------
-- activity_channel: the channel bucketing, lifted out of dashboard_overview so
-- the rollup, the live tail, and weekly_scorecard all share one definition.
-- ---------------------------------------------------------------------------
create or replace function public.activity_channel(p_source text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_source is null or p_source in ('direct', 'unknown', '') then 'Direct/None'
    when p_source ~* 'chatgpt|openai|perplexity|claude|gemini|copilot' then 'AI assistants'
    when p_source ~* 'google|bing|yahoo|yandex|duckduckgo|baidu|search' then 'Organic search'
    when p_source ~* 'facebook|instagram|twitter|linkedin|tiktok|zalo|telegram|whatsapp|reddit|youtube|t\.co|vk' then 'Social'
    else 'Referral' end;
$$;

-- ---------------------------------------------------------------------------
-- activity_rollup_*: the single definition of each aggregation. Called with a
-- whole-day range by refresh_activity_daily(), and with a partial range by the
-- window functions for the open tail.
-- ---------------------------------------------------------------------------
create or replace function public.activity_rollup_events(p_from timestamptz, p_to timestamptz)
returns table (
  day date, country text, channel text, event text,
  events bigint, actors int, sessions int, engaged_visitors int,
  payments int, revenue_minor numeric
)
language sql
stable
security definer
set search_path = ''
as $$
with ev as (
  select
    (e.created_at at time zone 'utc')::date as day,
    coalesce(e.user_id::text, e.anon_id) as visitor,
    coalesce(e.country, '') as country,
    public.activity_channel(nullif(e.props->>'acquisition_source', '')) as channel,
    e.event,
    e.session_id,
    case when e.event in ('subscription_activated', 'subscription_payment_succeeded') then
      case when e.props->>'amount_minor' ~ '^[0-9]+$' then (e.props->>'amount_minor')::numeric
           when e.props->>'amount' ~ '^[0-9]+$' then (e.props->>'amount')::numeric
           else null end
    end as pay_minor
  from public.activity_events e
  where e.created_at >= p_from and e.created_at < p_to
),
per_visitor_day as (
  select ev.day as d, ev.visitor as v, count(*)::int as n from ev group by 1, 2
)
select
  ev.day,
  ev.country,
  ev.channel,
  ev.event,
  count(*)::bigint,
  count(distinct ev.visitor)::int,
  count(distinct ev.session_id)::int,
  (count(distinct ev.visitor) filter (where pvd.n >= 3))::int,
  (count(*) filter (where ev.pay_minor is not null))::int,
  coalesce(sum(ev.pay_minor), 0)::numeric
from ev
join per_visitor_day pvd on pvd.d = ev.day and pvd.v = ev.visitor
group by 1, 2, 3, 4;
$$;

create or replace function public.activity_rollup_visitors(p_from timestamptz, p_to timestamptz)
returns table (
  day date, visitor text, country text, source text, channel text,
  events int, signed_up boolean, revenue_minor numeric,
  f_visited boolean, f_engaged boolean, f_submitted boolean, f_signed_in boolean,
  f_saw_gate boolean, f_upgrade_click boolean, f_checkout boolean, f_purchased boolean
)
language sql
stable
security definer
set search_path = ''
as $$
select
  (e.created_at at time zone 'utc')::date,
  coalesce(e.user_id::text, e.anon_id),
  mode() within group (order by e.country) filter (where e.country is not null),
  mode() within group (order by nullif(e.props->>'acquisition_source', ''))
    filter (where nullif(e.props->>'acquisition_source', '') is not null),
  public.activity_channel(
    mode() within group (order by nullif(e.props->>'acquisition_source', ''))
      filter (where nullif(e.props->>'acquisition_source', '') is not null)),
  count(*)::int,
  bool_or(e.event = 'signup_verified'),
  coalesce(sum(
    case when e.event in ('subscription_activated', 'subscription_payment_succeeded') then
      case when e.props->>'amount_minor' ~ '^[0-9]+$' then (e.props->>'amount_minor')::numeric
           when e.props->>'amount' ~ '^[0-9]+$' then (e.props->>'amount')::numeric
           else null end
    end), 0)::numeric,
  -- Funnel stages, identical to the v7 `funnel` CTE's event sets.
  bool_or(e.event = 'page_view'),
  bool_or(e.event in ('question_open', 'attempt_start', 'question_answer', 'audio_play', 'estimator_start')),
  bool_or(e.event in ('attempt_submit', 'writing_submit', 'speaking_submit')),
  bool_or(e.event in ('signup_verified', 'login')),
  bool_or(e.event in ('paywall_view', 'premium_gate', 'free_limit_gate', 'mock_paywall_shown')),
  bool_or(e.event = 'paywall_upgrade_click'),
  bool_or(e.event = 'checkout_start'),
  bool_or(e.event in ('purchase_success', 'subscription_activated'))
from public.activity_events e
where e.created_at >= p_from and e.created_at < p_to
group by 1, 2;
$$;

create or replace function public.activity_rollup_dims(p_from timestamptz, p_to timestamptz)
returns table (day date, dim text, label text, visitors int, events bigint, secs bigint, sessions int)
language sql
stable
security definer
set search_path = ''
as $$
with ev as (
  select
    (e.created_at at time zone 'utc')::date as day,
    coalesce(e.user_id::text, e.anon_id) as visitor,
    e.event,
    e.session_id,
    e.created_at,
    e.props->>'path' as path,
    nullif(e.props->>'browser', '') as browser,
    nullif(e.props->>'os', '') as os,
    nullif(e.props->>'device', '') as device,
    nullif(e.props->>'utm_campaign', '') as campaign
  from public.activity_events e
  where e.created_at >= p_from and e.created_at < p_to
),
entry as (
  select distinct on (ev.day, ev.session_id) ev.day, ev.session_id, ev.path
  from ev
  where ev.event = 'page_view' and ev.session_id is not null and ev.path is not null
  order by ev.day, ev.session_id, ev.created_at
),
last_seen as (
  select distinct on (ev.day, ev.session_id) ev.day, ev.session_id, ev.path
  from ev
  where ev.session_id is not null and ev.path is not null
  order by ev.day, ev.session_id, ev.created_at desc
)
select ev.day, 'path'::text, ev.path,
       count(distinct ev.visitor)::int, count(*)::bigint, 0::bigint, count(distinct ev.session_id)::int
  from ev where ev.event = 'page_view' and ev.path is not null group by 1, 3
union all
select entry.day, 'entry'::text, entry.path, count(*)::int, 0::bigint, 0::bigint, count(*)::int
  from entry group by 1, 3
union all
select last_seen.day, 'exit'::text, last_seen.path, count(*)::int, 0::bigint, 0::bigint, count(*)::int
  from last_seen group by 1, 3
union all
select ev.day, 'browser'::text, coalesce(ev.browser, 'Unknown'),
       count(distinct ev.visitor)::int, count(*)::bigint, 0::bigint, 0::int
  from ev where ev.event = 'page_view' group by 1, 3
union all
select ev.day, 'os'::text, coalesce(ev.os, 'Unknown'),
       count(distinct ev.visitor)::int, count(*)::bigint, 0::bigint, 0::int
  from ev where ev.event = 'page_view' group by 1, 3
union all
select ev.day, 'device'::text, coalesce(ev.device, 'Unknown'),
       count(distinct ev.visitor)::int, count(*)::bigint, 0::bigint, 0::int
  from ev where ev.event = 'page_view' group by 1, 3
union all
select ev.day, 'campaign'::text, ev.campaign,
       count(distinct ev.visitor)::int, count(*)::bigint, 0::bigint, 0::int
  from ev where ev.campaign is not null group by 1, 3
union all
select ev.day, 'area'::text,
       case
         when ev.path like '/readingquestion%' or ev.path like '/reading%' then 'Reading'
         when ev.path like '/listeningquestion%' then 'Listening'
         when ev.path like '/writingquestion%' or ev.path = '/ielts-writing-checker' then 'Writing'
         when ev.path like '/speakingquestion%' or ev.path = '/speaking-examiner' then 'Speaking'
         when ev.path like '/mock%' then 'Mock tests'
         when ev.path = '/band-estimator' then 'Band estimator'
         when ev.path = '/' then 'Home'
         when ev.path like '/pricing%' then 'Pricing'
         when ev.path like '/dashboard%' then 'User dashboard'
         when ev.path like '/blog%' then 'Blog'
         else 'Other' end,
       count(distinct ev.visitor)::int, count(*)::bigint, (count(*) * 60)::bigint,
       count(distinct ev.session_id)::int
  from ev where ev.event = 'session_heartbeat' group by 1, 3;
$$;

create or replace function public.activity_rollup_sessions(p_from timestamptz, p_to timestamptz)
returns table (
  day date, sessions int, pv_sessions int, bounce_sessions int, login_sessions int,
  secs int[], pv_secs int[]
)
language sql
stable
security definer
set search_path = ''
as $$
with s as (
  select
    (min(e.created_at) at time zone 'utc')::date as day,
    (count(*) filter (where e.event = 'page_view'))::int as page_views,
    bool_or(e.event = 'login') as had_login,
    greatest(extract(epoch from max(e.created_at) - min(e.created_at)), 0)::int as secs
  from public.activity_events e
  where e.created_at >= p_from and e.created_at < p_to and e.session_id is not null
  group by e.session_id
)
select
  s.day,
  count(*)::int,
  (count(*) filter (where s.page_views >= 1))::int,
  (count(*) filter (where s.page_views <= 1))::int,
  (count(*) filter (where s.had_login))::int,
  coalesce(array_agg(s.secs order by s.secs), '{}'::int[]),
  coalesce(array_agg(s.secs order by s.secs) filter (where s.page_views >= 1), '{}'::int[])
from s
group by s.day;
$$;

comment on function public.activity_rollup_sessions(timestamptz, timestamptz) is
  'Session shape per UTC day. A session crossing midnight is attributed to the day of its first event within the range, so it is counted once per rolled-up day it touches.';

-- ---------------------------------------------------------------------------
-- Coverage boundary. Closed days are whole UTC days inside [p_from, p_to) that
-- are already in the past; of those, only the CONTIGUOUS prefix present in
-- activity_daily_state may be read from the rollups. Everything else falls
-- back to raw rows, so a skipped cron run costs latency, never accuracy.
-- ---------------------------------------------------------------------------
create or replace function public.activity_rollup_boundary(p_from timestamptz, p_to timestamptz)
returns table (closed_from date, roll_to date)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from timestamp := p_from at time zone 'utc';
  v_to   timestamp := p_to   at time zone 'utc';
  v_closed_from date;
  v_closed_to   date;
  v_roll_to     date;
begin
  -- A partial first day can never be read from a whole-day rollup.
  v_closed_from := case when v_from = date_trunc('day', v_from)
                        then v_from::date else v_from::date + 1 end;
  -- Today is always live; so is the (partial) final day of the range.
  v_closed_to := least(v_to::date, (now() at time zone 'utc')::date);
  if v_closed_to < v_closed_from then
    v_closed_to := v_closed_from;
  end if;

  select coalesce(min(g.d)::date, v_closed_to) into v_roll_to
  from generate_series(v_closed_from::timestamp, (v_closed_to - 1)::timestamp, interval '1 day') as g(d)
  where not exists (
    select 1 from public.activity_daily_state s where s.day = g.d::date
  );

  closed_from := v_closed_from;
  roll_to := v_roll_to;
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- activity_window_*: rolled-up closed days UNION ALL live head/tail rows.
-- The three ranges are contiguous and disjoint by construction, so nothing is
-- double counted and nothing is dropped.
-- ---------------------------------------------------------------------------
create or replace function public.activity_window_events(p_from timestamptz, p_to timestamptz)
returns table (
  day date, country text, channel text, event text,
  events bigint, actors int, sessions int, engaged_visitors int,
  payments int, revenue_minor numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  b record;
  v_head timestamptz;
  v_tail timestamptz;
begin
  select * into b from public.activity_rollup_boundary(p_from, p_to);
  v_head := least(p_to, b.closed_from::timestamp at time zone 'utc');
  v_tail := greatest(p_from, b.roll_to::timestamp at time zone 'utc');
  return query
    select d.day, d.country, d.channel, d.event, d.events, d.actors, d.sessions,
           d.engaged_visitors, d.payments, d.revenue_minor
      from public.activity_daily d
     where d.day >= b.closed_from and d.day < b.roll_to
    union all
    select * from public.activity_rollup_events(p_from, v_head)
    union all
    select * from public.activity_rollup_events(v_tail, p_to);
end;
$$;

create or replace function public.activity_window_visitors(p_from timestamptz, p_to timestamptz)
returns table (
  day date, visitor text, country text, source text, channel text,
  events int, signed_up boolean, revenue_minor numeric,
  f_visited boolean, f_engaged boolean, f_submitted boolean, f_signed_in boolean,
  f_saw_gate boolean, f_upgrade_click boolean, f_checkout boolean, f_purchased boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  b record;
  v_head timestamptz;
  v_tail timestamptz;
begin
  select * into b from public.activity_rollup_boundary(p_from, p_to);
  v_head := least(p_to, b.closed_from::timestamp at time zone 'utc');
  v_tail := greatest(p_from, b.roll_to::timestamp at time zone 'utc');
  return query
    select v.day, v.visitor, v.country, v.source, v.channel, v.events, v.signed_up,
           v.revenue_minor, v.f_visited, v.f_engaged, v.f_submitted, v.f_signed_in,
           v.f_saw_gate, v.f_upgrade_click, v.f_checkout, v.f_purchased
      from public.activity_daily_visitor v
     where v.day >= b.closed_from and v.day < b.roll_to
    union all
    select * from public.activity_rollup_visitors(p_from, v_head)
    union all
    select * from public.activity_rollup_visitors(v_tail, p_to);
end;
$$;

create or replace function public.activity_window_dims(p_from timestamptz, p_to timestamptz)
returns table (day date, dim text, label text, visitors int, events bigint, secs bigint, sessions int)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  b record;
  v_head timestamptz;
  v_tail timestamptz;
begin
  select * into b from public.activity_rollup_boundary(p_from, p_to);
  v_head := least(p_to, b.closed_from::timestamp at time zone 'utc');
  v_tail := greatest(p_from, b.roll_to::timestamp at time zone 'utc');
  return query
    select d.day, d.dim, d.label, d.visitors, d.events, d.secs, d.sessions
      from public.activity_daily_dim d
     where d.day >= b.closed_from and d.day < b.roll_to
    union all
    select * from public.activity_rollup_dims(p_from, v_head)
    union all
    select * from public.activity_rollup_dims(v_tail, p_to);
end;
$$;

create or replace function public.activity_window_sessions(p_from timestamptz, p_to timestamptz)
returns table (
  day date, sessions int, pv_sessions int, bounce_sessions int, login_sessions int,
  secs int[], pv_secs int[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  b record;
  v_head timestamptz;
  v_tail timestamptz;
begin
  select * into b from public.activity_rollup_boundary(p_from, p_to);
  v_head := least(p_to, b.closed_from::timestamp at time zone 'utc');
  v_tail := greatest(p_from, b.roll_to::timestamp at time zone 'utc');
  return query
    select s.day, s.sessions, s.pv_sessions, s.bounce_sessions, s.login_sessions, s.secs, s.pv_secs
      from public.activity_daily_session s
     where s.day >= b.closed_from and s.day < b.roll_to
    union all
    select * from public.activity_rollup_sessions(p_from, v_head)
    union all
    select * from public.activity_rollup_sessions(v_tail, p_to);
end;
$$;

-- ---------------------------------------------------------------------------
-- refresh_activity_daily(p_from): idempotent rebuild of every rollup table for
-- [p_from, today). Today is never rolled up — it is the live tail. Re-running
-- it for the same days produces the same rows (delete + insert per day range),
-- so the daily cron, a manual backfill, and the apply script can all call it
-- freely. Default lookback is 3 days, which covers a missed cron run.
-- ---------------------------------------------------------------------------
create or replace function public.refresh_activity_daily(p_from date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today   date := (now() at time zone 'utc')::date;
  v_from    date := coalesce(p_from, v_today - 3);
  v_to      date := v_today;          -- exclusive
  v_from_ts timestamptz;
  v_to_ts   timestamptz;
  v_events  bigint;
  v_visitors bigint;
  v_dims    bigint;
  v_sessions bigint;
begin
  -- activity_events starts 2026-07-17; clamp so a stray call cannot walk the
  -- rollup back through empty years.
  if v_from < date '2026-07-01' then
    v_from := date '2026-07-01';
  end if;
  if v_from >= v_to then
    return jsonb_build_object('days', 0, 'from', v_from, 'to', v_to, 'skipped', true);
  end if;

  v_from_ts := v_from::timestamp at time zone 'utc';
  v_to_ts   := v_to::timestamp at time zone 'utc';

  delete from public.activity_daily         where day >= v_from and day < v_to;
  delete from public.activity_daily_visitor where day >= v_from and day < v_to;
  delete from public.activity_daily_dim     where day >= v_from and day < v_to;
  delete from public.activity_daily_session where day >= v_from and day < v_to;

  insert into public.activity_daily (
    day, country, channel, event, events, actors, sessions, engaged_visitors,
    payments, revenue_minor)
  select * from public.activity_rollup_events(v_from_ts, v_to_ts);
  get diagnostics v_events = row_count;

  insert into public.activity_daily_visitor (
    day, visitor, country, source, channel, events, signed_up, revenue_minor,
    f_visited, f_engaged, f_submitted, f_signed_in, f_saw_gate, f_upgrade_click,
    f_checkout, f_purchased)
  select * from public.activity_rollup_visitors(v_from_ts, v_to_ts);
  get diagnostics v_visitors = row_count;

  insert into public.activity_daily_dim (day, dim, label, visitors, events, secs, sessions)
  select * from public.activity_rollup_dims(v_from_ts, v_to_ts);
  get diagnostics v_dims = row_count;

  insert into public.activity_daily_session (
    day, sessions, pv_sessions, bounce_sessions, login_sessions, secs, pv_secs)
  select * from public.activity_rollup_sessions(v_from_ts, v_to_ts);
  get diagnostics v_sessions = row_count;

  -- Mark every day in the range, including days with no events at all: the
  -- reader needs a contiguous watermark, not a "has rows" test.
  insert into public.activity_daily_state (day, refreshed_at)
  select g::date, now()
  from generate_series(v_from::timestamp, (v_to - 1)::timestamp, interval '1 day') as g
  on conflict (day) do update set refreshed_at = now();

  return jsonb_build_object(
    'from', v_from,
    'to', v_to,
    'days', (v_to - v_from),
    'rows', jsonb_build_object(
      'activity_daily', v_events,
      'activity_daily_visitor', v_visitors,
      'activity_daily_dim', v_dims,
      'activity_daily_session', v_sessions));
end;
$$;

-- ---------------------------------------------------------------------------
-- dashboard_overview v8. Same arguments, same JSON shape as v7
-- (20260724040000); the only change is where the numbers come from.
--
-- Still reads raw activity_events for exactly three things:
--   * the hour heatmap, which is pinned to the trailing 7 days by design;
--   * the hourly series bucket, which the API caps at 8-day windows;
--   * the returning-visitor look-back, which needs "was this visitor ever seen
--     before p_from" and is an index probe since 20260803190000.
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_overview(
  p_from timestamptz,
  p_to timestamptz,
  p_bucket text default 'day'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bucket    text := case when p_bucket = 'hour' then 'hour' else 'day' end;
  v_prev_from timestamptz := p_from - (p_to - p_from);
  v_heatmap   jsonb;
  v_series    jsonb;
  v_result    jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('dow', h.dow, 'hour', h.hour, 'events', h.events)), '[]'::jsonb)
    into v_heatmap
  from (
    select extract(isodow from e.created_at)::int as dow,
           extract(hour from e.created_at)::int as hour,
           count(*) as events
    from public.activity_events e
    where e.created_at > now() - interval '7 days'
    group by 1, 2
  ) h;

  with ev as materialized (
    select * from public.activity_window_events(p_from, p_to)
  ),
  vis as materialized (
    select * from public.activity_window_visitors(p_from, p_to)
  ),
  dims as materialized (
    select * from public.activity_window_dims(p_from, p_to)
  ),
  ses as materialized (
    select * from public.activity_window_sessions(p_from, p_to)
  ),
  pev as materialized (
    select * from public.activity_window_events(v_prev_from, p_from)
  ),
  pvis as materialized (
    select * from public.activity_window_visitors(v_prev_from, p_from)
  ),
  -- One row per visitor for the whole range: this is what makes every
  -- headline count a true DISTINCT rather than a sum of daily distincts.
  v_stats as (
    select
      v.visitor,
      sum(v.events)::int as n,
      mode() within group (order by v.country) filter (where v.country is not null) as country,
      mode() within group (order by v.source) filter (where v.source is not null) as source,
      mode() within group (order by v.channel) as channel,
      bool_or(v.signed_up) as signed_up,
      coalesce(sum(v.revenue_minor), 0) as revenue_minor,
      bool_or(v.f_visited) as f_visited,
      bool_or(v.f_engaged) as f_engaged,
      bool_or(v.f_submitted) as f_submitted,
      bool_or(v.f_signed_in) as f_signed_in,
      bool_or(v.f_saw_gate) as f_saw_gate,
      bool_or(v.f_upgrade_click) as f_upgrade_click,
      bool_or(v.f_checkout) as f_checkout,
      bool_or(v.f_purchased) as f_purchased
    from vis v
    group by 1
  ),
  engaged as (select * from v_stats where n >= 3),
  ses_tot as (
    select
      coalesce(sum(s.sessions), 0)::int as sessions_total,
      coalesce(sum(s.bounce_sessions), 0)::int as bounce_sessions,
      coalesce(sum(s.login_sessions), 0)::int as login_sessions
    from ses s
  ),
  ses_all as (select unnest(s.secs) as secs from ses s),
  ses_pv  as (select unnest(s.pv_secs) as secs from ses s),
  totals as (
    select
      (select coalesce(sum(e.events), 0) from ev e) as events,
      (select count(*) from v_stats) as visitors,
      (select count(*) from engaged) as engaged_visitors,
      (select count(*) from v_stats where signed_up) as signups,
      (select coalesce(sum(e.events), 0) from ev e
        where e.event in ('attempt_submit', 'writing_submit', 'speaking_submit')) as submits,
      (select coalesce(sum(e.events), 0) from ev e where e.event = 'question_answer') as questions_answered,
      (select coalesce(sum(e.events), 0) from ev e where e.event = 'purchase_success') as purchases,
      (select count(*) from v_stats where revenue_minor > 0) as purchasers,
      (select coalesce(sum(e.payments), 0) from ev e) as payments,
      (select login_sessions from ses_tot) as login_sessions,
      (select coalesce(sum(e.revenue_minor), 0) from ev e) as revenue_minor,
      (select sessions_total from ses_tot) as sessions_total,
      (select bounce_sessions from ses_tot) as bounce_sessions,
      (select coalesce(percentile_cont(0.5) within group (order by p.secs), 0)::int from ses_pv p)
        as median_session_secs,
      (select coalesce(avg(p.secs), 0)::int from ses_pv p) as avg_session_secs
  ),
  prev_totals as (
    select
      (select coalesce(sum(e.events), 0) from pev e) as events,
      (select count(distinct p.visitor) from pvis p) as visitors,
      (select count(distinct p.visitor) from pvis p where p.signed_up) as signups,
      (select coalesce(sum(e.events), 0) from pev e
        where e.event in ('attempt_submit', 'writing_submit', 'speaking_submit')) as submits,
      (select coalesce(sum(e.events), 0) from pev e where e.event = 'question_answer') as questions_answered,
      (select coalesce(sum(e.events), 0) from pev e where e.event = 'purchase_success') as purchases,
      (select coalesce(sum(e.revenue_minor), 0) from pev e) as revenue_minor
  ),
  series as (
    select jsonb_agg(jsonb_build_object(
      't', s.t, 'events', s.events, 'visitors', s.visitors, 'submits', s.submits,
      'signups', s.signups, 'revenue_minor', s.revenue_minor
    ) order by s.t) as data
    from (
      select
        (coalesce(e.day, v.day)::timestamp at time zone 'utc') as t,
        coalesce(e.events, 0) as events,
        coalesce(v.visitors, 0) as visitors,
        coalesce(e.submits, 0) as submits,
        coalesce(v.signups, 0) as signups,
        coalesce(e.revenue_minor, 0) as revenue_minor
      from (
        select ev.day,
          sum(ev.events) as events,
          coalesce(sum(ev.events) filter (where ev.event in
            ('attempt_submit', 'writing_submit', 'speaking_submit')), 0) as submits,
          coalesce(sum(ev.revenue_minor), 0) as revenue_minor
        from ev group by 1
      ) e
      full join (
        select vis.day,
          count(distinct vis.visitor) as visitors,
          count(distinct vis.visitor) filter (where vis.signed_up) as signups
        from vis group by 1
      ) v on v.day = e.day
    ) s
  ),
  countries as (
    select jsonb_agg(jsonb_build_object(
      'c', c.country,
      'events', coalesce(c.events, 0),
      'visitors', coalesce(c.visitors, 0),
      'engaged', coalesce(c.engaged, 0),
      'submits', coalesce(c.submits, 0),
      'signups', coalesce(c.signups, 0),
      'engaged_secs', coalesce(c.engaged_secs, 0),
      'revenue_minor', coalesce(c.revenue_minor, 0)
    ) order by coalesce(c.engaged, 0) desc, coalesce(c.visitors, 0) desc) as data
    from (
      select
        coalesce(a.country, b.country) as country,
        a.events, a.submits, a.engaged_secs,
        b.visitors, b.engaged, b.signups, b.revenue_minor
      from (
        select e.country,
          sum(e.events) as events,
          coalesce(sum(e.events) filter (where e.event in
            ('attempt_submit', 'writing_submit', 'speaking_submit')), 0) as submits,
          coalesce(sum(e.events) filter (where e.event = 'session_heartbeat'), 0) * 60 as engaged_secs
        from ev e where e.country <> '' group by 1
      ) a
      full join (
        select s.country,
          count(*)::int as visitors,
          (count(*) filter (where s.n >= 3))::int as engaged,
          (count(*) filter (where s.signed_up))::int as signups,
          coalesce(sum(s.revenue_minor), 0) as revenue_minor
        from v_stats s where s.country is not null group by 1
      ) b on b.country = a.country
    ) c
  ),
  referrers as (
    select jsonb_agg(jsonb_build_object(
      'label', r.source, 'visitors', r.visitors, 'revenue_minor', r.revenue_minor, 'signups', r.signups
    ) order by r.visitors desc) as data
    from (
      select coalesce(e.source, 'Direct/None') as source,
        count(*)::int as visitors,
        sum(e.revenue_minor) as revenue_minor,
        (count(*) filter (where e.signed_up))::int as signups
      from engaged e group by 1 order by 2 desc limit 8
    ) r
  ),
  channels as (
    select jsonb_agg(jsonb_build_object(
      'label', c.channel, 'visitors', c.visitors, 'revenue_minor', c.revenue_minor, 'signups', c.signups
    ) order by c.visitors desc) as data
    from (
      select e.channel,
        count(*)::int as visitors,
        sum(e.revenue_minor) as revenue_minor,
        (count(*) filter (where e.signed_up))::int as signups
      from engaged e group by 1 order by 2 desc
    ) c
  ),
  campaigns as (
    select jsonb_agg(jsonb_build_object('label', c.label, 'visitors', c.visitors)
      order by c.visitors desc) as data
    from (
      select d.label, sum(d.visitors)::int as visitors
      from dims d where d.dim = 'campaign' group by 1 order by 2 desc limit 8
    ) c
  ),
  pages_top as (
    select jsonb_agg(jsonb_build_object('label', p.label, 'visitors', p.visitors, 'views', p.views)
      order by p.visitors desc) as data
    from (
      select d.label, sum(d.visitors)::int as visitors, sum(d.events)::bigint as views
      from dims d where d.dim = 'path' group by 1 order by 2 desc limit 8
    ) p
  ),
  pages_entry as (
    select jsonb_agg(jsonb_build_object('label', p.label, 'visitors', p.visitors)
      order by p.visitors desc) as data
    from (
      select d.label, sum(d.visitors)::int as visitors
      from dims d where d.dim = 'entry' group by 1 order by 2 desc limit 8
    ) p
  ),
  pages_exit as (
    select jsonb_agg(jsonb_build_object('label', p.label, 'visitors', p.visitors)
      order by p.visitors desc) as data
    from (
      select d.label, sum(d.visitors)::int as visitors
      from dims d where d.dim = 'exit' group by 1 order by 2 desc limit 8
    ) p
  ),
  ua_dims as (
    select
      (select jsonb_agg(jsonb_build_object('label', x.label, 'visitors', x.visitors) order by x.visitors desc)
         from (select d.label, sum(d.visitors)::int as visitors from dims d
                where d.dim = 'browser' group by 1 order by 2 desc limit 8) x) as browsers,
      (select jsonb_agg(jsonb_build_object('label', x.label, 'visitors', x.visitors) order by x.visitors desc)
         from (select d.label, sum(d.visitors)::int as visitors from dims d
                where d.dim = 'os' group by 1 order by 2 desc limit 8) x) as oses,
      (select jsonb_agg(jsonb_build_object('label', x.label, 'visitors', x.visitors) order by x.visitors desc)
         from (select d.label, sum(d.visitors)::int as visitors from dims d
                where d.dim = 'device' group by 1 order by 2 desc limit 8) x) as devices
  ),
  funnel as (
    select jsonb_build_object(
      'visited',       count(*) filter (where s.f_visited),
      'engaged',       count(*) filter (where s.f_engaged),
      'submitted',     count(*) filter (where s.f_submitted),
      'signed_up',     count(*) filter (where s.f_signed_in),
      'saw_gate',      count(*) filter (where s.f_saw_gate),
      'upgrade_click', count(*) filter (where s.f_upgrade_click),
      'checkout',      count(*) filter (where s.f_checkout),
      'purchased',     count(*) filter (where s.f_purchased)
    ) as data
    from v_stats s
  ),
  areas as (
    select jsonb_agg(jsonb_build_object('area', a.label, 'secs', a.secs, 'sessions', a.sessions)
      order by a.secs desc) as data
    from (
      select d.label, sum(d.secs)::bigint as secs, sum(d.sessions)::int as sessions
      from dims d where d.dim = 'area' group by 1
    ) a
  ),
  session_buckets as (
    select jsonb_agg(jsonb_build_object('bucket', b.bucket, 'sessions', b.n) order by b.bucket) as data
    from (
      select case
          when a.secs < 30 then '0'
          when a.secs < 180 then '1'
          when a.secs < 600 then '2'
          when a.secs < 1800 then '3'
          when a.secs < 3600 then '4'
          else '5' end as bucket,
        count(*)::int as n
      from ses_all a group by 1
    ) b
  ),
  returning_share as (
    select count(*) as visitors,
      count(*) filter (where exists (
        select 1 from public.activity_events e
        where e.created_at < p_from
          and coalesce(e.user_id::text, e.anon_id) = s.visitor
      )) as returning_visitors
    from v_stats s
  )
  select jsonb_build_object(
    'totals', (select row_to_json(totals)::jsonb from totals),
    'prev_totals', (select row_to_json(prev_totals)::jsonb from prev_totals),
    'series', coalesce((select data from series), '[]'::jsonb),
    'countries', coalesce((select data from countries), '[]'::jsonb),
    'breakdowns', jsonb_build_object(
      'channels', coalesce((select data from channels), '[]'::jsonb),
      'referrers', coalesce((select data from referrers), '[]'::jsonb),
      'campaigns', coalesce((select data from campaigns), '[]'::jsonb),
      'pages_top', coalesce((select data from pages_top), '[]'::jsonb),
      'pages_entry', coalesce((select data from pages_entry), '[]'::jsonb),
      'pages_exit', coalesce((select data from pages_exit), '[]'::jsonb),
      'browsers', coalesce((select browsers from ua_dims), '[]'::jsonb),
      'oses', coalesce((select oses from ua_dims), '[]'::jsonb),
      'devices', coalesce((select devices from ua_dims), '[]'::jsonb)
    ),
    'funnel', (select data from funnel),
    'areas', coalesce((select data from areas), '[]'::jsonb),
    'hour_heatmap', v_heatmap,
    'session_buckets', coalesce((select data from session_buckets), '[]'::jsonb),
    'returning', (select jsonb_build_object('visitors', visitors, 'returning', returning_visitors)
                  from returning_share)
  ) into v_result;

  -- Hourly buckets cannot come from a daily rollup. The API only allows
  -- p_bucket = 'hour' for windows of 8 days or less, so this stays cheap.
  if v_bucket = 'hour' then
    select coalesce(jsonb_agg(jsonb_build_object(
      't', s.t, 'events', s.events, 'visitors', s.visitors, 'submits', s.submits,
      'signups', s.signups, 'revenue_minor', s.revenue_minor) order by s.t), '[]'::jsonb)
      into v_series
    from (
      select date_trunc('hour', e.created_at) as t,
        count(*) as events,
        count(distinct coalesce(e.user_id::text, e.anon_id)) as visitors,
        count(*) filter (where e.event in ('attempt_submit', 'writing_submit', 'speaking_submit')) as submits,
        count(*) filter (where e.event = 'signup_verified') as signups,
        coalesce(sum(case when e.event in ('subscription_activated', 'subscription_payment_succeeded') then
          case when e.props->>'amount_minor' ~ '^[0-9]+$' then (e.props->>'amount_minor')::numeric
               when e.props->>'amount' ~ '^[0-9]+$' then (e.props->>'amount')::numeric end end), 0) as revenue_minor
      from public.activity_events e
      where e.created_at >= p_from and e.created_at < p_to
      group by 1
    ) s;
    v_result := jsonb_set(v_result, '{series}', v_series);
  end if;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: service-role only, matching every other dashboard RPC.
-- ---------------------------------------------------------------------------
revoke all on function public.activity_channel(text) from public, anon, authenticated;
grant execute on function public.activity_channel(text) to service_role;

revoke all on function public.activity_rollup_events(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.activity_rollup_events(timestamptz, timestamptz) to service_role;

revoke all on function public.activity_rollup_visitors(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.activity_rollup_visitors(timestamptz, timestamptz) to service_role;

revoke all on function public.activity_rollup_dims(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.activity_rollup_dims(timestamptz, timestamptz) to service_role;

revoke all on function public.activity_rollup_sessions(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.activity_rollup_sessions(timestamptz, timestamptz) to service_role;

revoke all on function public.activity_rollup_boundary(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.activity_rollup_boundary(timestamptz, timestamptz) to service_role;

revoke all on function public.activity_window_events(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.activity_window_events(timestamptz, timestamptz) to service_role;

revoke all on function public.activity_window_visitors(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.activity_window_visitors(timestamptz, timestamptz) to service_role;

revoke all on function public.activity_window_dims(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.activity_window_dims(timestamptz, timestamptz) to service_role;

revoke all on function public.activity_window_sessions(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.activity_window_sessions(timestamptz, timestamptz) to service_role;

revoke all on function public.refresh_activity_daily(date) from public, anon, authenticated;
grant execute on function public.refresh_activity_daily(date) to service_role;

revoke all on function public.dashboard_overview(timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.dashboard_overview(timestamptz, timestamptz, text) to service_role;

comment on function public.dashboard_overview(timestamptz, timestamptz, text) is
  'v8 (20260901010000): reads activity_daily* rollups for closed days and raw activity_events only for the open tail. JSON shape identical to v7.';
