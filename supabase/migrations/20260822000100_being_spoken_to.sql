-- Being spoken to, and being told about it.
--
-- A room thread is two levels deep and no more: a post, comments on it, and
-- replies under each comment. enforce_flat_comments refuses a third. So
-- answering a REPLY has nowhere to nest, and the product does what a threaded
-- conversation does once you stop drawing the indent — it puts the person's
-- name in the box, and the reply sits beside the others saying who it is for.
--
-- That worked for reading and not at all for telling. The row nests under the
-- COMMENT, so reply_received went to whoever wrote the comment, and the person
-- actually being answered — whose name is at the front of the message — got
-- nothing at all. Three people in a thread and only two of them were ever told.
--
-- ── why the resolving happens here ───────────────────────────────────────────
--
-- room_messages.user_id is REVOKED from members. That is the whole anonymity
-- mechanism: an anonymous post shows an alias, the alias is per-room, and
-- nothing a member can call maps one back to a person.
--
-- A mention has to make exactly that hop. So it makes it in here, behind a
-- function no member may execute, and the answer never travels back to anybody
-- — it is used to write a notification for the person named and is then gone.
-- A version of this that returned ids to the client would be a way to ask "is
-- Cedar the same person as Willow", and that question has no price at which it
-- gets an answer.

create or replace function public.mentioned_members(
  p_room_id uuid,
  p_actor uuid,
  p_names text[]
)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select distinct m.user_id
    from public.room_messages m
    left join public.profiles p on p.id = m.user_id
   where m.room_id = p_room_id
     and m.user_id is not null
     and m.deleted_at is null
     -- Never the sender. notify_member refuses a self-notification when it has
     -- an actor to compare against, and an anonymous mention deliberately has
     -- none — so tagging yourself would have got through.
     and m.user_id <> p_actor
     -- Both spellings of a name in a room, and only the one that applies.
     --
     -- An anonymous author is their alias and NOT their display name: matching
     -- the display name too would let somebody discover the alias by tagging
     -- the person and watching what happens. Nothing is watchable from the
     -- sender's side, but the rule is cheaper to keep than to reason about.
     and (
       case when m.anonymous
         then lower(m.author_alias)
         else lower(p.display_name)
       end
     ) = any (select lower(n) from unnest(p_names) as n)
     -- Still in the room. Somebody who has left is not reachable here, and a
     -- notification pointing at a room they cannot open is a dead end.
     and public.is_member_of_room(m.user_id, p_room_id)
     -- Blocks, both directions. §4 makes a block mutual invisibility, and a
     -- notification is a way to reach somebody.
     and not public.is_blocked_either_way(p_actor, m.user_id)
$$;

revoke all on function public.mentioned_members(uuid, uuid, text[]) from public, anon, authenticated;

comment on function public.mentioned_members(uuid, uuid, text[]) is
  'Who, in this room, goes by one of these names — resolved behind a wall because room_messages.user_id is revoked from members and an anonymous author must not be traceable. Excludes the sender, anyone who has left, and both directions of a block. Never returns to a client.';

-- ── a reply to a comment is not a reply to a post ────────────────────────────
--
-- reply_received fires to the author of whatever was replied to, and that is a
-- post for a comment and a COMMENT for a reply. The line said "replied to your
-- post" either way, which is wrong half the time and wrong in the direction
-- that sends somebody looking for something that is not there.
--
-- Resolved at read time rather than stored, like everything else in this list:
-- one more expression on a row the function was already reading.
drop function if exists public.my_notifications(integer);

create or replace function public.my_notifications(p_limit integer default 50)
returns table (
  id uuid,
  event text,
  actor_name text,
  subject_id uuid,
  subject_path text,
  subject_is_comment boolean,
  created_at timestamptz,
  read_at timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    n.id,
    n.event,
    v.display_name,
    n.subject_id,
    case
      when n.event in ('like_received', 'reply_received', 'mention_received') then (
        -- Up to the top of the thread, however deep the subject sits.
        --
        -- /app/rooms/<room>/<post> is the only page a room message has — a
        -- comment is not a page, and a thread rendered from a comment id has
        -- no root and draws nothing. Two hops covers the whole shape, because
        -- enforce_flat_comments refuses a third level.
        select '/app/rooms/' || m.room_id::text || '/' ||
               coalesce(gp.id, pm.id, m.id)::text
          from public.room_messages m
          left join public.room_messages pm on pm.id = m.parent_id
          left join public.room_messages gp on gp.id = pm.parent_id
         where m.id = n.subject_id and m.deleted_at is null
      )
      when n.event in ('message_received', 'chat_closed', 'plan_proposed', 'plan_confirmed') then (
        select '/app/chats/' || c.id::text
          from public.chats c
         where c.id = n.subject_id
      )
    end,
    /**
     * Whether the thing that was replied to is itself a comment.
     *
     * Null when the subject is not a room message at all, or is one the reader
     * may no longer see — and the line falls back to the wording that is true
     * either way rather than guessing.
     */
    (
      select m.parent_id is not null
        from public.room_messages m
       where m.id = n.subject_id and m.deleted_at is null
    ),
    n.created_at,
    n.read_at
  from public.notifications n
  left join public.visible_profiles v on v.id = n.actor_id
  where n.user_id = (select auth.uid())
  order by n.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

grant execute on function public.my_notifications(integer) to authenticated;

comment on function public.my_notifications(integer) is
  'The caller''s notifications, newest first, with the actor, the destination AND the shape of the subject resolved at read time — so somebody since blocked has no name, a post since deleted has no link, and a reply to a comment does not claim to be a reply to a post.';
