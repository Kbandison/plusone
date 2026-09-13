-- Where a room notification should land.
--
-- `reply_received`, `like_received` and `mention_received` all carry
-- `path: "/app/rooms"` — the tab. Every chat event has a `pathFor` that opens
-- the thing itself; the room ones never did, so the tap lands somewhere and the
-- member goes hunting.
--
-- ── why they were left, which is a real constraint ─────────────────────────
--
-- `pathFor` receives ONE id and a thread lives at /app/rooms/<room>/<post>,
-- which needs two. The subject already travelling is the post id; the room id
-- has nowhere to ride. And the id is shape-checked as a uuid before it reaches
-- a path — deliberately, so a display name cannot be smuggled into one — so
-- "<room>/<post>" would be dropped by that guard, correctly.
--
-- This resolves the second id server-side instead. One uuid stays in the path.
--
-- ── it walks, because the data nests deeper than the render ────────────────
--
-- notifications.ts says a thread is "two levels deep and no deeper". That
-- describes what is DRAWN: answering a reply has nowhere to nest, so the reply
-- sits flat beside the others with the name in the box. `parent_id` still
-- records what was actually answered, and 6 of the 18 replies in this database
-- have a parent that is itself a reply. One hop would have landed a third of
-- them on a thread that does not exist.
--
-- ── security invoker, and this time it is the right call ───────────────────
--
-- room_messages' read policy is `deleted_at is null AND i_am_in_room(room_id)
-- AND NOT i_am_blocked_with(user_id)`. Running as the member makes that policy
-- the access check, so a post in a room they cannot see resolves to nothing and
-- the route 404s — and the rule cannot drift from the room screens because it
-- IS the room screens' rule.
--
-- Unlike my_nav_counts, which had to be a definer: that one needed `user_id`,
-- which is not granted because a post may be anonymous. This needs id, room_id
-- and parent_id, all three of which are granted, and it never counts rows.

create or replace function public.room_post_root(p_message_id uuid)
returns table (room_id uuid, root_id uuid)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with recursive up as (
    select m.id, m.room_id, m.parent_id, 0 as depth
      from public.room_messages m
     where m.id = p_message_id
    union all
    select m.id, m.room_id, m.parent_id, up.depth + 1
      from public.room_messages m
      join up on m.id = up.parent_id
     -- Bounded, so a cycle written by a future bug cannot hang a page load.
     -- Sixteen is far past anything the product can produce.
     where up.depth < 16
  )
  select up.room_id, up.id from up where up.parent_id is null limit 1;
$$;

revoke all on function public.room_post_root(uuid) from public, anon;
grant execute on function public.room_post_root(uuid) to authenticated;

comment on function public.room_post_root(uuid) is
  'The room and root post for any message in a thread, so a notification carrying one uuid can open the thread. security invoker: room_messages RLS is the access check, so an unreachable post resolves to nothing.';
