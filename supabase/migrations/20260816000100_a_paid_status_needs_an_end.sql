-- Permanent premium was representable, and one webhook wrote it.
--
-- is_premium() reads:
--
--   status in ('active', 'trialing')
--   and (current_period_end is null or current_period_end > now())
--
-- The null arm is there for a good reason — a grant from §6.5 has no Stripe
-- period — but on a SUBSCRIPTION row it means "paid, forever". And the
-- checkout.session.completed branch of the webhook wrote exactly that shape:
-- status 'active' with no period end, because the checkout session does not
-- carry one. It was corrected moments later by customer.subscription.created,
-- so it never showed up in testing. If that event is not subscribed to, or its
-- delivery fails permanently, the correction never comes and the member is
-- premium for good with nothing left to revoke it.
--
-- The webhook is fixed in the same change. This is the half that cannot be
-- forgotten: with the constraint in place there is no way to spell the bad
-- state, from the webhook, from a backfill, or from a console.
--
-- 'canceled', 'past_due', 'incomplete' and the rest are unconstrained — they do
-- not grant anything, so a missing period end on them means nothing.
alter table public.subscriptions
  add constraint subscriptions_paid_status_has_an_end
  check (status not in ('active', 'trialing') or current_period_end is not null);
