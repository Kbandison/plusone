-- A block did not reach the rooms.
--
-- `room_messages` was readable on `deleted_at is null and i_am_in_room(...)`
-- and carried no block term, so someone a member had blocked kept appearing in
-- their feed every day, and the member kept appearing in theirs. Meanwhile
-- 20260813000200 says, above the blocks index: "Blocks are checked in both
-- directions on every visibility test."
--
-- The spec requires blocks in visible_profiles (§5.3) and is silent on rooms,
-- so this is a deliberate widening rather than a missed requirement — and it is
-- the kind that should be easy to reverse, so it is one policy and one
-- predicate. **KEVIN: this changes what members see. Say if you want it back.**
--
-- The argument for it: a member who blocks someone after being harassed, and
-- then reads that person in a support room every day, has been given a control
-- that does not control anything. Rooms here are a flat feed with no threading,
-- so a hidden post leaves no visible gap to puzzle over.
--
-- It filters reads, NOT writes. Blocking is one member's decision about their
-- own view; it is not a way to silence someone in a shared room, and a block
-- that removed another member's voice for everybody would be a moderation
-- action wearing a safety control's clothes.

create or replace function public.i_am_blocked_with(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_blocked_either_way((select auth.uid()), p_other);
$$;

comment on function public.i_am_blocked_with(uuid) is
  'Self-relative: is there a block in either direction between the caller and p_other. The two-argument original stays internal so the block list cannot be probed about third parties.';

revoke all on function public.i_am_blocked_with(uuid) from public, anon;
grant execute on function public.i_am_blocked_with(uuid) to authenticated;

drop policy "room members read room messages" on public.room_messages;
create policy "room members read room messages"
  on public.room_messages for select to authenticated
  using (
    deleted_at is null
    and public.i_am_in_room(room_id)
    -- Your own posts are never hidden from you, and a block against yourself
    -- cannot exist (blocks_no_self), so this is only ever about other people.
    and not public.i_am_blocked_with(user_id)
  );
