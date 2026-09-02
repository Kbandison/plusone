-- Read receipts, on by default, hideable only with premium.
--
-- The marker already exists. `chat_reads` (20260819000100) holds `last_read_at`
-- per chat per member for the unread badges, and its policy is
-- `user_id = auth.uid() and i_am_in_chat(chat_id)` — private to its owner. So
-- this file exposes an existing value to the other person in the chat rather
-- than collecting a new one.
--
-- ── why premium buys HIDING and not SEEING ──────────────────────────────────
--
-- Kevin's call, 2026-09-01, against a proposal that premium should buy the
-- ability to see receipts. Two reasons, and the second is the durable one.
-- Free members would have nothing to pay for; and PREMIUM_LEAD promises
-- "who can see you, and how far you can reach", so seeing other people is a
-- third thing the tier does not claim, where controlling what others see of you
-- is incognito browse and per-photo privacy again.
--
-- ── checked against PREMIUM_NEVER, and it clears only just ──────────────────
--
-- "nobody gets ghosted" is the brand tagline and the never-list bans
-- "exemptions from closure notes", so paying to hide a receipt reads like
-- paying to ghost quietly. It is not: ghosting is handled by the seven-day fuse
-- and the closure note, and neither is touched here. A premium member who hides
-- receipts still meets the fuse and still owes the note. If that ever stops
-- being true, this feature needs revisiting.

alter table public.profiles
  add column if not exists hide_read_receipts boolean not null default false;

comment on column public.profiles.hide_read_receipts is
  'Premium: stop the other person seeing when you read. Retained on lapse — premium gates SETTING it, never keeping it.';

-- NOT granted to authenticated, deliberately.
--
-- `profiles` carries no whole-table update grant — column-level only — so the
-- strongest gate available is to never grant the column at all and write it
-- through a definer function. A member then has no path to it rather than a
-- checked one. That is the shape 18a settled, and the opposite of
-- `profile_photos`, which needed a trigger precisely because it DOES carry a
-- whole-table grant. Read information_schema.role_table_grants, never the
-- migration that created the table.
revoke update (hide_read_receipts) on public.profiles from anon, authenticated;
grant select (hide_read_receipts) on public.profiles to authenticated;

/**
 * Set your own flag, if you are premium.
 *
 * Turning it ON requires premium. Turning it OFF never does: a lapsed member
 * who could not clear their own flag would be stranded, and the rule this
 * schema keeps is that the safe direction is always available. The mirror of
 * 18b, where clearing a photo override back to "follow the profile" is ungated.
 */
create or replace function public.set_read_receipts_hidden(p_hidden boolean)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  -- Hiding is the premium half. Un-hiding is always allowed.
  if p_hidden and not public.is_premium(v_uid) then
    raise exception 'hiding read receipts requires premium' using errcode = '42501';
  end if;

  update public.profiles
     set hide_read_receipts = p_hidden
   where id = v_uid;

  return p_hidden;
end;
$$;

revoke all on function public.set_read_receipts_hidden(boolean) from public, anon;
grant execute on function public.set_read_receipts_hidden(boolean) to authenticated;

/**
 * When the other person in this chat last read it, or null.
 *
 * A function rather than a widened policy on `chat_reads`. Widening the policy
 * to `i_am_in_chat(chat_id)` would expose the raw row and then need the
 * hide-flag checked in the same predicate, on a table whose whole-table select
 * grant means every column travels. This returns one timestamp and nothing else.
 *
 * Null covers every case that is not "they read it and are happy to say so" —
 * not in the chat, nobody else, never read, or hidden — because a caller that
 * can tell those apart can probe for the flag.
 */
create or replace function public.chat_read_at(p_chat_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public, extensions
as $$
  select r.last_read_at
    from public.chat_reads r
    join public.profiles p on p.id = r.user_id
   where r.chat_id = p_chat_id
     and r.user_id <> (select auth.uid())
     and public.i_am_in_chat(p_chat_id)
     and p.hide_read_receipts = false
   limit 1;
$$;

revoke all on function public.chat_read_at(uuid) from public, anon;
grant execute on function public.chat_read_at(uuid) to authenticated;
