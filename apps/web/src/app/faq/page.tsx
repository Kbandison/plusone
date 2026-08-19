import type { Metadata } from "next";

import { SiteFooter } from "../site-footer";

import { FAQ } from "@plusone/config";
import { SiteHeader } from "@/app/site-header";

export const metadata: Metadata = {
  title: "Questions",
  description: "How Plus One works, what it costs, and what happens to your data.",
};

export default function FaqPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-[612px] px-6 py-16 sm:py-24">
      <SiteHeader />

      <h1 className="text-h1 text-balance">Questions</h1>

      <div className="mt-14 flex flex-col gap-12">
        {FAQ.map((entry) => (
          <section key={entry.id} id={entry.id} className="scroll-mt-24">
            <h2 className="text-h3">{entry.question}</h2>
            {entry.answer.map((paragraph) => (
              <p key={paragraph} className="mt-4 text-[14.9px] leading-[1.72] text-ink-2">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </div>

      <SiteFooter current="/faq" />
    </main>
  );
}
