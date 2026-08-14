import type { Metadata } from "next";
import Link from "next/link";

import { COPY, HEALTH_DATA_ANCHOR } from "@plusone/config";
import { onboarding } from "@plusone/logic";

import { requireStep } from "@/lib/onboarding";
import { ConsentForm } from "./consent-form";

/**
 * The §9.1 health-data consent screen.
 *
 * Its own screen, with one unbundled checkbox — §7.2 describes the tick as part
 * of the community + condition screen, but a checkbox on the screen where a
 * member is also choosing their condition is bundled by definition. §9 is
 * headed "build requirements, not aspirations", so it wins.
 *
 * Nothing else is asked for here. That is the requirement, not a layout choice.
 */

export const metadata: Metadata = {
  // Neutral, like every other title: a browser history entry or a shared tab
  // must not disclose anything about the person reading it.
  title: "Your information",
  robots: { index: false, follow: false },
};

const STEP = "health_consent" as const;

export default async function ConsentPage() {
  await requireStep("health_consent");

  const { current, total } = onboarding.progress({
    step: STEP,
    completed: [],
    skipped: [],
    consentGrantedAt: null,
  });

  return (
    <main id="main" className="mx-auto w-full max-w-[600px] px-6 py-16 sm:py-24">
      <p className="text-[13px] tracking-[0.04em] text-ink-3 uppercase">
        Step {current + 1} of {total}
      </p>

      <div
        className="mt-4 h-px w-full bg-line"
        role="progressbar"
        aria-valuenow={current + 1}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-label="Onboarding progress"
      >
        <div
          className="h-px bg-accent"
          style={{ width: `${((current + 1) / total) * 100}%` }}
        />
      </div>

      <h1 className="mt-12 text-[clamp(2rem,6vw,2.6rem)] text-balance">
        {COPY.consent.heading}
      </h1>

      {/* §9.1, verbatim. This paragraph is the consent — it is not a summary of
          one, and it is not shortened behind a "read more". */}
      <p className="mt-7 text-[16.5px] leading-[1.7] text-ink-2">{COPY.consent.healthData}</p>

      <p className="mt-6">
        <Link
          href={`/privacy#${HEALTH_DATA_ANCHOR}`}
          className="ease-brand text-[15.5px] text-accent underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:decoration-accent"
        >
          {COPY.consent.policyLinkLabel}
        </Link>
      </p>

      <ConsentForm />
    </main>
  );
}
