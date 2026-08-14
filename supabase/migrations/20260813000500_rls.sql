-- Plus One — Row Level Security (spec §5.3)
--
-- Principle 1: DEFAULT DENY EVERYTHING. RLS is enabled on every table; a table
-- with no policy for an operation denies that operation. The publishable key is
-- public, so RLS is the only thing between the internet and this data.
--
-- Principle 4: state transitions happen through SECURITY DEFINER RPCs. Tables
-- that hold transition state (connects, chats) therefore have NO update policy
-- for `authenticated` — writing them directly is impossible by construction.

-- ── policy helpers ────────────────────────────────────────────────────────────
create or replace function public.viewer_community()
returns public.condition_community
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select community from public.profiles where id = (select auth.uid());
$$;

create or replace function public.is_chat_participant(p_chat_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.chats ch
    join public.connects c on c.id = ch.connect_id
    where ch.id = p_chat_id
      and (c.initiator_id = p_user_id or c.target_id = p_user_id)
  );
$$;

create or replace function public.chat_accepts_messages(p_chat_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.chats
    where id = p_chat_id and status in ('open', 'date_planned')
  );
$$;

-- ── enable RLS everywhere ─────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.profile_photos enable row level security;
alter table public.consents enable row level security;
alter table public.quiz_responses enable row level security;
alter table public.drops enable row level security;
alter table public.connects enable row level security;
alter table public.chats enable row level security;
alter table public.messages enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.room_messages enable row level security;
alter table public.connect_budgets enable row level security;
alter table public.referrals enable row level security;
alter table public.referral_conversions enable row level security;
alter table public.referral_rewards enable row level security;
alter table public.premium_grants enable row level security;
alter table public.subscriptions enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.moderation_queue enable row level security;
alter table public.deletion_requests enable row level security;
alter table public.app_config enable row level security;
alter table public.audit_log enable row level security;
alter table public.admin_users enable row level security;

-- ── profiles ──────────────────────────────────────────────────────────────────
create policy "own profile is readable"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "visible profiles are readable"
  on public.profiles for select to authenticated
  using (
    public.can_view_profile(
      (select auth.uid()), id, community, cross_community_opt_in, mode, verification_status
    )
  );

create policy "own profile is insertable once"
  on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));

create policy "own profile is updatable"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- No delete policy. Account removal goes through deletion_requests and the purge
-- job, so the 7-day window and the storage sweep can never be skipped (§9.3).

-- ── profile_photos ────────────────────────────────────────────────────────────
create policy "own photos are readable"
  on public.profile_photos for select to authenticated
  using (user_id = (select auth.uid()));

create policy "own photos are writable"
  on public.profile_photos for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Other members' photos are reached only through visible_profile_photos, which
-- resolves the blurred-until-connected setting server-side.

-- ── consents ──────────────────────────────────────────────────────────────────
create policy "own consents are readable"
  on public.consents for select to authenticated
  using (user_id = (select auth.uid()));

create policy "own consents are insertable"
  on public.consents for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Consent records are append-only: no update, no delete.

-- ── quiz_responses ────────────────────────────────────────────────────────────
create policy "own quiz is readable"
  on public.quiz_responses for select to authenticated
  using (user_id = (select auth.uid()));

create policy "own quiz is writable"
  on public.quiz_responses for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ── drops ─────────────────────────────────────────────────────────────────────
create policy "own drops are readable"
  on public.drops for select to authenticated
  using (user_id = (select auth.uid()));

-- Drops are written by the cron job under the service key only.

-- ── connects ──────────────────────────────────────────────────────────────────
create policy "own connects are readable"
  on public.connects for select to authenticated
  using (
    initiator_id = (select auth.uid()) or target_id = (select auth.uid())
  );

-- §5.3.3. The trigger enforces budgets and re-checks these same walls; this
-- policy states them declaratively so the wall exists even if the trigger is
-- ever dropped.
create policy "connects respect every wall"
  on public.connects for insert to authenticated
  with check (
    initiator_id = (select auth.uid())
    and status = 'pending'
    and initiator_id <> target_id
    and not public.is_blocked_either_way(initiator_id, target_id)
    -- Nobody in dating mode may initiate toward a support-only member.
    --
    -- These read modes through profile_mode(), which is SECURITY DEFINER. Reading
    -- public.profiles inline here would be RLS-filtered, and since a dating-mode
    -- member cannot see a support-only profile, the negative test would be
    -- vacuously true — the wall would pass in precisely the case it must block.
    and not (
      public.profile_mode(initiator_id) = 'dating'
      and public.profile_mode(target_id) = 'support_only'
    )
    -- Support-only outbound toward a dating member requires a shared room.
    and (
      not (
        public.profile_mode(initiator_id) = 'support_only'
        and public.profile_mode(target_id) = 'dating'
      )
      or (
        room_id is not null
        and public.is_member_of_room(initiator_id, room_id)
        and public.is_member_of_room(target_id, room_id)
      )
    )
  );

