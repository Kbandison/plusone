import type { Metadata } from "next";

import { getServerSupabase } from "@/lib/supabase";

export const metadata: Metadata = { title: "Metrics" };

interface Metrics {
  verified_members: number;
  onboarded_members: number;
  support_only_members: number;
  active_this_week: number;
  drops_served: number;
  connects_sent: number;
  connects_accepted: number;
  chats_open: number;
  chats_date_planned: number;
  chats_graduated: number;
  chats_closed_by_fuse: number;
  chats_closed_by_member: number;
  closed_without_a_note: number;
  open_reports: number;
  subscriptions_active: number;
  premium_from_grants: number;
  referral_conversions: number;
}

const GROUPS: { title: string; keys: (keyof Metrics)[] }[] = [
  {
    title: "Members",
    keys: ["verified_members", "onboarded_members", "active_this_week", "support_only_members"],
  },
  {
    title: "Discovery",
    keys: ["drops_served", "connects_sent", "connects_accepted"],
  },
  {
    title: "Chats",
    keys: [
      "chats_open",
      "chats_date_planned",
      "chats_graduated",
      "chats_closed_by_fuse",
      "chats_closed_by_member",
    ],
  },
  {
    title: "Money",
    keys: ["subscriptions_active", "premium_from_grants", "referral_conversions"],
  },
  { title: "Moderation", keys: ["open_reports"] },
];

const LABELS: Record<keyof Metrics, string> = {
  verified_members: "Verified",
  onboarded_members: "Finished onboarding",
  support_only_members: "In support-only",
  active_this_week: "Active this week",
  drops_served: "Drops served",
  connects_sent: "Connects sent",
  connects_accepted: "Accepted",
  chats_open: "Open",
  chats_date_planned: "Date planned",
  chats_graduated: "Graduated",
  chats_closed_by_fuse: "Closed by the fuse",
  chats_closed_by_member: "Closed by a member",
  closed_without_a_note: "Closed with no note",
  open_reports: "Open reports",
  subscriptions_active: "Subscriptions",
  premium_from_grants: "Premium from invites",
  referral_conversions: "Referral conversions",
};

/**
 * The metrics dashboard (§7.3).
 *
 * Counts only. No member appears here by name or by id — a dashboard is the
 * easiest place for a product to start looking at individuals, because it is
 * the one screen where doing so feels like analysis.
 */
export default async function MetricsPage() {
  const supabase = await getServerSupabase();
  const { data } = await supabase.rpc("admin_metrics");
  const metrics = (data ?? {}) as Partial<Metrics>;

  const ghosted = Number(metrics.closed_without_a_note ?? 0);

  return (
    <main id="main">
      <h1 className="mt-4 text-h2">Metrics</h1>

      {/* §7.3 asks for the "closure vs ghost-equivalent rate = 0 by
          construction". It is measured rather than asserted: if this is ever
          non-zero, the product's central promise has broken, and this is the
          only place that would say so. */}
      <section
        className={`mt-8 rounded-xl border p-6 ${
          ghosted === 0 ? "border-line-2 bg-surface" : "border-critical bg-surface"
        }`}
      >
        <p className="text-[11px] tracking-[0.04em] text-ink-3 uppercase">
          Chats that ended in silence
        </p>
        <p className="mt-2 font-display text-h1 leading-none">{ghosted}</p>
        <p className="mt-3 text-[11.7px] leading-[1.6] text-ink-2">
          {ghosted === 0
            ? "Zero by construction — every closed chat carries a note. If this ever moves, something has broken."
            : "This should be zero. Every closed chat is supposed to carry a note."}
        </p>
      </section>

      {GROUPS.map((group) => (
        <section key={group.title} className="mt-10">
          <h2 className="text-[0.891rem] tracking-[0.04em] text-ink-3 uppercase">{group.title}</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {group.keys.map((key) => (
              <div key={key} className="rounded-lg border border-line-control bg-surface px-5 py-4">
                <dt className="text-[11px] text-ink-3">{LABELS[key]}</dt>
                <dd className="mt-1.5 font-display text-[1.377rem] leading-none tabular-nums">
                  {Number(metrics[key] ?? 0)}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </main>
  );
}
