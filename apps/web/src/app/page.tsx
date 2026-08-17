import Link from "next/link";

import { COPY, DRAFT_COPY } from "@plusone/config";

import { SiteFooter } from "./site-footer";
import { Wordmark } from "@/app/ui";
import { buttonClass } from "@/app/ui";

/**
 * The front door.
 *
 * Still a holding page — §7.1's marketing site (how-it-works, pricing, FAQ,
 * community guidelines, legal) is Milestone 8. What it now has is a way in,
 * which it did not before: every screen in the product was reachable only by
 * someone who already knew the URL.
 *
 * Two links, because there are two people knocking. `/onboarding/phone` starts
 * an account and forwards a member who already has a live session to `/app`;
 * `/sign-in` is for the one whose session lapsed, who would otherwise be sent
 * to step one of signing up and charged a text to reach an account they already
 * had. Neither needs to know who is knocking, so this page stays static.
 */
export default function Home() {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-[100dvh] max-w-[680px] flex-col justify-center px-6 py-24"
    >
      {/* Not a link on the home page — it is already here. */}
      <Wordmark className="text-[34px]" asLink={false} />

      {/* §3.4, verbatim. */}
      <h1 className="mt-12 max-w-[15ch] text-h1 text-balance">{COPY.marketing.hero}</h1>

      <p className="mt-6 max-w-[46ch] text-ink-2">{COPY.marketing.sub}</p>

      <div className="mt-11 flex flex-wrap items-center gap-x-7 gap-y-4">
        <Link href="/onboarding/phone" className={buttonClass("primary")}>
          {DRAFT_COPY.home.getStarted}
        </Link>

        <Link
          href="/sign-in"
          className="ease-brand text-[15.5px] text-ink-2 underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:text-ink hover:decoration-accent"
        >
          {DRAFT_COPY.home.signIn}
        </Link>

        {/* Never in production, and never merely hidden — the guard on
            /dev/sign-in itself is what closes that door, and this only stops
            the link from existing. Two independent checks, same as the page.
            NODE_ENV is inlined at build time, so this whole branch is gone from
            a production bundle rather than rendered and styled away. */}
        {process.env.NODE_ENV !== "production" && process.env["OTP_PROVIDER"] === "stub" ? (
          <Link
            href="/dev/sign-in"
            className="ease-brand rounded-lg border border-dashed border-line-2 px-4 py-2 text-[14px] text-ink-3 transition-colors duration-200 hover:text-ink"
          >
            Dev sign-in
          </Link>
        ) : null}

        <Link
          href="/how-it-works"
          className="ease-brand text-[15.5px] text-ink-2 underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:text-ink hover:decoration-accent"
        >
          How it works
        </Link>
      </div>

      {/* §3.4's verification pitch — the one claim worth making on the way in,
          because it is the thing the incumbents cannot say. */}
      <p className="mt-14 max-w-[44ch] border-t border-line pt-6 text-[14.5px] leading-[1.65] text-ink-3">
        {COPY.marketing.verificationPitch}
      </p>

      <SiteFooter />
    </main>
  );
}
