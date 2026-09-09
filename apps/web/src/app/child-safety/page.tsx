import type { Metadata } from "next";

import { CHILD_SAFETY, CHILD_SAFETY_INTRO } from "@plusone/config";

import { SiteFooter } from "../site-footer";
import { SiteHeader } from "@/app/site-header";

/**
 * Deferred, not resolved.
 *
 * `instant = false` marks this segment as ALLOWED TO BLOCK while Cache
 * Components is adopted one route at a time — the incremental flow the
 * migration guide describes. It does not force the route to be dynamic, so a
 * genuinely prerenderable one still ships a static shell.
 *
 * Removing this line is the unit of work: the route then has to resolve its own
 * validation, by caching data with `use cache` or wrapping the runtime parts in
 * <Suspense>.
 */
export const instant = false;

/**
 * The child safety standards page (Google Play's Child safety standards form).
 *
 * Play requires a link that is "active, publicly available anywhere in the
 * world, and not editable", which rules out a PDF, a shared document, and
 * anything behind a sign-in. So it is a route on the marketing site rather than
 * a page in the app, and it is indexable on purpose — a standards page nobody
 * can find is not published.
 */
export const metadata: Metadata = {
  title: "Child safety standards",
  description:
    "Plus One is an adults-only app. What we prohibit, how to report it, and what we do about it.",
};

export default function ChildSafetyPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-[550.8px] px-6 py-16 sm:py-24">
      <SiteHeader />

      <h1 className="text-h1 text-balance">Child safety standards</h1>
      <p className="mt-6 text-[13.8px] leading-[1.7] text-ink-2">{CHILD_SAFETY_INTRO}</p>

      <div className="mt-16 flex flex-col gap-14">
        {CHILD_SAFETY.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-24">
            <h2 className="text-h3">{section.title}</h2>
            {section.body.map((paragraph) => (
              <p key={paragraph} className="mt-5 text-[13.4px] leading-[1.72] text-ink-2">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </div>

      <p className="mt-16 text-[11px] text-ink-3">
        These standards are a draft and are pending legal review.
      </p>

      <SiteFooter current="/child-safety" />
    </main>
  );
}
