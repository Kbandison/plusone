-- Who shared it.
--
-- A shared post said nothing about the sharing. A member's post carried their
-- name because they became its author, which is right — but an ARTICLE stays
-- authorless when it is shared, so it arrived in the new room looking exactly
-- like one the ingest had put there. Somebody chose to bring it, and that is
-- most of what the share means.
--
-- A column rather than a line of text in the body: an attribution that is part
-- of the words cannot be told apart from the words, and would be carried along
-- again by the next share.
alter table public.room_messages
  add column if not exists shared_by uuid references public.profiles (id) on delete set null;

comment on column public.room_messages.shared_by is
  'The member who brought this post into this room. Null on everything that was posted here first.';

create index if not exists room_messages_shared_by_ix
  on public.room_messages (shared_by) where shared_by is not null;

create or replace function public.share_post_to_room(p_message_id uuid, p_room_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := (select auth.uid());
  v_src record;
  v_new uuid;
begin
  if v_me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select m.body, m.article_url, m.article_title, m.article_source, m.article_icon
    into v_src
    from public.room_messages m
   where m.id = p_message_id
     and m.deleted_at is null
     and m.parent_id is null
     and public.i_am_in_room(m.room_id)
     and not public.i_am_blocked_with(m.user_id);

  if not found then
    raise exception 'no such post' using errcode = 'P0002';
  end if;

  if not public.i_am_in_room(p_room_id) then
    raise exception 'not in that room' using errcode = '42501';
  end if;

  if v_src.article_url is not null and exists (
    select 1 from public.room_messages m
     where m.room_id = p_room_id and m.article_url = v_src.article_url
  ) then
    raise exception 'already shared there' using errcode = 'P0001';
  end if;

  insert into public.room_messages
    (room_id, user_id, shared_by, body, article_url, article_title, article_source, article_icon)
  values (
    p_room_id,
    -- An article keeps having no author, even shared: it is still nobody
    -- here's words. Anything else becomes the sharer's post, because they are
    -- the one who can be replied to about it.
    case when v_src.article_url is not null then null else v_me end,
    v_me,
    v_src.body,
    v_src.article_url,
    v_src.article_title,
    v_src.article_source,
    v_src.article_icon
  )
  returning id into v_new;

  return v_new;
end;
$$;

revoke all on function public.share_post_to_room(uuid, uuid) from public, anon;
grant execute on function public.share_post_to_room(uuid, uuid) to authenticated;

grant select (id, room_id, body, deleted_at, created_at, anonymous, author_alias,
              parent_id, image_path, article_url, article_title, article_source, article_icon)
  on public.room_messages to authenticated;

-- ── the projections carry it ─────────────────────────────────────────────────
drop function if exists public.room_feed(uuid, integer, text);

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
  article_icon text,
  /** Who brought it into this room. Null on everything posted here first. */
  shared_by_name text
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
    m.article_icon,
    sp.display_name
  from public.room_messages m
  left join public.profiles p on p.id = m.user_id
  left join public.profiles sp on sp.id = m.shared_by
  cross join needle n
  where m.room_id = p_room_id
    and m.parent_id is null
    and m.deleted_at is null
    and public.i_am_in_room(m.room_id)
    and not public.i_am_blocked_with(m.user_id)
    -- And not from somebody they have blocked. An article has no author to
    -- block, so without this a member could block someone and keep seeing
    -- everything that person chose to bring into the room.
    and not public.i_am_blocked_with(m.shared_by)
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
  'A room''s top-level posts as they may be shown, articles included, optionally filtered by a search term, with the sharer where there was one.';

revoke all on function public.room_feed(uuid, integer, text) from public, anon;
grant execute on function public.room_feed(uuid, integer, text) to authenticated;

drop function if exists public.room_thread(uuid);

create function public.room_thread(p_message_id uuid)
returns table (
  id uuid,
  parent_id uuid,
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
  article_icon text,
  shared_by_name text,
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
       and not public.i_am_blocked_with(m.shared_by)
  )
  select
    m.id,
    m.parent_id,
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
    (select count(*) from visible c where c.parent_id = m.id)::integer,
    case
      when m.user_id = (select auth.uid())
      then (select count(*) from public.room_post_views v where v.message_id = m.id)::integer
    end,
    m.article_url,
    m.article_title,
    m.article_icon,
    sp.display_name,
    m.id = p_message_id
  from visible m
  left join public.profiles p on p.id = m.user_id
  left join public.profiles sp on sp.id = m.shared_by
  where m.id = p_message_id
     or m.parent_id = p_message_id
     or m.parent_id in (select c.id from visible c where c.parent_id = p_message_id)
  order by
    (m.id = p_message_id) desc,
    case when m.parent_id = p_message_id then 0 else 1 end,
    case when m.parent_id = p_message_id then m.created_at end desc,
    m.created_at asc;
$$;

comment on function public.room_thread(uuid) is
  'A post, its comments newest first, and their replies oldest first — articles included, with the sharer where there was one.';

revoke all on function public.room_thread(uuid) from public, anon;
grant execute on function public.room_thread(uuid) to authenticated;
