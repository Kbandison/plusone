import Link from "next/link";

import { BRAND, COPY, DRAFT_COPY } from "@plusone/config";

/**
 * The front door.
 *
 * Still a holding page — §7.1's marketing site (how-it-works, pricing, FAQ,
 * community guidelines, legal) is Milestone 8. What it now has is a way in,
 * which it did not before: every screen in the product was reachable only by
 * someone who already knew the URL.
 *
 * One link handles both cases. `/onboarding/phone` sends a signed-in member
 * straight to `/app`, so there is no need to ask who is knocking before showing
 * them the door — and no need to make this page dynamic to find out.
 */
export default function Home() {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-[100dvh] max-w-[680px] flex-col justify-center px-6 py-24"
    >
      <p className="font-display text-[34px] leading-none tracking-[-0.02em]">
        <span className="align-super text-[0.42em] text-accent">+</span>One
      </p>

      {/* §3.4, verbatim. */}
      <h1 className="mt-12 max-w-[15ch] text-[clamp(2.3rem,7vw,3.4rem)] text-balance">
        {COPY.marketing.hero}
      </h1>

      <p className="mt-6 max-w-[46ch] text-ink-2">{COPY.marketing.sub}</p>

      <div className="mt-11 flex flex-wrap items-center gap-x-7 gap-y-4">
        <Link
          href="/onboarding/phone"
          className="ease-brand rounded-lg bg-accent px-7 py-3.5 text-[16px] text-accent-ink transition-[opacity,transform] duration-200 hover:opacity-90 active:scale-[0.995]"
        >
          {DRAFT_COPY.home.getStarted}
        </Link>

        <Link
          href="/faq"
          className="ease-brand text-[15.5px] text-ink-2 underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:text-ink hover:decoration-accent"
        >
          Questions
        </Link>

        <Link
          href="/privacy"
          className="ease-brand text-[15.5px] text-ink-2 underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:text-ink hover:decoration-accent"
        >
          {DRAFT_COPY.home.privacyLink}
        </Link>
      </div>

      {/* §3.4's verification pitch — the one claim worth making on the way in,
          because it is the thing the incumbents cannot say. */}
      <p className="mt-14 max-w-[44ch] border-t border-line pt-6 text-[14.5px] leading-[1.65] text-ink-3">
        {COPY.marketing.verificationPitch}
      </p>

      <p className="mt-6 text-[13px] text-ink-3">{BRAND.name} is in build.</p>
    </main>
  );
}
