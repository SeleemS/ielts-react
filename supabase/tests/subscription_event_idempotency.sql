-- Apply candidate migration inside a transaction, run this test, always ROLLBACK.
do $$
declare
  v_uid uuid:=gen_random_uuid();
  v_now timestamptz:=now();
  v_fields jsonb;
  v_result jsonb;
begin
  insert into auth.users(id,email,raw_user_meta_data)
    values(v_uid,'subscription-rpc-qa-'||v_uid||'@example.invalid','{}'::jsonb);
  insert into public.users(id) values(v_uid) on conflict(id) do nothing;
  v_fields:=jsonb_build_object('plan','premium','plan_status','active','plan_sku','monthly',
    'stripe_subscription_id','sub_qa_new','premium_since',v_now);
  -- New subscription.created before checkout binds identity but does not seed.
  v_result:=public.apply_subscription_billing_event('evt_qa_create',v_uid,v_now,v_now,v_fields,true,null,null);
  if not (v_result->>'plan_applied')::boolean or (v_result->>'quota_applied')::boolean then
    raise exception 'new subscription mapping/order failed';
  end if;
  -- Checkout then grants its initial quota via the existing atomic RPC.
  perform public.fulfill_checkout('cs_qa_subscription_phase2',v_uid,v_now,
    v_fields||jsonb_build_object('plan_started_at',v_now),3600);
  update public.user_quotas set realtime_seconds_remaining=99 where user_id=v_uid;
  -- A newer lifecycle event may arrive before an older-time renewal invoice.
  perform public.apply_subscription_billing_event('evt_qa_updated',v_uid,v_now,v_now+interval '4 minutes',v_fields,true,null,null);
  v_result:=public.apply_subscription_billing_event('invoice:in_qa_cycle',v_uid,v_now,v_now+interval '3 minutes',v_fields,false,3600,v_now+interval '1 minute');
  if not (v_result->>'quota_applied')::boolean or (v_result->>'plan_applied')::boolean then
    raise exception 'renewal was lost due to lifecycle watermark';
  end if;
  update public.user_quotas set realtime_seconds_remaining=123 where user_id=v_uid;
  v_result:=public.apply_subscription_billing_event('invoice:in_qa_cycle',v_uid,v_now,v_now+interval '3 minutes',v_fields,false,3600,v_now+interval '1 minute');
  if v_result->>'status'<>'already_applied'
    or (select realtime_seconds_remaining from public.user_quotas where user_id=v_uid)<>123 then
    raise exception 'duplicate invoice refilled quota';
  end if;
  -- An older different invoice cannot refill after a more recent renewal.
  perform public.apply_subscription_billing_event('invoice:in_qa_older',v_uid,v_now,v_now+interval '4 minutes',v_fields,false,3600,v_now);
  if (select realtime_seconds_remaining from public.user_quotas where user_id=v_uid)<>123 then
    raise exception 'older invoice refilled quota';
  end if;
  -- Proration revenue is recorded outside this RPC; it must not refill quota.
  perform public.apply_subscription_billing_event('invoice:in_qa_proration',v_uid,v_now,v_now+interval '5 minutes',v_fields,false,null,v_now+interval '2 minutes');
  if (select realtime_seconds_remaining from public.user_quotas where user_id=v_uid)<>123 then
    raise exception 'proration refilled quota';
  end if;
  -- Paid-through cancellation can precede its renewal invoice; paid access
  -- still gets the renewal allowance even though its plan event is older.
  v_fields:=v_fields||jsonb_build_object('plan_status','canceled','plan_renews_at',v_now+interval '30 days');
  perform public.apply_subscription_billing_event('evt_qa_scheduled_cancel',v_uid,v_now,v_now+interval '6 minutes',v_fields,true,null,null);
  v_result:=public.apply_subscription_billing_event('invoice:in_qa_paid_through',v_uid,v_now,v_now+interval '5 minutes',v_fields,false,3600,v_now+interval '3 minutes');
  if not (v_result->>'quota_applied')::boolean then raise exception 'paid-through canceled renewal lost refill'; end if;
  update public.user_quotas set realtime_seconds_remaining=123 where user_id=v_uid;
  v_fields:=v_fields||jsonb_build_object('plan_status','active');
  -- Late old legacy subscription events cannot replace current monthly.
  v_fields:=v_fields||jsonb_build_object('stripe_subscription_id','sub_qa_legacy','premium_since',v_now-interval '1 year');
  perform public.apply_subscription_billing_event('evt_qa_legacy_active',v_uid,v_now-interval '1 year',v_now+interval '6 minutes',v_fields,true,null,null);
  perform public.apply_subscription_billing_event('invoice:in_qa_legacy',v_uid,v_now-interval '1 year',v_now+interval '6 minutes',v_fields,false,3600,v_now+interval '6 minutes');
  perform public.apply_subscription_billing_event('evt_qa_legacy_delete',v_uid,v_now-interval '1 year',v_now+interval '7 minutes',v_fields||jsonb_build_object('plan','free','plan_status','canceled'),false,0,null);
  if (select stripe_subscription_id from public.users where id=v_uid)<>'sub_qa_new'
    or (select plan from public.users where id=v_uid)<>'premium'
    or (select realtime_seconds_remaining from public.user_quotas where user_id=v_uid)<>123 then
    raise exception 'legacy events changed current entitlement';
  end if;
  -- Same exact current subscription deletion revokes; an older invoice cannot
  -- undo the cancellation even with an independent invoice refill path.
  v_fields:=v_fields||jsonb_build_object('stripe_subscription_id','sub_qa_new','premium_since',v_now);
  perform public.apply_subscription_billing_event('evt_qa_delete',v_uid,v_now,v_now+interval '8 minutes',v_fields||jsonb_build_object('plan','free','plan_status','canceled'),false,0,null);
  perform public.apply_subscription_billing_event('invoice:in_qa_delayed',v_uid,v_now,v_now+interval '7 minutes',v_fields,false,3600,v_now+interval '7 minutes');
  if (select plan from public.users where id=v_uid)<>'free'
    or (select realtime_seconds_remaining from public.user_quotas where user_id=v_uid)<>0 then
    raise exception 'late invoice undid cancellation';
  end if;
  -- Existing Exam Pass cannot be downgraded by old subscription invoice/delete.
  update public.users set stripe_subscription_id=null,plan='premium',plan_status='active',
    plan_sku='exam_pass',plan_started_at=v_now+interval '9 minutes',premium_since=v_now+interval '9 minutes',
    plan_expires_at=v_now+interval '30 days' where id=v_uid;
  perform public.apply_subscription_billing_event('evt_qa_after_pass',v_uid,v_now,v_now+interval '10 minutes',v_fields||jsonb_build_object('plan','free','plan_status','canceled'),false,0,null);
  if (select plan_sku from public.users where id=v_uid)<>'exam_pass'
    or (select plan from public.users where id=v_uid)<>'premium' then
    raise exception 'old deletion replaced exam pass';
  end if;
  -- Genuine newer subscription adopts; a forced quota failure rolls back all.
  v_fields:=v_fields||jsonb_build_object('stripe_subscription_id','sub_qa_next','premium_since',v_now+interval '11 minutes');
  perform public.apply_subscription_billing_event('evt_qa_next',v_uid,v_now+interval '11 minutes',v_now+interval '11 minutes',v_fields,true,null,null);
  execute format('alter table public.user_quotas add constraint subscription_qa_failure check (user_id<>%L::uuid or realtime_seconds_remaining<>1800) not valid',v_uid);
  begin
    perform public.apply_subscription_billing_event('invoice:in_qa_crash',v_uid,v_now+interval '11 minutes',v_now+interval '12 minutes',v_fields||jsonb_build_object('plan_sku','annual'),false,1800,v_now+interval '12 minutes');
    raise exception 'expected quota failure';
  exception when check_violation then null;
  end;
  if exists(select 1 from public.billing_subscription_events where event_key='invoice:in_qa_crash')
    or (select plan_sku from public.users where id=v_uid)='annual' then
    raise exception 'partial event survived quota failure';
  end if;
  alter table public.user_quotas drop constraint subscription_qa_failure;
  perform public.apply_subscription_billing_event('invoice:in_qa_crash',v_uid,v_now+interval '11 minutes',v_now+interval '12 minutes',v_fields||jsonb_build_object('plan_sku','annual'),false,1800,v_now+interval '12 minutes');
  if (select realtime_seconds_remaining from public.user_quotas where user_id=v_uid)<>1800 then
    raise exception 'failed invoice could not retry';
  end if;
  if has_function_privilege('anon','public.apply_subscription_billing_event(text,uuid,timestamptz,timestamptz,jsonb,boolean,integer,timestamptz)','EXECUTE')
    or has_function_privilege('authenticated','public.apply_subscription_billing_event(text,uuid,timestamptz,timestamptz,jsonb,boolean,integer,timestamptz)','EXECUTE')
    or not has_function_privilege('service_role','public.apply_subscription_billing_event(text,uuid,timestamptz,timestamptz,jsonb,boolean,integer,timestamptz)','EXECUTE') then
    raise exception 'incorrect service-only privileges';
  end if;
end;
$$;
