-- A store sold a subscription, and the gate has to hear about it.
--
-- is_premium() unions two sources today: a Stripe row in `subscriptions`, and a
-- `premium_grants` row from §6.5. Neither can hold an App Store or Play
-- purchase. `subscriptions` is shaped around Stripe down to the column names —
-- stripe_customer_id is NOT NULL and UNIQUE — so putting a StoreKit purchase in
-- it means inventing a customer id, and an invented unique key is a collision
-- waiting for the second person who buys on an iPhone.
--
-- So a third table and a third `exists`. Everything downstream of is_premium()
-- is untouched: the walls, the policies and the RPCs all ask one question and
-- keep getting one answer.
--
-- ── what identifies a subscription, and why it is not the purchase ───────────
--
-- `transaction_id` is the store's own stable handle for the SUBSCRIPTION rather
-- than for any one payment, because a renewal is a new payment and must not be
-- a new entitlement:
--
--   Apple  originalTransactionId  — constant for the life of the subscription,
--                                   across every renewal, and the id the App
--                                   Store Server API is keyed on.
--   Google purchaseToken          — constant across renewals of one purchase.
--                                   NOT constant across a tier change: Play
--                                   issues a new token and reports the old one
--                                   as linkedPurchaseToken. That is the
--                                   webhook's problem (backlog server 4), and
--                                   the shape here is right for it — the new
--                                   token arrives as its own row and the old
--                                   one is closed out.
create table public.iap_entitlements (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,

  -- Which store sold it. Cancellation has to be sent to whoever took the money
  -- (backlog server 5), and neither store will route the other's subscribers.
  store text not null,

  -- The store's product id — `1month`, `3months`, `6months`. Recorded on PLANS
  -- as appleProductId and playProductId, which are separate fields there for
  -- the same reason this column does not name a plan: two consoles, two
  -- permanent namespaces, and the plan is derived from the product rather than
  -- the other way round.
  product_id text not null,

  transaction_id text not null,

  status text not null,
  expires_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint iap_entitlements_known_store check (store in ('apple', 'google')),

  -- ── the statuses, and which of them buy anything ──────────────────────────
  --
  --   active   grants while unexpired.
  --   grace    grants. Both stores keep a member in service while a renewal
  --            payment is retried; treating it as expired would lock somebody
  --            out over a card their bank re-authorises an hour later.
  --   paused   does NOT grant. Play only, and it is a deliberate pause by the
  --            member with a future resume date — so the row has an expiry in
  --            the future and still must not buy anything.
  --   expired  no.
  --   revoked  no, and this is the one a date comparison alone gets wrong. A
  --            refund or a chargeback revokes access NOW, with weeks left on
  --            expires_at. Anything reading this table must gate on status
  --            before it looks at the date.
  constraint iap_entitlements_known_status
    check (status in ('active', 'grace', 'paused', 'expired', 'revoked')),

  -- The same shape as subscriptions_paid_status_has_an_end, for the same reason
  -- and against a bug that actually happened: a granting row with a null expiry
  -- reads as premium forever, and there is nothing left to revoke it. There it
  -- came from a webhook branch that ran before the period was known. Here the
  -- store always sends an expiry with a granting status, so a null one means
  -- something is wrong upstream and this refuses to record it.
  constraint iap_entitlements_granting_status_has_an_end
    check (status not in ('active', 'grace') or expires_at is not null),

  -- ── account binding, in the schema rather than in a code path ─────────────
  --
  -- A store entitlement belongs to an Apple ID or a Google account, not to a
  -- Plus One account, and the two are not the same thing. One person can buy
  -- once and then sign in to several Plus One accounts on the same phone, and
  -- "restore purchases" on each: without this, one subscription unlocks all of
  -- them and every one of them looks legitimate.
  --
  -- The unique key makes the second one a constraint violation instead. See
  -- also the trigger below, which is the other half — unique alone stops a
  -- second INSERT and says nothing about an UPDATE moving the row.
  constraint iap_entitlements_one_row_per_store_subscription
    unique (store, transaction_id)
);

-- is_premium() asks per member; the sweep asks per expiry.
create index iap_entitlements_user_ix
  on public.iap_entitlements (user_id, expires_at desc);

create trigger iap_entitlements_set_updated_at
  before update on public.iap_entitlements
  for each row execute function public.set_updated_at();

-- ── the other half of account binding ────────────────────────────────────────
--
-- The unique constraint refuses a SECOND row for one store subscription. It has
-- nothing to say about the first row being moved, and the natural way to write
-- the webhook moves it:
--
--   insert into iap_entitlements (...) values (...)
--   on conflict (store, transaction_id) do update set user_id = excluded.user_id, ...
--
-- That is one plausible line away from a purchase hopping to whichever account
-- most recently presented it, which is the exact failure the unique key was
-- added to prevent. So the binding is immutable here, and the webhook can use
-- the obvious upsert safely as long as it does not try to move the owner.
create or replace function public.iap_entitlement_binding_is_permanent()
returns trigger
language plpgsql
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception
      'an iap entitlement cannot be rebound to another member'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger iap_entitlements_binding_is_permanent
  before update on public.iap_entitlements
  for each row execute function public.iap_entitlement_binding_is_permanent();

-- ── who can read it ──────────────────────────────────────────────────────────
--
-- Written by the store webhooks under the service key only, exactly like
-- subscriptions. A member can read their own row so the premium screen can say
-- where the subscription came from and where to go to cancel it.
alter table public.iap_entitlements enable row level security;

create policy "own entitlements are readable"
  on public.iap_entitlements for select to authenticated
  using (user_id = (select auth.uid()));

grant select on public.iap_entitlements to authenticated;

-- ── the third exists ─────────────────────────────────────────────────────────
--
-- Note what is NOT here: the `expires_at is null` arm that the subscriptions
-- clause carries. That arm exists there because a §6.5 grant has no Stripe
-- period, and it is also precisely what let a null-period subscription read as
-- premium forever. It would be a copy-paste away, it would look symmetrical,
-- and it would reintroduce the bug that 20260816000100 exists to close.
-- iap_entitlements_granting_status_has_an_end already guarantees the date is
-- there, so the null arm would buy nothing and cost everything.
create or replace function public.is_premium(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    exists (
      select 1 from public.subscriptions s
      where s.user_id = p_user_id
        and s.status in ('active', 'trialing')
        and (s.current_period_end is null or s.current_period_end > now())
    )
    or exists (
      select 1 from public.premium_grants g
      where g.user_id = p_user_id and g.expires_at > now()
    )
    or exists (
      select 1 from public.iap_entitlements e
      where e.user_id = p_user_id
        and e.status in ('active', 'grace')
        and e.expires_at > now()
    );
$$;
