-- Run inside a transaction after applying the migration; caller MUST ROLLBACK.
-- Only a synthetic QA auth/user record is created and all data is rolled back.
do $$
declare
  v_uid uuid := gen_random_uuid();
  v_now timestamptz := now();
  v_fields jsonb;
  v_result jsonb;
  v_expiry timestamptz;
  v_remaining integer;
begin
  insert into auth.users (id, email, raw_user_meta_data)
    values (v_uid, 'checkout-rpc-qa-' || v_uid || '@example.invalid', '{}'::jsonb);
  insert into public.users (id) values (v_uid) on conflict (id) do nothing;
  v_fields := jsonb_build_object('plan', 'premium', 'plan_status', 'active',
    'plan_started_at', v_now, 'premium_since', v_now, 'plan_sku', 'exam_pass',
    'plan_expires_at', v_now + interval '30 days');
  v_result := public.fulfill_checkout('cs_qa_pass', v_uid, v_now, v_fields, 3600);
  if v_result->>'status' <> 'applied' then raise exception 'first pass failed: %', v_result; end if;
  select plan_expires_at into v_expiry from public.users where id=v_uid;
  if v_expiry <> v_now + interval '30 days' then raise exception 'pass did not grant full 30 days'; end if;
  update public.user_quotas set realtime_seconds_remaining=120 where user_id=v_uid;
  -- Even if a buggy caller proposes a different expiration, the ledger wins.
  v_result := public.fulfill_checkout('cs_qa_pass', v_uid, v_now,
    v_fields || jsonb_build_object('plan_expires_at', v_now + interval '60 days'), 3600);
  select realtime_seconds_remaining into v_remaining from public.user_quotas where user_id=v_uid;
  if v_result->>'status' <> 'already_applied' or v_remaining <> 120
    or (v_result->>'access_expires_at')::timestamptz <> v_expiry
    or (select plan_expires_at from public.users where id=v_uid) <> v_expiry then
    raise exception 'replay refilled quota or extended access';
  end if;
  -- Refund followed by replay must not resurrect access.
  update public.users set plan='free', plan_status='refunded', plan_expires_at=null where id=v_uid;
  perform public.fulfill_checkout('cs_qa_pass', v_uid, v_now, v_fields, 3600);
  if (select plan from public.users where id=v_uid) <> 'free' then raise exception 'refund replay resurrected plan'; end if;

  -- New recurring checkout wins; older distinct pass cannot replace it.
  v_fields := jsonb_build_object('plan', 'premium', 'plan_status', 'active',
    'plan_started_at', v_now + interval '1 minute', 'premium_since', v_now + interval '1 minute',
    'plan_sku', 'monthly', 'stripe_subscription_id', 'sub_qa_current');
  perform public.fulfill_checkout('cs_qa_monthly', v_uid, v_now + interval '1 minute', v_fields, 1800);
  update public.user_quotas set realtime_seconds_remaining=23 where user_id=v_uid;
  v_result := public.fulfill_checkout('cs_qa_monthly', v_uid, v_now + interval '1 minute', v_fields, 1800);
  if v_result->>'status' <> 'already_applied' or
     (select realtime_seconds_remaining from public.user_quotas where user_id=v_uid) <> 23 then
    raise exception 'recurring replay refilled quota';
  end if;
  v_result := public.fulfill_checkout('cs_qa_old_pass', v_uid, v_now,
    v_fields || jsonb_build_object('plan_sku','exam_pass','stripe_subscription_id',null,
      'plan_expires_at',v_now + interval '30 days'), 3600);
  if v_result->>'status' <> 'stale' then raise exception 'old pass accepted'; end if;
  v_result := public.fulfill_checkout('cs_qa_old_sub', v_uid, v_now,
    v_fields || jsonb_build_object('stripe_subscription_id','sub_qa_old'), 3600);
  if v_result->>'status' <> 'stale' then raise exception 'old subscription accepted'; end if;
  if (select stripe_subscription_id from public.users where id=v_uid) <> 'sub_qa_current' then
    raise exception 'stale purchase replaced subscription';
  end if;

  v_result := public.fulfill_checkout('cs_qa_legacy',v_uid,v_now - interval '1 year',v_fields,3600);
  if v_result->>'status' <> 'legacy' then raise exception 'unknown legacy replay accepted'; end if;

  -- Force failure after the users UPDATE: a CHECK violation on the quota row.
  -- PL/pgSQL exception block is a subtransaction, so the whole RPC rolls back.
  execute format('alter table public.user_quotas add constraint checkout_qa_forced_failure
    check (user_id <> %L::uuid or realtime_seconds_remaining <> 3600) not valid', v_uid);
  begin
    perform public.fulfill_checkout('cs_qa_abort',v_uid,v_now + interval '2 minutes',
      v_fields || jsonb_build_object('plan_sku','annual'),3600);
    raise exception 'expected quota failure';
  exception when check_violation then null;
  end;
  if exists(select 1 from public.billing_checkout_fulfillments where session_id='cs_qa_abort')
    or (select plan_sku from public.users where id=v_uid) <> 'monthly' then
    raise exception 'failed fulfillment left partial state';
  end if;
  alter table public.user_quotas drop constraint checkout_qa_forced_failure;
  v_result := public.fulfill_checkout('cs_qa_abort',v_uid,v_now + interval '2 minutes',
    v_fields || jsonb_build_object('plan_sku','annual'),3600);
  if v_result->>'status' <> 'applied' then raise exception 'retry after failure failed'; end if;
end;
$$;

-- Privilege checks cover the Data API roles, independently of caller identity.
do $$
begin
  if has_function_privilege('anon','public.fulfill_checkout(text,uuid,timestamptz,jsonb,integer)','EXECUTE')
     or has_function_privilege('authenticated','public.fulfill_checkout(text,uuid,timestamptz,jsonb,integer)','EXECUTE')
     or not has_function_privilege('service_role','public.fulfill_checkout(text,uuid,timestamptz,jsonb,integer)','EXECUTE') then
    raise exception 'incorrect RPC grants';
  end if;
  if has_table_privilege('authenticated','public.billing_checkout_fulfillments','INSERT')
     or has_table_privilege('anon','public.billing_checkout_fulfillments','SELECT') then
    raise exception 'ledger exposed';
  end if;
end;
$$;
