-- Which rooms have something new in them.
--
-- The rooms were a page of five identical cards and are now a bar of five
-- identical tabs. Either way nothing on them says which room anyone is in, so
-- the only way to find out is to open all five — every time.
--
-- Same shape as chat_reads and for the same reason: a read marker is a fact
-- about one person's relationship to a room, not a fact about the room, so it
-- does not belong in a column on `rooms`.
--
-- Deliberately NOT a count of unread posts. A number invites a member to clear
-- it, and a support room is not an inbox to get to zero — Decision #26's whole
-- posture is against mechanics that make people feel behind. A dot says there
-- is something new; it does not say you are failing to keep up.
create table public.room_reads (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),

  primary key (room_id, user_id)
);

alter table public.room_reads enable row level security;

-- Own rows only, AND only for a room you are in. Either test alone leaks:
-- without the first, a co-member could read your marker and learn when you last
-- looked; without the second, a member could write markers for rooms they are
-- not in — including rooms outside their community scope, which would let them
-- confirm a room exists that the scope wall exists to hide.
create policy "own read markers in your own rooms" on public.room_reads
  for all
  using (user_id = (select auth.uid()) and public.i_am_in_room(room_id))
  with check (user_id = (select auth.uid()) and public.i_am_in_room(room_id));

-- Supabase's default privileges grant every role everything on a NEW object in
-- this schema. check:db has caught this omission four times now — on
-- visible_profiles, matched_profiles, chat_reads, and it would have here.
revoke all on public.room_reads from anon, authenticated;
grant select, insert, update on public.room_reads to authenticated;

create index room_reads_user_ix on public.room_reads (user_id, room_id);

/*
 * Marks a room read, now.
 *
 * An upsert: opening a room twice is the ordinary case, not a conflict. A
 * function rather than a direct write so the timestamp comes from the database
 * — a client-supplied one could be set in the future to keep a room
 * permanently read.
 */
create function public.mark_room_read(p_room_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  insert into public.room_reads (room_id, user_id, last_read_at)
  values (p_room_id, (select auth.uid()), now())
  on conflict (room_id, user_id) do update set last_read_at = now();
end;
$$;

grant execute on function public.mark_room_read(uuid) to authenticated;

/*
 * The activity behind each tab, in one call.
 *
 * A per-room query from the layout would be five round trips on every
 * navigation between rooms, which is the one place in the app a member moves
 * quickly.
 *
 * SECURITY INVOKER, so every wall still applies: rooms out of community scope
 * never appear, and the room_messages policy — which excludes blocked members'
 * posts (20260815001200) — decides what counts as activity. A room whose only
 * new post is from somebody you blocked is not a room with something new in it.
 */
create function public.room_activity()
returns table (room_id uuid, last_post_at timestamptz, unread boolean)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    r.id,
    m.last_post_at,
    -- Never looked, and there is something to see, is unread — which is how a
    -- room a member has just joined should read.
    m.last_post_at is not null
      and (rd.last_read_at is null or m.last_post_at > rd.last_read_at) as unread
  from public.rooms r
  left join lateral (
    select max(rm.created_at) as last_post_at
      from public.room_messages rm
     where rm.room_id = r.id
  ) m on true
  left join public.room_reads rd
    on rd.room_id = r.id and rd.user_id = (select auth.uid());
$$;

comment on function public.room_activity() is
  'Per-room last post and unread flag for the caller, through the same walls the room screens read.';

grant execute on function public.room_activity() to authenticated;
