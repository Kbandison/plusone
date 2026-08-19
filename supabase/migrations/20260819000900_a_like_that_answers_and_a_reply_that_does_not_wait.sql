-- Two things a member found by using it.
--
-- ── 1. THE LIKE CAME BACK ─────────────────────────────────────────────────────
-- Press like, see 1, press again, see 0 — and then watch it return to 1.
--
-- toggle_room_like returned only whether the row now exists, and the action
-- returned nothing at all. useOptimistic DISCARDS its value when the transition
-- ends and falls back to the props it was given; nothing revalidated the page,
-- so those props still said what they said when the server rendered. The
-- optimistic number was correct, briefly, and then the stale one won.
--
-- revalidatePath would fix it and is the wrong tool here: a like is the one
-- control a member presses without thinking, and re-rendering a hundred-post
-- feed on every press is a lot of work to learn a number this function already
-- knows. So it returns the number, and the button takes it as truth rather than
-- guessing and hoping the page catches up.
drop function if exists public.toggle_room_like(uuid);
create function public.toggle_room_like(p_message_id uuid)
returns table (liked boolean, like_count integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := (select auth.uid());
  v_room uuid;
  v_deleted integer;
  v_liked boolean;
begin
  if v_me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Only a post the caller can see. Without this any id — guessed, or lifted
  -- from elsewhere — could be liked, which turns the counter into an oracle for
  -- which posts exist and lets somebody inflate a stranger's.
  select m.room_id into v_room
    from public.room_messages m
   where m.id = p_message_id
     and m.deleted_at is null
     and public.i_am_in_room(m.room_id)
     and not public.i_am_blocked_with(m.user_id);

  if v_room is null then
    raise exception 'no such post' using errcode = 'P0002';
  end if;

  delete from public.room_likes where message_id = p_message_id and user_id = v_me;
  get diagnostics v_deleted = row_count;

  if v_deleted > 0 then
    v_liked := false;
  else
    insert into public.room_likes (message_id, user_id) values (p_message_id, v_me)
    on conflict do nothing;
    v_liked := true;
  end if;

  -- Counted after the write, in the same transaction, so what comes back is
  -- what is actually stored rather than what this function expects to be.
  return query
    select v_liked, (select count(*) from public.room_likes l where l.message_id = p_message_id)::integer;
end;
$$;

revoke all on function public.toggle_room_like(uuid) from public, anon;
grant execute on function public.toggle_room_like(uuid) to authenticated;

-- ── 2. A REPLY IS NOT A FLOOD ─────────────────────────────────────────────────
-- Kevin, 2026-08-19: "i wouldn't want someone replying to someone else to get
-- throttled."
--
-- Slow mode exists so one member cannot fill a room. Answering somebody is not
-- filling a room — it is the thing the room is for — and a sixty-second wait
-- between a reply and its follow-up ends the conversation it was written to
-- protect.
--
-- The concern this leaves is reply-flooding, which the trigger can no longer
-- see. Rather than argue it, the throttle stays available as a config key
-- defaulting to OFF: if it ever happens, it is one row in app_config and no
-- migration, and the code for it is already here and already correct.
create or replace function public.enforce_room_slow_mode()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_seconds integer;
  v_last timestamptz;
begin
  if new.parent_id is null then
    select r.slow_mode_seconds into v_seconds from public.rooms r where r.id = new.room_id;
  else
    -- Comments have their own, off by default. Deliberately not the room's:
    -- the number that makes somebody pause before their second post is not the
    -- number that should sit between two halves of an answer.
    v_seconds := public.config_int('rooms.comment_slow_mode_seconds', 0);
  end if;

  if coalesce(v_seconds, 0) <= 0 then
    return new;
  end if;

  select max(m.created_at) into v_last
    from public.room_messages m
   where m.room_id = new.room_id
     and m.user_id = new.user_id
     -- Like against like. A comment's cooldown counts comments, so a top-level
     -- post no longer silently blocks a reply written a moment later.
     and (m.parent_id is null) = (new.parent_id is null);

  if v_last is not null and now() < v_last + make_interval(secs => v_seconds) then
    -- The remaining wait, not the room's setting: a member who has waited most
    -- of it should be told what is left.
    raise exception 'slow mode: wait % more seconds',
      ceil(extract(epoch from (v_last + make_interval(secs => v_seconds) - now())))::integer
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

insert into public.app_config (key, value) values
  ('rooms.comment_slow_mode_seconds', to_jsonb(0))
on conflict (key) do nothing;

-- ── 3. HALVED ────────────────────────────────────────────────────────────────
-- Kevin's numbers. The old ones were mine and had never been used by anybody.
update public.rooms set slow_mode_seconds = greatest(slow_mode_seconds / 2, 5);
