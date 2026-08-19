-- Comments, likes and views on a room post.
--
-- NO DISLIKES, and that is a decision rather than an omission. Decision #26
-- puts ghosting penalties out and rules out public response rates and shame
-- mechanics; a downvote counter under somebody's diagnosis story is the exact
-- mechanic it exists to prevent. Kevin's call, 2026-08-19, having been asked.
--
-- ── COMMENTS ARE POSTS WITH A PARENT ──────────────────────────────────────────
-- Not a second table. Everything a post already gets — the alias trigger, the
-- anonymity projection, the tone check, the block wall, deletion by a moderator
-- — applies to a comment for free, and none of it has to be remembered twice.
-- A comments table would have started as a copy of room_messages and drifted
-- from it by the second change.
--
-- Slow mode still applies. A reply is a post, and exempting replies would make
-- reply-spam the one way to flood a room the trigger cannot see.
alter table public.room_messages
  add column if not exists parent_id uuid references public.room_messages (id) on delete cascade;

comment on column public.room_messages.parent_id is
  'The post this is a comment on. Null for a top-level post.';

-- One level. A reply to a reply is a different product, and the check is here
-- rather than in the app because "the UI never sends it" is not a constraint.
create or replace function public.enforce_flat_comments()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_parent_parent uuid;
  v_parent_room uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  select m.parent_id, m.room_id into v_parent_parent, v_parent_room
    from public.room_messages m where m.id = new.parent_id;

  if v_parent_room is null then
    raise exception 'no such post' using errcode = 'P0002';
  end if;
  if v_parent_parent is not null then
    raise exception 'a reply cannot be replied to' using errcode = 'P0001';
  end if;
  -- A comment belongs to its parent's room, whatever the client said.
  new.room_id := v_parent_room;

  return new;
end;
$$;

drop trigger if exists room_messages_flat on public.room_messages;
create trigger room_messages_flat
  before insert on public.room_messages
  for each row execute function public.enforce_flat_comments();

create index room_messages_parent_ix
  on public.room_messages (parent_id, created_at) where parent_id is not null;

grant insert (room_id, user_id, body, anonymous, parent_id) on public.room_messages to authenticated;
grant select (id, room_id, body, deleted_at, created_at, anonymous, author_alias, parent_id)
  on public.room_messages to authenticated;

-- ── likes ─────────────────────────────────────────────────────────────────────
--
-- WHO liked is never exposed, only how many. In a room where posts can be
-- anonymous, a list of likers is a list of people who were reading a thread
-- about a diagnosis — which is the thing the anonymity is for, arriving by the
-- side door.
create table public.room_likes (
  message_id uuid not null references public.room_messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (message_id, user_id)
);

alter table public.room_likes enable row level security;

-- Own rows only, and only in a room you are in. Reading is deliberately limited
-- to your own row: the counts come from room_feed, which aggregates. Without
-- this a member could select the whole table and rebuild the liker list.
create policy "own likes in your own rooms" on public.room_likes
  for all
  using (
    user_id = (select auth.uid())
    and public.i_am_in_room((select m.room_id from public.room_messages m where m.id = message_id))
  )
  with check (
    user_id = (select auth.uid())
    and public.i_am_in_room((select m.room_id from public.room_messages m where m.id = message_id))
  );

-- Every new object in this schema needs this line. check:db has caught its
-- absence five times now.
revoke all on public.room_likes from anon, authenticated;
grant select, insert, delete on public.room_likes to authenticated;

create index room_likes_message_ix on public.room_likes (message_id);

