import type { Metadata } from "next";

import { getServerSupabase } from "@/lib/supabase";
import { ReportCard, type OpenReport } from "./report-card";

/**
 * Deferred, not resolved.
 *
 * `instant = false` marks this segment as ALLOWED TO BLOCK while Cache
 * Components is adopted one route at a time — the incremental flow the
 * migration guide describes. It does not force the route to be dynamic, so a
 * genuinely prerenderable one still ships a static shell.
 *
 * Removing this line is the unit of work: the route then has to resolve its own
 * validation, by caching data with `use cache` or wrapping the runtime parts in
 * <Suspense>.
 */
export const instant = false;

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.rpc("admin_open_reports");
  const reports = (data ?? []) as OpenReport[];

  return (
    <main id="main">
      <h1 className="mt-4 text-h2">Reports</h1>
      <p className="mt-4 max-w-[52ch] text-[13px] leading-[1.7] text-ink-2">
        Open reports, oldest first. Every decision is written to the audit log with your note.
      </p>

      {error ? (
        <p role="alert" className="mt-8 text-[12.2px] text-critical">
          {error.message}
        </p>
      ) : reports.length === 0 ? (
        <p className="mt-10 rounded-lg border border-line-2 bg-surface p-8 text-[13px] text-ink-2">
          Nothing waiting.
        </p>
      ) : (
        <ul className="mt-10 flex flex-col gap-5">
          {reports.map((report) => (
            // Narrowed on purpose. admin_open_reports also returns reporter_id
            // and subject ids, which this card does not render — and handing the
            // whole row to a client component serialises every field of it into
            // the page payload, so the reporter's id travelled to the browser
            // for no reason. A moderator decides on what was said.
            <ReportCard
              key={report.queue_id}
              report={{
                queue_id: report.queue_id,
                reason: report.reason,
                detail: report.detail,
                reported_display_name: report.reported_display_name,
                reported_body: report.reported_body,
                created_at: report.created_at,
              }}
            />
          ))}
        </ul>
      )}
    </main>
  );
}
