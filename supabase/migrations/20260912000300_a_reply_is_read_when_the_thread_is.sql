-- Unread replies clear a thread at a time, not a room at a time.
--
-- `my_nav_counts` measures an unread reply against `room_reads.last_read_at`,
-- which is per ROOM. So opening any post in Disclosure stories cleared every
-- unread reply in it, including replies to posts the member never opened.
-- Kevin: "that would bother me." It should — the badge said one thing and
-- clearing it required nothing to do with the thing it counted.
--
-- ── why not room_post_views, which already exists ──────────────────────────
--
-- It looked like the answer: keyed (message_id, user_id), and
-- `record_room_views` records only ROOT posts, which is exactly per-thread
-- granularity. Two things kill it.
--
-- `first_seen_at` never advances — `on conflict do nothing` — so a reply
-- arriving after the first view would stay unread for ever. That is fixable
-- with a second column. The one that is not: THE FEED RECORDS VIEWS TOO, for
-- every post that came up. Its own comment says "'Seen' means it came up in
-- your feed, which is what every feed counts and is why the copy says seen
-- rather than read." Scrolling past a post would clear a badge for a reply the
-- member never saw, which is a worse version of the bug being fixed.
--
-- This codebase distinguishes seen from read on purpose. A read marker does not
-- belong in a table named for views.
--
-- ── a BACKFILL, not a fallback ─────────────────────────────────────────────
--
-- The first version of this measured against the thread marker OR, where there
-- was none, the room marker — so that members who had read a room before this
-- existed would not wake up to weeks-old replies marked unread.
--
-- It reintroduced the bug. `rooms/[roomId]/page.tsx` calls `mark_room_read`
-- when the room opens, so opening the room still cleared every reply badge in
-- it: exactly what this migration exists to stop, reached by a different route.
-- Caught by testing the four cases rather than the one being fixed.
--
-- So the room markers are copied ONCE, here, into thread markers — and only for
-- root posts the member wrote, which is all the count ever looks at. After
-- that, nothing but opening a thread clears a thread.

create table public.thread_reads (
  root_id uuid not null references public.room_messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),

  primary key (root_id, user_id)
);

alter table public.thread_reads enable row level security;

-- Own rows only, and only for a thread in a room you are in. The same two tests
-- room_reads carries, for the same two reasons: without the first a co-member
-- learns when you last looked, and without the second a member could write a
-- marker for a room outside their community scope and confirm it exists.
create policy "own thread markers in your own rooms" on public.thread_reads
  for all
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.room_messages m
       where m.id = root_id and public.i_am_in_room(m.room_id)
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.room_messages m
       where m.id = root_id and public.i_am_in_room(m.room_id)
    )
  );

-- Supabase's default privileges grant every role everything on a NEW object in
-- this schema, and check:db has caught this omission five times now.
revoke all on public.thread_reads from anon, authenticated;
grant select, insert, update on public.thread_reads to authenticated;

create index thread_reads_user_ix on public.thread_reads (user_id, root_id);

-- The one-time copy. A member who had already read a room is treated as having
-- read every thread of their own in it, as of that moment — so nothing that was
-- read before today comes back unread, and nothing after today is cleared by
-- anything but opening the thread itself.
insert into public.thread_reads (root_id, user_id, last_read_at)
select post.id, rd.user_id, rd.last_read_at
  from public.room_messages post
  join public.room_reads rd
    on rd.room_id = post.room_id and rd.user_id = post.user_id
 where post.parent_id is null
   and post.deleted_at is null
on conflict do nothing;

/**
 * Opening a thread. Upsert, so the marker ADVANCES — unlike record_room_views,
 * whose `on conflict do nothing` is correct for a first-seen count and useless
 * as a read marker.
 */
create or replace function public.mark_thread_read(p_root_id uuid)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  insert into public.thread_reads (root_id, user_id)
  values (p_root_id, (select auth.uid()))
  on conflict (root_id, user_id) do update set last_read_at = now();
$$;

grant execute on function public.mark_thread_read(uuid) to authenticated;

comment on function public.mark_thread_read(uuid) is
  'Marks a thread read for the caller, advancing on every open. Separate from record_room_views, which counts a post being SEEN in a feed and must not clear anything.';

/**
 * The nav counts again, measuring a reply against its own thread.
 *
 * Everything else is unchanged from 20260912000100 — still a definer, because
 * room_messages.user_id is not granted to members, and still carrying the two
 * walls a definer does not inherit.
 */
create or replace function public.my_nav_counts()
returns table (messages integer, replies integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    (
      select count(m.id)::integer
        from public.messages m
        left join public.chat_reads cr
          on cr.chat_id = m.chat_id and cr.user_id = (select auth.uid())
       where public.i_am_in_chat(m.chat_id)
         and m.sender_id is distinct from (select auth.uid())
         and m.deleted_at is null
         and (cr.last_read_at is null or m.created_at > cr.last_read_at)
    ),
    (
      select count(reply.id)::integer
        from public.room_messages reply
        join public.room_messages post on post.id = reply.parent_id
        left join public.thread_reads tr
          on tr.root_id = post.id and tr.user_id = (select auth.uid())
       where post.user_id = (select auth.uid())
         and post.deleted_at is null
         and reply.user_id is distinct from (select auth.uid())
         and reply.deleted_at is null
         and exists (
           select 1 from public.room_members rmem
            where rmem.room_id = reply.room_id
              and rmem.user_id = (select auth.uid())
         )
         -- The thread's own marker, and nothing else. room_reads is NOT
         -- consulted: opening the room calls mark_room_read, so reading it here
         -- would let opening the room clear a reply the member never saw.
         and reply.created_at > coalesce(tr.last_read_at, '-infinity'::timestamptz)
    );
$$;

revoke all on function public.my_nav_counts() from public, anon;
grant execute on function public.my_nav_counts() to authenticated;

comment on function public.my_nav_counts() is
  'Unread messages, and unread replies to the caller''s own room posts. A reply is unread until its THREAD is opened. room_reads is deliberately not consulted — opening a room marks it read, and that must not clear a reply.';
