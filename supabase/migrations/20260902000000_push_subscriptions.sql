-- 20260902000000_push_subscriptions.sql
-- Web push daily practice reminders (2026-08-02 audit item 32).
--
-- One row per browser/device subscription. Created ONLY after an explicit
-- in-app "Enable daily reminder" click (never an on-load permission prompt),
-- written by /api/push/subscribe with the service role after verifying the
-- caller's Supabase access token.
--
--   endpoint             the push service URL — the natural unique key.
--   keys                 { p256dh, auth } from PushSubscription.toJSON().
--   time_zone            IANA zone (e.g. 'Asia/Karachi'). DST-correct, and the
--                        value the hourly cron matches on.
--   tz_offset_minutes    minutes EAST of UTC at subscribe time; only a
--                        fallback for browsers with no resolved zone, and it
--                        is stale across a DST change by definition.
--   reminder_hour_local  0-23, default 19 (7pm local).
--   enabled              turned off by the user, or automatically when the
--                        push service answers 404/410 (subscription gone).
--   failures             consecutive non-fatal send failures; the cron stops
--                        retrying a subscription after 5.
--
-- Readable by its owner (the dashboard card renders current state); all writes
-- go through the service role.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  ua text,
  time_zone text,
  tz_offset_minutes int,
  reminder_hour_local int not null default 19
    check (reminder_hour_local between 0 and 23),
  enabled boolean not null default true,
  failures int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_sent_at timestamptz,
  disabled_reason text
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

-- The hourly cron scans enabled rows only.
create index if not exists push_subscriptions_enabled_hour_idx
  on public.push_subscriptions (reminder_hour_local)
  where enabled;

alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from anon, authenticated;
grant select on table public.push_subscriptions to authenticated;
grant all on table public.push_subscriptions to service_role;

drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

comment on table public.push_subscriptions is
  'Web push endpoints for the daily practice reminder. Created only after an explicit in-app enable; writes are service-role only.';
