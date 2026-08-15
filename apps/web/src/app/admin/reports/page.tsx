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
            <ReportCard key={report.queue_id} report={report} />
          ))}
        </ul>
      )}
    </main>
  );
}
