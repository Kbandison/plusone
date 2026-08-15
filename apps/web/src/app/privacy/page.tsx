import type { Metadata } from "next";
import Link from "next/link";

import {
  BRAND,
  PRIVACY_POLICY,
  PRIVACY_POLICY_EFFECTIVE,
  PRIVACY_POLICY_INTRO,
} from "@plusone/config";

/**
 * The privacy page (§7.1). Plain language: what we store, what we never store,
 * hard delete. §9.1's consent screen links to the health-data section here.
 *
 * DRAFT — Decision #30 requires counsel review before public launch.
 */

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Plus One stores, what it never stores, and how to delete all of it.",
};

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function PrivacyPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-[680px] px-6 py-16 sm:py-24">
      <h1 className="text-[clamp(2.2rem,7vw,3rem)] text-balance">Privacy</h1>

      <p className="mt-6 text-[17px] leading-[1.7] text-ink-2">{PRIVACY_POLICY_INTRO}</p>

      <p className="mt-5 text-[14px] text-ink-3">
        Effective {formatDate(PRIVACY_POLICY_EFFECTIVE)}
      </p>

      {/* Jump list. The consent screen deep-links to #health-data, but someone
          arriving here cold should be able to find the same section by eye. */}
      <nav aria-label="Sections" className="mt-12 border-t border-line pt-8">
        <ul className="flex flex-col gap-2.5">
          {PRIVACY_POLICY.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="ease-brand text-[15.5px] text-ink-2 underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:text-ink hover:decoration-accent"
              >
                {section.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-16 flex flex-col gap-14">
        {PRIVACY_POLICY.map((section) => (
          <section
            key={section.id}
            id={section.id}
            // Deep links land under any sticky chrome rather than flush against it.
            className="scroll-mt-24"
          >
            <h2 className="text-[clamp(1.5rem,4vw,1.85rem)]">{section.title}</h2>

            {section.body.map((paragraph) => (
              <p key={paragraph} className="mt-5 text-[16.5px] leading-[1.72] text-ink-2">
                {paragraph}
              </p>
            ))}

            {section.list ? (
              <ul className="mt-6 flex flex-col gap-3.5">
                {section.list.map((item) => (
                  <li
                    key={item}
                    className="border-l border-line-2 pl-5 text-[16px] leading-[1.65] text-ink-2"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>

      <nav className="mt-20 flex flex-wrap gap-x-7 gap-y-3 border-t border-line pt-6">
        {[
          { href: "/faq", label: "Questions" },
          { href: "/guidelines", label: "Community guidelines" },
        ].map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="ease-brand text-[15px] text-ink-2 underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:text-ink hover:decoration-accent"
          >
            {label}
          </Link>
        ))}
      </nav>

      <p className="mt-8 text-[13.5px] text-ink-3">
        {BRAND.name} is in build. This policy is a draft and is pending legal review.
      </p>
    </main>
  );
}
