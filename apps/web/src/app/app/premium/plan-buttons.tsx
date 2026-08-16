"use client";

import { useActionState } from "react";

import { DRAFT_COPY, PLANS, formatPriceCents } from "@plusone/config";

import { openBillingPortal, startCheckout } from "./actions";
import { CHECKOUT_INITIAL } from "./state";

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
            <h2 className="text-[1.2rem]">{plan.label}</h2>
            <span className="text-[15px] text-ink-2">{formatPriceCents(plan.priceCents)}</span>
          </div>

          <p className="mt-1.5 text-[13.5px] text-ink-3">
            {C.perMonth(Math.round(plan.priceCents / plan.months))}
          </p>

          <button
            type="submit"
            name="plan"
            value={plan.id}
            disabled={pending}
            className={`ease-brand mt-5 rounded-lg px-5 py-2.5 text-[15px] transition-opacity duration-200 hover:opacity-90 disabled:opacity-55 ${
              plan.highlighted ? "bg-accent text-accent-ink" : "border border-line-2 text-ink"
            }`}
          >
            {C.choosePlanLabel}
          </button>
        </div>
      ))}

      {state.error ? (
        <p role="alert" className="text-[14.5px] text-critical">
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
      <button
        type="submit"
        disabled={pending}
        className="ease-brand rounded-lg border border-line-2 px-5 py-2.5 text-[15px] transition-colors duration-200 hover:border-accent disabled:opacity-55"
      >
        {C.manageBillingLabel}
      </button>
      {state.error ? (
        <p role="alert" className="mt-3 text-[14.5px] text-critical">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
