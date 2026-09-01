import type { Metadata } from "next";

import { FEEDBACK_STATUS_LABELS, type FeedbackStatus } from "@plusone/config";

import { Card } from "@/app/ui";
import { getServerSupabase } from "@/lib/supabase";
import { FeedbackForm } from "./feedback-form";

export const metadata: Metadata = { title: "Report a problem" };
export const dynamic = "force-dynamic";

interface Row {
  id: string;
  kind: string;
  body: string;
  status: FeedbackStatus;
  created_at: string;
  admin_note: string | null;
}

/**
 * Where a member says something is broken, or should exist.
 *
 * ── they can see what happened to it, and that is the point ─────────────────
 *
 * A public roadmap with upvotes is the obvious alternative and it is refused
 * in feedback.ts: a feature request carries a name, and a name on a board
 * belonging to an HSV and HIV app is a disclosure nobody set out to make.
 *
 * What a public board is actually FOR, from where the member is standing, is
 * knowing their report did not vanish. That part needs no board — it needs the
 * status of their own reports, which is what the list below is. `declined` is
 * shown as plainly as `done`, because being told no is a better outcome than
 * watching something that will never move.
 */
export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const supabase = await getServerSupabase();

  // Own rows only, by policy. The select is separate from the form and is
  // allowed to come back empty — a member with no history still gets the form.
  const { data } = await supabase
    .from("feedback")
    .select("id, kind, body, status, created_at, admin_note")
    .order("created_at", { ascending: false })
    .limit(20);

  const rows = (data ?? []) as Row[];

  return (
    <main id="main">
      <h1 className="text-h2">Report a problem</h1>
      <p className="mt-3 text-body leading-[1.7] text-ink-2">
        Plus One is in a closed beta and this is the most useful thing you can do with it. Anything
        at all — something broken, something missing, something that read wrong.
      </p>

      <FeedbackForm from={from ?? ""} />

      {rows.length > 0 ? (
        <section className="mt-12">
          <h2 className="text-h3">What you have sent</h2>
          <ul className="mt-4 flex flex-col gap-3">
            {rows.map((row) => (
              <Card key={row.id} sunk className="p-4">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-[11px] tracking-[0.03em] text-ink-3 uppercase">
                    {FEEDBACK_STATUS_LABELS[row.status]}
                  </span>
                  <time className="text-[11px] text-ink-3" dateTime={row.created_at}>
                    {new Date(row.created_at).toLocaleDateString()}
                  </time>
                </div>
                <p className="mt-2 text-body leading-[1.6] whitespace-pre-wrap">{row.body}</p>
                {/* Only when there is one. A reply is the difference between a
                    status and an answer. */}
                {row.admin_note ? (
                  <p className="mt-3 border-t border-line-2 pt-3 text-[12.6px] leading-[1.6] text-ink-2">
                    {row.admin_note}
                  </p>
                ) : null}
              </Card>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
