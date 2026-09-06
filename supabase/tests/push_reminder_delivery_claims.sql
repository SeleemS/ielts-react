-- Transactional fixture; no notification delivery. Run after the migration.
begin;
set local role service_role;
do $$
declare
  v_user uuid;
  v_id uuid := gen_random_uuid();
  v_first jsonb;
  v_second jsonb;
  v_now timestamptz := '2026-09-06T00:30:00Z';
begin
  v_user := nullif(current_setting('app.audit_qa_user_id',true),'')::uuid;
  if v_user is null then raise exception 'fixture requires dedicated app.audit_qa_user_id'; end if;
  insert into public.push_subscriptions(id,user_id,endpoint,keys,time_zone,reminder_hour_local)
    values(v_id,v_user,'https://fcm.googleapis.com/wp/sql-fixture-'||v_id,'{}','America/New_York',20);
  v_first := public.claim_push_reminder(v_id,v_now);
  if not (v_first->>'claimed')::boolean then raise exception 'first claim denied'; end if;
  v_second := public.claim_push_reminder(v_id,v_now);
  if (v_second->>'claimed')::boolean then raise exception 'live lease allowed second claim'; end if;
  if public.finish_push_reminder(v_id,gen_random_uuid(),true,false,false,v_now) then raise exception 'wrong token accepted'; end if;
  if not public.finish_push_reminder(v_id,(v_first->>'token')::uuid,false,false,false,v_now) then raise exception 'failure completion denied'; end if;
  if (select failures<>1 or last_sent_at is not null from public.push_subscriptions where id=v_id) then raise exception 'failure state incorrect'; end if;
  v_second := public.claim_push_reminder(v_id,v_now+interval '1 minute');
  if not (v_second->>'claimed')::boolean then raise exception 'settled failure cannot retry'; end if;
  if public.finish_push_reminder(v_id,(v_first->>'token')::uuid,true,false,false,v_now) then raise exception 'old token completed newer claim'; end if;
  if not public.finish_push_reminder(v_id,(v_second->>'token')::uuid,true,false,false,v_now) then raise exception 'success completion denied'; end if;
  if (public.claim_push_reminder(v_id,v_now+interval '1 minute')->>'claimed')::boolean then raise exception 'same local day double send'; end if;
  if (select failures<>0 or last_sent_at<>v_now from public.push_subscriptions where id=v_id) then raise exception 'success state incorrect'; end if;
  -- A send before midnight UTC is still the same New York local day.
  update public.push_subscriptions set last_sent_at=v_now-interval '1 hour' where id=v_id;
  if (public.claim_push_reminder(v_id,v_now)->>'claimed')::boolean then raise exception 'UTC midnight bypassed local day'; end if;
  -- Changing the reminder hour also must not resend on that same local day.
  update public.push_subscriptions set reminder_hour_local=21 where id=v_id;
  if (public.claim_push_reminder(v_id,v_now+interval '1 hour')->>'claimed')::boolean then raise exception 'local-day suppression lost'; end if;
  update public.push_subscriptions set reminder_hour_local=20 where id=v_id;
  v_first := public.claim_push_reminder(v_id,v_now+interval '1 day');
  if not (v_first->>'claimed')::boolean then raise exception 'next day claim denied'; end if;
  v_second := public.claim_push_reminder(v_id,v_now+interval '1 day 11 minutes');
  if not (v_second->>'claimed')::boolean then raise exception 'expired lease not reclaimed'; end if;
  if public.finish_push_reminder(v_id,(v_first->>'token')::uuid,true,false,false,v_now) then raise exception 'expired owner overwrote replacement'; end if;
  update public.push_subscriptions set enabled=false,disabled_reason='user-disabled' where id=v_id;
  perform public.finish_push_reminder(v_id,(v_second->>'token')::uuid,false,false,false,v_now);
  if (select enabled or disabled_reason<>'user-disabled' from public.push_subscriptions where id=v_id) then raise exception 'completion undid user disable'; end if;
  if (public.claim_push_reminder(v_id,v_now)->>'claimed')::boolean then raise exception 'disabled row claimed'; end if;
  -- Invalid IANA zone must preserve the client offset fallback.
  update public.push_subscriptions set enabled=true,failures=0,last_sent_at=null,time_zone='invalid/zone',tz_offset_minutes=330,reminder_hour_local=6 where id=v_id;
  v_first := public.claim_push_reminder(v_id,v_now);
  if not (v_first->>'claimed')::boolean then raise exception 'offset fallback denied'; end if;
  perform public.finish_push_reminder(v_id,(v_first->>'token')::uuid,false,true,true,v_now);
  if (select enabled or disabled_reason<>'invalid-push-endpoint' from public.push_subscriptions where id=v_id) then raise exception 'invalid endpoint not retired'; end if;
  if has_function_privilege('anon','public.claim_push_reminder(uuid,timestamptz)','execute')
    or has_function_privilege('authenticated','public.finish_push_reminder(uuid,uuid,boolean,boolean,boolean,timestamptz)','execute') then
    raise exception 'public claim privileges';
  end if;
  if not has_function_privilege('service_role','public.claim_push_reminder(uuid,timestamptz)','execute') then raise exception 'missing service privilege'; end if;
end;
$$;
rollback;
