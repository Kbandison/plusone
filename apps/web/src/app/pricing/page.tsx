import type { Metadata } from "next";

import { SiteFooter } from "../site-footer";

import {
  PLANS,
  PREMIUM_INCLUDES,
  PREMIUM_NEVER,
  PRICING_INTRO,
  PRICING_NEVER_NOTE,
  formatPriceCents,
} from "@plusone/config";

import { SiteHeader } from "@/app/site-header";

export const metadata: Metadata = {
  title: "Pricing",
  description: "What the free version includes, what premium adds, and what it will never buy.",
};

export default function PricingPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-[652.8px] px-6 py-16 sm:py-24">
      <SiteHeader />

      <h1 className="text-h1 text-balance">Pricing</h1>
      <p className="mt-6 text-[16.3px] leading-[1.7] text-ink-2">{PRICING_INTRO}</p>

      <ul className="mt-12 flex flex-col gap-4">
        {PLANS.map((plan) => (
          <li
            key={plan.id}
            className={`rounded-xl border bg-surface p-6 ${
              plan.highlighted ? "border-accent" : "border-line-2"
            }`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-[1.152rem]">{plan.label}</h2>
              <span className="text-[15.4px]">{formatPriceCents(plan.priceCents)}</span>
            </div>
            <p className="mt-1.5 text-[13px] text-ink-3">
              {formatPriceCents(Math.round(plan.priceCents / plan.months))} a month
            </p>
          </li>
        ))}
      </ul>

      <section className="mt-14">
        <h2 className="text-[1.248rem]">What premium gives you</h2>
        <ul className="mt-5 flex flex-col gap-3">
          {PREMIUM_INCLUDES.map((item) => (
            <li
              key={item}
              className="border-l border-line-2 pl-5 text-[15.4px] leading-[1.65] text-ink-2"
            >
              {item}
            </li>
          ))}
        </ul>
      </section>

      {/* §3.3 — "No selling exemptions from mechanics. Never monetized. Ever."
          Given equal weight to what premium does buy, on the page that sells
          it. Every other app in this space sells exactly this list. */}
      <section className="mt-12">
        <h2 className="text-[1.248rem]">What it will never buy</h2>
        <p className="mt-4 text-[15.4px] leading-[1.7] text-ink-2">{PRICING_NEVER_NOTE}</p>
        <ul className="mt-5 flex flex-col gap-3">
          {PREMIUM_NEVER.map((item) => (
            <li
              key={item}
              className="border-l border-critical/40 pl-5 text-[15.4px] leading-[1.65] text-ink-2"
            >
              {item}
            </li>
          ))}
        </ul>
      </section>

      <SiteFooter current="/pricing" />
    </main>
  );
}
