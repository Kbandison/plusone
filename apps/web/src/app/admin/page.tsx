import type { Metadata } from "next";
import Link from "next/link";

import { getServerSupabase } from "@/lib/supabase";

export const metadata: Metadata = { title: "Moderation" };

/**
 * The admin front door, which did not exist.
 *
 * /admin had a layout and no page, so the one URL anybody would type — and the
 * one the Settings link points at — was a 404. The nav inside the layout listed
 * six destinations and the segment holding it led nowhere.
 *
 * It is a queue rather than a menu. The layout already lists every section
 * across the top, so repeating those as six links would be a page whose whole
 * content is its own navigation. What an admin actually opens this for is "is
 * there anything waiting", and that is two numbers.
 *
 * Both counts come from the same RPCs the sections themselves use. A separate
 * count query is a second definition of "open", and the two would disagree the
 * first time either changed.
 */
export default async function AdminHomePage() {
  const supabase = await getServerSupabase();

  const [
    { data: reports, error: reportsError },
    { data: verifications, error: verificationsError },
  ] = await Promise.all([
    supabase.rpc("admin_open_reports"),
    supabase.rpc("admin_flagged_verifications"),
  ]);

  const queues = [
    {
      href: "/admin/reports",
      label: "Reports",
      count: (reports ?? []).length,
      error: reportsError?.message ?? null,
      note: "Open reports, oldest first.",
    },
    {
      href: "/admin/verifications",
      label: "Verifications",
      count: (verifications ?? []).length,
      error: verificationsError?.message ?? null,
      note: "Selfies the liveness check flagged for a human.",
    },
  ];

  return (
    <main id="main">
      <h1 className="mt-4 text-h2">Moderation</h1>
      <p className="mt-4 max-w-[52ch] text-[13px] leading-[1.7] text-ink-2">
        What is waiting. Every decision made from here is written to the audit log with your note.
      </p>

      <ul className="mt-10 flex flex-col gap-4">
        {queues.map((queue) => (
          <li key={queue.href}>
            <Link
              href={queue.href}
              className="ease-brand flex items-baseline justify-between gap-6 rounded-xl border border-line-2 bg-surface p-6 transition-colors duration-300 hover:border-line-control"
            >
              <span className="flex flex-col gap-1.5">
                <span className="text-[0.972rem]">{queue.label}</span>
                <span className="text-[12.2px] text-ink-2">{queue.note}</span>
              </span>

              {queue.error ? (
                <span role="alert" className="text-[11.7px] text-critical">
                  {queue.error}
                </span>
              ) : (
                // Nothing waiting reads differently from a count of zero, and
                // an admin scanning this wants to know which it is at a glance.
                <span
                  className={`font-display text-h2 leading-none tabular-nums ${
                    queue.count > 0 ? "text-accent" : "text-ink-3"
                  }`}
                >
                  {queue.count}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
