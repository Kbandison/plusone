import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getServerSupabase } from "@/lib/supabase";

/**
 * The admin surface (§7.3).
 *
 * Not indexed, not cached, and gated twice: this layout turns a non-admin away
 * at the door, and every RPC underneath checks `is_admin()` itself and raises.
 * A layout guard alone would be a client-side wall by another name — it stops
 * the page rendering, not the data moving.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin" },
  description: null,
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/sign-in");

  // No argument: is_admin() answers only about the caller, so the roster
  // cannot be probed. See 20260814001000_self_relative_predicates.sql.
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) redirect("/");

  return (
    <div className="mx-auto w-full max-w-[729px] px-6 py-12">
      <nav aria-label="Moderation" className="flex flex-wrap gap-6">
        {[
          { href: "/admin/reports", label: "Reports" },
          { href: "/admin/verifications", label: "Verifications" },
          { href: "/admin/members", label: "Members" },
          { href: "/admin/waitlist", label: "Waitlist" },
          { href: "/admin/feedback", label: "Feedback" },
          { href: "/admin/news", label: "News" },
          { href: "/admin/config", label: "Config" },
          { href: "/admin/metrics", label: "Metrics" },
        ].map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="ease-brand text-[11px] tracking-[0.04em] text-ink-3 uppercase transition-colors duration-300 hover:text-ink"
          >
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
