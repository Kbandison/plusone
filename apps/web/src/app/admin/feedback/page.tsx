import type { Metadata } from "next";
import Link from "next/link";

import { FEEDBACK_STATUS_LABELS, type FeedbackStatus } from "@plusone/config";

import { getServerSupabase } from "@/lib/supabase";
import { TriageRow, type FeedbackRow } from "./triage-row";

export const metadata: Metadata = { title: "Feedback" };
export const dynamic = "force-dynamic";

const FILTERS: (FeedbackStatus | "all")[] = ["new", "seen", "done", "declined", "all"];

/**
 * What members have reported.
 *
 * Reads through the member's own client rather than the service one: the SELECT
 * policy on `feedback` already admits an admin to every row, so there is a
 * member-context path and no reason to reach past RLS to use it. That is the
 * opposite call from /admin/waitlist, where the table has no policies at all
 * and the service client is the only door — and the difference is a property of
 * each table rather than a preference.
 *
 * No member names and no join to `profiles`. Who reported a bug is not what
 * makes it actionable, and this screen is open beside a moderation queue.
 */
export default async function AdminFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  // Typed as the union including "all", so the `filter !== "all"` narrowing
  // below is a real check rather than one TypeScript can prove impossible.
  const filter: FeedbackStatus | "all" = FILTERS.includes((status ?? "") as FeedbackStatus | "all")
    ? ((status ?? "new") as FeedbackStatus | "all")
    : "new";

  const supabase = await getServerSupabase();
  let query = supabase
    .from("feedback")
    .select("id, kind, body, status, surface, page, app_version, created_at, admin_note")
    .order("created_at", { ascending: false })
    .limit(100);

  if (filter !== "all") query = query.eq("status", filter);

  const { data } = await query;
  const rows = (data ?? []).map((r): FeedbackRow => ({
    id: r.id as string,
    kind: r.kind as string,
    body: r.body as string,
    status: r.status as FeedbackStatus,
    surface: (r.surface as string | null) ?? null,
    page: (r.page as string | null) ?? null,
    appVersion: (r.app_version as string | null) ?? null,
    createdAt: r.created_at as string,
    adminNote: (r.admin_note as string | null) ?? null,
  }));

  return (
    <main id="main">
      <h1 className="mt-4 text-h2">Feedback</h1>

      <nav aria-label="Filter" className="mt-4 flex flex-wrap gap-3">
        {FILTERS.map((value) => (
          <Link
            key={value}
            href={`/admin/feedback?status=${value}`}
            aria-current={filter === value ? "page" : undefined}
            className={`text-[12.6px] underline-offset-4 ${
              filter === value
                ? "text-ink underline decoration-accent"
                : "text-ink-2 underline decoration-line-2"
            }`}
          >
            {value === "all" ? "All" : FEEDBACK_STATUS_LABELS[value]}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="mt-8 text-body text-ink-2">Nothing here.</p>
      ) : (
        <ul className="mt-8 flex flex-col gap-4">
          {rows.map((row) => (
            <li key={row.id}>
              <TriageRow row={row} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
