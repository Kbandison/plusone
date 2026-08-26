"use client";

import { useActionState, useEffect, useState } from "react";

import { DRAFT_COPY, PLANS, formatPriceCents } from "@plusone/config";

import { openBillingPortal, startCheckout } from "./actions";
import { NativePlanChooser } from "./native-purchase";
import { CHECKOUT_INITIAL } from "./state";
import { buttonClass } from "@/app/ui";
import { inNativeShell } from "@/lib/native-shell";

const C = DRAFT_COPY.app;

/**
 * Whether to draw anything that starts a Stripe transaction.
 *
 * Guideline 3.1.1: a subscription unlocked inside an iOS app must go through
 * in-app purchase, and 3.1.3(f) adds that a free companion app may sell nothing
 * and carry no call to action for buying elsewhere. A Checkout session is both.
 * This is a rejection rather than a warning, and it contradicts a decision
 * already made on the 24th — store billing on both platforms, at 15%.
 *
 * `null` until the effect runs, and NOTHING renders while it is null. The
 * obvious version — start visible, hide on hydration — draws a Subscribe button
 * inside the shell for a frame, which is the exact thing that must not be
 * offered. The web pays one frame of blank on a settings sub-page for that, and
 * install-app.tsx resolves the same question the same way.
 *
 * No longer temporary, and no longer nothing: the shell renders
 * `NativePlanChooser` here instead, which sells the same three plans through
 * Apple. What this hook decides is which of the two, and the `null` state is
 * still load-bearing for the reason above — a Subscribe button drawn for one
 * frame inside the shell is the exact thing 3.1.1 forbids.
 */
type Surface = "web" | "native" | null;

function useSurface(): Surface {
  const [surface, setSurface] = useState<Surface>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- reads window.Capacitor, which does not exist during a server render
  useEffect(() => setSurface(inNativeShell() ? "native" : "web"), []);
  return surface;
}

export function PlanChooser({
  userId,
  alreadyPayingStripe,
}: {
  userId: string;
  alreadyPayingStripe: boolean;
}) {
  const [state, act, pending] = useActionState(startCheckout, CHECKOUT_INITIAL);
  const surface = useSurface();

  // Hooks first, branch after. Nothing below may return before useActionState
  // has run, whichever surface this turns out to be.
  if (surface === null) return null;

  /**
   * Inside the shell, Apple sells it.
   *
   * `alreadyPayingStripe` is passed rather than worked out here. The page has
   * already computed it, and the liveness test — status before date, because a
   * revoked entitlement keeps its expiry — has been got wrong twice in two days
   * by being rewritten. There is one implementation, in `subscription-source`,
   * and this is not a third.
   */
  if (surface === "native") {
    return <NativePlanChooser userId={userId} alreadyPayingStripe={alreadyPayingStripe} />;
  }

  return (
    <form action={act} className="mt-8 flex flex-col gap-4">
      {PLANS.map((plan) => (
        <div
          key={plan.id}
          className={`rounded-xl border bg-surface p-6 ${
            plan.highlighted ? "border-accent" : "border-line-2"
          }`}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            {/* h2: the page heading is the h1 and there is nothing between. */}
            <h2 id={`${plan.id}-label`} className="text-[0.972rem]">
              {plan.label}
            </h2>
            <span id={`${plan.id}-price`} className="text-[12.2px] text-ink-2">
              {formatPriceCents(plan.priceCents)}
            </span>
          </div>

          <p className="mt-1.5 text-[11px] text-ink-3">
            {C.perMonth(Math.round(plan.priceCents / plan.months))}
          </p>

          <button
            type="submit"
            name="plan"
            value={plan.id}
            disabled={pending}
            /* Three buttons all read "Choose" otherwise. The plan travels in the
               name/value pair, which assistive technology never sees, so a
               screen-reader user listing the controls on this page heard the
               same word three times with no way to tell which was which — and
               this is the page where the wrong choice costs money. */
            aria-labelledby={`${plan.id}-label ${plan.id}-price`}
            className={`ease-brand mt-5 rounded-lg px-5 py-2.5 text-[12.2px] transition-opacity duration-200 hover:opacity-90 disabled:opacity-55 ${
              plan.highlighted ? "bg-accent text-accent-ink" : "border border-line-2 text-ink"
            }`}
          >
            {C.choosePlanLabel}
          </button>
        </div>
      ))}

      {state.error ? (
        <p role="alert" className="text-[11.7px] text-critical">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

export function ManageBilling() {
  const [state, act, pending] = useActionState(openBillingPortal, CHECKOUT_INITIAL);
  const surface = useSurface();

  // Hidden in the shell too, and this one is worth arguing. The portal manages
  // a subscription rather than starting one — but it can also change a plan,
  // which is a purchase, and Apple requires an IAP subscription be managed
  // through the system. A member who bought on the web loses the portal inside
  // the app until store billing exists. That is a real cost and the smaller
  // one.
  if (surface !== "web") return null;

  return (
    <form action={act} className="mt-6">
      <button type="submit" disabled={pending} className={buttonClass("secondary")}>
        {C.manageBillingLabel}
      </button>
      {state.error ? (
        <p role="alert" className="mt-3 text-[11.7px] text-critical">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
