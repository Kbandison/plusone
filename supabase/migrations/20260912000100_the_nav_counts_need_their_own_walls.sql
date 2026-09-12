-- my_nav_counts could not run as the member. It raised, and the nav showed
-- nothing at all.
--
--   permission denied for table room_messages
--
-- ── two reasons, and the second is the one that matters ────────────────────
--
-- 1. `count(*)` needs SELECT on the TABLE. `authenticated` has no table-level
--    SELECT on room_messages — only column-level, on thirteen columns. This is
--    why `room_activity` gets away with `security invoker` and this did not:
--    that function selects `max(rm.created_at)`, a named column, and never
--    counts rows. I read its `security invoker` and copied the conclusion
--    without checking the thing that made it legal.
--
-- 2. `user_id` IS NOT ONE OF THE THIRTEEN. A room post can be anonymous —
--    `anonymous` and `author_alias` are columns on this table — so authorship
--    is deliberately withheld from members. "Replies to MY posts" therefore
--    cannot be expressed as the member AT ALL, at any cost. It is not a grant
--    that was forgotten; it is the anonymity of the rooms.
--
-- So: definer, and the walls written out rather than inherited.
--
-- ── what the walls are, now they are explicit ──────────────────────────────
--
-- A definer runs as the owner and does not see RLS, so every restriction the
-- invoker version got for free has to be stated:
--
--   messages   `i_am_in_chat` — the same helper the chat policies use, so this
--              cannot drift from them.
--   replies    membership of the room the reply sits in. `post.user_id = me`
--              nearly suffices, since somebody who posted there could see it —
--              but a member who has since changed community would keep a badge
--              they cannot open, and a count that cannot be cleared is worse
--              than no count.

create or replace function public.my_nav_counts()
returns table (messages integer, replies integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    (
      select count(m.id)::integer
        from public.messages m
        left join public.chat_reads cr
          on cr.chat_id = m.chat_id and cr.user_id = (select auth.uid())
       where public.i_am_in_chat(m.chat_id)
         and m.sender_id is distinct from (select auth.uid())
         and m.deleted_at is null
         and (cr.last_read_at is null or m.created_at > cr.last_read_at)
    ),
    (
      select count(reply.id)::integer
        from public.room_messages reply
        join public.room_messages post on post.id = reply.parent_id
        left join public.room_reads rd
          on rd.room_id = reply.room_id and rd.user_id = (select auth.uid())
       where post.user_id = (select auth.uid())
         and post.deleted_at is null
         and reply.user_id is distinct from (select auth.uid())
         and reply.deleted_at is null
         and exists (
           select 1 from public.room_members rmem
            where rmem.room_id = reply.room_id
              and rmem.user_id = (select auth.uid())
         )
         and (rd.last_read_at is null or reply.created_at > rd.last_read_at)
    );
$$;

revoke all on function public.my_nav_counts() from public, anon;
grant execute on function public.my_nav_counts() to authenticated;

comment on function public.my_nav_counts() is
  'Unread messages, and unread replies to the caller''s own room posts. DEFINER, because room_messages.user_id is not granted to members — a room post may be anonymous — so authorship cannot be read as the caller. The walls are therefore explicit: i_am_in_chat for messages, room membership for replies.';
