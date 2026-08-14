-- One meaning of "am I an admin".
--
-- The admin RPCs were written against is_admin(uuid), which 20260814001000
-- revoked from every session role. They still work — they run as their definer,
-- so the grant does not stop them — but two spellings of the same question is
-- how the two answers eventually differ.
--
-- Split into its own migration rather than appended to 20260814001000, which
-- was already applied: editing an applied file leaves the database and the
-- repository describing different schemas, and nothing complains.
-- They were written against is_admin(uuid), which is now revoked from every
-- session role. They run as their definer so the grant does not stop them, but
-- pointing them at the no-argument form keeps one meaning of "am I an admin"
-- rather than two that could drift.
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
  where public.is_admin()
    and p.verification_status in ('flagged', 'rejected')
  order by p.updated_at asc;
$$;

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
  if not public.is_admin() then
    raise exception 'not an administrator' using errcode = '42501';
  end if;

  select verification_status into v_current from public.profiles where id = p_user_id;

  if v_current is null then
    raise exception 'no such member' using errcode = 'P0002';
  end if;

  if v_current not in ('flagged', 'rejected') then
    raise exception 'member is not under review' using errcode = '22023';
  end if;

  v_next := case when p_approve then 'verified' else 'rejected' end;

  update public.profiles
  set verification_status = v_next,
      liveness_passed_at = case when p_approve then coalesce(liveness_passed_at, now()) else liveness_passed_at end,
      verified_at = case when p_approve then now() else verified_at end
  where id = p_user_id;

  update public.moderation_queue
  set status = 'resolved', resolved_at = now(), assigned_to = (select auth.uid())
  where subject_user_id = p_user_id and kind = 'verification_flag' and status = 'open';

  perform public.audit(
    'verification.decide', 'profile', p_user_id,
    jsonb_build_object('approved', p_approve, 'note', p_note, 'from', v_current, 'to', v_next)
  );

  return v_next;
end;
$$;

create or replace function public.admin_reveal_condition(p_user_id uuid, p_reason text)
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
  if not public.is_admin() then
    raise exception 'not an administrator' using errcode = '42501';
  end if;

  if p_reason is null or length(btrim(p_reason)) < 10 then
    raise exception 'a reason of at least 10 characters is required' using errcode = '22023';
  end if;

  -- Still one statement: the audit write and the read cannot come apart.
  return query
  with logged as (
    insert into public.audit_log (actor_id, action, subject_type, subject_id, metadata)
    values ((select auth.uid()), 'condition.reveal', 'profile', p_user_id,
            jsonb_build_object('reason', btrim(p_reason)))
    returning 1 as ok
  )
  select p.community, p.condition, p.u_equals_u
  from public.profiles p, logged
  where p.id = p_user_id;
end;
$$;

grant execute on function public.is_admin() to authenticated;
