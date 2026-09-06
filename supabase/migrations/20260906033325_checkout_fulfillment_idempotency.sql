-- Deploy before the application uses fulfill_checkout. No existing entitlements
-- are changed. Pre-cutover sessions need manual reconciliation if never applied:
-- historical activity rows do not consistently identify their Checkout Session.
create table public.billing_checkout_policy (
  singleton boolean primary key default true check (singleton),
  cutover_at timestamptz not null
);
-- Fixed investigation cutoff avoids stranding checkouts opened while rolling
-- out this migration. Release gate: verify no unfulfilled open sessions before
-- this timestamp (historical live sessions were last seen in July).
insert into public.billing_checkout_policy (singleton, cutover_at)
  values (true, '2026-09-06T03:00:00Z');
alter table public.billing_checkout_policy enable row level security;
revoke all on public.billing_checkout_policy from public, anon, authenticated;
grant select on public.billing_checkout_policy to service_role;

create table public.billing_checkout_fulfillments (
  session_id text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  session_created_at timestamptz not null,
  fulfilled_at timestamptz not null default now(),
  access_expires_at timestamptz,
  outcome text not null check (outcome in ('applied', 'legacy', 'stale'))
);
alter table public.billing_checkout_fulfillments enable row level security;
revoke all on public.billing_checkout_fulfillments from public, anon, authenticated;
grant select, insert on public.billing_checkout_fulfillments to service_role;
create index billing_checkout_fulfillments_user_id_idx
  on public.billing_checkout_fulfillments (user_id);

create function public.fulfill_checkout(
  p_session_id text,
  p_user_id uuid,
  p_session_created_at timestamptz,
  p_fields jsonb,
  p_realtime_quota integer
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user public.users%rowtype;
  v_previous public.billing_checkout_fulfillments%rowtype;
  v_fields public.users%rowtype;
  v_cutover timestamptz;
  v_outcome text := 'applied';
  v_expires_at timestamptz;
begin
  if current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_session_id is null or p_session_id !~ '^cs_[A-Za-z0-9_]+$'
     or p_user_id is null or p_session_created_at is null
     or p_session_created_at > now() + interval '5 minutes'
     or p_fields is null or jsonb_typeof(p_fields) <> 'object'
     or p_realtime_quota is null or p_realtime_quota not in (0, 1800, 3600) then
    raise exception 'invalid checkout fulfillment';
  end if;

  -- All checkouts for a user serialize; duplicate session races cannot refill
  -- quota after either request commits. Any subsequent statement failure rolls
  -- back the user, quota and receipt together, leaving the session retryable.
  select * into strict v_user from public.users where id = p_user_id for update;
  select * into v_previous from public.billing_checkout_fulfillments
    where session_id = p_session_id;
  if found then
    if v_previous.user_id <> p_user_id then
      raise exception 'checkout owner mismatch' using errcode = '42501';
    end if;
    return jsonb_build_object(
      'status', case when v_previous.outcome = 'applied' then 'already_applied' else v_previous.outcome end,
      'access_expires_at', v_previous.access_expires_at);
  end if;

  select cutover_at into strict v_cutover from public.billing_checkout_policy where singleton;
  select * into v_fields from jsonb_populate_record(null::public.users, p_fields);
  v_expires_at := v_fields.plan_expires_at;

  if p_session_created_at < v_cutover or exists (
    select 1 from public.activity_events
    where billing_event_id in ('checkout:' || p_session_id, 'purchase:' || p_session_id)
  ) then
    -- This also protects refunded/canceled legacy purchases from resurrection.
    v_outcome := 'legacy';
  elsif (
    greatest(v_user.plan_started_at, v_user.premium_since) > p_session_created_at
    and (v_fields.stripe_subscription_id is null
      or v_user.stripe_subscription_id is distinct from v_fields.stripe_subscription_id)
  ) or (
    v_fields.plan_sku = 'exam_pass'
    and v_user.stripe_subscription_id is not null
    and v_user.plan_status in ('active', 'trialing', 'past_due', 'paused')
  ) or exists (
    select 1 from public.billing_checkout_fulfillments
    where user_id = p_user_id and outcome = 'applied'
      and session_created_at > p_session_created_at
  ) then
    v_outcome := 'stale';
  end if;

  if v_outcome = 'applied' then
    if v_fields.plan_sku = 'exam_pass' then
      -- Give a full 30 days even when Checkout was open before payment.
      -- These database-owned timestamps are written only for the first grant.
      v_fields.plan_started_at := now();
      v_fields.premium_since := now();
      v_fields.plan_expires_at := now() + interval '30 days';
      v_expires_at := v_fields.plan_expires_at;
    end if;
    if v_fields.plan not in ('free', 'premium') or v_fields.plan is null
       or v_fields.plan_status is null or v_fields.plan_started_at is null
       or (v_fields.plan_sku = 'exam_pass' and
           (v_expires_at is null or v_fields.stripe_subscription_id is not null)) then
      raise exception 'invalid checkout plan fields';
    end if;
    -- Explicit allowlist: JSON cannot mutate identity/profile/admin columns.
    update public.users set
      plan = v_fields.plan,
      plan_status = v_fields.plan_status,
      plan_started_at = v_fields.plan_started_at,
      premium_since = v_fields.premium_since,
      plan_renews_at = v_fields.plan_renews_at,
      plan_expires_at = v_fields.plan_expires_at,
      plan_sku = v_fields.plan_sku,
      stripe_customer_id = v_fields.stripe_customer_id,
      stripe_subscription_id = v_fields.stripe_subscription_id,
      canceled_at = v_fields.canceled_at,
      billing_pause_until = v_fields.billing_pause_until
    where id = p_user_id;

    insert into public.user_quotas (user_id, realtime_seconds_quota,
      realtime_seconds_remaining, realtime_period_resets_at)
    values (p_user_id, p_realtime_quota, p_realtime_quota,
      now() + interval '30 days')
    on conflict (user_id) do update set
      realtime_seconds_quota = excluded.realtime_seconds_quota,
      realtime_seconds_remaining = excluded.realtime_seconds_remaining,
      realtime_period_resets_at = excluded.realtime_period_resets_at;
  end if;
  insert into public.billing_checkout_fulfillments
    (session_id, user_id, session_created_at, access_expires_at, outcome)
  values (p_session_id, p_user_id, p_session_created_at, v_expires_at, v_outcome);
  return jsonb_build_object('status', v_outcome, 'access_expires_at', v_expires_at);
end;
$$;
revoke all on function public.fulfill_checkout(text, uuid, timestamptz, jsonb, integer)
  from public, anon, authenticated;
grant execute on function public.fulfill_checkout(text, uuid, timestamptz, jsonb, integer)
  to service_role;

comment on function public.fulfill_checkout(text, uuid, timestamptz, jsonb, integer) is
  'Service-only atomic Checkout entitlement and quota fulfillment. Session replay is a no-op; legacy pre-cutover sessions require reconciliation.';
