-- SECURITY FIX.
--
-- Supabase sets default privileges so that every new function in `public` is
-- granted EXECUTE to anon, authenticated and service_role. `revoke all ... from
-- public` does not touch those, because they are explicit grants to named roles
-- rather than the PUBLIC pseudo-role.
--
-- The result: all 33 SECURITY DEFINER functions were callable by any signed-in
-- member, and by anyone at all. Most are harmless — they check the caller
-- themselves — but three were not:
--
--   purge_due_deletions    deletes accounts. Any member could purge every
--                          account whose 7-day window had elapsed.
--   sweep_expired_fuses    closes chats across the whole system.
--   sweep_expired_connects the same for connects.
--   audit                  writes the audit log. Forgeable log entries make the
--                          log worse than useless: it would still look intact.
--
-- Two layers, because the grant is the thing that failed:
--   1. revoke from anon and authenticated by name;
--   2. an internal guard, so a re-granted function is still refused.

-- ── the guard ─────────────────────────────────────────────────────────────────
-- A cron call arrives as service_role, where auth.uid() is null. Any call with a
-- member behind it has a uid, and none of these are a member's to make.
create or replace function public.assert_not_end_user(p_what text)
returns void
language plpgsql
stable
as $$
begin
  if (select auth.uid()) is not null then
    raise exception '% is not callable by a member', p_what using errcode = '42501';
  end if;
end;
$$;

comment on function public.assert_not_end_user(text) is
  'Refuses any call made on behalf of a signed-in member. Defence in depth behind the grants.';

create or replace function public.sweep_expired_fuses()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_closed integer;
begin
  perform public.assert_not_end_user('sweep_expired_fuses');

  with swept as (
    update public.chats
    set status = 'closed_fuse',
        fuse_expires_at = null,
        closure_template = coalesce(closure_template, 0),
        closed_at = now(),
        closed_by = null
    where status = 'open'
      and fuse_expires_at is not null
      and fuse_expires_at <= now()
    returning id
  )
  select count(*)::integer into v_closed from swept;

  return v_closed;
end;
$$;

create or replace function public.sweep_expired_connects()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_expired integer;
begin
  perform public.assert_not_end_user('sweep_expired_connects');

  with swept as (
    update public.connects
    set status = 'expired', decided_at = now()
    where status = 'pending' and expires_at <= now()
    returning id
  )
  select count(*)::integer into v_expired from swept;

  return v_expired;
end;
$$;

create or replace function public.purge_due_deletions()
returns table (purged_user_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_not_end_user('purge_due_deletions');

  return query
  with due as (
    select user_id from public.deletion_requests
    where status = 'requested' and purge_after <= now()
    for update skip locked
  ),
  marked as (
    update public.deletion_requests d
    set status = 'purged', purged_at = now()
    from due where d.user_id = due.user_id
    returning d.user_id
  ),
  gone as (
    delete from auth.users u using marked where u.id = marked.user_id
    returning u.id
  )
  select gone.id from gone;
end;
$$;

-- ── revoke what no member should reach ────────────────────────────────────────
-- `audit` is called by other SECURITY DEFINER functions, which run as their
-- owner and so do not need the caller to hold EXECUTE. Nothing legitimate calls
-- it directly from a session.
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.sweep_expired_fuses()',
    'public.sweep_expired_connects()',
    'public.purge_due_deletions()',
    'public.fuses_expiring_within(integer)',
    'public.audit(text, text, uuid, jsonb)',
    'public.create_profile_for_new_user()',
    'public.enforce_connect_rules()',
    'public.assert_not_end_user(text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', v_fn);
  end loop;
end;
$$;

grant execute on function public.sweep_expired_fuses() to service_role;
grant execute on function public.sweep_expired_connects() to service_role;
grant execute on function public.purge_due_deletions() to service_role;
grant execute on function public.fuses_expiring_within(integer) to service_role;
grant execute on function public.audit(text, text, uuid, jsonb) to service_role;

-- ── what deliberately stays reachable, and why ────────────────────────────────
-- The RLS helper predicates — can_view_profile, is_blocked_either_way,
-- profile_mode, shares_room, is_member_of_room, is_chat_participant,
-- chat_accepts_messages, viewer_community, has_accepted_connect, is_premium,
-- is_admin, config_int, age_from_birthdate and friends — MUST remain executable
-- by authenticated. A policy expression is evaluated as the querying role, so
-- revoking these breaks every policy that calls them, which fails closed but
-- fails on everything.
--
-- The cost is honest and worth writing down: a member who knows another
-- member's uuid can call profile_mode() or is_premium() and learn a fact the UI
-- would not show them. That is a small leak inherent to putting the wall in a
-- function, and the wall is worth more than the leak. It is not a reason to
-- pretend the leak is not there.
--
-- The mutating RPCs — create_connect, accept_connect, close_chat, switch_mode,
-- request_deletion and the rest — stay granted because members are their
-- callers. Every one checks auth.uid() itself and acts only on the caller's own
-- rows; the grant is not what protects them.

revoke all on function public.assert_not_end_user(text) from public, anon, authenticated;
grant execute on function public.assert_not_end_user(text) to service_role;
