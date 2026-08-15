-- A member could not see who they had blocked.
--
-- The settings list rendered "Blocked 14 August" and an Unblock button, and
-- nothing else — because blocking is mutual, so the blocked member fails
-- i_can_view and has no name anywhere the blocker can reach. Two blocks on one
-- day were indistinguishable, and unblocking was a guess.
--
-- This is the one place that wall should not apply. You already knew who they
-- were when you blocked them; it is your own list; and a safety control you
-- cannot read is a safety control you cannot undo.
--
-- Deliberately narrow. It returns only the rows where the CALLER is the
-- blocker, so it says nothing about who has blocked you — that would be a
-- probe, and a far more sensitive one.

create or replace function public.my_blocked_members()
returns table (
  blocked_id uuid,
  display_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select b.blocked_id, p.display_name, b.created_at
  from public.blocks b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = (select auth.uid())
  order by b.created_at desc;
$$;

comment on function public.my_blocked_members() is
  'The caller''s own block list, with names. Blocking is mutual, so these members are otherwise invisible to the person who blocked them — which made Unblock a guess. Never returns blocks made AGAINST the caller.';

revoke all on function public.my_blocked_members() from public, anon;
grant execute on function public.my_blocked_members() to authenticated;
