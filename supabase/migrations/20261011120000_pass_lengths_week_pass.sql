-- 20261011120000_pass_lengths_week_pass.sql
-- Supersedes 20260923130000_exam_pass_length.sql (never applied to production;
-- this file contains its full body plus the Week Pass). Apply with
-- `node scripts/apply-exam-pass-length.mjs`.
--
-- One-time passes are granted by billing_private.fulfill_checkout with a
-- caller-selected length instead of the hard-coded 30 days:
--   * p_fields->>'_pass_product' in ('exam_pass', 'week_pass'); absent ->
--     'exam_pass'. Both store users.plan_sku = 'exam_pass' (the one-time-pass
--     entitlement class every billing path already understands); the product
--     only selects which lengths are legal.
--   * exam_pass: p_fields->>'_exam_pass_days' in (30, 45); absent -> 30, so old
--     app builds keep their exact behaviour.
--   * week_pass: '_exam_pass_days' must be 7 and p_realtime_quota must be 0
--     (the Week Pass does not include live-examiner minutes).
--   * anything else raises and leaves the Stripe event retryable.
--   * a pass's live-examiner allowance period ends with the pass.
--   * public.billing_exam_pass_days_supported() lets checkout verify this
--     migration is live before it sells a 45-day or 7-day pass.
--
-- Existing entitlements are NOT touched: already-granted passes keep their
-- recorded plan_expires_at, and replays still return the recorded window.

create or replace function billing_private.fulfill_checkout(
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
  v_pass_days_raw text := nullif(p_fields->>'_exam_pass_days', '');
  v_pass_product text := coalesce(nullif(p_fields->>'_pass_product', ''), 'exam_pass');
  v_pass_days integer := 30;
  v_quota_resets_at timestamptz := now() + interval '30 days';
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
  -- Allowlists on the text form: no cast of untrusted input can raise first.
  if v_pass_product not in ('exam_pass', 'week_pass') then
    raise exception 'invalid pass product';
  end if;
  if v_pass_product = 'week_pass' then
    if v_pass_days_raw is distinct from '7' or p_realtime_quota <> 0
       or p_fields->>'plan_sku' is distinct from 'exam_pass' then
      raise exception 'invalid exam pass length';
    end if;
    v_pass_days := 7;
  elsif v_pass_days_raw is not null then
    if v_pass_days_raw not in ('30', '45') then
      raise exception 'invalid exam pass length';
    end if;
    v_pass_days := v_pass_days_raw::integer;
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
      -- Give the full advertised window even when Checkout was open before
      -- payment. These database-owned timestamps are written only for the
      -- first grant.
      v_fields.plan_started_at := now();
      v_fields.premium_since := now();
      v_fields.plan_expires_at := now() + make_interval(days => v_pass_days);
      v_expires_at := v_fields.plan_expires_at;
      -- One live-examiner allowance per pass, ending with the pass.
      v_quota_resets_at := v_expires_at;
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
    values (p_user_id, p_realtime_quota, p_realtime_quota, v_quota_resets_at)
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
revoke all on function billing_private.fulfill_checkout(text, uuid, timestamptz, jsonb, integer)
  from public, anon, authenticated;
grant execute on function billing_private.fulfill_checkout(text, uuid, timestamptz, jsonb, integer)
  to service_role;

-- Deployment probe for checkout: which pass lengths fulfill_checkout grants.
create or replace function public.billing_exam_pass_days_supported()
returns integer[]
language sql
immutable
security invoker
set search_path = ''
as $$ select array[7, 30, 45] $$;
revoke all on function public.billing_exam_pass_days_supported() from public, anon, authenticated;
grant execute on function public.billing_exam_pass_days_supported() to service_role;
comment on function public.billing_exam_pass_days_supported() is
  'Pass lengths (days) billing_private.fulfill_checkout accepts via p_fields._exam_pass_days (7 = Week Pass only). Checkout refuses to sell any other length.';
