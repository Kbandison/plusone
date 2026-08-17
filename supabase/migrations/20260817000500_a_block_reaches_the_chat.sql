-- Blocking someone from inside a chat did not stop them messaging you.
--
-- The chat policies test only i_am_in_chat and chat_accepts_messages. Neither
-- carries a block term, and nothing on `blocks` touched an existing chat —
-- is_blocked_either_way appears in can_view_profile, connect_permitted,
-- preview_permitted and the room_messages policy, and nowhere else. Yet the
-- Block button is rendered inside a live chat, and lib/safety.ts stated as fact
-- that "the moment this row exists neither member appears to the other anywhere
-- — drop, browse, rooms, or an existing chat". The chat was the one place it
-- did not hold: after blocking, the other member could keep sending and the
-- blocker kept receiving.
--
-- The block now CLOSES the chat rather than silently swallowing writes. Two
-- reasons for closing over refusing:
--
--   - chat_accepts_messages already gates the insert policy, so closing makes
--     the existing wall do the work. A separate block term in the policy would
--     be a second rule to keep in step with the first.
--   - §3.5: no interaction ends in silence. A chat that accepts nothing while
--     still looking open is exactly that. Closed is a state both members can
--     see and understand.
--
-- NOT DONE, deliberately, and flagged for Kevin: existing messages stay
-- readable to both. Hiding them retroactively is a product decision — it also
-- destroys what a member might want to attach to a report — and §5.3 does not
-- ask for it.
--
-- 'closed_by_member' rather than 'closed_fuse': a block is a person ending it,
-- not a timer running out, and the two read differently in the admin queue and
-- in any later count of why chats end. closed_reason is 'blocked' with no
-- closure template and no personal line — the §3.5 note is something a member
-- chooses to write, and nobody owes one to someone they have just blocked.
create or replace function public.close_chats_on_block()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.chats c
     set status = 'closed_by_member',
         closed_reason = 'blocked',
         closed_at = now(),
         -- The fuse is over; leaving it set would keep the sweep interested in
         -- a chat that has already ended.
         fuse_expires_at = null
    from public.connects k
   where c.connect_id = k.id
     and c.status = 'open'
     and (
       (k.initiator_id = new.blocker_id and k.target_id = new.blocked_id)
       or (k.initiator_id = new.blocked_id and k.target_id = new.blocker_id)
     );

  return new;
end;
$$;

drop trigger if exists blocks_close_chats on public.blocks;
create trigger blocks_close_chats
  after insert on public.blocks
  for each row execute function public.close_chats_on_block();
