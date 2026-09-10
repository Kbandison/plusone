import { getServerSupabase } from "@/lib/supabase";

import { ShowContact } from "./show-contact";

/**
 * Who has signed up, and when.
 *
 * ── this exists because search alone could not answer it ───────────────────
 *
 * `admin_member_lookup` needs a name you already have. Kevin found on
 * 2026-09-09 that there was no way to ask "who has signed up" at all — the
 * aggregate in `admin_metrics` says eight, and cannot say which eight.
 *
 * The §7.3 objection to a listing was about "a directory of members' private
 * details". That is answered by what this does NOT show rather than by
 * disagreeing with it: no condition, no email, no phone, no location, no bio.
 * A diagnosis still costs a written reason through RevealCondition.
 */
function when(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toISOString().slice(0, 10);
}

interface RosterRow {
  readonly user_id: string;
  readonly display_name: string | null;
  readonly verification_status: string;
  readonly created_at: string;
  readonly last_active_at: string | null;
  readonly joined_in_beta: boolean;
  readonly open_reports: number;
  readonly email_masked: string | null;
  readonly phone_masked: string | null;
}

export async function Roster() {
  const supabase = await getServerSupabase();
  // Allowed to fail, and to fail QUIETLY. 20260909000600 may not be applied —
  // migrations here are applied by hand and are Kevin's call — and this screen's
  // reason for existing is the search box below it, which must keep working.
  const { data, error } = await supabase.rpc("admin_member_roster");

  if (error) {
    return (
      <p className="mt-4 text-[12px] text-ink-3">
        The roster needs migration 20260909000600. Search below still works.
      </p>
    );
  }

  const rows = (data ?? []) as RosterRow[];
  if (rows.length === 0) return <p className="mt-4 text-[12px] text-ink-3">No members yet.</p>;

  return (
    <>
      <p className="mt-4 text-[12px] text-ink-2">
        {rows.length} {rows.length === 1 ? "member" : "members"}, newest first. No condition.
        Contact details are masked — press show on a row you need to place.
      </p>

      {/* The table scrolls inside its own box. The page must not scroll
          sideways: a document-level overflow shifts the header and wordmark with
          it, which is the bug 1ea97be spent an evening on. */}
      <div className="mt-5 -mx-6 overflow-x-auto px-6">
        <table className="w-full min-w-[44rem] border-collapse text-left text-[12.4px]">
          <thead>
            <tr className="border-b border-line text-[10.5px] tracking-[0.04em] text-ink-3 uppercase">
              <th className="py-2 pr-4 font-normal">Name</th>
              <th className="py-2 pr-4 font-normal">Joined</th>
              <th className="py-2 pr-4 font-normal">Status</th>
              <th className="py-2 pr-4 font-normal">Last active</th>
              <th className="py-2 pr-4 font-normal">Contact</th>
              <th className="py-2 font-normal">Flags</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.user_id} className="border-b border-line-2">
                {/* A member who has not named themselves yet is a real state —
                    onboarding is nine steps and this is step three. */}
                <td className="py-2.5 pr-4">
                  {r.display_name ?? <span className="text-ink-3">unnamed</span>}
                </td>
                {/* tabular-nums so the dates line up as a column rather than
                    wandering by digit width. */}
                <td className="py-2.5 pr-4 tabular-nums text-ink-2">{when(r.created_at)}</td>
                <td className="py-2.5 pr-4 text-ink-2">{r.verification_status}</td>
                <td className="py-2.5 pr-4 tabular-nums text-ink-2">{when(r.last_active_at)}</td>
                {/* Masked from the database, not hidden with CSS — a page that
                    ships whole addresses has already put them in the payload. */}
                <td className="py-2.5 pr-4 text-[11.5px]">
                  <ShowContact
                    userId={r.user_id}
                    emailMasked={r.email_masked}
                    phoneMasked={r.phone_masked}
                  />
                </td>
                <td className="py-2.5">
                  <span className="flex flex-wrap gap-1.5">
                    {r.joined_in_beta ? (
                      <span className="rounded-full border border-line-2 px-2 py-0.5 text-[10.5px] text-ink-3">
                        beta
                      </span>
                    ) : null}
                    {r.open_reports > 0 ? (
                      <span className="rounded-full border border-danger px-2 py-0.5 text-[10.5px] text-danger">
                        {r.open_reports} open
                      </span>
                    ) : null}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
