-- A decline that meant nothing, and a block that broke the metric.
--
-- Two separate faults in the same area, fixed together because both are about
-- what the system remembers after an interaction ends.
--
-- 1. NOTHING STOPPED RE-ASKING SOMEBODY WHO DECLINED.
--
--    connect_permitted checks blocks and modes. It does not look at history.
--    connects_one_pending_ix is a UNIQUE INDEX on (initiator_id, target_id)
--    WHERE status = 'pending' — so it stops two live asks at once and nothing
--    else. The moment a connect became 'declined' it left that index, and a new
--    row inserted cleanly. Someone could be asked, decline, and be asked again
--    the same minute, for as long as the asker cared to keep going.
--
--    §7.4 step 4 says these RPCs validate cooldowns. This is the one for a
--    decline, which did not exist. Declining now means something for a while.
--
--    Deliberately NOT a permanent bar. A decline is "not now, or not on this",
--    not a block — someone who wants that has the block button, and Decision
--    #26 rules out shame mechanics. Thirty days is a config value, and flagged
--    for Kevin as a number Claude picked.
--
-- 2. EVERY BLOCK BROKE THE PROMISE METRIC.
--
--    close_chats_on_block left closure_template null, on the reasoning that
--    nobody owes a note to someone they have just blocked. But 'closed_without_a_note'
--    counts exactly that — chats closed with a null template — and its own
--    comment reads: "If it is ever non-zero, the product's central promise has
--    broken and this is where it shows." It would have gone non-zero on the
--    first block ever placed, and stayed there, as a false alarm on Decision
--    #26's ghost-equivalent rate.
--
--    False, because the blocked member IS shown a note: the chat page renders
--    `closure_template ?? 0`. The note was on the screen and not in the row.
--
--    Storing the default fixes both halves. It asks nothing of the blocker —
--    the original argument was against making them WRITE one, which still
--    stands: closure_personal_line stays null and closed_by stays null. And
--    leaving closed_by null is what keeps a block indistinguishable from a fuse
--    expiry on the other member's screen, which is a safety property worth
--    keeping: telling somebody they have been blocked is how a block escalates.

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
         -- The default note, which is what the member is shown either way.
         -- Null here made every block a data point against the one promise the
         -- product measures.
         closure_template = 0,
         -- Unsigned and unwritten. Nobody owes a note to someone they have just
         -- blocked, and closed_by staying null is also what makes this read as a
         -- fuse expiry rather than as a person's decision.
         closure_personal_line = null,
         closed_by = null,
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

-- ── connect_permitted, now with a memory ──────────────────────────────────────
--
-- The signature does not change, and that is deliberate rather than incidental.
-- `create or replace` matches on the argument list: adding a third parameter
-- would have created an OVERLOAD beside the old two-argument function, not
-- replaced it. The RLS policy on connects calls `connect_permitted(target_id,
-- room_id)`, which resolves to the two-argument version exactly — so the wall
-- would have gone on calling the version with no cooldown in it, silently, and
-- every test written against the RPC would still have passed.
--
-- The value comes through config_int like every other threshold (§7.3, hot-read
-- by logic), so it is tunable from the admin config editor without a migration.
create or replace function public.connect_permitted(
  p_target_id uuid,
  p_room_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := (select auth.uid());
  v_my_mode public.member_mode;
  v_their_mode public.member_mode;
  v_cooldown integer := public.config_int('cooldowns.decline_days', 30);
begin
  if v_me is null or p_target_id is null or v_me = p_target_id then
    return false;
  end if;

  if public.is_blocked_either_way(v_me, p_target_id) then
    return false;
  end if;

  -- A no that lasts a while. Only the caller's OWN declined asks are consulted:
  -- this says nothing about who else has turned them down, and the direction
  -- matters — being declined does not stop the person who declined from asking
  -- back, which is a different and entirely welcome thing.
  if v_cooldown > 0 and exists (
    select 1 from public.connects c
     where c.initiator_id = v_me
       and c.target_id = p_target_id
       and c.status = 'declined'
       and coalesce(c.decided_at, c.created_at) > now() - make_interval(days => v_cooldown)
  ) then
    return false;
  end if;

  v_my_mode := public.profile_mode(v_me);
  v_their_mode := public.profile_mode(p_target_id);

  -- Nobody in dating mode may initiate toward a support-only member.
  if v_my_mode = 'dating' and v_their_mode = 'support_only' then
    return false;
  end if;

  -- Support-only outbound toward a dating member requires a shared room.
  if v_my_mode = 'support_only' and v_their_mode = 'dating' then
    return p_room_id is not null
      and public.is_member_of_room(v_me, p_room_id)
      and public.is_member_of_room(p_target_id, p_room_id);
  end if;

  return true;
end;
$$;

comment on function public.connect_permitted(uuid, uuid) is
  'Whether the caller may initiate a connect toward p_target_id: blocks, the decline cooldown, and the mode walls of Decisions #17 and #18.';

-- Tunable without a migration, like every other threshold. on conflict do
-- nothing so re-running this never stamps on a value an admin has since set.
insert into public.app_config (key, value) values
  ('cooldowns.decline_days', to_jsonb(30))
on conflict (key) do nothing;
