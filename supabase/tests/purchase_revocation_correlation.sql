-- Candidate migrations must be inside caller transaction; always ROLLBACK.
do $$
declare
  v_uid uuid:=gen_random_uuid();
  v_now timestamptz:=now();
  v_fields jsonb;
  v_result jsonb;
begin
  insert into auth.users(id,email,raw_user_meta_data)
    values(v_uid,'purchase-rpc-qa-'||v_uid||'@example.invalid','{}');
  insert into public.users(id) values(v_uid) on conflict(id) do nothing;
  v_fields:=jsonb_build_object('plan','premium','plan_status','active','plan_sku','exam_pass');
  -- Refund arrives before the FIRST checkout completion. Tombstone must block.
  v_result:=public.revoke_billing_purchase(v_uid,'checkout:cs_qa_before',null,'ch_qa_before','refund');
  if v_result->>'status'<>'recorded' then raise exception 'first refund not recorded'; end if;
  v_result:=public.fulfill_checkout('cs_qa_before',v_uid,v_now,v_fields,3600);
  if v_result->>'status'<>'revoked' or (select plan from public.users where id=v_uid)<>'free' then
    raise exception 'refunded purchase granted access';
  end if;
  -- Paid pass earns history. Matching refund revokes; duplicate/verify replay
  -- cannot resurrect it. Receipt and original expiration remain retained.
  perform public.fulfill_checkout('cs_qa_pass_current',v_uid,v_now,v_fields,3600);
  if (select purchase_key from public.billing_current_purchases where user_id=v_uid)<>'checkout:cs_qa_pass_current' then
    raise exception 'pass pointer absent';
  end if;
  perform public.revoke_billing_purchase(v_uid,'checkout:cs_qa_pass_current',null,'ch_qa_pass','refund');
  perform public.revoke_billing_purchase(v_uid,'checkout:cs_qa_pass_current',null,'ch_qa_pass','refund');
  v_result:=public.fulfill_checkout('cs_qa_pass_current',v_uid,v_now,v_fields,3600);
  if v_result->>'status'<>'revoked' or (select plan from public.users where id=v_uid)<>'free'
    or not exists(select 1 from public.billing_checkout_fulfillments where session_id='cs_qa_pass_current' and access_expires_at is not null) then
    raise exception 'revoked pass resurrected or history removed';
  end if;
  -- New pass replaces old pass; later old refund leaves it alone.
  perform public.fulfill_checkout('cs_qa_pass_new',v_uid,v_now+interval '1 minute',v_fields,3600);
  v_result:=public.revoke_billing_purchase(v_uid,'checkout:cs_qa_pass_current',null,'ch_qa_pass','refund');
  if v_result->>'status'<>'not_current' or (select plan from public.users where id=v_uid)<>'premium' then
    raise exception 'old pass refund revoked newer pass';
  end if;
  -- New subscription purchase pointer replaces pass atomically.
  v_fields:=jsonb_build_object('plan','premium','plan_status','active','plan_sku','monthly',
    'stripe_subscription_id','sub_qa_monthly','premium_since',v_now+interval '2 minutes',
    'plan_started_at',v_now+interval '2 minutes','_invoice_id','in_qa_monthly');
  perform public.fulfill_checkout('cs_qa_monthly_refund',v_uid,v_now+interval '2 minutes',v_fields,3600);
  perform public.revoke_billing_purchase(v_uid,'checkout:cs_qa_pass_new',null,'ch_qa_pass_new','refund');
  if (select plan from public.users where id=v_uid)<>'premium' then raise exception 'old pass revoked subscription'; end if;
  -- Another older subscription's charge cannot revoke the current subscription.
  perform public.revoke_billing_purchase(v_uid,'invoice:in_qa_oldsub','sub_qa_old','ch_qa_old','refund','invoice:in_qa_oldsub');
  if (select plan from public.users where id=v_uid)<>'premium' then raise exception 'old subscription revoked newer subscription'; end if;
  -- Renewal moves purchase identity atomically. An older same-sub charge cannot
  -- revoke renewed access, even when a provider snapshot says old invoice.
  v_fields:=v_fields||jsonb_build_object('_invoice_id','in_qa_renewal','_paid_purchase',true,'_purchase_requires_refill',true);
  perform public.apply_subscription_billing_event('invoice:in_qa_renewal',v_uid,v_now+interval '2 minutes',v_now+interval '3 minutes',v_fields,false,3600,v_now+interval '3 minutes');
  v_result:=public.revoke_billing_purchase(v_uid,'invoice:in_qa_monthly','sub_qa_monthly','ch_qa_monthly','refund','invoice:in_qa_monthly');
  if v_result->>'status'<>'not_current' or (select plan from public.users where id=v_uid)<>'premium' then
    raise exception 'old same-sub charge revoked renewed purchase';
  end if;
  -- Current invoice refund revokes, then lifecycle replay cannot regrant.
  perform public.revoke_billing_purchase(v_uid,'invoice:in_qa_renewal','sub_qa_monthly','ch_qa_renewal','dispute','invoice:in_qa_renewal');
  v_result:=public.apply_subscription_billing_event('evt_qa_refund_lifecycle',v_uid,v_now+interval '2 minutes',v_now+interval '4 minutes',v_fields,true,null,null);
  if v_result->>'status'<>'revoked' or (select plan from public.users where id=v_uid)<>'free' then
    raise exception 'lifecycle resurrected disputed invoice';
  end if;
  -- A NEW paid invoice can legitimately restore access; an unpaid lifecycle
  -- with a new latest_invoice cannot do so before the new paid event arrives.
  v_fields:=v_fields||jsonb_build_object('_invoice_id','in_qa_recovery','_paid_purchase',false);
  v_result:=public.apply_subscription_billing_event('evt_qa_unpaid_recovery',v_uid,v_now+interval '2 minutes',v_now+interval '5 minutes',v_fields,true,null,null);
  if v_result->>'status'<>'revoked' then raise exception 'unpaid lifecycle bypassed revocation'; end if;
  v_fields:=v_fields||jsonb_build_object('_paid_purchase',true,'_purchase_requires_refill',true);
  perform public.apply_subscription_billing_event('invoice:in_qa_recovery',v_uid,v_now+interval '2 minutes',v_now+interval '6 minutes',v_fields,false,3600,v_now+interval '6 minutes');
  if (select plan from public.users where id=v_uid)<>'premium'
    or (select purchase_key from public.billing_current_purchases where user_id=v_uid)<>'invoice:in_qa_recovery' then
    raise exception 'new paid purchase could not restore access';
  end if;
  -- Forced quota failure must not commit the tombstone or prior user change.
  execute format('alter table public.user_quotas add constraint purchase_qa_failure check (user_id<>%L::uuid or realtime_seconds_remaining<>0) not valid',v_uid);
  begin
    perform public.revoke_billing_purchase(v_uid,'invoice:in_qa_recovery','sub_qa_monthly','ch_qa_recovery','refund','invoice:in_qa_recovery');
    raise exception 'expected revocation quota failure';
  exception when check_violation then null;
  end;
  if exists(select 1 from public.billing_purchase_revocations where purchase_key='invoice:in_qa_recovery')
    or (select plan from public.users where id=v_uid)<>'premium' then
    raise exception 'failed revocation left partial state';
  end if;
  alter table public.user_quotas drop constraint purchase_qa_failure;
  -- Provider latest invoice independently protects direct legacy upgrades whose
  -- newer purchase pointer has not yet been delivered by its webhook.
  v_result:=public.revoke_billing_purchase(v_uid,'invoice:in_qa_recovery','sub_qa_monthly','ch_qa_recovery','refund','invoice:in_qa_provider_newer');
  if v_result->>'status'<>'not_current' or (select plan from public.users where id=v_uid)<>'premium' then
    raise exception 'stale local pointer overrode provider relationship';
  end if;
  -- Unmapped legacy paid access is an explicit reconciliation outcome, not
  -- arbitrary revocation or silent acknowledgement of the failure.
  delete from public.billing_current_purchases where user_id=v_uid;
  v_result:=public.revoke_billing_purchase(v_uid,'invoice:in_qa_unmapped','sub_qa_monthly','ch_qa_unmapped','refund','invoice:in_qa_unmapped');
  if v_result->>'status'<>'needs_reconciliation' or (select plan from public.users where id=v_uid)<>'premium' then
    raise exception 'unmapped legacy access was silently changed';
  end if;
  if has_function_privilege('authenticated','public.revoke_billing_purchase(uuid,text,text,text,text,text)','EXECUTE')
    or has_function_privilege('anon','public.fulfill_checkout(text,uuid,timestamptz,jsonb,integer)','EXECUTE')
    or has_schema_privilege('authenticated','billing_private','USAGE') then
    raise exception 'privilege escalation exposed';
  end if;
