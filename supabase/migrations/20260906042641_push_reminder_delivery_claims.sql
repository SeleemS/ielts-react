-- Apply before the leased push cron caller. Existing delivery history is unchanged.
alter table public.push_subscriptions
  add column delivery_claim_token uuid,
  add column delivery_claim_until timestamptz;

create function public.claim_push_reminder(p_subscription_id uuid,
  p_now timestamptz default clock_timestamp()) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_row public.push_subscriptions%rowtype;
  v_local timestamp;
  v_sent_local timestamp;
  v_zone text;
  v_token uuid;
begin
  if current_user not in ('service_role','postgres','supabase_admin') then
    raise exception 'service role required' using errcode='42501';
  end if;
  if p_now is null then raise exception 'current time required'; end if;
  select * into v_row from public.push_subscriptions where id=p_subscription_id for update;
  if not found or not v_row.enabled or v_row.failures >= 5
    or v_row.delivery_claim_until > p_now then
    return jsonb_build_object('claimed',false);
  end if;
  select name into v_zone from pg_catalog.pg_timezone_names where name=v_row.time_zone;
  if v_zone is not null then
    v_local := p_now at time zone v_zone;
    v_sent_local := v_row.last_sent_at at time zone v_zone;
  else
    v_local := (p_now at time zone 'UTC') + coalesce(v_row.tz_offset_minutes,0)*interval '1 minute';
    v_sent_local := (v_row.last_sent_at at time zone 'UTC') + coalesce(v_row.tz_offset_minutes,0)*interval '1 minute';
  end if;
  if extract(hour from v_local)::int <> v_row.reminder_hour_local
    or v_sent_local::date = v_local::date then
    return jsonb_build_object('claimed',false);
  end if;
  v_token := gen_random_uuid();
  update public.push_subscriptions set delivery_claim_token=v_token,
    delivery_claim_until=p_now+interval '10 minutes' where id=p_subscription_id;
  return jsonb_build_object('claimed',true,'token',v_token,'subscription',to_jsonb(v_row));
end;
$$;

create function public.finish_push_reminder(p_subscription_id uuid, p_token uuid,
  p_sent boolean, p_gone boolean, p_invalid_endpoint boolean default false,
  p_now timestamptz default clock_timestamp()) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare v_count integer;
begin
  if current_user not in ('service_role','postgres','supabase_admin') then
    raise exception 'service role required' using errcode='42501';
  end if;
  if p_now is null or p_sent is null or p_gone is null or p_invalid_endpoint is null then
    raise exception 'completion outcome required';
  end if;
  update public.push_subscriptions set
    last_sent_at=case when p_sent then p_now else last_sent_at end,
    failures=case when p_sent then 0 else failures+1 end,
    -- Never re-enable a row that the user disabled during delivery.
    enabled=enabled and (p_sent or (not p_gone and not p_invalid_endpoint and failures+1<5)),
    disabled_reason=case
      when not enabled then disabled_reason
      when p_sent then null
      when p_invalid_endpoint then 'invalid-push-endpoint'
      when p_gone then 'push-gone'
      when failures+1>=5 then 'too-many-failures'
      else disabled_reason end,
    delivery_claim_token=null, delivery_claim_until=null, updated_at=p_now
  where id=p_subscription_id and delivery_claim_token=p_token;
  get diagnostics v_count = row_count;
  return v_count=1;
end;
$$;

revoke all on function public.claim_push_reminder(uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.finish_push_reminder(uuid,uuid,boolean,boolean,boolean,timestamptz) from public,anon,authenticated;
grant execute on function public.claim_push_reminder(uuid,timestamptz) to service_role;
grant execute on function public.finish_push_reminder(uuid,uuid,boolean,boolean,boolean,timestamptz) to service_role;
