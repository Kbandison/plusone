import Link from "next/link";

import { BRAND } from "@plusone/config";

/**
 * The marketing footer.
 *
 * One list, because four pages each carrying their own was four places for a
 * link to go stale — and the legal ones are the links that must not.
 */
const LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/faq", label: "Questions" },
  { href: "/guidelines", label: "Community guidelines" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  // Play requires the child safety standards to be reachable by anyone, from
  // anywhere, without an account. A page nobody can navigate to is not
  // published, whatever URL the console holds.
  { href: "/child-safety", label: "Child safety" },
];

export function SiteFooter({ current }: { current?: string }) {
  return (
    <footer className="mt-20 border-t border-line pt-8">
      <nav aria-label="Site">
        <ul className="flex flex-wrap gap-x-7 gap-y-3">
          {LINKS.filter((link) => link.href !== current).map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="ease-brand text-[12.2px] text-ink-2 underline decoration-line-2 underline-offset-4 transition-colors duration-300 hover:text-ink hover:decoration-accent"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/*
       * A reachable address, on every marketing page.
       *
       * It was already published — terms.ts and legal.ts both write it into
       * their body text — but only to somebody who opens a policy and reads to
       * the end of it. App Review's guideline 1.2 asks for a published point of
       * contact for a user-generated-content app, and a reviewer checking that
       * looks at the footer, not paragraph forty of the terms.
       *
       * Off BRAND rather than typed, for the reason the constant's own comment
       * gives: three places naming an address is three places for it to drift.
       */}
      <p className="mt-7 text-[11px] text-ink-3">
        {BRAND.name} is in build. Reach us at{" "}
        <a
          href={`mailto:${BRAND.supportEmail}`}
          className="ease-brand underline decoration-line-2 underline-offset-4 transition-colors duration-300 hover:text-ink hover:decoration-accent"
        >
          {BRAND.supportEmail}
        </a>
        .
      </p>
    </footer>
  );
}
