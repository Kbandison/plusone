import type { Metadata } from "next";

import { getServerSupabase } from "@/lib/supabase";
import { ReportCard, type OpenReport } from "./report-card";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.rpc("admin_open_reports");
  const reports = (data ?? []) as OpenReport[];

  return (
    <main id="main">
      <h1 className="mt-4 text-[clamp(1.9rem,5vw,2.4rem)]">Reports</h1>
      <p className="mt-4 max-w-[52ch] text-[16px] leading-[1.7] text-ink-2">
        Open reports, oldest first. Every decision is written to the audit log with your note.
      </p>

      {error ? (
        <p role="alert" className="mt-8 text-[15px] text-critical">
          {error.message}
        </p>
      ) : reports.length === 0 ? (
        <p className="mt-10 rounded-lg border border-line-2 bg-surface p-8 text-[16px] text-ink-2">
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
