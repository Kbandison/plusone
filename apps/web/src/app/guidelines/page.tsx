import type { Metadata } from "next";

import { SiteFooter } from "../site-footer";

import { COMMUNITY_GUIDELINES, GUIDELINES_INTRO } from "@plusone/config";
import { SiteHeader } from "@/app/site-header";

export const metadata: Metadata = {
  title: "Community guidelines",
  description: "How people treat each other here, and what gets someone removed.",
};

export default function GuidelinesPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-[652.8px] px-6 py-16 sm:py-24">
      <SiteHeader />

      <h1 className="text-h1 text-balance">Community guidelines</h1>
      <p className="mt-6 text-[16.3px] leading-[1.7] text-ink-2">{GUIDELINES_INTRO}</p>

      <div className="mt-16 flex flex-col gap-14">
        {COMMUNITY_GUIDELINES.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-24">
            <h2 className="text-h3">{section.title}</h2>

            {section.body.map((paragraph) => (
              <p key={paragraph} className="mt-5 text-[15.9px] leading-[1.72] text-ink-2">
                {paragraph}
              </p>
            ))}

            {section.list ? (
              <ul className="mt-6 flex flex-col gap-3.5">
                {section.list.map((item) => (
                  <li
                    key={item}
                    className="border-l border-line-2 pl-5 text-[15.4px] leading-[1.65] text-ink-2"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>
      <SiteFooter current="/guidelines" />
    </main>
  );
}
