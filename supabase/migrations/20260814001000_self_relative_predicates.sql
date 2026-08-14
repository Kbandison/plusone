-- Closing the probe leak.
--
-- The RLS helper predicates have to stay callable by `authenticated`: a policy
-- expression is evaluated as the querying role, so revoking them fails closed
-- on everything. But most of them took a viewer or user argument that was
-- ALWAYS auth.uid() in practice — which meant a member could substitute any
-- uuid and ask questions about other people:
--
--   is_admin(uuid)                     who moderates
--   is_premium(uuid)                   who pays
--   is_blocked_either_way(a, b)        whether two OTHER people have blocked
--   has_accepted_connect(a, b)         whether two OTHER people connected
--   is_member_of_room(user, room)      whether someone else is in a room
--   profile_mode(uuid)                 whether anyone is in support-only mode
--   can_view_profile(viewer, ...)      what someone else can see
--
-- The fix is not more revoking, it is taking the argument away. Each of these
-- now answers only about the caller, so the questions above become unaskable
-- rather than merely discouraged. What remains is "can I see X", "may I connect
-- to X", "am I blocked with X" — every one of which the interface already
-- answers by showing or not showing a button.
--
-- The two-argument originals stay, because SECURITY DEFINER functions call them
-- internally and run with their own rights, but they are revoked from anon and
-- authenticated so no session can reach them.

-- ── self-relative predicates ──────────────────────────────────────────────────

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.admin_users where user_id = (select auth.uid()));
$$;

comment on function public.is_admin() is
  'Am I an administrator. Takes no argument, so the roster cannot be probed.';

