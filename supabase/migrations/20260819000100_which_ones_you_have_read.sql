-- Read state, so the inbox can say which threads are waiting on you.
--
-- The list shows three things about every thread: it needs your reply, it is
-- waiting on them, or there is something in it you have not seen. The first two
-- are derivable from who sent the last message. The third is not derivable from
-- anything — nothing has ever recorded that a member looked at a chat — and
-- approximating it with "their message is newer than yours" is wrong in the one
-- case that matters: you open a thread, read it, and it still claims to be
-- unread until you type something back.
--
-- One row per member per chat, and nothing else on it. A read marker is not a
-- fact about the chat, it is a fact about one person's relationship to it, and
-- putting a column on `chats` for each side would have made every read a write
-- to a row the other person also owns.
create table public.chat_reads (
  chat_id uuid not null references public.chats (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),

  primary key (chat_id, user_id)
);

alter table public.chat_reads enable row level security;

-- Own rows only, AND only for a chat you are actually in. Either test alone
-- leaks: without the first, a participant could read the other side's marker
-- and learn exactly when they were last looked at; without the second, a member
-- could write markers for chats they have nothing to do with.
create policy "own read markers in your own chats" on public.chat_reads
  for all
  using (user_id = (select auth.uid()) and public.i_am_in_chat(chat_id))
  with check (user_id = (select auth.uid()) and public.i_am_in_chat(chat_id));

-- Supabase's default privileges grant every role everything on a NEW object in
-- this schema. 20260813000700 revoked that once, before this table existed, and
-- check:db has now caught the same omission three times — on visible_profiles,
-- on matched_profiles, and here. Every new object in this schema needs this
-- line.
revoke all on public.chat_reads from anon, authenticated;
grant select, insert, update on public.chat_reads to authenticated;

create index chat_reads_user_ix on public.chat_reads (user_id, chat_id);

/*
 * Marks a chat read, now.
 *
 * An upsert rather than an insert: opening a thread twice is the ordinary case,
 * not a conflict. It is a function rather than a direct write so the timestamp
 * comes from the database — a client-supplied one could be set in the future to
 * make a thread permanently "read", which is a small lie a member could tell
 * their own inbox but a lie the schema should not accept.
 */
create function public.mark_chat_read(p_chat_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  insert into public.chat_reads (chat_id, user_id, last_read_at)
  values (p_chat_id, (select auth.uid()), now())
  on conflict (chat_id, user_id) do update set last_read_at = now();
end;
$$;

grant execute on function public.mark_chat_read(uuid) to authenticated;
