-- 20260802220000_referral_program.sql
-- Give-get referral program (2026-08-02 audit P5): "give a friend a free AI
-- score, get one yourself." AI scores are the scarce free-tier resource, so
-- the incentive is real but marginal-cost-cheap.
--
--   * referral_codes: one short shareable code per user (owner-read, created
--     via the get_or_create_referral_code RPC).
--   * referrals: one redemption per referred user, credited to both sides.
--   * user_quotas.referral_bonus_scores: spendable AI-score credits, consumed
--     by consume_ai_score v9 AFTER the lifetime samples, usable on writing or
--     speaking. refund_ai_score v4 can restore them.
--   * redeem_referral RPC (service-role only, called by /api/referral/redeem):
--     atomic validate + insert + credit. Abuse guards: self-referral blocked,
--     one redemption per referred user ever, referred account must be < 7 days
--     old and non-anonymous, referrer capped at 5 credited referrals/month.

alter table public.user_quotas
  add column if not exists referral_bonus_scores int not null default 0;

create table if not exists public.referral_codes (
  user_id uuid primary key references public.users(id) on delete cascade,
  code text not null unique check (code ~ '^[a-z0-9]{8}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references public.users(id) on delete cascade,
  referred_user_id uuid not null unique references public.users(id) on delete cascade,
  code text not null,
  created_at timestamptz not null default now(),
  credited_at timestamptz
);

create index if not exists referrals_referrer_credited_idx
  on public.referrals (referrer_user_id, credited_at desc);

alter table public.referral_codes enable row level security;
alter table public.referrals enable row level security;
revoke all on table public.referral_codes from anon, authenticated;
revoke all on table public.referrals from anon, authenticated;
grant select on table public.referral_codes to authenticated;
grant select on table public.referrals to authenticated;
grant all on table public.referral_codes to service_role;
grant all on table public.referrals to service_role;

drop policy if exists referral_codes_select_own on public.referral_codes;
create policy referral_codes_select_own
  on public.referral_codes for select
  using (auth.uid() = user_id);

drop policy if exists referrals_select_own on public.referrals;
create policy referrals_select_own
  on public.referrals for select
  using (auth.uid() = referrer_user_id or auth.uid() = referred_user_id);

-- Callable by the signed-in user for their own row; idempotent.
create or replace function public.get_or_create_referral_code(p_uid uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if p_uid is null or (
    (select auth.uid()) is distinct from p_uid
    and coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role'
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select code into v_code from public.referral_codes where user_id = p_uid;
  if v_code is not null then return v_code; end if;

  -- 8 lowercase base36 chars from random bytes; retry on the (unlikely)
  -- uniqueness collision.
  for i in 1..5 loop
    v_code := lower(substr(translate(encode(extensions.gen_random_bytes(8), 'base64'), '+/=ABCDEFGHIJKLMNOPQRSTUVWXYZ', ''), 1, 8));
    if length(v_code) < 8 then
      v_code := rpad(v_code, 8, '0');
    end if;
    begin
      insert into public.referral_codes (user_id, code) values (p_uid, v_code);
      return v_code;
    exception when unique_violation then
      -- try again (either another code collided, or a concurrent call already
      -- created this user's code — return that one)
      select code into v_code from public.referral_codes where user_id = p_uid;
      if v_code is not null then return v_code; end if;
    end;
  end loop;
  raise exception 'could not allocate referral code';
end;
$$;

revoke all on function public.get_or_create_referral_code(uuid) from public, anon;
grant execute on function public.get_or_create_referral_code(uuid) to authenticated, service_role;

-- Service-role only: full validation + atomic crediting.
create or replace function public.redeem_referral(p_code text, p_referred uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_referrer uuid;
  v_referred_created timestamptz;
  v_referred_anon boolean;
  v_month_credits int;
begin
  if coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_referred is null or p_code is null or p_code !~ '^[a-z0-9]{8}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_code');
  end if;

  select user_id into v_referrer from public.referral_codes where code = p_code;
  if v_referrer is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_code');
  end if;
  if v_referrer = p_referred then
    return jsonb_build_object('ok', false, 'reason', 'self_referral');
  end if;

  select created_at, coalesce(is_anonymous, false)
  into v_referred_created, v_referred_anon
  from public.users where id = p_referred;
  if v_referred_created is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_user');
  end if;
  if v_referred_anon then
    return jsonb_build_object('ok', false, 'reason', 'account_required');
  end if;
  if v_referred_created < now() - interval '7 days' then
    return jsonb_build_object('ok', false, 'reason', 'account_too_old');
  end if;

  select count(*) into v_month_credits
  from public.referrals
  where referrer_user_id = v_referrer
    and credited_at >= date_trunc('month', now());
  if v_month_credits >= 5 then
    -- Record the referral for attribution but do not credit either side.
    begin
      insert into public.referrals (referrer_user_id, referred_user_id, code)
      values (v_referrer, p_referred, p_code);
    exception when unique_violation then
      return jsonb_build_object('ok', false, 'reason', 'already_redeemed');
    end;
    return jsonb_build_object('ok', true, 'credited', false, 'reason', 'referrer_monthly_cap');
  end if;

  begin
    insert into public.referrals (referrer_user_id, referred_user_id, code, credited_at)
    values (v_referrer, p_referred, p_code, now());
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'already_redeemed');
  end;

  insert into public.user_quotas (user_id, ai_scores_remaining, period_resets_at, referral_bonus_scores)
  values (v_referrer, 0, null, 1)
  on conflict (user_id) do update
    set referral_bonus_scores = public.user_quotas.referral_bonus_scores + 1;
  insert into public.user_quotas (user_id, ai_scores_remaining, period_resets_at, referral_bonus_scores)
  values (p_referred, 0, null, 1)
  on conflict (user_id) do update
    set referral_bonus_scores = public.user_quotas.referral_bonus_scores + 1;

  return jsonb_build_object('ok', true, 'credited', true);
end;
$$;

revoke all on function public.redeem_referral(text, uuid) from public, anon, authenticated;
grant execute on function public.redeem_referral(text, uuid) to service_role;

-- consume_ai_score v9: free tier order becomes lifetime sample (per skill)
-- THEN referral bonus credits (usable on either skill).
create or replace function public.consume_ai_score(p_uid uuid, p_skill text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quota public.user_quotas%rowtype;
  v_plan text;
  v_status text;
  v_renews timestamptz;
  v_expires timestamptz;
  v_pause_until timestamptz;
  v_is_anonymous boolean := false;
  v_premium boolean := false;
  v_daily_cap int;
  v_weekly_cap int;
  v_monthly_cap int;
  v_daily_used int;
  v_weekly_used int;
  v_monthly_used int;
  v_today date := (now() at time zone 'utc')::date;
  v_week_start date := date_trunc('week', now() at time zone 'utc')::date;
  v_month_start date := date_trunc('month', now() at time zone 'utc')::date;
  v_tomorrow timestamptz := date_trunc('day', now() at time zone 'utc') + interval '1 day';
  v_next_week timestamptz := date_trunc('week', now() at time zone 'utc') + interval '1 week';
  v_next_month timestamptz := date_trunc('month', now() at time zone 'utc') + interval '1 month';
  v_now timestamptz := now();
begin
  if p_uid is null or (
    (select auth.uid()) is distinct from p_uid
    and coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role'
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_skill not in ('writing', 'speaking') then
    raise exception 'unknown skill %', p_skill;
  end if;

  insert into public.users (id, email, is_anonymous)
  select
    u.id,
    u.email,
    coalesce((u.raw_user_meta_data ->> 'is_anonymous')::boolean, u.email is null)
  from auth.users u
  where u.id = p_uid
  on conflict (id) do nothing;

  select
    coalesce(to_jsonb(u)->>'plan', 'free'),
    coalesce(to_jsonb(u)->>'plan_status', 'inactive'),
    (to_jsonb(u)->>'plan_renews_at')::timestamptz,
    (to_jsonb(u)->>'plan_expires_at')::timestamptz,
    (to_jsonb(u)->>'billing_pause_until')::timestamptz,
    u.is_anonymous
  into v_plan, v_status, v_renews, v_expires, v_pause_until, v_is_anonymous
  from public.users u
  where u.id = p_uid;

  if v_is_anonymous then
    return jsonb_build_object(
      'allowed', false, 'remaining', 0, 'resetsAt', null,
      'plan', 'free', 'free', false, 'reason', 'account_required'
    );
  end if;

  v_premium := (
    case
      when v_expires is not null then v_expires > v_now
      else v_plan in ('premium', 'pro', 'paid') and (
        v_status in ('active', 'trialing', 'past_due')
        or (v_status = 'canceled' and coalesce(v_renews, v_now) > v_now)
      )
    end
  ) and coalesce(v_pause_until, '-infinity'::timestamptz) <= v_now;

  insert into public.user_quotas (user_id, ai_scores_remaining, period_resets_at)
  values (p_uid, 0, null)
  on conflict (user_id) do nothing;

  select * into v_quota
  from public.user_quotas
  where user_id = p_uid
  for update;

  if not v_premium then
    if p_skill = 'writing' and v_quota.free_writing_score_used_at is null then
      update public.user_quotas
      set free_writing_score_used_at = v_now
      where user_id = p_uid;
      return jsonb_build_object(
        'allowed', true, 'remaining', 0, 'resetsAt', null,
        'plan', 'free', 'free', true, 'consumedAt', v_now
      );
    end if;
    if p_skill = 'speaking' and v_quota.free_speaking_score_used_at is null then
      update public.user_quotas
      set free_speaking_score_used_at = v_now
      where user_id = p_uid;
      return jsonb_build_object(
        'allowed', true, 'remaining', 0, 'resetsAt', null,
        'plan', 'free', 'free', true, 'consumedAt', v_now
      );
    end if;
    if coalesce(v_quota.referral_bonus_scores, 0) > 0 then
      update public.user_quotas
      set referral_bonus_scores = referral_bonus_scores - 1
      where user_id = p_uid;
      return jsonb_build_object(
        'allowed', true, 'remaining', v_quota.referral_bonus_scores - 1,
        'resetsAt', null, 'plan', 'free', 'free', false,
        'referral', true, 'consumedAt', v_now
      );
    end if;
    return jsonb_build_object(
      'allowed', false, 'remaining', 0, 'resetsAt', null,
      'plan', 'free', 'free', false, 'reason', 'premium_required'
    );
  end if;

  if v_quota.daily_counters_date is distinct from v_today then
    update public.user_quotas
    set writing_scores_today = 0,
        speaking_scores_today = 0,
        daily_counters_date = v_today
    where user_id = p_uid
    returning * into v_quota;
  end if;
  if v_quota.weekly_counters_start is distinct from v_week_start then
    update public.user_quotas
    set writing_scores_week = 0,
        speaking_scores_week = 0,
        weekly_counters_start = v_week_start
    where user_id = p_uid
    returning * into v_quota;
  end if;
  if v_quota.monthly_counters_start is distinct from v_month_start then
    update public.user_quotas
    set writing_scores_month = 0,
        speaking_scores_month = 0,
        monthly_counters_start = v_month_start
    where user_id = p_uid
    returning * into v_quota;
  end if;

  v_daily_cap := case p_skill when 'speaking' then 1 else 2 end;
  v_weekly_cap := case p_skill when 'speaking' then 5 else 10 end;
  v_monthly_cap := case p_skill when 'speaking' then 15 else 30 end;
  v_daily_used := case p_skill
    when 'speaking' then v_quota.speaking_scores_today
    else v_quota.writing_scores_today end;
  v_weekly_used := case p_skill
    when 'speaking' then v_quota.speaking_scores_week
    else v_quota.writing_scores_week end;
  v_monthly_used := case p_skill
    when 'speaking' then v_quota.speaking_scores_month
    else v_quota.writing_scores_month end;

  if v_daily_used >= v_daily_cap then
    return jsonb_build_object(
      'allowed', false, 'remaining', 0, 'resetsAt', v_tomorrow,
      'plan', 'premium', 'free', false, 'reason', 'daily_cap',
      'limitPeriod', 'day', 'limit', v_daily_cap
    );
  end if;
  if v_weekly_used >= v_weekly_cap then
    return jsonb_build_object(
      'allowed', false, 'remaining', 0, 'resetsAt', v_next_week,
      'plan', 'premium', 'free', false, 'reason', 'weekly_cap',
      'limitPeriod', 'week', 'limit', v_weekly_cap
    );
  end if;
  if v_monthly_used >= v_monthly_cap then
    return jsonb_build_object(
      'allowed', false, 'remaining', 0, 'resetsAt', v_next_month,
      'plan', 'premium', 'free', false, 'reason', 'monthly_cap',
      'limitPeriod', 'month', 'limit', v_monthly_cap
    );
  end if;

  if p_skill = 'speaking' then
    update public.user_quotas
    set speaking_scores_today = speaking_scores_today + 1,
        speaking_scores_week = speaking_scores_week + 1,
        speaking_scores_month = speaking_scores_month + 1
    where user_id = p_uid;
  else
    update public.user_quotas
    set writing_scores_today = writing_scores_today + 1,
        writing_scores_week = writing_scores_week + 1,
        writing_scores_month = writing_scores_month + 1
    where user_id = p_uid;
  end if;

  return jsonb_build_object(
    'allowed', true,
    'remaining', least(
      v_daily_cap - v_daily_used - 1,
      v_weekly_cap - v_weekly_used - 1,
      v_monthly_cap - v_monthly_used - 1
    ),
    'dailyRemaining', v_daily_cap - v_daily_used - 1,
    'weeklyRemaining', v_weekly_cap - v_weekly_used - 1,
    'monthlyRemaining', v_monthly_cap - v_monthly_used - 1,
    'resetsAt', v_tomorrow,
    'plan', 'premium', 'free', false, 'consumedAt', v_now
  );
end;
$$;

revoke all on function public.consume_ai_score(uuid, text)
  from public, anon, authenticated;
grant execute on function public.consume_ai_score(uuid, text) to service_role;
comment on function public.consume_ai_score(uuid, text) is
  'consume_ai_score v9: lifetime free samples, then referral bonus credits, then Premium UTC caps.';

-- refund_ai_score v4: p_referral restores a spent referral credit.
create or replace function public.refund_ai_score(
  p_uid uuid,
  p_skill text,
  p_free boolean,
  p_consumed_at timestamptz,
  p_referral boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_affected int := 0;
  v_consumed_day date := (p_consumed_at at time zone 'utc')::date;
  v_consumed_week date := date_trunc('week', p_consumed_at at time zone 'utc')::date;
  v_consumed_month date := date_trunc('month', p_consumed_at at time zone 'utc')::date;
begin
  if coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_uid is null
    or p_consumed_at is null
    or p_free is null
    or p_skill not in ('writing', 'speaking')
  then
    return false;
  end if;

  insert into public.ai_score_refunds (user_id, skill, consumed_at, free)
  values (p_uid, p_skill, p_consumed_at, p_free)
  on conflict (user_id, skill, consumed_at) do nothing;
  get diagnostics v_affected = row_count;
  if v_affected = 0 then return false; end if;

  if coalesce(p_referral, false) then
    update public.user_quotas
    set referral_bonus_scores = referral_bonus_scores + 1
    where user_id = p_uid;
  elsif p_free and p_skill = 'writing' then
    update public.user_quotas
    set free_writing_score_used_at = null
    where user_id = p_uid
      and free_writing_score_used_at = p_consumed_at;
  elsif p_free then
    update public.user_quotas
    set free_speaking_score_used_at = null
    where user_id = p_uid
      and free_speaking_score_used_at = p_consumed_at;
  elsif p_skill = 'writing' then
    update public.user_quotas
    set writing_scores_today = case
          when daily_counters_date = v_consumed_day
          then greatest(writing_scores_today - 1, 0) else writing_scores_today end,
        writing_scores_week = case
          when weekly_counters_start = v_consumed_week
          then greatest(writing_scores_week - 1, 0) else writing_scores_week end,
        writing_scores_month = case
          when monthly_counters_start = v_consumed_month
          then greatest(writing_scores_month - 1, 0) else writing_scores_month end
    where user_id = p_uid;
  else
    update public.user_quotas
    set speaking_scores_today = case
          when daily_counters_date = v_consumed_day
          then greatest(speaking_scores_today - 1, 0) else speaking_scores_today end,
        speaking_scores_week = case
          when weekly_counters_start = v_consumed_week
          then greatest(speaking_scores_week - 1, 0) else speaking_scores_week end,
        speaking_scores_month = case
          when monthly_counters_start = v_consumed_month
          then greatest(speaking_scores_month - 1, 0) else speaking_scores_month end
    where user_id = p_uid;
  end if;

  get diagnostics v_affected = row_count;
  if v_affected <> 1 then
    raise exception 'consumed score not found for refund' using errcode = 'P0002';
  end if;
  return true;
end;
$$;

revoke all on function public.refund_ai_score(uuid, text, boolean, timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.refund_ai_score(uuid, text, boolean, timestamptz, boolean) to service_role;
comment on function public.refund_ai_score(uuid, text, boolean, timestamptz, boolean) is
  'refund_ai_score v4: restores lifetime samples, referral credits, or premium counters.';

-- The 4-arg signature is superseded; drop it so PostgREST rpc name resolution
-- stays unambiguous.
drop function if exists public.refund_ai_score(uuid, text, boolean, timestamptz);
