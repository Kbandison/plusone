-- Posting as yourself, or not.
--
-- Rooms have been unattributed by construction: no name, no face, and the
-- author's id deliberately never reaching the client. That is the right default
-- for "Newly diagnosed" and the wrong one for "General lounge", and making it a
-- per-post choice is the only way to have both.
--
-- ── THE QUESTION THIS ANSWERS ─────────────────────────────────────────────────
-- Attribution means shipping something per post. The moment a post carries an
-- author, the naive version ships user_id and lets the client decide what to
-- render — and a client-side decision about whose name to show is not privacy,
-- it is a stylesheet. Anyone reading the page payload sees the pairing.
--
-- So the id is removed from what a client can select AT ALL:
--
--   1. revoke select (user_id) on room_messages. Not a policy — a column
--      privilege. A member querying room_messages directly, through PostgREST
--      or anything else, cannot name that column at all. The pairing between a
--      post and a person stops being something the client is trusted not to
--      look at.
--
--   2. room_feed() projects what is safe: the display name and id of an author
--      who CHOSE to be named, and for an anonymous post an alias and a null id.
--      There is no branch where an anonymous author's id is returned, so there
--      is no bug in a client that could reveal one.
--
--   3. The alias is STORED, not derived. A hash of (user_id, room_id) is
--      reversible by anybody who can guess a user id — and every member can see
--      plenty of ids. A random word pair, chosen once and written down, cannot
--      be worked backwards from at all.
--
--   4. It is per ROOM. The same member is one alias in one room and a different
--      one in another, so a story in "Newly diagnosed" cannot be lined up with
--      an offhand remark in "General lounge" and then with a profile. That
--      correlation is the actual attack on a pseudonym, and per-room aliases
--      are what close it rather than the pseudonym itself.
--
-- What does NOT change: report and block still resolve the author server-side
-- from the message id, so an anonymous post can be reported and its author
-- blocked without anyone learning who they are.

alter table public.room_messages
  add column if not exists anonymous boolean not null default false,
  -- Null unless anonymous. Set by the trigger below, never by a client — a
  -- client-supplied alias is a client choosing to be somebody else.
  add column if not exists author_alias text;

comment on column public.room_messages.author_alias is
  'Stable per (room, author) pseudonym for an anonymous post. Never derived from the author id.';

-- ── the alias ─────────────────────────────────────────────────────────────────
--
-- THESE WORDS ARE CLAUDE'S, NOT KEVIN'S. Deliberately flat: colours and
-- natural things, nothing playful and nothing that could read as a comment on
-- the person. A pseudonym in a health community is worn by somebody telling a
-- hard story, and a jokey one puts a costume on them.
create or replace function public.room_alias_words()
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select array[
    'Amber','Ash','Aspen','Auburn','Basalt','Birch','Bramble','Cedar','Chalk','Cinder',
    'Clay','Cobalt','Copper','Coral','Dune','Ember','Fern','Flint','Garnet','Hazel',
    'Heather','Indigo','Ivory','Juniper','Larch','Laurel','Linen','Maple','Marble','Moss',
    'Ochre','Olive','Onyx','Pebble','Pewter','Quartz','Reed','Rowan','Russet','Sable',
    'Saffron','Sage','Sandstone','Sepia','Shale','Slate','Sorrel','Spruce','Teal','Thistle',
    'Umber','Verdigris','Willow','Yarrow'
  ];
$$;

/*
 * The alias for one member in one room: theirs if they have posted anonymously
 * here before, a fresh one otherwise.
 *
 * Collision-free within a room, which matters more than it looks: two members
 * sharing an alias would read as one person contradicting themselves.
 */
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
  if not new.anonymous then
    new.author_alias := null;
    return new;
  end if;

  -- Reuse. A member who posts twice in a thread is the same person in it —
  -- without this, a room of anonymous posts is a room of strangers who each
  -- said one thing, and a conversation cannot happen.
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

  -- random() rather than anything derived from the member. Derivation is the
  -- whole thing this is avoiding: a value computed from user_id can be computed
  -- again by anyone holding a user_id.
  select w into v_candidate
    from unnest(v_words) as w
   where not (w = any (v_taken))
   order by random()
   limit 1;

  -- More anonymous posters in one room than there are words. Falling back to a
  -- numbered alias keeps posting working; it is ugly and it is reachable, and
  -- silently reusing a word would be worse than ugly.
  new.author_alias := coalesce(
    v_candidate,
    'Member ' || (coalesce(array_length(v_taken, 1), 0) + 1)::text
  );
  return new;
