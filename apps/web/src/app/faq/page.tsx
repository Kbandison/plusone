import type { Metadata } from "next";
import Link from "next/link";

import { FAQ } from "@plusone/config";

export const metadata: Metadata = {
  title: "Questions",
  description: "How Plus One works, what it costs, and what happens to your data.",
};

export default function FaqPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-[680px] px-6 py-16 sm:py-24">
      <h1 className="text-[clamp(2.2rem,7vw,3rem)] text-balance">Questions</h1>

      <div className="mt-14 flex flex-col gap-12">
        {FAQ.map((entry) => (
          <section key={entry.id} id={entry.id} className="scroll-mt-24">
            <h2 className="text-[clamp(1.35rem,3.6vw,1.6rem)]">{entry.question}</h2>
            {entry.answer.map((paragraph) => (
              <p key={paragraph} className="mt-4 text-[16.5px] leading-[1.72] text-ink-2">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </div>

      <nav className="mt-20 flex flex-wrap gap-x-7 gap-y-3 border-t border-line pt-6">
        {[
          { href: "/guidelines", label: "Community guidelines" },
          { href: "/privacy", label: "Privacy" },
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
    </main>
  );
}