create or replace function public.i_am_in_room(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_member_of_room((select auth.uid()), p_room_id);
$$;

create or replace function public.i_am_in_chat(p_chat_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_chat_participant(p_chat_id, (select auth.uid()));
$$;

create or replace function public.i_have_connected_with(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.has_accepted_connect((select auth.uid()), p_other);
$$;

create or replace function public.i_can_view(
  p_target_id uuid,
  p_target_community public.condition_community,
  p_target_cross_opt_in boolean,
  p_target_mode public.member_mode,
  p_target_verification public.verification_status
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.can_view_profile(
    (select auth.uid()),
    p_target_id,
    p_target_community,
    p_target_cross_opt_in,
    p_target_mode,
    p_target_verification
  );
$$;

-- The compound predicate for connects.
--
-- One boolean over community, mode, blocks and room membership, rather than
-- three separately-askable facts. Even asked repeatedly it yields a mixed
-- answer: a false does not say which wall stopped it. And the initiator is
-- implicit, so it can only ever be asked about the caller's own reach — which
-- is exactly what the connect button already tells them.
create or replace function public.connect_permitted(
  p_target_id uuid,
  p_room_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := (select auth.uid());
  v_my_mode public.member_mode;
  v_their_mode public.member_mode;
begin
  if v_me is null or p_target_id is null or v_me = p_target_id then
    return false;
  end if;

  if public.is_blocked_either_way(v_me, p_target_id) then
    return false;
  end if;

  v_my_mode := public.profile_mode(v_me);
  v_their_mode := public.profile_mode(p_target_id);

  -- Nobody in dating mode may initiate toward a support-only member.
  if v_my_mode = 'dating' and v_their_mode = 'support_only' then
    return false;
  end if;

  -- Support-only outbound toward a dating member requires a shared room.
  if v_my_mode = 'support_only' and v_their_mode = 'dating' then
    return p_room_id is not null
      and public.is_member_of_room(v_me, p_room_id)
      and public.is_member_of_room(p_target_id, p_room_id);
  end if;

  return true;
end;
$$;

comment on function public.connect_permitted(uuid, uuid) is
  'May I connect to this member. Compound and self-relative: a false does not reveal which wall stopped it.';

-- Preview visibility, so `preview_profiles` stops calling is_blocked_either_way
-- directly from an invoker view.
create or replace function public.preview_permitted(p_target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select not public.is_blocked_either_way((select auth.uid()), p_target_id);
$$;

-- ── policies, restated against the self-relative versions ─────────────────────

drop policy "visible profiles are readable" on public.profiles;
create policy "visible profiles are readable"
  on public.profiles for select to authenticated
  using (public.i_can_view(id, community, cross_community_opt_in, mode, verification_status));

drop policy "connects respect every wall" on public.connects;
create policy "connects respect every wall"
  on public.connects for insert to authenticated
  with check (
    initiator_id = (select auth.uid())
    and status = 'pending'
    -- Every wall, in one call. The trigger re-checks the same rules on every
    -- insert path, so this is the declarative statement rather than the only
    -- enforcement.
    and public.connect_permitted(target_id, room_id)
  );

drop policy "admins read the audit log" on public.audit_log;
create policy "admins read the audit log"
  on public.audit_log for select to authenticated
  using (public.is_admin());

-- ── views, restated ───────────────────────────────────────────────────────────

create or replace view public.visible_profiles
with (security_invoker = true) as
select
  p.id,
  p.display_name,
  public.age_from_birthdate(p.birthdate) as age,
  public.age_band(p.birthdate) as age_band,
  p.gender,
  p.seeking,
  p.community,
  p.condition,
  p.u_equals_u,
  p.intention,
  p.mode,
  p.bio,
  p.prompts,
  p.photo_privacy,
  p.last_active_at,
  public.distance_mi(viewer.location, p.location) as distance_mi
from public.profiles p
cross join lateral (
  select location from public.profiles where id = (select auth.uid())
) viewer
where p.id <> (select auth.uid())
  and public.i_can_view(p.id, p.community, p.cross_community_opt_in, p.mode, p.verification_status);

create or replace view public.preview_profiles
with (security_invoker = true) as
select
  p.id,
  public.age_band(p.birthdate) as age_band,
  p.intention,
  public.distance_bucket_mi(viewer.location, p.location) as distance_bucket_mi
from public.profiles p
cross join lateral (
  select location from public.profiles where id = (select auth.uid())
) viewer
where p.id <> (select auth.uid())
  and p.mode = 'dating'
  and p.verification_status = 'verified'
  and public.preview_permitted(p.id)
  and exists (
    select 1 from public.profiles v
    where v.id = (select auth.uid())
      and v.mode = 'support_only'
      and v.verification_status = 'verified'
      and (
        v.community = p.community
        or (v.cross_community_opt_in and p.cross_community_opt_in)
      )
  );

create or replace view public.visible_profile_photos
with (security_invoker = true) as
select
  ph.user_id,
  ph.position,
  case
    when p.photo_privacy = 'clear'
      or public.i_have_connected_with(ph.user_id)
    then ph.storage_path
    else ph.blurred_path
  end as storage_path,
  (
    p.photo_privacy = 'blurred_until_connected'
    and not public.i_have_connected_with(ph.user_id)
  ) as is_blurred
from public.profile_photos ph
join public.profiles p on p.id = ph.user_id
where public.i_can_view(p.id, p.community, p.cross_community_opt_in, p.mode, p.verification_status);

-- ── room and chat policies, restated ──────────────────────────────────────────

drop policy "participants read their chats" on public.chats;
create policy "participants read their chats"
  on public.chats for select to authenticated
  using (public.i_am_in_chat(id));

drop policy "participants read chat messages" on public.messages;
create policy "participants read chat messages"
  on public.messages for select to authenticated
  using (public.i_am_in_chat(chat_id));

drop policy "participants write to open chats" on public.messages;
create policy "participants write to open chats"
  on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and public.i_am_in_chat(chat_id)
    and public.chat_accepts_messages(chat_id)
  );

drop policy "co-members are readable" on public.room_members;
create policy "co-members are readable"
  on public.room_members for select to authenticated
  using (public.i_am_in_room(room_id));

drop policy "room members read room messages" on public.room_messages;
create policy "room members read room messages"
  on public.room_messages for select to authenticated
  using (deleted_at is null and public.i_am_in_room(room_id));

drop policy "room members post to their rooms" on public.room_messages;
create policy "room members post to their rooms"
  on public.room_messages for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and deleted_at is null
    and public.i_am_in_room(room_id)
  );

-- ── grants ────────────────────────────────────────────────────────────────────
-- The self-relative versions are what a session may call.
grant execute on function public.is_admin() to authenticated;
grant execute on function public.i_am_in_room(uuid) to authenticated;
grant execute on function public.i_am_in_chat(uuid) to authenticated;
grant execute on function public.i_have_connected_with(uuid) to authenticated;
grant execute on function public.i_can_view(
  uuid, public.condition_community, boolean, public.member_mode, public.verification_status
) to authenticated;
grant execute on function public.connect_permitted(uuid, uuid) to authenticated;
grant execute on function public.preview_permitted(uuid) to authenticated;

-- The two-argument originals are now internal only. They are still called by
-- the SECURITY DEFINER functions above, which run with their own rights and do
-- not need the caller to hold EXECUTE.
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.is_admin(uuid)',
    'public.is_premium(uuid)',
    'public.profile_mode(uuid)',
    'public.is_blocked_either_way(uuid, uuid)',
    'public.has_accepted_connect(uuid, uuid)',
    'public.is_member_of_room(uuid, uuid)',
    'public.is_chat_participant(uuid, uuid)',
    'public.can_view_profile(uuid, uuid, public.condition_community, boolean, public.member_mode, public.verification_status)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', v_fn);
  end loop;
end;
$$;

-- shares_room is called by nothing at all — it survived as a helper that was
-- never used. Dead code with a grant on it is a door to a room that was never
-- built, and it is easier to delete than to keep explaining.
drop function if exists public.shares_room(uuid, uuid);

-- viewer_community() and chat_accepts_messages(uuid) already take no argument
-- about anyone else, and config_int / age_from_birthdate / age_band /
-- distance_mi / distance_bucket_mi are pure functions of what the caller
-- supplies. They stay as they are.
