-- The admin flag queue (§7.3, Decision #21).
--
-- Manual review happens ONLY on a risk flag. Everything here is scoped to that:
-- there is no admin path that lists members generally, and no admin path that
-- returns condition data without writing down why it was asked for.

-- ── who is flagged ────────────────────────────────────────────────────────────
-- Deliberately returns NO condition, community or U=U. §7.3: "NO condition data
-- displayed by default". A moderator deciding whether a selfie matches a face
-- has no use for someone's diagnosis, and the surest way to keep it off the
-- screen is to keep it out of the query.
create or replace function public.admin_flagged_verifications()
returns table (
  user_id uuid,
  display_name text,
  verification_status public.verification_status,
  appeal_opened_at timestamptz,
  flagged_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p.id,
    p.display_name,
    p.verification_status,
    (
      select min(m.created_at) from public.moderation_queue m
      where m.subject_user_id = p.id and m.kind = 'verification_flag' and m.status = 'open'
    ),
    p.updated_at
  from public.profiles p
  where public.is_admin((select auth.uid()))
    and p.verification_status in ('flagged', 'rejected')
  order by p.updated_at asc;
$$;

-- ── decide ────────────────────────────────────────────────────────────────────
-- The state machine in packages/logic/verification decides what a transition
-- means; this is the write, restated where the database can enforce who may
-- make it. A member can be verified out of 'rejected' — Decision #21's appeal
-- path is never closed, and closing it here would close it everywhere.
create or replace function public.admin_decide_verification(
  p_user_id uuid,
  p_approve boolean,
  p_note text default null
)
returns public.verification_status
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current public.verification_status;
  v_next public.verification_status;
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'not an administrator' using errcode = '42501';
  end if;

  select verification_status into v_current from public.profiles where id = p_user_id;

  if v_current is null then
    raise exception 'no such member' using errcode = 'P0002';
  end if;

  -- Only a member under review is an administrator's to decide. Verifying
  -- somebody who never failed a check is not review, it is a bypass.
  if v_current not in ('flagged', 'rejected') then
    raise exception 'member is not under review' using errcode = '22023';
  end if;

  v_next := case when p_approve then 'verified' else 'rejected' end;

  update public.profiles
  set verification_status = v_next,
      verified_at = case when p_approve then now() else verified_at end
  where id = p_user_id;

  update public.moderation_queue
  set status = 'resolved', resolved_at = now(), assigned_to = (select auth.uid())
  where subject_user_id = p_user_id and kind = 'verification_flag' and status = 'open';

  perform public.audit(
    'verification.decide',
    'profile',
    p_user_id,
    jsonb_build_object('approved', p_approve, 'note', p_note, 'from', v_current, 'to', v_next)
  );

  return v_next;
end;
$$;

-- ── reveal ────────────────────────────────────────────────────────────────────
-- §7.3: "reveal requires explicit reason logged".
--
-- The audit write and the read are ONE statement. A data-modifying CTE always
-- executes when it is referenced, and the select joins it — so there is no way
-- to obtain the condition data without the log entry, and no later edit can
-- separate them without visibly rewriting the query. A function that logged
-- first and selected second would be two statements, and two statements can
-- become one.
create or replace function public.admin_reveal_condition(
  p_user_id uuid,
  p_reason text
)
returns table (
  community public.condition_community,
  condition public.condition_detail,
  u_equals_u boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'not an administrator' using errcode = '42501';
  end if;

  -- A reason nobody could act on is not a reason. Ten characters is not a high
  -- bar; it is enough that "." and "x" do not clear it.
  if p_reason is null or length(btrim(p_reason)) < 10 then
    raise exception 'a reason of at least 10 characters is required'
      using errcode = '22023';
  end if;

  return query
  with logged as (
    insert into public.audit_log (actor_id, action, subject_type, subject_id, metadata)
    values (
      (select auth.uid()),
      'condition.reveal',
      'profile',
      p_user_id,
      jsonb_build_object('reason', btrim(p_reason))
    )
    returning 1 as ok
  )
  select p.community, p.condition, p.u_equals_u
  from public.profiles p, logged
  where p.id = p_user_id;
end;
$$;

comment on function public.admin_reveal_condition(uuid, text) is
  'Returns condition data and writes the audit entry in the same statement, so the two cannot be separated.';

-- ── grants ────────────────────────────────────────────────────────────────────
-- Granted to every authenticated caller; each function checks is_admin() itself
-- and raises. Gating on the grant alone would mean a role change silently
-- opening a door rather than a check failing loudly.
grant execute on function public.admin_flagged_verifications() to authenticated;
grant execute on function public.admin_decide_verification(uuid, boolean, text) to authenticated;
grant execute on function public.admin_reveal_condition(uuid, text) to authenticated;

-- Administrators can already read the audit log: the policy is in
-- 20260813000500_rls.sql and the grant in 20260813000700_grants.sql. Repeating
-- either here is not idempotent — CREATE POLICY has no OR REPLACE — and an
-- earlier draft of this file failed on exactly that.
