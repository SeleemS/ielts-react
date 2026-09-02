-- 20260902010000_rollup_boundary_pre_epoch.sql
-- activity_rollup_boundary: treat days before the rollup epoch as covered.
--
-- WHY: the boundary only trusts a CONTIGUOUS run of watermarked days starting
-- at the range's own first closed day. refresh_activity_daily() clamps its
-- start to 2026-07-01 (activity_events begins 2026-07-17), so any range that
-- starts earlier — the /data 90-day preset today, and every prior-period
-- comparison window for it — found no prefix at all and fell back to raw rows
-- for the WHOLE range: 3.1s on 2026-09-02 while 7/28/all took under 350ms.
--
-- FIX: when there are no events before the epoch (checked, not assumed), the
-- pre-epoch part of a range can never contribute rows, so the contiguous check
-- may start at the epoch instead. The raw head read for [p_from, epoch) stays
-- in place and returns nothing via the created_at index. Safe to re-run.

create or replace function public.activity_rollup_boundary(p_from timestamptz, p_to timestamptz)
returns table (closed_from date, roll_to date)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_epoch date := date '2026-07-01';
  v_from timestamp := p_from at time zone 'utc';
  v_to   timestamp := p_to   at time zone 'utc';
  v_closed_from date;
  v_closed_to   date;
  v_roll_to     date;
begin
  -- A partial first day can never be read from a whole-day rollup.
  v_closed_from := case when v_from = date_trunc('day', v_from)
                        then v_from::date else v_from::date + 1 end;

  -- Days before the epoch hold no events (verified here, so a future import of
  -- older data automatically disables the shortcut), and the refresh never
  -- watermarks them. Start the contiguous check at the epoch instead.
  if v_closed_from < v_epoch and not exists (
    select 1 from public.activity_events e
     where e.created_at < (v_epoch::timestamp at time zone 'utc')
     limit 1
  ) then
    v_closed_from := v_epoch;
  end if;

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
revoke all on function public.activity_rollup_boundary(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.activity_rollup_boundary(timestamptz, timestamptz) to service_role;
