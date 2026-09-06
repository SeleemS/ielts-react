-- Add exact purchase identity and revocation tombstones. Existing entitlements
-- remain unchanged. Unmapped legacy current purchases require reconciliation.
create table public.billing_current_purchases (
  user_id uuid primary key references public.users(id) on delete cascade,
  purchase_key text not null,
  subscription_id text,
  updated_at timestamptz not null default now()
);
create table public.billing_purchase_revocations (
  purchase_key text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  charge_id text not null,
  reason text not null check(reason in ('refund','dispute')),
  revoked_at timestamptz not null default now()
);
alter table public.billing_current_purchases enable row level security;
alter table public.billing_purchase_revocations enable row level security;
revoke all on public.billing_current_purchases,public.billing_purchase_revocations from public,anon,authenticated;
grant select,insert,update on public.billing_current_purchases to service_role;
grant select,insert on public.billing_purchase_revocations to service_role;
create index billing_purchase_revocations_user_id_idx on public.billing_purchase_revocations(user_id);

-- Retain the already-reviewed atomic implementations behind non-API wrappers.
-- SECURITY INVOKER is preserved, with service-role-only schema/function access.
create schema if not exists billing_private;
revoke all on schema billing_private from public,anon,authenticated;
grant usage on schema billing_private to service_role;
alter function public.fulfill_checkout(text,uuid,timestamptz,jsonb,integer) set schema billing_private;
alter function public.apply_subscription_billing_event(text,uuid,timestamptz,timestamptz,jsonb,boolean,integer,timestamptz) set schema billing_private;

