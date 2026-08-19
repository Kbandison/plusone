-- The fix in 20260819000200 and 20260819000300 was forward-only.
--
-- Both changed a trigger, so they govern every block from now on and none of
-- the ones already in the table. The first block placed against this database
-- sat there afterwards with closure_template null and blocked_at null, which
-- meant:
--
--   · closed_without_a_note still read 1 — the metric whose own comment says
--     "if it is ever non-zero, the product's central promise has broken". It
--     was non-zero for a block, which is exactly the false alarm the earlier
--     migration set out to stop. Fixing the trigger and leaving the row is
--     fixing the cause and keeping the symptom.
--
--   · blocked_at null meant may_read_chat treated it as an ordinary close, so
--     the thread stayed readable to both members — including the one who was
--     blocked. The whole model shipped and did not apply to the only block that
--     existed.
--
-- A migration rather than a one-off script, because a script that has to be
-- remembered is a script that runs on one database and not the next one.

update public.chats
   set closure_template = coalesce(closure_template, 0),
       -- closed_at is when the block landed: close_chats_on_block sets them in
       -- the same statement, so for these rows they are the same instant.
       blocked_at = coalesce(blocked_at, closed_at)
 where closed_reason = 'blocked'
   and (closure_template is null or blocked_at is null);

-- Any other closed chat missing its note. There should be none — the sweep
-- writes one and the close form requires one — but the metric counts them all
-- the same, and a null here is a chat that ended in the silence §6.2 says is
-- impossible by construction.
update public.chats
   set closure_template = 0
 where status in ('closed_fuse', 'closed_by_member')
   and closure_template is null;
