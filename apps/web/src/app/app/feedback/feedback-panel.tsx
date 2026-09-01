import { FEEDBACK_STATUS_LABELS, type FeedbackStatus } from "@plusone/config";

import { Card } from "@/app/ui";
import { getServerSupabase } from "@/lib/supabase";
import { FeedbackForm } from "./feedback-form";

interface Row {
  id: string;
  kind: string;
  body: string;
  status: FeedbackStatus;
  created_at: string;
  admin_note: string | null;
}

/**
 * The contents, so the page and the sheet cannot drift.
 *
 * Same split as ConnectPanel and for the same reason: `/app/feedback` is a real
 * URL that has to work on a hard load, a share, or a refresh, and the header
 * icon opens it as a sheet over whatever you were looking at. Two copies of
 * this markup would be two places to fix a bug in a form whose whole job is
 * collecting bug reports.
 */
export async function FeedbackPanel({ from }: { from: string }) {
  const supabase = await getServerSupabase();

  // Own rows only, by policy. Allowed to come back empty — somebody with no
  // history still gets the form.
  const { data } = await supabase
    .from("feedback")
    .select("id, kind, body, status, created_at, admin_note")
    .order("created_at", { ascending: false })
    .limit(20);

  const rows = (data ?? []) as Row[];

  return (
    <>
      <h1 className="text-h2">Report a problem</h1>
      <p className="mt-3 text-body leading-[1.7] text-ink-2">
        Plus One is in a closed beta and this is the most useful thing you can do with it. Anything
        at all — something broken, something missing, something that read wrong.
      </p>

      <FeedbackForm from={from} />

      {rows.length > 0 ? (
        <section className="mt-12">
          <h2 className="text-h3">What you have sent</h2>
          <ul className="mt-4 flex flex-col gap-3">
            {rows.map((row) => (
              <li key={row.id}>
                <Card sunk className="p-4">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-[11px] tracking-[0.03em] text-ink-3 uppercase">
                      {FEEDBACK_STATUS_LABELS[row.status]}
                    </span>
                    <time className="text-[11px] text-ink-3" dateTime={row.created_at}>
                      {new Date(row.created_at).toLocaleDateString()}
                    </time>
                  </div>
                  <p className="mt-2 text-body leading-[1.6] whitespace-pre-wrap">{row.body}</p>
                  {/* Only when there is one. A reply is the difference between
                      a status and an answer. */}
                  {row.admin_note ? (
                    <p className="mt-3 border-t border-line-2 pt-3 text-[12.6px] leading-[1.6] text-ink-2">
                      {row.admin_note}
                    </p>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