end;
$$;

-- Execute wrappers as the real service role, not postgres: this catches missing
-- USAGE/EXECUTE/DELETE grants that privileged migration tests would hide.
do $$
declare v_uid uuid:=gen_random_uuid();
begin
  insert into auth.users(id,email,raw_user_meta_data)
    values(v_uid,'purchase-role-qa-'||v_uid||'@example.invalid','{}');
  insert into public.users(id) values(v_uid) on conflict(id) do nothing;
  perform set_config('ielts.qa_role_uid',v_uid::text,true);
end;
$$;
set local role service_role;
do $$
declare
  v_uid uuid:=current_setting('ielts.qa_role_uid')::uuid;
  v_fields jsonb;
  v_result jsonb;
begin
  if current_user<>'service_role' then raise exception 'role test not running as service'; end if;
  v_fields:=jsonb_build_object('plan','premium','plan_status','active','plan_sku','exam_pass');
  perform public.fulfill_checkout('cs_qa_role_pass',v_uid,now(),v_fields,3600);
  v_fields:=jsonb_build_object('plan','premium','plan_status','active','plan_sku','monthly',
    'stripe_subscription_id','sub_qa_role','premium_since',now()+interval '1 minute',
    'plan_started_at',now()+interval '1 minute','_invoice_id','in_qa_role');
  -- New subscription mapping invokes DELETE on the prior pass pointer.
  perform public.apply_subscription_billing_event('evt_qa_role_new',v_uid,now()+interval '1 minute',now()+interval '1 minute',v_fields,true,null,null);
  if exists(select 1 from public.billing_current_purchases where user_id=v_uid) then
    raise exception 'old pointer not removed on subscription adoption';
  end if;
  perform public.fulfill_checkout('cs_qa_role_sub',v_uid,now()+interval '1 minute',v_fields,3600);
  -- No provider override because latest invoice may be unpaid: an exact funded
  -- local pointer still authorizes reversal of this matching paid purchase.
  v_result:=public.revoke_billing_purchase(v_uid,'invoice:in_qa_role','sub_qa_role','ch_qa_role','refund',null);
  if v_result->>'status'<>'revoked' or (select plan from public.users where id=v_uid)<>'free' then
    raise exception 'unpaid latest invoice prevented current paid refund';
  end if;
end;
$$;
reset role;
