-- Rooms and the inbox, on the same doorbell as the chat.
--
-- 20260821000600 established the shape: touch a row the reader can already see,
-- let them refetch through the page, carry no payload. Every wall applies
-- because the refetch is an ordinary server render. This extends it to the two
-- other surfaces where something arrives from somebody else.
--
-- What is deliberately NOT here: likes and views. They fire constantly, change
-- a number nobody is waiting on, and would wake every member of a room for each
-- one. Realtime is for things that arrive, not for things that tick.

-- ── rooms ────────────────────────────────────────────────────────────────────
--
-- A column rather than an updated_at, because rooms has neither and inventing
-- an updated_at would mean a row whose "last change" is really "last post" —
-- true today and misleading the first time somebody edits a room's title.
--
-- Useful beyond the doorbell: the room list has no sign of life on it, and this
-- is the number that would give it one.
alter table public.rooms add column if not exists last_post_at timestamptz;

create or replace function public.ring_room()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Replies are room_messages too, so this covers a comment landing in a thread
  -- as well as a post landing in the feed. Both are somebody arriving.
  update public.rooms set last_post_at = now() where id = new.room_id;
  return null;
end;
$$;

revoke all on function public.ring_room() from public, anon, authenticated;

comment on function public.ring_room() is
  'Touches the room when a post or reply lands, so members reading it refetch. Carries no payload: room_feed() applies the anonymity and block walls on the way back, and a realtime row could not.';

create trigger ring_room_on_message
  after insert on public.room_messages
  for each row
  execute function public.ring_room();

-- ── what streams ─────────────────────────────────────────────────────────────
--
-- `rooms` is a title, a description and a slow-mode setting. It is already
-- readable by anyone in scope — "rooms in scope are readable" — and carries
-- nothing about who posted what. The posts themselves stay off the wire, which
-- matters more here than in a chat: room_messages.user_id is REVOKED from
-- members because an anonymous post must not be traceable, and the feed's
-- author redaction is done by room_feed(), a function. A row on a socket cannot
-- reproduce a function, so no row goes on the socket.
alter publication supabase_realtime add table public.rooms;

-- `connects` is how the inbox learns that somebody replied to a prompt, and
-- that a connect was accepted or declined. "own connects are readable" scopes
-- it to the two people involved, and Realtime evaluates that per subscriber —
-- so this streams a member their own connects and nobody else's.
--
-- prompt_reply travels with it, which is what the sender wrote and what the
-- recipient is about to read on the page anyway. No third party can receive it.
alter publication supabase_realtime add table public.connects;
