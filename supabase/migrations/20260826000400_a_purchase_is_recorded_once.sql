-- Recording a purchase without ever offering to move it.
--
-- 20260826000100 made the binding between a store subscription and a member
-- immutable, with a unique key against a second INSERT and a trigger against an
-- UPDATE that moves the owner. The trigger has been doing real work rather than
-- standing by, and that was not the intent.
--
-- `iap-actions.ts` writes through PostgREST's upsert, which builds
-- `on conflict (...) do update set` from EVERY column in the payload — and the
-- payload carries user_id, because the insert needs it. So each replayed
-- transaction has been proposing to rebind the row to whoever submitted it, and
-- the only reason nothing went wrong is that the value happened to match and
-- the trigger would have refused it if it had not.
--
-- A comment in that file said "NOT user_id", which was true of the conflict
-- TARGET and false of the update set. Wrong in a way that reads as reassuring,
-- which is the worst kind.
--
-- So the write moves into SQL that can be read. The update list is explicit and
-- user_id is not in it, so a replay updates the term and nothing else.
--
-- ── and the refusal is a value rather than an exception ─────────────────────
--
-- `where iap_entitlements.user_id = p_user_id` on the DO UPDATE means a row
-- belonging to somebody else is not touched and nothing is returned. The caller
-- gets null and can say "not yours" — where the trigger would have raised, and
-- an exception on the path of somebody who has just paid becomes a 500 and a
-- StoreKit transaction nobody finished.
--
-- The trigger stays. It is the backstop for every future caller that does not
-- come through here, which is what a backstop is for.
--
-- Security INVOKER, not DEFINER. Only the service role calls this and the
-- service role already passes RLS, so a definer function would be a new
-- privileged surface bought for nothing. Execute is revoked from members
-- regardless: a client that can call this can write its own entitlement.
create or replace function public.record_iap_entitlement(
  p_user_id uuid,
  p_store text,
  p_product_id text,
  p_transaction_id text,
  p_status text,
  p_expires_at timestamptz,
  p_environment text default null
)
returns uuid
language sql
set search_path = public, pg_temp
as $$
  insert into public.iap_entitlements
    (user_id, store, product_id, transaction_id, status, expires_at, environment)
  values
    (p_user_id, p_store, p_product_id, p_transaction_id, p_status, p_expires_at, p_environment)
  on conflict (store, transaction_id) do update
     set product_id = excluded.product_id,
         status     = excluded.status,
         expires_at = excluded.expires_at,
         -- Kept when the caller does not know it. A notification carries the
         -- environment and a restore may not, and the answer must not flip to
         -- null because the second one arrived later.
         environment = coalesce(excluded.environment, public.iap_entitlements.environment)
   where public.iap_entitlements.user_id = p_user_id
  returning id;
$$;

revoke all on function
  public.record_iap_entitlement(uuid, text, text, text, text, timestamptz, text)
  from public, anon, authenticated;

comment on function
  public.record_iap_entitlement(uuid, text, text, text, text, timestamptz, text) is
  'Records a store purchase, updating the term but never the member it belongs to. Returns null when the subscription is already bound to somebody else. Service role only.';
