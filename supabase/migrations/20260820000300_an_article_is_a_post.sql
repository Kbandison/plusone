-- An article is a post.
--
-- Latest news was a table of its own with a page of its own, and every time
-- Kevin asked for another thing posts already do — likes, views, comments,
-- replies, opening into a thread — the honest answer was "that is a second
-- implementation of room_messages". So it stops being a second implementation.
--
-- A news item is now a row in room_messages carrying an article on it, in a
-- room named Latest news. Everything a post has, it has, because it IS one:
-- the likes table keys on message id, the comment tree keys on parent_id, the
-- views table, the report and block controls, the projections, the thread
-- page. None of that is written twice and none of it can drift.
--
-- ── TWO ROOMS, NOT ONE ───────────────────────────────────────────────────────
-- Rooms are scoped by community and news is too, so one 'all' room would show
-- HIV articles to somebody in the HSV community. Two rooms with the same title,
-- one per community, and no member ever sees both. An article scoped 'all' is
-- posted to each — which also means the two communities discuss it separately,
-- and in a health community that is a feature rather than a compromise.
--
-- ── AN ARTICLE HAS NO AUTHOR ─────────────────────────────────────────────────
-- user_id becomes nullable, which is the honest shape: nobody in this product
-- wrote the article. The alternative was a system member sitting in profiles,
-- visible to every query that has ever assumed a profile row is a person.
--
-- The care that costs is one line: `not i_am_blocked_with(user_id)` is NULL for
-- a null author, and NOT NULL is NULL, so every article would have been
-- silently filtered out of every feed. Every one of those tests is now written
-- to survive an authorless row.

alter table public.room_messages
  alter column user_id drop not null,
  add column if not exists article_url text,
  add column if not exists article_title text,
  add column if not exists article_source text,
  add column if not exists article_icon text;

comment on column public.room_messages.article_url is
  'The original article. Present exactly on the posts that are news; null on everything a member wrote.';

alter table public.room_messages
  add constraint room_messages_article_shape check (
    (
      -- An article: no author, never anonymous, and it carries what it needs to
      -- render without a profile behind it.
      article_url is not null
      and user_id is null
      and anonymous = false
      and article_title is not null
      and article_source is not null
      and article_url like 'https://%'
    )
    or (
      -- A member's post, unchanged.
      article_url is null
      and user_id is not null
    )
  );

-- One copy of an article per room. Not globally unique: an 'all' article is
-- posted to both news rooms on purpose, and a unique index on the URL alone
-- would store it for one community and silently drop it for the other.
create unique index if not exists room_messages_article_once_per_room
  on public.room_messages (room_id, article_url) where article_url is not null;

-- ── the rooms ────────────────────────────────────────────────────────────────
-- position 5, ahead of Newly diagnosed at 10: Kevin's call, and it is the one
-- tab that changes without anybody in the room doing anything.
insert into public.rooms (slug, title, community_scope, slow_mode_seconds, position, description)
values
  ('latest-news-hsv', 'Latest news', 'hsv', 0, 5, null),
  ('latest-news-hiv', 'Latest news', 'hiv', 0, 5, null)
on conflict (slug) do nothing;

-- Nobody posts here directly, so slow mode is meaningless — and a comment on an
-- article should not wait behind the room's cooldown.
update public.rooms set slow_mode_seconds = 0 where slug like 'latest-news-%';

