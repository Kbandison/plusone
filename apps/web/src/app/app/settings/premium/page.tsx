import type { Metadata } from "next";

import {
  DRAFT_COPY,
  PLANS,
  PREMIUM_INCLUDES,
  PREMIUM_NEVER,
  formatPriceCents,
  type PlanId,
} from "@plusone/config";

import { getServerSupabase } from "@/lib/supabase";
import { ManageBilling, PlanChooser } from "./plan-buttons";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: DRAFT_COPY.app.premiumHeading };

const C = DRAFT_COPY.app;

export default async function PremiumPage() {
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");

  const [{ data: subscription }, { data: grants }, { data: isPremium, error: premiumError }] =
    await Promise.all([
      supabase
        .from("subscriptions")
        // `plan`, which the webhook has been writing since the beginning and
        // nothing has ever read. It is the answer to the one question a paying
        // member opens this screen with.
        .select("plan, status, current_period_end")
        .eq("user_id", auth.user.id)
        .maybeSingle(),
      supabase
        .from("premium_grants")
        .select("expires_at")
        .eq("user_id", auth.user.id)
        .order("expires_at", { ascending: false })
        .limit(1),
      // The same rule the walls use — a second opinion about who is premium is how
      // a paying member gets told they are not.
      //
      // The self-relative form, because is_premium(uuid) is revoked from
      // authenticated (20260814001000, closing a uuid-probe leak). Calling it here
      // returned "permission denied", supabase-js resolves rather than rejects, the
      // error was discarded, and null read as "not premium" — so every paying
      // member was shown the plan chooser.
      supabase.rpc("i_am_premium"),
    ]);

  // Not discarded. This page deciding wrongly is a member being asked to pay
  // twice, which should be loud rather than silent.
  if (premiumError) {
    console.error(JSON.stringify({ at: "premium.page", problem: premiumError.message }));
  }

  // Only dates that have not already passed.
  //
  // A member whose subscription lapsed in June and who then earned a referral
  // grant is premium — and this sorted both dates and took the later string, so
  // it could show them a June date and tell a currently-premium member their
  // access ended two months ago. Whether they ARE premium is is_premium's
  // answer; this line only picks which date to show.
  /**
   * Which of the three, resolved from the id the webhook stored.
   *
   * Looked up rather than trusted: `plan` is a bare text column, and a price
   * retired in Stripe would leave a value that matches nothing here. Undefined
   * then, and the page says "an active subscription" rather than inventing a
   * tier — being vague is recoverable, being wrong about what somebody pays is
   * not.
   */
  const plan = PLANS.find((p) => p.id === (subscription?.plan as PlanId | null));

  const now = Date.now();
  const grantUntil = grants?.[0]?.expires_at as string | undefined;
  const until = [subscription?.current_period_end as string | undefined, grantUntil]
    .filter((d): d is string => Boolean(d) && Date.parse(d as string) > now)
    .sort()
    .at(-1);

  return (
    <main id="main">
      {/* Repeated from the tab above it, the way a room's title is. The skip
          link lands on #main, and a page whose first thing inside #main is a
          paragraph has not told the member who used it where they are. */}
      <h1 className="text-h2">{C.premiumHeading}</h1>
      <p className="mt-5 text-[13.4px] leading-[1.7] text-ink-2">{C.premiumIntro}</p>

      {isPremium ? (
        <section className="mt-8 rounded-xl border border-accent bg-surface p-6">
          {/* What they are paying for, above when it runs out. The page said
              "Premium until 14 September" and nothing else, so the only way to
              find out which plan you were on was to leave for Stripe. */}
          {subscription ? (
            <>
              <h2 className="text-[11px] tracking-[0.04em] text-ink-3 uppercase">
                {C.premiumPlanHeading}
              </h2>
              <p className="mt-1.5 text-[13px]">
                {plan
                  ? C.premiumPlanLine(plan.label, formatPriceCents(plan.priceCents))
                  : C.premiumPlanUnknown}
              </p>
            </>
          ) : null}

          <p className={subscription ? "mt-4 text-[13px]" : "text-[13px]"}>
            {until ? C.premiumUntil(new Date(until).toLocaleDateString()) : C.premiumActive}
          </p>
          {!subscription && grantUntil ? (
            <p className="mt-2 text-[11.7px] text-ink-3">{C.premiumFromGrant}</p>
          ) : null}
          {subscription ? <ManageBilling /> : null}
        </section>
      ) : (
        <PlanChooser />
      )}

      <section className="mt-14">
        <h2 className="text-[0.972rem]">{C.premiumIncludesHeading}</h2>
        <ul className="mt-5 flex flex-col gap-3">
          {PREMIUM_INCLUDES.map((item) => (
            <li
              key={item}
              className="border-l border-line-2 pl-5 text-[12.6px] leading-[1.65] text-ink-2"
            >
              {item}
            </li>
          ))}
        </ul>
      </section>

      {/* §3.3 — "No selling exemptions from mechanics. Never monetized. Ever."
          Printed on the page that sells the thing, because a promise made only
          in a spec is a promise nobody can hold you to. */}
      <section className="mt-12">
        <h2 className="text-[0.972rem]">{C.premiumNeverHeading}</h2>
        <p className="mt-4 text-[12.6px] leading-[1.7] text-ink-2">{C.premiumNeverNote}</p>
        <ul className="mt-5 flex flex-col gap-3">
          {PREMIUM_NEVER.map((item) => (
            <li
              key={item}
              className="border-l border-critical/40 pl-5 text-[12.6px] leading-[1.65] text-ink-2"
            >
              {item}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