end;
$$;

drop trigger if exists room_messages_alias on public.room_messages;
create trigger room_messages_alias
  before insert on public.room_messages
  for each row execute function public.assign_room_alias();

-- ── the column a client may no longer name ────────────────────────────────────
revoke select on public.room_messages from authenticated;
grant select (id, room_id, body, deleted_at, created_at, anonymous, author_alias)
  on public.room_messages to authenticated;

-- Insert still needs user_id: a member writes their own id into their own post,
-- and the policy checks it equals auth.uid(). Writing it is not reading it.
grant insert (room_id, user_id, body, anonymous) on public.room_messages to authenticated;

-- ── the feed ──────────────────────────────────────────────────────────────────
--
-- SECURITY DEFINER, because it has to read user_id to decide what to show and
-- authenticated may no longer select that column. Every wall is re-applied
-- explicitly below — and by calling the SAME predicates the dropped policy
-- called, so this reuses the wall rather than restating it.
create or replace function public.room_feed(p_room_id uuid, p_limit integer default 100)
returns table (
  id uuid,
  body text,
  created_at timestamptz,
  anonymous boolean,
  /** Null for an anonymous post. There is no branch where it is not. */
  author_id uuid,
  author_name text,
  is_mine boolean
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
    m.user_id = (select auth.uid())
  from public.room_messages m
  left join public.profiles p on p.id = m.user_id
  where m.room_id = p_room_id
    and m.deleted_at is null
    -- The same three terms the policy carries. i_am_in_room also covers the
    -- community scope wall, because membership of a room out of scope cannot
    -- be created in the first place.
    and public.i_am_in_room(m.room_id)
    and not public.i_am_blocked_with(m.user_id)
  order by m.created_at desc
  limit greatest(least(p_limit, 200), 1);
$$;

comment on function public.room_feed(uuid, integer) is
  'A room''s posts as they may be shown: an author id and display name only where the author chose to be named, an alias otherwise.';

revoke all on function public.room_feed(uuid, integer) from public, anon;
grant execute on function public.room_feed(uuid, integer) to authenticated;

-- ── blocking the author of a post, without learning who they are ──────────────
--
-- lib/safety.ts resolved this by selecting user_id with the caller's own
-- privileges, under a comment reading "the id never leaves the server" — true
-- of that code and not true of the privilege that allowed it. With the column
-- revoked that select now returns nothing, and the block would silently do
-- nothing at all. This does the resolve and the write in one place, where the
-- id is never a value any client could have asked for.
create or replace function public.block_room_message_author(p_room_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := (select auth.uid());
  v_author uuid;
begin
  if v_me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Only from a post the caller can actually see. Without this, any message id
  -- — guessed, or lifted from somewhere else — would block its author, which
  -- turns a safety control into an oracle for "does this id exist".
  select m.user_id into v_author
    from public.room_messages m
   where m.id = p_room_message_id
     and m.deleted_at is null
     and public.i_am_in_room(m.room_id);

  if v_author is null or v_author = v_me then
    raise exception 'no such post' using errcode = 'P0002';
  end if;

  insert into public.blocks (blocker_id, blocked_id)
  values (v_me, v_author)
  on conflict do nothing;
end;
$$;

comment on function public.block_room_message_author(uuid) is
  'Blocks the author of a room post the caller can see, without the author id ever being selectable by them.';

revoke all on function public.block_room_message_author(uuid) from public, anon;
grant execute on function public.block_room_message_author(uuid) to authenticated;
