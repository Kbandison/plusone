import type { Metadata } from "next";

import { TERMS, TERMS_EFFECTIVE, TERMS_INTRO } from "@plusone/config";

import { SiteFooter } from "../site-footer";
import { SiteHeader } from "@/app/site-header";

export const metadata: Metadata = {
  title: "Terms",
  description: "The rules of using Plus One, in plain words.",
};

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function TermsPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-[652.8px] px-6 py-16 sm:py-24">
      <SiteHeader />

      <h1 className="text-h1 text-balance">Terms</h1>
      <p className="mt-6 text-[16.3px] leading-[1.7] text-ink-2">{TERMS_INTRO}</p>
      <p className="mt-5 text-[13.4px] text-ink-3">Effective {formatDate(TERMS_EFFECTIVE)}</p>

      <div className="mt-16 flex flex-col gap-14">
        {TERMS.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-24">
            <h2 className="text-h3">{section.title}</h2>
            {section.body.map((paragraph) => (
              <p key={paragraph} className="mt-5 text-[15.9px] leading-[1.72] text-ink-2">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </div>

      <p className="mt-16 text-[13px] text-ink-3">
        These terms are a draft and are pending legal review.
      </p>

      <SiteFooter current="/terms" />
    </main>
  );
}
