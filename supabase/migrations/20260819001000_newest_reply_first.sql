-- Comments newest first.
--
-- They were oldest first, on the reasoning that a thread is read forwards. That
-- holds for a handful and stops holding the moment there are twenty: the newest
-- reply is the one a member came back for, and putting it last means scrolling
-- past everything they have already read to find it.
--
-- The post still comes first. It is the thing the page is about, and the sort
-- key that puts it there is unchanged.
create or replace function public.room_thread(p_message_id uuid)
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
  view_count integer,
  is_root boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
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
      select count(*) from public.room_messages c
       where c.parent_id = m.id
         and c.deleted_at is null
         and not public.i_am_blocked_with(c.user_id)
    )::integer,
    case
      when m.user_id = (select auth.uid())
      then (select count(*) from public.room_post_views v where v.message_id = m.id)::integer
    end,
    m.id = p_message_id
  from public.room_messages m
  left join public.profiles p on p.id = m.user_id
  where (m.id = p_message_id or m.parent_id = p_message_id)
    and m.deleted_at is null
    and public.i_am_in_room(m.room_id)
    and not public.i_am_blocked_with(m.user_id)
  -- The post, then the newest reply.
  order by (m.id = p_message_id) desc, m.created_at desc;
$$;

comment on function public.room_thread(uuid) is
  'One post and its comments newest first, in the same projection room_feed uses. The post is the row with is_root.';

revoke all on function public.room_thread(uuid) from public, anon;
grant execute on function public.room_thread(uuid) to authenticated;
