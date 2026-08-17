-- Decision #21's appeal path had a reducer and no door.
--
-- packages/logic/verification implements `open_appeal` carefully — it reads
-- status and nothing else, so "the appeal path is never locked behind the thing
-- being appealed" holds, and it distinguishes an OPEN appeal from an
-- ever-opened one so a member gets more than one in their life. Nothing called
-- it. There was no column to record an appeal, no RPC to open one, and no
-- control anywhere in the app.
--
-- What a rejected member actually got was the flagged screen: "The automatic
-- check could not decide. Someone on our team will review it, usually within a
-- day. You do not need to do anything." Every clause of that is false for them
-- — the check did decide, the review already happened, and doing nothing
-- changes nothing — and admin_decide_verification leaves liveness_passed_at
-- null on a rejection, so resolveStep returns them to that screen forever.
--
-- Two columns and one RPC.

alter table public.profiles
  add column if not exists appeal_opened_at timestamptz,
  add column if not exists appeal_decided_at timestamptz;

comment on column public.profiles.appeal_opened_at is
  'When this member last asked a human to look again (Decision #21). Set by '
  'open_verification_appeal, cleared to a decided state by admin_decide_verification.';

-- Deliberately NOT in the members'' update grant: a member who can set their own
-- appeal timestamps can also clear an administrator's decision.

/**
 * A member asking for a human to look again.
 *
 * Mirrors the reducer's rule rather than inventing a second one:
 *   - only a member under review may appeal (flagged or rejected)
 *   - an appeal already OPEN cannot be opened twice
 *   - an appeal already DECIDED does not block a new one, because the rejection
 *     itself has to be appealable or the path is locked behind its own outcome
 */
create or replace function public.open_verification_appeal()
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_status public.verification_status;
  v_opened timestamptz;
  v_decided timestamptz;
  v_now timestamptz := now();
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select verification_status, appeal_opened_at, appeal_decided_at
    into v_status, v_opened, v_decided
    from public.profiles where id = v_uid;

  if v_status is null then
    raise exception 'no such member' using errcode = 'P0002';
  end if;

  if v_status not in ('flagged', 'rejected') then
    raise exception 'no review to appeal' using errcode = 'P0001';
  end if;

  -- Open, not ever-opened. Testing "has ever appealed" would give each member
  -- exactly one appeal in their life, and would make the rejection that
  -- followed their first appeal unappealable — the trap Decision #21 names.
  if v_opened is not null and (v_decided is null or v_decided < v_opened) then
    raise exception 'an appeal is already open' using errcode = 'P0001';
  end if;

  update public.profiles
     set appeal_opened_at = v_now
   where id = v_uid;

  -- Puts it in front of a human. One open entry per member per kind, matching
  -- what queue_verification_flag does for the flag itself.
  insert into public.moderation_queue (kind, subject_user_id, status, created_at)
  select 'verification_flag', v_uid, 'open', v_now
  where not exists (
    select 1 from public.moderation_queue
     where kind = 'verification_flag' and subject_user_id = v_uid and status = 'open'
  );

  return v_now;
end;
$$;

revoke all on function public.open_verification_appeal() from public, anon;
grant execute on function public.open_verification_appeal() to authenticated;

-- The queue said "Appealed" about everyone.
--
-- appeal_opened_at was `min(moderation_queue.created_at)` — the moment the
-- member was FLAGGED, written by the trigger. The admin UI showed "Appealed
-- <date>" whenever it was non-null, which was every open row, while no appeal
-- mechanism existed at all. Now that one does, the column can mean what it says.
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
    -- The member's own appeal, and only if it is still open.
    case
      when p.appeal_opened_at is not null
       and (p.appeal_decided_at is null or p.appeal_decided_at < p.appeal_opened_at)
      then p.appeal_opened_at
    end,
    (select min(m.created_at)
       from public.moderation_queue m
      where m.kind = 'verification_flag'
        and m.subject_user_id = p.id
        and m.status = 'open')
  from public.profiles p
  where public.is_admin()
    and p.verification_status in ('flagged', 'rejected')
  order by 5 asc nulls last;
$$;

revoke all on function public.admin_flagged_verifications() from public, anon;
grant execute on function public.admin_flagged_verifications() to authenticated;

-- An administrator's decision closes any open appeal.
--
-- Without this, appeal_opened_at stays ahead of appeal_decided_at forever: the
-- member could never open a second appeal, and the queue would keep showing
-- theirs as pending after it had been ruled on. The rest of the body is
-- unchanged from 20260814000500 — only liveness_passed_at on approval and the
-- appeal close are added.
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

  -- Only a member under review is an administrator's to decide. Verifying
  -- somebody who never failed a check is not review, it is a bypass.
  if v_current not in ('flagged', 'rejected') then
    raise exception 'member is not under review' using errcode = '22023';
  end if;

  v_next := case when p_approve then 'verified' else 'rejected' end;

  update public.profiles
  set verification_status = v_next,
      verified_at = case when p_approve then now() else verified_at end,
      -- An upheld appeal has to move the member PAST the liveness step, not
      -- just relabel them. resolveStep reads liveness_passed_at, so without
      -- this an approved member is sent straight back to the selfie screen.
      liveness_passed_at = case when p_approve then coalesce(liveness_passed_at, now()) else liveness_passed_at end,
      appeal_decided_at = case when appeal_opened_at is not null then now() else appeal_decided_at end
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

revoke all on function public.admin_decide_verification(uuid, boolean, text) from public, anon;
grant execute on function public.admin_decide_verification(uuid, boolean, text) to authenticated;
