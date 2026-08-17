-- Paying members were shown the plan chooser.
--
-- 20260813000700 granted EXECUTE on is_premium(uuid) to authenticated.
-- 20260814001000 then revoked it again — correctly, as part of closing a
-- uuid-probe leak where a member could ask questions about any id they guessed.
-- That migration replaced every other locked-down predicate with a self-relative
-- form: is_admin(), i_am_in_room(), i_am_in_chat(), i_have_connected_with(),
-- i_can_view(), connect_permitted(), preview_permitted(). It did not write one
-- for is_premium, and nothing re-granted the old one.
--
-- So /app/premium calls rpc('is_premium', { p_user_id: me }) as the member, gets
-- "permission denied for function is_premium", and destructures only { data } —
-- supabase-js resolves rather than rejects, so data is null, null is falsy, and
-- a member who is paying is offered the three plans again.
--
-- Self-relative, so there is no argument to probe with.
create or replace function public.i_am_premium()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_premium((select auth.uid()));
$$;

revoke all on function public.i_am_premium() from public, anon;
grant execute on function public.i_am_premium() to authenticated;