create function public.fulfill_checkout(
  p_session_id text,p_user_id uuid,p_session_created_at timestamptz,p_fields jsonb,p_realtime_quota integer
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_result jsonb;
  v_key text;
  v_sub text:=p_fields->>'stripe_subscription_id';
begin
  if current_user not in ('service_role','postgres','supabase_admin') then
    raise exception 'service role required' using errcode='42501';
  end if;
  perform 1 from public.users where id=p_user_id for update;
  v_key:=case when p_fields->>'plan_sku'='exam_pass' then 'checkout:'||p_session_id
    when nullif(p_fields->>'_invoice_id','') is not null then 'invoice:'||(p_fields->>'_invoice_id')
    else null end;
  if exists(select 1 from public.billing_purchase_revocations
    where purchase_key=v_key and user_id=p_user_id) then
    return jsonb_build_object('status','revoked');
  end if;
  v_result:=billing_private.fulfill_checkout(p_session_id,p_user_id,p_session_created_at,p_fields,p_realtime_quota);
  if v_result->>'status'='applied' then
    -- Old application instances omit invoice identity during rollout. A null
    -- key removes any prior purchase pointer; it does not guess a paid invoice.
    if v_key is null then
      delete from public.billing_current_purchases where user_id=p_user_id;
    else
      insert into public.billing_current_purchases(user_id,purchase_key,subscription_id)
      values(p_user_id,v_key,v_sub) on conflict(user_id) do update
        set purchase_key=excluded.purchase_key,subscription_id=excluded.subscription_id,updated_at=now();
    end if;
  end if;
  return v_result;
end;
$$;

create function public.apply_subscription_billing_event(
  p_event_key text,p_user_id uuid,p_subscription_created_at timestamptz,p_event_created_at timestamptz,
  p_fields jsonb,p_allow_replace boolean,p_realtime_quota integer,p_invoice_created_at timestamptz
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_result jsonb;
  v_pointer public.billing_current_purchases%rowtype;
  v_sub text:=p_fields->>'stripe_subscription_id';
  v_invoice_key text:=case when nullif(p_fields->>'_invoice_id','') is not null
    then 'invoice:'||(p_fields->>'_invoice_id') else null end;
  v_current_sub text;
begin
  if current_user not in ('service_role','postgres','supabase_admin') then
    raise exception 'service role required' using errcode='42501';
  end if;
  select stripe_subscription_id into v_current_sub from public.users where id=p_user_id for update;
  select * into v_pointer from public.billing_current_purchases where user_id=p_user_id;
  if p_fields->>'plan'='premium' and (
    exists(select 1 from public.billing_purchase_revocations where purchase_key=v_invoice_key and user_id=p_user_id)
    or (v_pointer.subscription_id=v_sub
      and exists(select 1 from public.billing_purchase_revocations where purchase_key=v_pointer.purchase_key and user_id=p_user_id)
      and (p_event_key is distinct from v_invoice_key or not coalesce((p_fields->>'_paid_purchase')::boolean,false)))
  ) then
    return jsonb_build_object('status','revoked','plan_applied',false,'quota_applied',false);
  end if;
  v_result:=billing_private.apply_subscription_billing_event(p_event_key,p_user_id,p_subscription_created_at,
    p_event_created_at,p_fields,p_allow_replace,p_realtime_quota,p_invoice_created_at);
  if v_result->>'status'='applied' then
    if p_event_key=v_invoice_key and p_fields->>'plan'='premium'
      and coalesce((p_fields->>'_paid_purchase')::boolean,false)
      and (coalesce((v_result->>'quota_applied')::boolean,false)
        or (not coalesce((p_fields->>'_purchase_requires_refill')::boolean,false)
          and coalesce((v_result->>'plan_applied')::boolean,false))) then
      -- Only a verified paid invoice may replace a refunded purchase pointer.
      insert into public.billing_current_purchases(user_id,purchase_key,subscription_id)
      values(p_user_id,v_invoice_key,v_sub) on conflict(user_id) do update
        set purchase_key=excluded.purchase_key,subscription_id=excluded.subscription_id,updated_at=now();
    elsif coalesce((v_result->>'plan_applied')::boolean,false) and v_current_sub is distinct from v_sub then
      delete from public.billing_current_purchases where user_id=p_user_id;
    end if;
  end if;
  return v_result;
end;
$$;

create function public.revoke_billing_purchase(
  p_user_id uuid,p_purchase_key text,p_subscription_id text,p_charge_id text,p_reason text,
  p_provider_current_key text default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_user public.users%rowtype;
  v_pointer public.billing_current_purchases%rowtype;
  v_owner uuid;
begin
  if current_user not in ('service_role','postgres','supabase_admin') then
    raise exception 'service role required' using errcode='42501';
  end if;
  if p_purchase_key is null or p_purchase_key !~ '^(checkout:cs_|invoice:in_)[A-Za-z0-9_]+$'
    or p_charge_id is null or p_reason not in ('refund','dispute') then
    raise exception 'invalid purchase revocation';
  end if;
  select * into strict v_user from public.users where id=p_user_id for update;
  select user_id into v_owner from public.billing_purchase_revocations where purchase_key=p_purchase_key;
  if found and v_owner<>p_user_id then raise exception 'purchase owner mismatch' using errcode='42501'; end if;
  insert into public.billing_purchase_revocations(purchase_key,user_id,charge_id,reason)
    values(p_purchase_key,p_user_id,p_charge_id,p_reason) on conflict(purchase_key) do nothing;
  if p_subscription_id is not null and p_provider_current_key is not null
    and p_provider_current_key is distinct from p_purchase_key then
    return jsonb_build_object('status','not_current');
  end if;
  select * into v_pointer from public.billing_current_purchases where user_id=p_user_id;
  if found then
    if v_pointer.purchase_key<>p_purchase_key
      or v_pointer.subscription_id is distinct from p_subscription_id
      or v_user.stripe_subscription_id is distinct from p_subscription_id then
      return jsonb_build_object('status','not_current');
    end if;
    update public.users set plan='free',plan_status='refunded',plan_expires_at=null,billing_pause_until=null
      where id=p_user_id;
    update public.user_quotas set realtime_seconds_quota=0,realtime_seconds_remaining=0 where user_id=p_user_id;
    return jsonb_build_object('status','revoked');
  end if;
  -- No pointer: safely identify an unrelated old subscription, or a purchase
  -- that had not granted any current paid access. Never guess legacy ownership.
  if v_user.stripe_subscription_id is distinct from p_subscription_id
    or v_user.plan not in ('premium','pro','paid') then
    return jsonb_build_object('status','recorded');
  end if;
  return jsonb_build_object('status','needs_reconciliation');
end;
$$;

grant delete on public.billing_current_purchases to service_role;
revoke all on function public.fulfill_checkout(text,uuid,timestamptz,jsonb,integer) from public,anon,authenticated;
revoke all on function public.apply_subscription_billing_event(text,uuid,timestamptz,timestamptz,jsonb,boolean,integer,timestamptz) from public,anon,authenticated;
revoke all on function public.revoke_billing_purchase(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.fulfill_checkout(text,uuid,timestamptz,jsonb,integer) to service_role;
grant execute on function public.apply_subscription_billing_event(text,uuid,timestamptz,timestamptz,jsonb,boolean,integer,timestamptz) to service_role;
grant execute on function public.revoke_billing_purchase(uuid,text,text,text,text,text) to service_role;
