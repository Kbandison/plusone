-- What the nav bar needs to show a count, in one round trip.
--
-- Kevin asked for a badge on Inbox and on Rooms, visible only when there is
-- something unread. Neither number existed: `room_activity` returns a per-room
-- BOOLEAN, and the inbox derives per-thread booleans in the page.
--
-- ── the two definitions, and why they are not the same shape ───────────────
--
-- MESSAGES is every unread message, not every thread with one. Kevin's call:
-- "16" says how much is waiting, where "3" says how many people are.
--
-- REPLIES is replies TO THE MEMBER'S OWN POSTS, and that is the more
-- consequential choice. Counting all unread room posts would have been simpler
-- and would have read 118 today, because Latest news holds 117 articles against
-- 1 reply — a number the news cron sets rather than a person, and one that would
-- never reach zero. §3.3 forbids the app nudging somebody back for general
-- activity; it says nothing about telling them another member answered them.
-- Those are different products and the second is the one this app is.
--
-- ── security invoker, so the walls are the ones the screens use ────────────
--
-- No definer here. `messages` and `room_messages` both carry RLS that already
-- restricts a caller to their own chats and their own community's rooms, so the
-- counts inherit exactly what the member can see — the same reasoning
-- room_activity's comment gives. A definer would need to re-derive both walls
-- and would be a second set of rules to keep in step.
--
-- ── LEFT JOIN on the read rows, deliberately ───────────────────────────────
--
-- A chat or a room the member has never opened has NO row in chat_reads or
-- room_reads. An inner join would score those zero, which is the exact opposite
-- of the truth: nothing read means everything unread. Null last_read_at
-- therefore counts the lot.

create or replace function public.my_nav_counts()
returns table (messages integer, replies integer)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    -- Unread messages. Own messages never count, and a deleted one is not
    -- waiting for anybody — `messages.deleted_at` is how unsend redacts.
    (
      select count(*)::integer
        from public.messages m
        left join public.chat_reads cr
          on cr.chat_id = m.chat_id and cr.user_id = (select auth.uid())
       where m.sender_id is distinct from (select auth.uid())
         and m.deleted_at is null
         and (cr.last_read_at is null or m.created_at > cr.last_read_at)
    ),
    -- Replies under the member's own posts. A reply to somebody else's post is
    -- discussion; a reply to yours is addressed to you.
    (
      select count(*)::integer
        from public.room_messages reply
        join public.room_messages post on post.id = reply.parent_id
        left join public.room_reads rd
          on rd.room_id = reply.room_id and rd.user_id = (select auth.uid())
       where post.user_id = (select auth.uid())
         and post.deleted_at is null
         and reply.user_id is distinct from (select auth.uid())
         and reply.deleted_at is null
         and (rd.last_read_at is null or reply.created_at > rd.last_read_at)
    );
$$;

revoke all on function public.my_nav_counts() from public, anon;
grant execute on function public.my_nav_counts() to authenticated;

comment on function public.my_nav_counts() is
  'Unread messages, and unread replies to the caller''s own room posts. security invoker so both counts inherit the RLS the screens read through. Replies only — counting room POSTS would be dominated by the news cron and would never reach zero.';
