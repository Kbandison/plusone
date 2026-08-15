import type { Metadata } from "next";

import { SiteFooter } from "../site-footer";

import { HOW_IT_WORKS, HOW_IT_WORKS_INTRO } from "@plusone/config";

export const metadata: Metadata = {
  title: "How it works",
  description: "Verification, the Drop, connects, the fuse, and why nothing here ends in silence.",
};

export default function HowItWorksPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-[680px] px-6 py-16 sm:py-24">
      <h1 className="text-[clamp(2.2rem,7vw,3rem)] text-balance">How it works</h1>
      <p className="mt-6 text-[17px] leading-[1.7] text-ink-2">{HOW_IT_WORKS_INTRO}</p>

      <ol className="mt-16 flex flex-col gap-14">
        {HOW_IT_WORKS.map((step, index) => (
          <li key={step.id} id={step.id} className="scroll-mt-24">
            <p className="font-display text-[15px] text-accent">{String(index + 1).padStart(2, "0")}</p>
            <h2 className="mt-2 text-[clamp(1.5rem,4vw,1.85rem)]">{step.title}</h2>

            {step.body.map((paragraph) => (
              <p key={paragraph} className="mt-5 text-[16.5px] leading-[1.72] text-ink-2">
                {paragraph}
              </p>
            ))}

            {/* §3.4, verbatim — the same sentence the app itself shows. A
                marketing page that describes a mechanic differently from the
                screen that runs it is the beginning of two products. */}
            {step.quoted ? (
              <p className="mt-6 border-l-2 border-line-2 pl-5 text-[16px] leading-[1.7]">
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
