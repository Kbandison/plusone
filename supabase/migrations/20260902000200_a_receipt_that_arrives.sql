-- Read receipts, live — and the two things that had to change first.
--
-- 20260902000100 shipped the receipt as a server render, so it appeared only
-- when something else re-rendered the page. Making it arrive by itself needs
-- Realtime, and Realtime needs the subscriber to be allowed to SELECT the row.
-- The policy on `chat_reads` is own-rows-only, so the other person's marker is
-- invisible to it and no event would ever be delivered.

-- ── 1. mark_chat_read stops writing when nothing changed ────────────────────
--
-- THIS IS THE LOOP GUARD AND IT COMES FIRST.
--
-- `live-refresh.tsx` already warns about the shape: "Marking the list read is
-- an UPDATE on the same table, so a watch for `*` would hear the page's own
-- bookkeeping and refresh the screen the member is reading — turning a
-- once-per-arrival doorbell into one that also rings when you answer it."
--
-- The chat page calls this on every render. Unconditional `last_read_at = now()`
-- means every render writes, every write is an event, and every event is a
-- render. Watching this table without fixing that is an infinite loop, not a
-- slow page.
--
-- So it only writes when the marker is actually behind something. Re-reading a
-- chat with nothing new in it is now a no-op that produces no event at all,
-- which also stops one member's idle tab waking the other's.
create or replace function public.mark_chat_read(p_chat_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  insert into public.chat_reads (chat_id, user_id, last_read_at)
  values (p_chat_id, (select auth.uid()), now())
  on conflict (chat_id, user_id) do update
    set last_read_at = now()
    -- Only when there is something newer than the marker. `is distinct from`
    -- rather than `<` so a chat with no messages at all does not write either.
    where public.chat_reads.last_read_at is distinct from null
      and public.chat_reads.last_read_at < (
        select max(m.created_at)
          from public.messages m
         where m.chat_id = p_chat_id
      );
end;
$$;

-- ── 2. the other person's marker becomes readable, if they allow it ─────────
--
-- Split from one FOR ALL policy into three, because only SELECT should widen.
-- Writing somebody else's read marker was never possible and must not become
-- possible: this is the difference between "you can see that I read it" and
-- "you can decide that I read it".
--
-- The hide flag is enforced HERE rather than only in `chat_read_at()`, which
-- means Realtime honours it too — a member who has hidden their receipts
-- generates no event the other side is allowed to receive, so there is nothing
-- to leak and nothing to filter client-side.
drop policy if exists "own read markers in your own chats" on public.chat_reads;

create policy "read markers in your own chats" on public.chat_reads
  for select
  using (
    public.i_am_in_chat(chat_id)
    and (
      user_id = (select auth.uid())
      or not exists (
        select 1
          from public.profiles p
         where p.id = public.chat_reads.user_id
           and p.hide_read_receipts
      )
    )
  );

create policy "write only your own read marker" on public.chat_reads
  for insert
  with check (user_id = (select auth.uid()) and public.i_am_in_chat(chat_id));

create policy "move only your own read marker" on public.chat_reads
  for update
  using (user_id = (select auth.uid()) and public.i_am_in_chat(chat_id))
  with check (user_id = (select auth.uid()) and public.i_am_in_chat(chat_id));

-- ── 3. and it has to be published for Realtime to carry it ─────────────────
--
-- Guarded, because adding a table already in the publication is an error and
-- this file has to be re-runnable alongside the others.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_reads'
  ) then
    alter publication supabase_realtime add table public.chat_reads;
  end if;
end;
$$;
