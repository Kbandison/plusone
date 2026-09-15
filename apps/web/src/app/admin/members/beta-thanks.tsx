import { BETA_THANKS_MONTHS, metroLabel } from "@plusone/config";

import { getServerSupabase } from "@/lib/supabase";

import { grantBetaThanks } from "./actions";

/**
 * Thanking the people who were here first, one area at a time.
 *
 * BACKLOG 29. `is_premium()` already unions `premium_grants`, so this is an
 * insert — no store involved and nothing to reconcile with Apple or Google.
 *
 * ── there is no "metro opened" record, and that is the design ──────────────
 *
 * Kevin's call was that the grant starts when the member's area opens rather
 * than when they joined: premium is reach and filters, and a tester whose area
 * holds four people gets nothing from either, so a grant running from signup is
 * spent before it is worth anything.
 *
 * Nothing can hold that judgement in a column. PRESSING THE BUTTON IS THE
 * OPENING — one metro at a time, when that metro is worth being in.
 *
 * Renders nothing when nobody is owed, which is the state this will be in for
 * most of its life.
 */
export async function BetaThanks() {
  const supabase = await getServerSupabase();
  // Allowed to fail: applied by hand like everything else, and a missing
  // function must not take the members screen down with it.
  const { data } = await supabase.rpc("admin_beta_thanks_pending").then(
    (r) => r,
    () => ({ data: null }),
  );

  const owed = (data ?? []) as { metro: string | null; waiting: number }[];
  if (owed.length === 0) return null;

  return (
    <section className="mt-10 border-t border-line pt-8">
      <h2 className="text-[0.891rem] tracking-[0.04em] text-ink-3 uppercase">Beta thank-you</h2>
      <p className="mt-3 max-w-[56ch] text-[12px] leading-[1.7] text-ink-2">
        {BETA_THANKS_MONTHS} months of Premium, for people who joined during the beta. Grant it when
        their area is worth being in — not before.
      </p>

      <ul className="mt-5 flex flex-col">
        {owed.map((row) => (
          <li
            key={row.metro ?? "none"}
            className="flex items-center gap-4 border-b border-line-2 py-3"
          >
            <span className="flex-1 text-[12.6px]">
              {row.metro ? (
                metroLabel(row.metro)
              ) : (
                /* No location, so no metro — they never finished the radius
                   step. Still owed, and grantable, because a row somebody can
                   see and never action is worse than not listing them. */
                <span className="text-ink-3">No location set</span>
              )}
            </span>
            <span className="tabular-nums text-[12px] text-ink-3">{row.waiting} waiting</span>
            <form action={grantBetaThanks}>
              <input type="hidden" name="metro" value={row.metro ?? ""} />
              <button
                type="submit"
                className="ease-brand min-h-tap text-[11.7px] text-accent underline decoration-line-control underline-offset-4 transition-colors duration-300 hover:decoration-accent"
              >
                Grant
              </button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
