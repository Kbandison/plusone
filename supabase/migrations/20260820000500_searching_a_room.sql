-- Searching a room.
--
-- Latest news has no composer — a member does not post articles — so the box
-- above the feed is a search box there instead. The search itself is not
-- news-specific: any room can be searched, and one that could not would be the
-- odd one out rather than the safe one.
--
-- ILIKE over the body and the headline rather than full text search. Four
-- rooms, a few hundred posts, and a tsvector column plus its index plus its
-- trigger is a lot of machinery to make "does this contain that" faster than it
-- already is. When a room is big enough for that to matter it will be obvious.
drop function if exists public.room_feed(uuid, integer);

create function public.room_feed(
  p_room_id uuid,
  p_limit integer default 100,
  p_search text default null
)
returns table (
  id uuid,
  body text,
  image_path text,
  created_at timestamptz,
  anonymous boolean,
  author_id uuid,
  author_name text,
  is_mine boolean,
  like_count integer,
  i_liked boolean,
  comment_count integer,
  view_count integer,
  article_url text,
  article_title text,
  article_icon text
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
  ),
  -- Escaped, so a member searching for "100%" gets posts containing "100%"
  -- rather than every post in the room.
  needle as (
    select case
      when coalesce(btrim(p_search), '') = '' then null
      else '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%'
    end as pattern
  )
  select
    m.id,
    m.body,
    m.image_path,
    m.created_at,
    m.anonymous,
    case when m.anonymous or m.article_url is not null then null else m.user_id end,
    case
      when m.article_url is not null then m.article_source
      when m.anonymous then m.author_alias
      else p.display_name
    end,
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
    end,
    m.article_url,
    m.article_title,
    m.article_icon
  from public.room_messages m
  left join public.profiles p on p.id = m.user_id
  cross join needle n
  where m.room_id = p_room_id
    and m.parent_id is null
    and m.deleted_at is null
    and public.i_am_in_room(m.room_id)
    and not public.i_am_blocked_with(m.user_id)
    and (
      n.pattern is null
      -- The headline as well as the body: on an article the body is the
      -- summary, and somebody searching for a headline they half remember is
      -- searching for the headline.
      or m.body ilike n.pattern escape '\'
      or m.article_title ilike n.pattern escape '\'
      or m.article_source ilike n.pattern escape '\'
    )
  order by m.created_at desc
  limit greatest(least(p_limit, 200), 1);
$$;

comment on function public.room_feed(uuid, integer, text) is
  'A room''s top-level posts as they may be shown, articles included, optionally filtered by a search term over the body, headline and source.';

revoke all on function public.room_feed(uuid, integer, text) from public, anon;
grant execute on function public.room_feed(uuid, integer, text) to authenticated;
