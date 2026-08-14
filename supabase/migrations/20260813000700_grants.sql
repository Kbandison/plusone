-- Plus One — Data API grants
--
-- Grants control API visibility; RLS controls row access. Both are required.
-- New Supabase projects do not expose public-schema tables to the Data API by
-- default, so every reachable object below is granted deliberately.
--
-- Start from nothing, then add back exactly what a member's own session needs.

revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- ── anon ──────────────────────────────────────────────────────────────────────
-- Signed-out visitors reach nothing at all. The invite landing page is neutral by
-- design (§3.4) and validates a code through one boolean RPC that reveals no
-- referrer, no member, and no condition language.
create or replace function public.invite_code_exists(p_code text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.referrals where code = p_code);
$$;

grant execute on function public.invite_code_exists(text) to anon, authenticated;

-- ── authenticated: read paths ─────────────────────────────────────────────────
grant select on public.visible_profiles to authenticated;
grant select on public.preview_profiles to authenticated;
grant select on public.visible_profile_photos to authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.profile_photos to authenticated;
grant select, insert on public.consents to authenticated;
grant select, insert, update on public.quiz_responses to authenticated;
grant select on public.drops to authenticated;

grant select, insert on public.connects to authenticated;
grant select on public.chats to authenticated;
grant select, insert on public.messages to authenticated;

grant select on public.rooms to authenticated;
grant select, insert, delete on public.room_members to authenticated;
grant select, insert on public.room_messages to authenticated;

grant select on public.connect_budgets to authenticated;
grant select on public.referrals to authenticated;
grant select on public.referral_conversions to authenticated;
grant select on public.referral_rewards to authenticated;
grant select on public.premium_grants to authenticated;
grant select on public.subscriptions to authenticated;

grant select, insert, delete on public.blocks to authenticated;
grant select, insert on public.reports to authenticated;
grant select, insert, update on public.moderation_queue to authenticated;

grant select, insert on public.deletion_requests to authenticated;
grant select, insert, update on public.app_config to authenticated;
grant select on public.audit_log to authenticated;
grant select on public.admin_users to authenticated;

-- ── authenticated: state transitions ──────────────────────────────────────────
grant execute on function public.create_connect(uuid, text, text, public.connect_source, uuid) to authenticated;
grant execute on function public.accept_connect(uuid) to authenticated;
grant execute on function public.decline_connect(uuid, smallint, text) to authenticated;
grant execute on function public.propose_date_plan(uuid, jsonb) to authenticated;
grant execute on function public.confirm_date_plan(uuid) to authenticated;
grant execute on function public.cancel_date_plan(uuid) to authenticated;
grant execute on function public.close_chat(uuid, smallint, text) to authenticated;
grant execute on function public.switch_mode(public.member_mode) to authenticated;
grant execute on function public.change_intention(public.intention) to authenticated;
grant execute on function public.request_deletion() to authenticated;

-- ── authenticated: read-only helpers the client legitimately calls ────────────
grant execute on function public.is_premium(uuid) to authenticated;
grant execute on function public.age_from_birthdate(date) to authenticated;
grant execute on function public.age_band(date) to authenticated;

-- ── deliberately NOT granted ──────────────────────────────────────────────────
-- public.audit(...)            — a client that can write the audit log can lie in it
-- public.can_view_profile(...) — reachable only through the views and policies
-- public.enforce_connect_rules — trigger only
-- public.round_location(...)   — trigger only
-- public.config_int(...)       — server-side threshold reads only
-- public.is_admin(...)         — probing the admin roster is not a member capability
-- public.is_blocked_either_way, shares_room, is_member_of_room,
-- public.has_accepted_connect, is_chat_participant, chat_accepts_messages,
-- public.viewer_community      — all policy internals; exposing them would let a
--                                client enumerate relationships the views hide.
