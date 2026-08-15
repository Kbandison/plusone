-- REGRESSION FIX.
--
-- 20260814000900 revoked is_admin(uuid) from `authenticated`, and
-- 20260814001000 introduced the no-argument is_admin(). The moderation_queue
-- policy was never updated and still calls the one-argument form.
--
-- A policy expression is evaluated as the querying role, and Postgres resolves
-- overloads by arity — so a reachable is_admin() does not help a call written
-- as is_admin(uuid). The result: "permission denied for function is_admin" for
-- every administrator reading the queue. The moderation queue was unreadable.
--
-- Missed because check:admin exercises the admin RPCs, which are SECURITY
-- DEFINER and therefore never go through this policy. The queue's own read path
-- had no test.

drop policy "admins manage the moderation queue" on public.moderation_queue;

create policy "admins manage the moderation queue"
  on public.moderation_queue for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Anything else still calling the one-argument form from a policy is the same
-- bug waiting to happen. This raises rather than warns: a policy that cannot
-- call what it references fails closed, which looks like "there is no data"
-- and not like a permissions error, at whatever hour someone finally notices.
do $$
declare
  v_bad text;
begin
  select string_agg(format('%s.%s', tablename, policyname), ', ')
  into v_bad
  from pg_policies
  where schemaname in ('public', 'storage')
    and 'authenticated' = any (roles)
    and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ 'is_admin\s*\(\s*\(?\s*select'
  ;

  if v_bad is not null then
    raise exception 'policies still calling is_admin(uuid): %', v_bad;
  end if;
end;
$$;
