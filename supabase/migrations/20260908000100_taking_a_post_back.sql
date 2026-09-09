-- Deleting your own room post.
--
-- ── the column has been here since Milestone 1 and nothing ever wrote it ────
--
-- `room_messages.deleted_at` and `deleted_by` were created in 20260813000200
-- for moderation, and no function has ever set them. The read policy already
-- honours the flag — `using (deleted_at is null and i_am_in_room(room_id))`,
-- 20260814001000 — and so does `room_feed`. So this is a writer for a mechanism
-- that was already built and never connected.
--
-- ── a flag, NOT a delete, for the same reason unsend is ─────────────────────
--
-- `reports.reported_room_message_id` is `on delete set null`, so removing the
-- row does not remove a report — it removes the EVIDENCE from one, and a
-- moderator opens an accusation with nothing attached. The row stays, its body
-- stays, and RLS is what makes it invisible to every member.
--
-- Nothing needs redacting into a second table the way `messages` did. There the
-- row remains VISIBLE as a tombstone, so the content had to be moved out from
-- under it; here the row is hidden outright by a predicate that already exists.
--
-- ── what it costs, which the copy has to say out loud ───────────────────────
--
-- `room_feed` selects top-level posts and nests replies underneath. Hiding a
-- parent therefore takes its replies out of view with it, and those are other
-- people's words.
--
-- Refusing to delete a post that has replies was the alternative and is the
-- wrong call HERE, whatever it is elsewhere: this app exists so that somebody
-- can control their own disclosure, and a member who posted about their
-- diagnosis must be able to withdraw it. Blocking that because a stranger
-- replied would put a stranger in charge of it. So the deletion is allowed and
-- the confirmation says what goes with it.

create or replace function public.delete_own_room_message(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.room_messages%rowtype;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  -- Definer, so this sees the row whatever the read policy says — including one
  -- already deleted, which is what makes the idempotent branch below reachable.
  select * into v_row from public.room_messages where id = p_id;

  -- Not found and not yours are the SAME refusal, so this cannot be used to
  -- discover whether a post id exists in a room the caller cannot see.
  if v_row.id is null or v_row.user_id <> v_uid then
    raise exception 'that post is not yours to delete' using errcode = '42501';
  end if;

  -- Pressing it twice on a slow connection is not a mistake worth an error.
  if v_row.deleted_at is not null then
    return;
  end if;

  update public.room_messages
     set deleted_at = now(),
         -- The author, not a moderator. Worth recording separately: a post
         -- withdrawn by the person who wrote it and one removed by moderation
         -- are different events, and only this column tells them apart.
         deleted_by = v_uid
   where id = p_id;
end;
$$;

revoke all on function public.delete_own_room_message(uuid) from public, anon;
grant execute on function public.delete_own_room_message(uuid) to authenticated;