-- ── the walls, taught that an author is optional ─────────────────────────────
--
-- Every one of these read `not i_am_blocked_with(m.user_id)`, which is NULL for
-- an article and therefore excludes it. Nothing about a block changes; what
-- changes is that a row with no author cannot be blocked, and says so.
create or replace function public.i_am_blocked_with(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- coalesce, because a null author is not somebody the caller has blocked —
  -- and without it NOT NULL is NULL and the row disappears from every feed.
  select coalesce(public.is_blocked_either_way((select auth.uid()), p_other), false);
$$;

comment on function public.i_am_blocked_with(uuid) is
  'Self-relative: is there a block in either direction between the caller and p_other. False for a null other, which is an authorless post rather than a person. The two-argument original stays internal so the block list cannot be probed about third parties.';

-- The alias trigger must not try to give an article a pseudonym.
create or replace function public.assign_room_alias()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_words text[] := public.room_alias_words();
  v_alias text;
  v_taken text[];
  v_candidate text;
begin
  -- An article is never anonymous and has no author to be anonymous about.
  if not new.anonymous or new.user_id is null then
    new.author_alias := null;
    return new;
  end if;

  select m.author_alias into v_alias
    from public.room_messages m
   where m.room_id = new.room_id
     and m.user_id = new.user_id
     and m.author_alias is not null
   limit 1;

  if v_alias is not null then
    new.author_alias := v_alias;
    return new;
  end if;

  select coalesce(array_agg(distinct m.author_alias), array[]::text[]) into v_taken
    from public.room_messages m
   where m.room_id = new.room_id
     and m.author_alias is not null;

  select w into v_candidate
    from unnest(v_words) as w
   where not (w = any (v_taken))
   order by random()
   limit 1;

  new.author_alias := coalesce(
    v_candidate,
    'Member ' || (coalesce(array_length(v_taken, 1), 0) + 1)::text
  );
  return new;
end;
$$;

-- Slow mode counts a member's own posts, and an article has no member.
create or replace function public.enforce_room_slow_mode()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_seconds integer;
  v_last timestamptz;
begin
  if new.user_id is null then
    return new;
  end if;

  if new.parent_id is null then
    select r.slow_mode_seconds into v_seconds from public.rooms r where r.id = new.room_id;
  else
    v_seconds := public.config_int('rooms.comment_slow_mode_seconds', 0);
  end if;

  if coalesce(v_seconds, 0) <= 0 then
    return new;
  end if;

  select max(m.created_at) into v_last
    from public.room_messages m
   where m.room_id = new.room_id
     and m.user_id = new.user_id
     and (m.parent_id is null) = (new.parent_id is null);

  if v_last is not null and now() < v_last + make_interval(secs => v_seconds) then
    raise exception 'slow mode: wait % more seconds',
      ceil(extract(epoch from (v_last + make_interval(secs => v_seconds) - now())))::integer
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- ── the projections carry the article ────────────────────────────────────────
--
-- Dropped rather than replaced: the return type gains four columns, and
-- `create or replace` refuses to change one.
drop function if exists public.room_feed(uuid, integer);
drop function if exists public.room_thread(uuid);

create function public.room_feed(p_room_id uuid, p_limit integer default 100)
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
  )
  select
    m.id,
    m.body,
    m.image_path,
    m.created_at,
    m.anonymous,
    -- An article has no author id to give, which is the same answer anonymity
    -- gives and for a different reason: there is nobody, rather than somebody
    -- withheld.
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
  where m.room_id = p_room_id
    and m.parent_id is null
    and m.deleted_at is null
    and public.i_am_in_room(m.room_id)
    and not public.i_am_blocked_with(m.user_id)
  order by m.created_at desc
  limit greatest(least(p_limit, 200), 1);
$$;

comment on function public.room_feed(uuid, integer) is
  'A room''s top-level posts as they may be shown, articles included. comment_count is every descendant.';

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
    m.id = p_message_id
  from visible m
  left join public.profiles p on p.id = m.user_id
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
  'A post, its comments newest first, and their replies oldest first — articles included.';

revoke all on function public.room_feed(uuid, integer) from public, anon;
revoke all on function public.room_thread(uuid) from public, anon;
grant execute on function public.room_feed(uuid, integer) to authenticated;
grant execute on function public.room_thread(uuid) to authenticated;

-- Readable, never writable: a member may see an article on a post and may not
-- put one there.
grant select (id, room_id, body, deleted_at, created_at, anonymous, author_alias,
              parent_id, image_path, article_url, article_title, article_source, article_icon)
  on public.room_messages to authenticated;

-- ── everybody is in the news room ────────────────────────────────────────────
--
-- Reading a room needs membership, and nobody chose to join this one — it
-- appeared. Joining every existing member now, and every new one at the moment
-- their community is known, because a tab that is empty until you press a
-- button you were never shown is a broken tab.
insert into public.room_members (room_id, user_id)
select r.id, p.id
  from public.rooms r
  join public.profiles p
    on r.community_scope::text = p.community::text
 where r.slug like 'latest-news-%'
on conflict do nothing;

create or replace function public.join_news_room()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.community is null then
    return new;
  end if;

  insert into public.room_members (room_id, user_id)
  select r.id, new.id
    from public.rooms r
   where r.slug like 'latest-news-%'
     and r.community_scope::text = new.community::text
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists profiles_join_news_room on public.profiles;
create trigger profiles_join_news_room
  after insert or update of community on public.profiles
  for each row execute function public.join_news_room();
