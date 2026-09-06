-- Service-only subscription event receipt and ordering ledger. No historical
-- entitlements are rewritten. Apply before deploying the corresponding caller.
create table public.billing_subscription_events (
  event_key text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  subscription_id text not null,
  event_created_at timestamptz not null,
  invoice_created_at timestamptz,
  plan_applied boolean not null,
  quota_applied boolean not null,
  applied_at timestamptz not null default now()
);
alter table public.billing_subscription_events enable row level security;
revoke all on public.billing_subscription_events from public, anon, authenticated;
grant select, insert on public.billing_subscription_events to service_role;
create index billing_subscription_events_user_subscription_idx
  on public.billing_subscription_events (user_id, subscription_id);

create function public.apply_subscription_billing_event(
  p_event_key text, p_user_id uuid, p_subscription_created_at timestamptz,
  p_event_created_at timestamptz, p_fields jsonb, p_allow_replace boolean,
  p_realtime_quota integer, p_invoice_created_at timestamptz
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_user public.users%rowtype;
  v_fields public.users%rowtype;
  v_previous public.billing_subscription_events%rowtype;
  v_plan_applied boolean := false;
  v_quota_applied boolean := false;
  v_related boolean;
  v_latest_event timestamptz;
  v_latest_invoice timestamptz;
  v_cutover timestamptz;
begin
  if current_user not in ('service_role','postgres','supabase_admin') then
    raise exception 'service role required' using errcode='42501';
  end if;
  if p_event_key is null or p_event_key = '' or p_user_id is null
    or p_subscription_created_at is null or p_event_created_at is null
    or p_fields is null or jsonb_typeof(p_fields) <> 'object'
    or (p_realtime_quota is not null and p_realtime_quota not in (0,1800,3600)) then
    raise exception 'invalid subscription event';
  end if;
  select * into v_fields from jsonb_populate_record(null::public.users,p_fields);
  if v_fields.stripe_subscription_id is null or v_fields.plan not in ('free','premium')
    or v_fields.plan is null or v_fields.plan_status is null then
    raise exception 'invalid subscription fields';
  end if;
  select * into strict v_user from public.users where id=p_user_id for update;
  select * into v_previous from public.billing_subscription_events where event_key=p_event_key;
  if found then
    if v_previous.user_id <> p_user_id or v_previous.subscription_id <> v_fields.stripe_subscription_id then
      raise exception 'event owner mismatch' using errcode='42501';
    end if;
    return jsonb_build_object('status','already_applied',
      'plan_applied',v_previous.plan_applied,'quota_applied',v_previous.quota_applied);
  end if;

  -- Only created/updated may adopt a genuinely newer paid subscription.
  -- Invoice/deletion events must match the exact currently bound subscription.
  v_related := v_user.stripe_subscription_id = v_fields.stripe_subscription_id;
  if not coalesce(v_related,false) and p_allow_replace and v_fields.plan='premium'
    and p_subscription_created_at > coalesce(
      greatest(v_user.plan_started_at,v_user.premium_since),'-infinity'::timestamptz)
  then
    v_related := true;
  end if;
  select max(event_created_at) into v_latest_event from public.billing_subscription_events
    where user_id=p_user_id and subscription_id=v_fields.stripe_subscription_id and plan_applied;
  if coalesce(v_related,false) and (v_latest_event is null or p_event_created_at >= v_latest_event) then
    update public.users set
      plan=v_fields.plan, plan_status=v_fields.plan_status,
      stripe_customer_id=v_fields.stripe_customer_id,
      stripe_subscription_id=v_fields.stripe_subscription_id,
      plan_renews_at=v_fields.plan_renews_at, plan_expires_at=v_fields.plan_expires_at,
      plan_sku=v_fields.plan_sku, premium_since=v_fields.premium_since,
      plan_started_at=case when v_user.stripe_subscription_id is distinct from v_fields.stripe_subscription_id
        then p_subscription_created_at else v_user.plan_started_at end,
      billing_pause_until=v_fields.billing_pause_until,
      canceled_at=case when v_fields.plan='free' then coalesce(v_fields.canceled_at,now())
        else null end
    where id=p_user_id;
    v_plan_applied := true;
  end if;

  if coalesce(v_related,false) then
    select cutover_at into strict v_cutover from public.billing_checkout_policy where singleton;
    select max(invoice_created_at) into v_latest_invoice from public.billing_subscription_events
      where user_id=p_user_id and subscription_id=v_fields.stripe_subscription_id and quota_applied;
    -- Cancellation revocation follows plan ordering. Renewal grant ordering is
    -- independent: subscription.updated can precede its invoice without losing
    -- that invoice's refill. Proration invoices pass NULL and never refill.
    if (p_realtime_quota=0 and v_plan_applied) or (
      p_realtime_quota > 0 and v_fields.plan='premium'
      and (v_plan_applied or (v_user.plan='premium'
        and (v_user.plan_status in ('active','trialing','past_due','paused')
          or (v_user.plan_status='canceled' and v_user.plan_renews_at>now()))))
      and p_invoice_created_at >= v_cutover
      and p_invoice_created_at >= coalesce(greatest(v_user.plan_started_at,v_user.premium_since),'-infinity'::timestamptz)
      and (v_latest_invoice is null or p_invoice_created_at > v_latest_invoice)
      and not exists(select 1 from public.activity_events where billing_event_id=p_event_key)
    ) then
      insert into public.user_quotas(user_id,realtime_seconds_quota,realtime_seconds_remaining,realtime_period_resets_at)
      values(p_user_id,p_realtime_quota,p_realtime_quota,now()+interval '30 days')
      on conflict(user_id) do update set realtime_seconds_quota=excluded.realtime_seconds_quota,
        realtime_seconds_remaining=excluded.realtime_seconds_remaining,
        realtime_period_resets_at=excluded.realtime_period_resets_at;
      v_quota_applied := true;
    end if;
  end if;
  insert into public.billing_subscription_events(event_key,user_id,subscription_id,event_created_at,
    invoice_created_at,plan_applied,quota_applied)
  values(p_event_key,p_user_id,v_fields.stripe_subscription_id,p_event_created_at,
    p_invoice_created_at,v_plan_applied,v_quota_applied);
  return jsonb_build_object('status',case when v_plan_applied or v_quota_applied then 'applied' else 'stale' end,
    'plan_applied',v_plan_applied,'quota_applied',v_quota_applied);
end;
$$;
revoke all on function public.apply_subscription_billing_event(text,uuid,timestamptz,timestamptz,jsonb,boolean,integer,timestamptz)
  from public,anon,authenticated;
grant execute on function public.apply_subscription_billing_event(text,uuid,timestamptz,timestamptz,jsonb,boolean,integer,timestamptz)
  to service_role;
