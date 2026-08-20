-- Replies to replies, one layer down and no further.
--
-- enforce_flat_comments refused any reply to a reply, and the UI answered that
-- by putting the person's name in the box instead — which works, and is not
-- what a conversation with three people in it looks like. Facebook nests one
-- layer and stops, and the reason it stops is the same reason this does: a
-- second layer is a thread, a third is a tree, and a tree on a phone is a
-- horizontal scrollbar.
--
-- So: post → comment → reply. A reply to a reply is refused, and the UI puts
-- that person's name in the box, which is exactly where the mention behaviour
-- earns its keep rather than standing in for structure.
create or replace function public.enforce_flat_comments()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_parent record;
  v_grandparent_parent uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  select m.parent_id, m.room_id into v_parent
    from public.room_messages m where m.id = new.parent_id;

  if v_parent.room_id is null then
    raise exception 'no such post' using errcode = 'P0002';
  end if;

  -- Depth. The parent being a comment is fine; the parent being a reply is
  -- not, and the only way to tell those apart is one more hop.
  if v_parent.parent_id is not null then
    select m.parent_id into v_grandparent_parent
      from public.room_messages m where m.id = v_parent.parent_id;

    if v_grandparent_parent is not null then
      raise exception 'a reply cannot be replied to' using errcode = 'P0001';
    end if;
  end if;

  -- A comment belongs to its parent's room, whatever the client said.
  new.room_id := v_parent.room_id;

  return new;
end;
$$;

-- ── the thread, two levels deep ───────────────────────────────────────────────
--
-- parent_id comes back now, because the page has to nest and cannot work out
-- what belongs under what from a flat list.
--
-- comment_count means DIRECT children here, which is what "3 replies" under a
-- comment is counting. room_feed's version counts every descendant, because
-- what a feed row is claiming is how many comments the post has. Two questions,
-- two answers, and they are asked in different places on purpose.
drop function if exists public.room_thread(uuid);
create function public.room_thread(p_message_id uuid)
returns table (
  id uuid,
  parent_id uuid,
  body text,
  created_at timestamptz,
  anonymous boolean,
  author_id uuid,
  author_name text,
  is_mine boolean,
  like_count integer,
  i_liked boolean,
  comment_count integer,
  view_count integer,
  is_root boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with visible as (
    select m.*
      from public.room_messages m
     where m.deleted_at is null
       and public.i_am_in_room(m.room_id)
       and not public.i_am_blocked_with(m.user_id)
  )
  select
    m.id,
    m.parent_id,
    m.body,
    m.created_at,
    m.anonymous,
    case when m.anonymous then null else m.user_id end,
    case when m.anonymous then m.author_alias else p.display_name end,
    m.user_id = (select auth.uid()),
    (select count(*) from public.room_likes l where l.message_id = m.id)::integer,
    exists (
      select 1 from public.room_likes l
       where l.message_id = m.id and l.user_id = (select auth.uid())
    ),
    (select count(*) from visible c where c.parent_id = m.id)::integer,
    case
      when m.user_id = (select auth.uid())
      then (select count(*) from public.room_post_views v where v.message_id = m.id)::integer
    end,
    m.id = p_message_id
  from visible m
  left join public.profiles p on p.id = m.user_id
  where m.id = p_message_id
     or m.parent_id = p_message_id
     -- The third level: replies to this post's comments.
     or m.parent_id in (select c.id from visible c where c.parent_id = p_message_id)
  -- The post, then newest first at both levels. A reply thread reads the same
  -- way the comment list does.
  order by (m.id = p_message_id) desc, m.created_at desc;
$$;

comment on function public.room_thread(uuid) is
  'A post, its comments and their replies, newest first, in the projection room_feed uses. comment_count is direct children.';

revoke all on function public.room_thread(uuid) from public, anon;
grant execute on function public.room_thread(uuid) to authenticated;

-- ── the feed count, which means something else ────────────────────────────────
--
-- Every descendant, not direct children. A post with two comments carrying
-- four replies between them has six comments on it, and a row claiming two
-- would be undercounting the conversation a member is deciding whether to open.
drop function if exists public.room_feed(uuid, integer);
create function public.room_feed(p_room_id uuid, p_limit integer default 100)
returns table (
  id uuid,
  body text,
  created_at timestamptz,
  anonymous boolean,
  author_id uuid,
  author_name text,
  is_mine boolean,
  like_count integer,
  i_liked boolean,
  comment_count integer,
  view_count integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with visible as (
    select m.id, m.parent_id, m.user_id
      from public.room_messages m
     where m.deleted_at is null
       and not public.i_am_blocked_with(m.user_id)
  )
  select
    m.id,
    m.body,
    m.created_at,
    m.anonymous,
    case when m.anonymous then null else m.user_id end,
    case when m.anonymous then m.author_alias else p.display_name end,
    m.user_id = (select auth.uid()),
    (select count(*) from public.room_likes l where l.message_id = m.id)::integer,
    exists (
      select 1 from public.room_likes l
       where l.message_id = m.id and l.user_id = (select auth.uid())
    ),
    (
      select count(*) from visible c
       where c.parent_id = m.id
          or c.parent_id in (select d.id from visible d where d.parent_id = m.id)
    )::integer,
    case
      when m.user_id = (select auth.uid())
      then (select count(*) from public.room_post_views v where v.message_id = m.id)::integer
    end
  from public.room_messages m
  left join public.profiles p on p.id = m.user_id
  where m.room_id = p_room_id
    and m.parent_id is null
    and m.deleted_at is null
    and public.i_am_in_room(m.room_id)
    and not public.i_am_blocked_with(m.user_id)
  order by m.created_at desc
  limit greatest(least(p_limit, 200), 1);
$$;

comment on function public.room_feed(uuid, integer) is
  'A room''s top-level posts as they may be shown. comment_count is every descendant, which is what "how many comments" means on a feed row.';

revoke all on function public.room_feed(uuid, integer) from public, anon;
grant execute on function public.room_feed(uuid, integer) to authenticated;
