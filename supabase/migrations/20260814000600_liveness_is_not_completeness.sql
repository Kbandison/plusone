-- `profiles_complete_when_verified` tied two different things together, and the
-- admin queue found it: liveness runs at step 2 of §7.2, BEFORE basics, so a
-- member flagged at liveness has an entirely empty profile. An administrator
-- approving that member set verification_status = 'verified' and hit the
-- constraint — a raw 23514 in the moderation queue, for doing the one thing the
-- queue exists to do.
--
-- The conflation was mine. "Passed the identity check" and "finished onboarding"
-- are different facts with different timing, and one column cannot carry both.
--
--   liveness_passed_at  the check succeeded. Set by the member's own attempt or
--                       by an administrator upholding an appeal.
--   onboarded_at        every §7.2 step is done. Set once, at the last one.
--
-- The completeness invariant now hangs off onboarded_at, which is the fact it
-- was always about.

alter table public.profiles
  add column if not exists liveness_passed_at timestamptz,
  add column if not exists onboarded_at timestamptz;

comment on column public.profiles.liveness_passed_at is
  'When the selfie check passed. Independent of whether onboarding is finished.';
comment on column public.profiles.onboarded_at is
  'When the last §7.2 step was completed. Null while onboarding is in progress.';

alter table public.profiles
  drop constraint profiles_complete_when_verified;

alter table public.profiles
  add constraint profiles_complete_when_onboarded check (
    onboarded_at is null
    or (
      display_name is not null
      and birthdate is not null
      and community is not null
      and condition is not null
      and intention is not null
      and search_radius_mi is not null
    )
  );

comment on constraint profiles_complete_when_onboarded on public.profiles is
  'Finished onboarding means every §7.2 answer is present. Half-finished profiles are never marked done.';

-- Visibility does not depend on the constraint above and never did. A profile
-- with a null community cannot match the community wall in can_view_profile(),
-- so an unfinished profile is unreachable whatever its verification status —
-- which is why relaxing this is safe rather than merely convenient.

-- Backfill: anyone already verified passed liveness by definition.
update public.profiles
set liveness_passed_at = coalesce(liveness_passed_at, verified_at, updated_at)
where verification_status = 'verified' and liveness_passed_at is null;

-- ── the decision, restated ────────────────────────────────────────────────────
-- Approving a flagged member records that they passed the check. It does not
-- pretend they finished signing up, and it no longer explodes when they have
-- not.
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
    'verification.decide',
    'profile',
    p_user_id,
    jsonb_build_object('approved', p_approve, 'note', p_note, 'from', v_current, 'to', v_next)
  );

  return v_next;
end;
$$;