-- ── views ─────────────────────────────────────────────────────────────────────
--
-- The count is shown to the AUTHOR and to nobody else (Kevin's call). "2 views"
-- under somebody's diagnosis story reads worse than no number at all, and the
-- question a member actually has is "did anyone see this" — which their own
-- count answers without publishing a small number to the room.
--
-- One row per member per post, because a count that grows every time a page
-- re-renders measures scrolling rather than people.
create table public.room_post_views (
  message_id uuid not null references public.room_messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  first_seen_at timestamptz not null default now(),

  primary key (message_id, user_id)
);

alter table public.room_post_views enable row level security;

-- Write your own, read nothing. Not even your own: there is no reason for a
-- client to read this table, and the author's count comes from room_feed. A
-- table nobody can select is a table that cannot be joined into a list of who
-- read what.
create policy "record your own views" on public.room_post_views
  for insert
  with check (user_id = (select auth.uid()));

revoke all on public.room_post_views from anon, authenticated;
grant insert on public.room_post_views to authenticated;

create index room_post_views_message_ix on public.room_post_views (message_id);

/* Seen, in one call for the whole page. */
create or replace function public.record_room_views(p_message_ids uuid[])
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  insert into public.room_post_views (message_id, user_id)
  select id, (select auth.uid()) from unnest(p_message_ids) as id
  on conflict do nothing;
$$;

grant execute on function public.record_room_views(uuid[]) to authenticated;

/* Liking, and unliking, which is the same press. */
create or replace function public.toggle_room_like(p_message_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := (select auth.uid());
  v_room uuid;
  v_deleted integer;
begin
  if v_me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Only a post the caller can see. Without this any id — guessed, or lifted
  -- from elsewhere — could be liked, which turns the counter into an oracle for
  -- which posts exist and lets somebody inflate a stranger's.
  select m.room_id into v_room
    from public.room_messages m
   where m.id = p_message_id
     and m.deleted_at is null
     and public.i_am_in_room(m.room_id)
     and not public.i_am_blocked_with(m.user_id);

  if v_room is null then
    raise exception 'no such post' using errcode = 'P0002';
  end if;

  delete from public.room_likes where message_id = p_message_id and user_id = v_me;
  get diagnostics v_deleted = row_count;
  if v_deleted > 0 then
    return false;
  end if;

  insert into public.room_likes (message_id, user_id) values (p_message_id, v_me)
  on conflict do nothing;
  return true;
end;
$$;

revoke all on function public.toggle_room_like(uuid) from public, anon;
grant execute on function public.toggle_room_like(uuid) to authenticated;

-- ── the feed, with what a row now carries ─────────────────────────────────────
drop function if exists public.room_feed(uuid, integer);
create function public.room_feed(p_room_id uuid, p_limit integer default 100)
returns table (
  id uuid,
  body text,
  created_at timestamptz,
  anonymous boolean,
  /** Null for an anonymous post. There is no branch where it is not. */
  author_id uuid,
  author_name text,
  is_mine boolean,
  like_count integer,
  i_liked boolean,
  comment_count integer,
  /** The author's own count, and null to everybody else. */
  view_count integer
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
    end
  from public.room_messages m
  left join public.profiles p on p.id = m.user_id
  where m.room_id = p_room_id
    -- Top level only. A comment belongs under its post, not beside it.
    and m.parent_id is null
    and m.deleted_at is null
    and public.i_am_in_room(m.room_id)
    and not public.i_am_blocked_with(m.user_id)
  order by m.created_at desc
  limit greatest(least(p_limit, 200), 1);
$$;

comment on function public.room_feed(uuid, integer) is
  'A room''s top-level posts as they may be shown: an author id and display name only where the author chose to be named, an alias otherwise, plus like and comment counts and the author''s own view count.';

revoke all on function public.room_feed(uuid, integer) from public, anon;
grant execute on function public.room_feed(uuid, integer) to authenticated;

/*
 * One post and its comments, in the same projection.
 *
 * The post itself comes back as the first row, so the page has one shape to
 * render and one place where anonymity is decided.
 */
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
  -- The post first, then its comments oldest first: a thread is read forwards.
  order by (m.id = p_message_id) desc, m.created_at asc;
$$;

comment on function public.room_thread(uuid) is
  'One post and its comments, in the same projection room_feed uses. The post is the row with is_root.';

revoke all on function public.room_thread(uuid) from public, anon;
grant execute on function public.room_thread(uuid) to authenticated;
