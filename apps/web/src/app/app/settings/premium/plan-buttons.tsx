"use client";

import { useActionState } from "react";

import { DRAFT_COPY, PLANS, formatPriceCents } from "@plusone/config";

import { openBillingPortal, startCheckout } from "./actions";
import { CHECKOUT_INITIAL } from "./state";
import { buttonClass } from "@/app/ui";

const C = DRAFT_COPY.app;

export function PlanChooser() {
  const [state, act, pending] = useActionState(startCheckout, CHECKOUT_INITIAL);

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
