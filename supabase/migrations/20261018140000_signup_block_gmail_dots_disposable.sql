-- Database-level sign-up block, extending the Sep 11 mailbox guard
-- (20260911010000_auth_mailbox_claims.sql):
--
--   1. Gmail look-alikes: canonical_auth_mailbox() now also folds dots for
--      gmail.com/googlemail.com (Gmail delivers j.smith@ and jsmith@ to the
--      same inbox) and maps googlemail.com -> gmail.com. Other domains keep
--      their dots. Claims are re-keyed additively under the same table lock:
--      existing look-alike accounts are grandfathered into one claim and keep
--      login/recovery access. Old dotted-Gmail claim rows are left in place —
--      nothing looks them up any more, so they are inert.
--   2. Throwaway inboxes: a new auth user (or an email change) on a disposable
--      domain is rejected. Keep the list in step with DISPOSABLE_DOMAINS in
--      lib/emailCheck.js (lib/emailCheck.test.js checks this file).
--
-- The triggers are the race-safe enforcement point and apply even when the
-- site's /api/auth/signup-check precheck is skipped (direct Supabase signUp).
-- before_user_created_mailbox_guard() — the optional Before User Created hook
-- that turns these into friendly 422 messages — learns the disposable rule too.
lock table auth.users in share row exclusive mode;

create or replace function public.is_disposable_email(email text)
returns boolean language sql immutable strict set search_path = ''
as $$
  with d as (select lower(split_part(btrim(email), '@', 2)) as domain)
  select exists (
    select 1 from d, unnest(array[
      '10minutemail.com', '10minutemail.net', '1secmail.com', '1secmail.net', '1secmail.org',
      'burnermail.io', 'discard.email', 'dispostable.com', 'emailondeck.com', 'fakeinbox.com',
      'getairmail.com', 'getnada.com', 'guerrillamail.biz', 'guerrillamail.com', 'guerrillamail.de',
      'guerrillamail.info', 'guerrillamail.net', 'guerrillamail.org', 'guerrillamailblock.com', 'grr.la',
      'harakirimail.com', 'inboxkitten.com', 'mailcatch.com', 'maildrop.cc', 'mailinator.com',
      'mailnesia.com', 'mailpoof.com', 'mintemail.com', 'moakt.com', 'mohmal.com',
      'mytemp.email', 'nada.email', 'sharklasers.com', 'spamgourmet.com', 'temp-mail.io',
      'temp-mail.org', 'tempail.com', 'tempmail.com', 'tempmail.net', 'tempmailo.com',
      'tempr.email', 'throwawaymail.com', 'trashmail.com', 'trashmail.de', 'yopmail.com',
      'yopmail.fr', 'yopmail.net'
    ]::text[]) as blocked(name)
    where d.domain = blocked.name or d.domain like '%.' || blocked.name
  )
$$;
revoke all on function public.is_disposable_email(text) from public, anon, authenticated, service_role;

create or replace function public.canonical_auth_mailbox(email text)
returns text language sql immutable strict set search_path = ''
as $$
  with parts as (
    select lower(split_part(split_part(btrim(email), '@', 1), '+', 1)) as local_part,
           lower(split_part(btrim(email), '@', 2)) as domain
    where strpos(btrim(email), '@') > 1
  )
  select case when domain in ('gmail.com', 'googlemail.com')
              then replace(local_part, '.', '') || '@gmail.com'
              else local_part || '@' || domain end
  from parts
$$;

-- Re-key claims additively: every account lands in its new mailbox's claim.
insert into public.auth_mailbox_claims as claims (mailbox, user_ids)
select public.canonical_auth_mailbox(email), array_agg(id order by id)
from auth.users
where public.canonical_auth_mailbox(email) is not null
group by public.canonical_auth_mailbox(email)
on conflict (mailbox) do update
  set user_ids = (
    select array_agg(distinct u order by u)
    from unnest(claims.user_ids || excluded.user_ids) as u
  );

create or replace function public.guard_disposable_auth_email()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.email is not null
     and (tg_op = 'INSERT' or new.email is distinct from old.email)
     and public.is_disposable_email(new.email) then
    raise exception 'Please use an email address you''ll keep. Temporary inboxes are not supported.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_disposable_auth_email() from public, anon, authenticated, service_role;

drop trigger if exists auth_disposable_email_guard on auth.users;
create trigger auth_disposable_email_guard
before insert or update of email on auth.users
for each row execute function public.guard_disposable_auth_email();

create or replace function public.before_user_created_mailbox_guard(event jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  if public.is_disposable_email(event->'user'->>'email') then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 422,
      'message', 'Please use an email address you''ll keep. Temporary inboxes are not supported.'
    ));
  end if;
  if exists (
    select 1 from public.auth_mailbox_claims
    where mailbox = public.canonical_auth_mailbox(event->'user'->>'email')
  ) then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 422,
      'message', 'An account for this mailbox already exists. Sign in or reset your password.'
    ));
  end if;
  return '{}'::jsonb;
end;
$$;
revoke all on function public.before_user_created_mailbox_guard(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.before_user_created_mailbox_guard(jsonb) to supabase_auth_admin;
