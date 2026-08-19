import type { Metadata } from "next";

import { SiteFooter } from "../site-footer";

import { HOW_IT_WORKS, HOW_IT_WORKS_INTRO } from "@plusone/config";
import { SiteHeader } from "@/app/site-header";

export const metadata: Metadata = {
  title: "How it works",
  description: "Verification, the Drop, connects, the fuse, and why nothing here ends in silence.",
};

export default function HowItWorksPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-[550.8px] px-6 py-16 sm:py-24">
      <SiteHeader />

      <h1 className="text-h1 text-balance">How it works</h1>
      <p className="mt-6 text-[13.8px] leading-[1.7] text-ink-2">{HOW_IT_WORKS_INTRO}</p>

      <ol className="mt-16 flex flex-col gap-14">
        {HOW_IT_WORKS.map((step, index) => (
          <li key={step.id} id={step.id} className="scroll-mt-24">
            <p className="font-display text-[12.2px] text-accent">
              {String(index + 1).padStart(2, "0")}
            </p>
            <h2 className="mt-2 text-h3">{step.title}</h2>

            {step.body.map((paragraph) => (
              <p key={paragraph} className="mt-5 text-[13.4px] leading-[1.72] text-ink-2">
                {paragraph}
              </p>
            ))}

            {/* §3.4, verbatim — the same sentence the app itself shows. A
                marketing page that describes a mechanic differently from the
                screen that runs it is the beginning of two products. */}
            {step.quoted ? (
              <p className="mt-6 border-l-2 border-line-2 pl-5 text-[13px] leading-[1.7]">
                {step.quoted}
              </p>
            ) : null}
          </li>
        ))}
      </ol>

      <SiteFooter current="/how-it-works" />
    </main>
  );
}
