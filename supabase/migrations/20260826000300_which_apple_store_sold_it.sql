-- Sandbox and Production are different shops, and a row cannot say which.
--
-- Apple signs both with the same root, so `verifyAppStoreJws` cannot tell them
-- apart and must not try — the signature is equally genuine either way. What
-- separates them is one field in the payload, and it decides whether a purchase
-- involved money.
--
-- It has to be recorded rather than inferred, for two reasons:
--
--   · TestFlight purchases are SANDBOX even when the app is the shipping
--     build. So "sandbox means development" is false in exactly the case
--     somebody would rely on it, and a support question about why a member is
--     premium has no answer without this column.
--   · Refusing sandbox in production is a decision worth being able to MAKE
--     later. Today it would lock Kevin out of testing his own purchase flow on
--     the iPad, so both are accepted; the day the app ships and TestFlight is
--     no longer the point, that becomes a one-line change with the data already
--     there to see what it would have refused.
--
-- Nullable, because a Play entitlement has no such thing. Constrained rather
-- than free text: two spellings of Sandbox would make the column unreadable by
-- exactly the query anyone writes against it.
alter table public.iap_entitlements
  add column environment text;

alter table public.iap_entitlements
  add constraint iap_entitlements_known_environment
  check (environment is null or environment in ('Sandbox', 'Production'));
