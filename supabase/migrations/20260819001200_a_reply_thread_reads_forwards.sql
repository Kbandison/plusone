-- Comments newest first; the replies under one of them oldest first.
--
-- They are two different lists asking two different questions.
--
-- The comment list is a feed: a member comes back to see what is new, and the
-- newest is what they came for. A reply thread is a conversation between two or
-- three people about one thing — it is read forwards, because the second reply
-- is usually an answer to the first and reversing them makes an argument run
-- backwards.
--
-- Both directions in one sort. The rows come back flat and the page groups
-- them, so each subset only has to be ordered correctly against itself.
create or replace function public.room_thread(p_message_id uuid)
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
  order by
    -- The post, always.
    (m.id = p_message_id) desc,
    -- Then the comments, then the replies. The page groups them anyway; this
    -- only keeps the two sort directions below from applying to each other.
    case when m.parent_id = p_message_id then 0 else 1 end,
    -- Comments: newest first. Null for a reply, so this key does nothing to
    -- them and the next one decides.
    case when m.parent_id = p_message_id then m.created_at end desc,
    -- Replies: oldest first, because a reply thread is read forwards.
    m.created_at asc;
$$;

comment on function public.room_thread(uuid) is
  'A post, its comments newest first, and their replies oldest first, in the projection room_feed uses. comment_count is direct children.';

revoke all on function public.room_thread(uuid) from public, anon;
grant execute on function public.room_thread(uuid) to authenticated;
