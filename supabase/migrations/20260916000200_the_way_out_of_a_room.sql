-- Who, in this room, can I actually reach?
--
-- ── the whole feature was built except the button ──────────────────────────
--
-- `connect_permitted(target, room_id)` already answers this, and already
-- carries the rule the support-only mode depends on: "Support-only outbound
-- toward a dating member requires a shared room", checking both people are in
-- it. `connects.source` already has a 'room' value with a CHECK forcing
-- `room_id` to be set. `connect-panel.tsx` already accepts `source=room`, and
-- the intercepting modal's own comment names a room as one of the three places
-- a connect starts.
--
-- Nothing ever rendered a control, so the count of room-sourced connects is
-- zero and cannot be anything else. COPY.supportOnly.toggle meanwhile promises
-- "you can reach out to people you meet there whenever you're ready", and
-- CONNECTS.supportOnlyPerWeek is a weekly budget for an action nobody can take.
-- Kevin found it twice, from two different screens.
--
-- ── why a bulk form rather than calling the existing one per post ──────────
--
-- A room page renders a feed. Asking per author means one round trip per
-- distinct person on the screen, on a page whose load time was deliberately
-- worked on this month — and the page already does exactly this shape for
-- photos, collecting the distinct author ids and fetching once.
--
-- It is a filter over the existing function rather than a reimplementation of
-- the rule. Two copies of "may A reach B" is how a screen starts offering a
-- door the RPC refuses, and the refusal is the thing that has to win.
--
-- Security INVOKER, deliberately: connect_permitted is a definer and reads
-- auth.uid() for the caller, so this must not introduce a second identity.
-- Nulls are dropped rather than passed through — an anonymous post and an
-- article both arrive with a null author, and asking about nobody is not a
-- question.

create or replace function public.connect_permitted_bulk(
  p_targets uuid[],
  p_room_id uuid
)
returns table (user_id uuid)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select t
    from unnest(coalesce(p_targets, '{}'::uuid[])) as t
   where t is not null
     and t is distinct from (select auth.uid())
     and public.connect_permitted(t, p_room_id);
$$;

revoke all on function public.connect_permitted_bulk(uuid[], uuid) from public, anon;
grant execute on function public.connect_permitted_bulk(uuid[], uuid) to authenticated;

comment on function public.connect_permitted_bulk(uuid[], uuid) is
  'Which of these people the caller may send a room-sourced connect to. A filter over connect_permitted, so the screen and the RPC cannot disagree about who is reachable.';
