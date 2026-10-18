-- Server-side free Reading & Listening allowance (backstop for the Oct 11 wall).
--
-- The client (src/lib/usePracticeAllowance.js) counts the learner's own
-- attempts and fails OPEN on any lookup problem, and attempts are inserted
-- straight from the browser — so the 3-test cap was advisory. Oct 12-16, seven
-- free accounts saved 17 passages past it. This trigger makes the database the
-- authority, using exactly the client's rule:
--
--   * only browser inserts are checked (auth.uid() = new.user_id); service-role
--     and postgres writes pass through untouched;
--   * only non-mock Reading/Listening rows with a passage_id count;
--   * re-submitting a passage already used stays free (retries, review mode);
--   * Premium/pass holders are exempt (same rule as consume_ai_score v10);
--   * otherwise, once the account holds public.free_practice_limit() distinct
--     passages, a NEW passage is rejected with SQLSTATE PT402, which PostgREST
--     returns as HTTP 402. The client shows PracticeLimitDialog on that code.
--
-- Rollback lever (no code deploy needed):
--   drop trigger if exists attempts_free_practice_cap on public.attempts;
-- Keep public.free_practice_limit() in step with NEXT_PUBLIC_FREE_PRACTICE_TESTS
-- (default 3). If the env flag is set to "unlimited", drop the trigger too.

create or replace function public.free_practice_limit()
returns integer
language sql
immutable
as $$ select 3 $$;

comment on function public.free_practice_limit() is
  'Free-account lifetime cap on distinct marked Reading/Listening passages. Mirror of NEXT_PUBLIC_FREE_PRACTICE_TESTS.';

create or replace function public.enforce_free_practice_cap()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_plan text;
  v_status text;
  v_renews timestamptz;
  v_expires timestamptz;
  v_pause_until timestamptz;
  v_premium boolean := false;
  v_used integer;
begin
  if new.skill not in ('reading', 'listening')
     or new.mock_test_id is not null
     or new.passage_id is null
     or auth.uid() is null
     or auth.uid() <> new.user_id then
    return new;
  end if;

  -- Serialise this learner's inserts so two tabs can't both take the last slot.
  perform pg_advisory_xact_lock(hashtextextended('free_practice_cap:' || new.user_id::text, 0));

  if exists (
    select 1 from public.attempts a
    where a.user_id = new.user_id
      and a.passage_id = new.passage_id
      and a.mock_test_id is null
  ) then
    return new;
  end if;

  select
    coalesce(to_jsonb(u)->>'plan', 'free'),
    coalesce(to_jsonb(u)->>'plan_status', 'inactive'),
    (to_jsonb(u)->>'plan_renews_at')::timestamptz,
    (to_jsonb(u)->>'plan_expires_at')::timestamptz,
    (to_jsonb(u)->>'billing_pause_until')::timestamptz
  into v_plan, v_status, v_renews, v_expires, v_pause_until
  from public.users u
  where u.id = new.user_id;

  v_premium := coalesce((
    case
      when v_expires is not null then v_expires > v_now
      else v_plan in ('premium', 'pro', 'paid') and (
        v_status in ('active', 'trialing', 'past_due')
        or (v_status = 'canceled' and coalesce(v_renews, v_now) > v_now)
      )
    end
  ) and coalesce(v_pause_until, '-infinity'::timestamptz) <= v_now, false);

  if v_premium then
    return new;
  end if;

  select count(distinct a.passage_id) into v_used
  from public.attempts a
  where a.user_id = new.user_id
    and a.skill in ('reading', 'listening')
    and a.mock_test_id is null
    and a.passage_id is not null;

  if v_used >= public.free_practice_limit() then
    raise exception 'free_practice_limit'
      using errcode = 'PT402',
            detail = format('used=%s limit=%s', v_used, public.free_practice_limit()),
            hint = 'Upgrade to Pro for unlimited marked practice.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_free_practice_cap() from public, anon, authenticated;

drop trigger if exists attempts_free_practice_cap on public.attempts;
create trigger attempts_free_practice_cap
  before insert on public.attempts
  for each row execute function public.enforce_free_practice_cap();

-- ---------------------------------------------------------------------------
-- Sign-up alias check: one account per real inbox.
-- Gmail ignores dots and "+tags"; the other big providers ignore "+tags". The
-- /api/auth/signup-check route (service role only) calls find_email_alias()
-- before sign-up and sends a look-alike address to sign in instead.
-- Keep email_alias_key() in step with emailAliasKey() in lib/emailCheck.js.
-- ---------------------------------------------------------------------------
create or replace function public.email_alias_key(p_email text)
returns text
language sql
immutable
as $$
  with parts as (
    select
      split_part(lower(btrim(p_email)), '@', 1) as local_part,
      split_part(lower(btrim(p_email)), '@', 2) as domain
  ),
  tagged as (
    select
      case when domain in ('gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com',
                           'icloud.com', 'me.com', 'proton.me', 'protonmail.com', 'fastmail.com')
           then split_part(local_part, '+', 1) else local_part end as local_part,
      domain
    from parts
  )
  select case when domain in ('gmail.com', 'googlemail.com')
              then replace(local_part, '.', '') || '@gmail.com'
              else local_part || '@' || domain end
  from tagged
$$;

-- Returns the confirmed account address that shares p_email's inbox but is
-- spelled differently, or null. Exact matches are left to Supabase Auth.
create or replace function public.find_email_alias(p_email text)
returns text
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select u.email::text
  from auth.users u
  where u.email is not null
    and u.email_confirmed_at is not null
    and lower(u.email) <> lower(btrim(p_email))
    and public.email_alias_key(u.email) = public.email_alias_key(p_email)
  order by u.created_at
  limit 1
$$;

revoke all on function public.find_email_alias(text) from public, anon, authenticated;
grant execute on function public.find_email_alias(text) to service_role;
