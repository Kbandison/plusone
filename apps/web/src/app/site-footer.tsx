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
                className="ease-brand text-[13.6px] text-ink-2 underline decoration-line-2 underline-offset-4 transition-colors duration-200 hover:text-ink hover:decoration-accent"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <p className="mt-7 text-[12.2px] text-ink-3">{BRAND.name} is in build.</p>
    </footer>
  );
}
