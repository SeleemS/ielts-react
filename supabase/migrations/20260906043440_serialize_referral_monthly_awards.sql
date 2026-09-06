-- Prevent concurrent distinct referrals from exceeding the five-award monthly cap.
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

  -- One code per referrer (user_id primary key). Serialize the monthly
  -- count and both awards before another redemption can observe that count.
  select user_id into v_referrer from public.referral_codes where code = p_code for update;
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

