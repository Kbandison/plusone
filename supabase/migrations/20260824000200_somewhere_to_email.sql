-- Where to reach a member who is not on push.
--
-- notify() has always computed which channels survive a member's switches and
-- then thrown the email cohort away — it filtered for 'push', hard-coded
-- ["push"] into planDeliveries, and returned early when nobody wanted push. So
-- somebody with push off and email on received nothing at all, which is the
-- opposite of what their settings said.
--
-- The address is not ours. profiles has no email column on purpose (see
-- 20260813000200) — auth.users owns it, phone OTP is the primary factor, and an
-- email is something a member adds afterwards in settings so they can sign in
-- with it. So this reads auth.users, and reads nothing else from it.
--
-- Confirmed addresses only. Supabase stages an unconfirmed change in
-- email_change rather than email, so a set `email` is already confirmed in the
-- ordinary flow — requiring it explicitly means a row that arrived some other
-- way cannot turn a typo into ⁺One appearing in a stranger's inbox.
--
-- No grant to authenticated, like push_devices_for. A member has no business
-- resolving anybody's address, including their own — the settings screen
-- already knows it from the session.
create or replace function public.emails_for(p_user_ids uuid[])
returns table (user_id uuid, email text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.id, u.email::text
    from auth.users u
   where u.id = any (p_user_ids)
     and u.email is not null
     and u.email_confirmed_at is not null;
$$;

revoke all on function public.emails_for(uuid[]) from public, anon, authenticated;

comment on function public.emails_for(uuid[]) is
  'Confirmed sign-in addresses for a set of members, for the email notifier. Service role only — a member cannot resolve anybody''s address, including their own.';
