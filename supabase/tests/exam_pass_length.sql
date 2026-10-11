-- Run inside a transaction after applying 20261011120000_pass_lengths_week_pass.sql;
-- caller MUST ROLLBACK. Only a synthetic QA auth/user record is created and all
-- data is rolled back (scripts/apply-exam-pass-length.mjs does exactly that).
do $$
declare
  v_uid uuid := gen_random_uuid();
  v_now timestamptz := now();
  v_fields jsonb;
  v_result jsonb;
  v_resets timestamptz;
begin
  insert into auth.users (id, email, raw_user_meta_data)
    values (v_uid, 'exam-pass-length-qa-' || v_uid || '@example.invalid', '{}'::jsonb);
  insert into public.users (id) values (v_uid) on conflict (id) do nothing;
  v_fields := jsonb_build_object('plan', 'premium', 'plan_status', 'active',
    'plan_started_at', v_now, 'premium_since', v_now, 'plan_sku', 'exam_pass',
    'plan_expires_at', v_now + interval '30 days');

  -- Old app builds send no length: exactly the previous 30-day grant.
  v_result := public.fulfill_checkout('cs_qa_len_default', v_uid, v_now, v_fields, 3600);
  if v_result->>'status' <> 'applied'
     or (v_result->>'access_expires_at')::timestamptz <> v_now + interval '30 days' then
    raise exception 'default pass length changed: %', v_result;
  end if;

  -- An unsupported length is refused and leaves nothing behind (retryable).
  begin
    perform public.fulfill_checkout('cs_qa_len_bad', v_uid, v_now + interval '1 second',
      v_fields || jsonb_build_object('_exam_pass_days', '90'), 3600);
    raise exception 'expected invalid length rejection';
  exception when raise_exception then
    if sqlerrm <> 'invalid exam pass length' then raise; end if;
  end;
  if exists(select 1 from public.billing_checkout_fulfillments where session_id = 'cs_qa_len_bad') then
    raise exception 'rejected length left a receipt';
  end if;

  -- A 45-day pass grants 45 days, and one live-examiner allowance ending with it.
  update public.users set plan = 'free', plan_status = 'inactive', plan_expires_at = null,
    plan_started_at = null, premium_since = null where id = v_uid;
  v_result := public.fulfill_checkout('cs_qa_len_45', v_uid, v_now + interval '2 seconds',
    v_fields || jsonb_build_object('_exam_pass_days', 45), 3600);
  if v_result->>'status' <> 'applied'
     or (v_result->>'access_expires_at')::timestamptz <> v_now + interval '45 days'
     or (select plan_expires_at from public.users where id = v_uid) <> v_now + interval '45 days' then
    raise exception '45-day pass not granted: %', v_result;
  end if;
  select realtime_period_resets_at into v_resets from public.user_quotas where user_id = v_uid;
  if v_resets <> v_now + interval '45 days' then
    raise exception 'examiner allowance does not end with the pass: %', v_resets;
  end if;

  -- Replays keep the recorded window, whatever length a caller proposes.
  v_result := public.fulfill_checkout('cs_qa_len_45', v_uid, v_now + interval '2 seconds',
    v_fields || jsonb_build_object('_exam_pass_days', 30), 3600);
  if v_result->>'status' <> 'already_applied'
     or (v_result->>'access_expires_at')::timestamptz <> v_now + interval '45 days' then
    raise exception 'replay changed the recorded window: %', v_result;
  end if;

  if public.billing_exam_pass_days_supported() <> array[7, 30, 45] then
    raise exception 'deployment probe mismatch';
  end if;
end;
$$;

do $$
begin
  if has_function_privilege('anon', 'public.billing_exam_pass_days_supported()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.billing_exam_pass_days_supported()', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.billing_exam_pass_days_supported()', 'EXECUTE')
     or has_function_privilege('authenticated', 'billing_private.fulfill_checkout(text,uuid,timestamptz,jsonb,integer)', 'EXECUTE') then
    raise exception 'incorrect grants';
  end if;
end;
$$;
