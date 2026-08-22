-- A message that arrives without being asked for.
--
-- A chat you have to reload is not a chat. Everything here is server rendered,
-- correct on load and then frozen, so the other person's reply sat in the
-- database while the screen showed the conversation as it was when it opened.
--
-- ── a doorbell, not a delivery ───────────────────────────────────────────────
--
-- The client is told THAT this chat changed and nothing else. It then refetches
-- through the page it was already using, which is a normal server render with
-- the member's own session — so may_read_chat, the block wall and every column
-- grant apply exactly as they do on a cold load, because it IS a cold load.
--
-- That matters more here than in most apps. Every wall in this schema is three
-- layers deep: policies, column grants, and security-definer functions. Ten
-- columns are unreadable by members on purpose, and the things the app renders
-- are produced by FUNCTIONS rather than by rows. A realtime payload can honour
-- the first two layers and cannot reproduce the third. So it carries no payload
-- worth reproducing.
--
-- ── why this rings `chats` and not a broadcast ───────────────────────────────
--
-- The first attempt used realtime.send() on a private channel, which is the
-- documented way and is better on paper: an empty payload, authorised once per
-- channel rather than once per subscriber per row.
--
-- It silently did nothing. realtime.messages is partitioned by day, this
-- project has zero partitions, and realtime.send catches its own failure and
-- turns it into a WARNING nobody sees:
--
--     WarnSendingBroadcastMessage: no partition of relation "messages" found
--
-- The partitions are created by Supabase's own Realtime service; there is no
-- pg_cron here and no maintenance function in the realtime schema to call. So
-- broadcast depends on a platform detail that fails invisibly, and "did my
-- message arrive" is the wrong feature to build on something that fails
-- invisibly.
--
-- Postgres Changes reads the WAL and needs none of that. Bumping the chat's own
-- row is the smallest thing that can be noticed: the row carries no message
-- text, RLS already restricts it to participants, and members hold SELECT on
-- chats and nothing else — so nobody can ring this bell but the trigger.

-- Undo the broadcast attempt, so replaying these migrations from empty lands in
-- one state rather than two.
drop trigger if exists ring_chat_on_message on public.messages;
drop policy if exists "participants may listen to their own chat" on realtime.messages;

create or replace function public.ring_chat()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Touching the row IS the notification. chats_set_updated_at maintains this
  -- column on every update anyway; saying so explicitly is for whoever reads
  -- this next and wonders what the statement is for.
  --
  -- It also corrects the inbox, which sorted by updated_at while updated_at
  -- only moved on a STATUS change — so a thread with twenty unread messages
  -- sat below one where somebody had proposed a date and nothing since. A new
  -- message is a change to the conversation; now the column agrees.
  update public.chats set updated_at = now() where id = new.chat_id;
  return null;
end;
$$;

revoke all on function public.ring_chat() from public, anon, authenticated;

comment on function public.ring_chat() is
  'Touches the chat row when a message lands, so participants subscribed to it refetch. Carries no payload: the client re-reads through the page, where every wall applies as on a cold load.';

-- AFTER: a doorbell for a row that then fails to commit is a refetch that finds
-- nothing. FOR EACH ROW, because a statement-level trigger cannot see which
-- chat to touch.
create trigger ring_chat_on_message
  after insert on public.messages
  for each row
  execute function public.ring_chat();

-- ── what the client may watch ────────────────────────────────────────────────
--
-- Adding a table here puts its rows on the replication stream, so this list is
-- a privacy decision and not a performance one. `chats` carries a status, a
-- fuse, a date plan and a closure note — everything a participant can already
-- read on the page, and no message text at all. It does NOT include `messages`,
-- deliberately: the words people said to each other have no reason to travel a
-- second time over a different channel with a different authorisation path.
--
-- Realtime still evaluates the chats RLS policy per subscriber, so a member who
-- may not read a chat is not told when it changes.
alter publication supabase_realtime add table public.chats;