-- No update policy: accept/decline go through RPCs so the closure note is never
-- skipped. No interaction ends in silence (Decision #14).

-- ── chats ─────────────────────────────────────────────────────────────────────
create policy "participants read their chats"
  on public.chats for select to authenticated
  using (public.is_chat_participant(id, (select auth.uid())));

-- No insert/update/delete. Chats open on accept_connect and change state only
-- through confirm_date_plan, close_chat, or the fuse sweep. The timer is not
-- client-writable, which is what makes "never purchasable" structural.

-- ── messages ──────────────────────────────────────────────────────────────────
create policy "participants read chat messages"
  on public.messages for select to authenticated
  using (public.is_chat_participant(chat_id, (select auth.uid())));

create policy "participants write to open chats"
  on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and public.is_chat_participant(chat_id, (select auth.uid()))
    and public.chat_accepts_messages(chat_id)
  );

-- Messages are immutable. A closed chat accepts nothing further.

-- ── rooms ─────────────────────────────────────────────────────────────────────
-- Rooms are open to ALL members regardless of mode (Decision #17) but respect
-- community scope.
create policy "rooms in scope are readable"
  on public.rooms for select to authenticated
  using (
    community_scope = 'all'
    or community_scope::text = public.viewer_community()::text
  );

create policy "own room membership is readable"
  on public.room_members for select to authenticated
  using (user_id = (select auth.uid()));

create policy "co-members are readable"
  on public.room_members for select to authenticated
  using (public.is_member_of_room((select auth.uid()), room_id));

create policy "members join rooms themselves"
  on public.room_members for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.rooms r
      where r.id = room_id
        and (r.community_scope = 'all' or r.community_scope::text = public.viewer_community()::text)
    )
  );

create policy "members leave rooms themselves"
  on public.room_members for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "room members read room messages"
  on public.room_messages for select to authenticated
  using (
    deleted_at is null
    and public.is_member_of_room((select auth.uid()), room_id)
  );

create policy "room members post to their rooms"
  on public.room_messages for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and deleted_at is null
    and public.is_member_of_room((select auth.uid()), room_id)
  );

-- ── budgets and growth ────────────────────────────────────────────────────────
create policy "own budget is readable"
  on public.connect_budgets for select to authenticated
  using (user_id = (select auth.uid()));

create policy "own referral code is readable"
  on public.referrals for select to authenticated
  using (user_id = (select auth.uid()));

create policy "own conversions are readable"
  on public.referral_conversions for select to authenticated
  using (referrer_id = (select auth.uid()));

create policy "own rewards are readable"
  on public.referral_rewards for select to authenticated
  using (user_id = (select auth.uid()));

create policy "own grants are readable"
  on public.premium_grants for select to authenticated
  using (user_id = (select auth.uid()));

create policy "own subscription is readable"
  on public.subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

-- Subscriptions are written by the Stripe webhook under the service key only.

-- ── safety ────────────────────────────────────────────────────────────────────
create policy "own blocks are readable"
  on public.blocks for select to authenticated
  using (blocker_id = (select auth.uid()));

create policy "members block for themselves"
  on public.blocks for insert to authenticated
  with check (blocker_id = (select auth.uid()) and blocker_id <> blocked_id);

create policy "members unblock for themselves"
  on public.blocks for delete to authenticated
  using (blocker_id = (select auth.uid()));

create policy "own reports are readable"
  on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()));

create policy "members file their own reports"
  on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()));

create policy "admins manage the moderation queue"
  on public.moderation_queue for all to authenticated
  using (public.is_admin((select auth.uid())))
  with check (public.is_admin((select auth.uid())));

-- ── compliance ────────────────────────────────────────────────────────────────
create policy "own deletion request is readable"
  on public.deletion_requests for select to authenticated
  using (user_id = (select auth.uid()));

create policy "members request their own deletion"
  on public.deletion_requests for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Config is world-readable to members because packages/logic needs the live
-- thresholds; only admins may write it.
create policy "config is readable"
  on public.app_config for select to authenticated
  using (true);

create policy "admins write config"
  on public.app_config for all to authenticated
  using (public.is_admin((select auth.uid())))
  with check (public.is_admin((select auth.uid())));

create policy "admins read the audit log"
  on public.audit_log for select to authenticated
  using (public.is_admin((select auth.uid())));

create policy "admins read the admin roster"
  on public.admin_users for select to authenticated
  using (public.is_admin((select auth.uid())));
