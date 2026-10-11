-- Run inside a transaction after applying 20261011120000_pass_lengths_week_pass.sql;
-- caller MUST ROLLBACK. Only a synthetic QA auth/user record is created and all
-- data is rolled back (scripts/apply-exam-pass-length.mjs does exactly that).
do $$
declare
  v_uid uuid := gen_random_uuid();
  v_now timestamptz := now();
  v_fields jsonb;
  v_week jsonb;
  v_result jsonb;
  v_quota record;
begin
  insert into auth.users (id, email, raw_user_meta_data)
    values (v_uid, 'week-pass-qa-' || v_uid || '@example.invalid', '{}'::jsonb);
  insert into public.users (id) values (v_uid) on conflict (id) do nothing;
  v_fields := jsonb_build_object('plan', 'premium', 'plan_status', 'active',
    'plan_started_at', v_now, 'premium_since', v_now, 'plan_sku', 'exam_pass',
    'plan_expires_at', v_now + interval '7 days');
  v_week := v_fields || jsonb_build_object('_pass_product', 'week_pass', '_exam_pass_days', '7');

  -- Week Pass rejections leave nothing behind (the Stripe event stays retryable).
  begin
    perform public.fulfill_checkout('cs_qa_week_30', v_uid, v_now, v_fields
      || jsonb_build_object('_pass_product', 'week_pass', '_exam_pass_days', '30'), 0);
    raise exception 'expected week pass length rejection';
  exception when raise_exception then
    if sqlerrm <> 'invalid exam pass length' then raise; end if;
  end;
  begin
    perform public.fulfill_checkout('cs_qa_week_quota', v_uid, v_now, v_week, 1800);
    raise exception 'expected week pass quota rejection';
  exception when raise_exception then
    if sqlerrm <> 'invalid exam pass length' then raise; end if;
  end;
  begin
    perform public.fulfill_checkout('cs_qa_exam_7', v_uid, v_now, v_fields
      || jsonb_build_object('_exam_pass_days', '7'), 3600);
    raise exception 'expected 7-day exam pass rejection';
  exception when raise_exception then
    if sqlerrm <> 'invalid exam pass length' then raise; end if;
  end;
  begin
    perform public.fulfill_checkout('cs_qa_bad_product', v_uid, v_now, v_fields
      || jsonb_build_object('_pass_product', 'lifetime'), 3600);
    raise exception 'expected product rejection';
  exception when raise_exception then
    if sqlerrm <> 'invalid pass product' then raise; end if;
  end;
  if exists(select 1 from public.billing_checkout_fulfillments
            where session_id in ('cs_qa_week_30', 'cs_qa_week_quota', 'cs_qa_exam_7', 'cs_qa_bad_product')) then
    raise exception 'rejected pass left a receipt';
  end if;

  -- A valid Week Pass grants exactly 7 days, no examiner minutes, and stores
  -- the one-time-pass entitlement class.
  v_result := public.fulfill_checkout('cs_qa_week_ok', v_uid, v_now, v_week, 0);
  if v_result->>'status' <> 'applied'
     or (v_result->>'access_expires_at')::timestamptz <> v_now + interval '7 days'
     or (select plan_expires_at from public.users where id = v_uid) <> v_now + interval '7 days'
     or (select plan_sku from public.users where id = v_uid) <> 'exam_pass' then
    raise exception 'week pass not granted: %', v_result;
  end if;
  select realtime_seconds_quota, realtime_seconds_remaining, realtime_period_resets_at
    into v_quota from public.user_quotas where user_id = v_uid;
  if v_quota.realtime_seconds_quota <> 0 or v_quota.realtime_seconds_remaining <> 0
     or v_quota.realtime_period_resets_at <> v_now + interval '7 days' then
    raise exception 'week pass quota wrong: %', row_to_json(v_quota);
  end if;
  if (select purchase_key from public.billing_current_purchases where user_id = v_uid)
     is distinct from 'checkout:cs_qa_week_ok' then
    raise exception 'week pass purchase pointer missing';
  end if;

  -- Replays keep the recorded window.
  v_result := public.fulfill_checkout('cs_qa_week_ok', v_uid, v_now, v_week, 0);
  if v_result->>'status' <> 'already_applied'
     or (v_result->>'access_expires_at')::timestamptz <> v_now + interval '7 days' then
    raise exception 'replay changed the week pass window: %', v_result;
  end if;
end;
$$;
