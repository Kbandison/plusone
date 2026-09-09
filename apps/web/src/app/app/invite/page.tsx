import type { Metadata } from "next";

import { COPY, DRAFT_COPY, parseClientEnv } from "@plusone/config";

import { getServerSupabase } from "@/lib/supabase";
import { InviteLink } from "./invite-link";
import { redirect } from "next/navigation";

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

export const metadata: Metadata = { title: DRAFT_COPY.app.navInvite };

export default async function InvitePage() {
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in");

  // Allocated on first view and permanent thereafter (§6.5 — the link stays
  // live forever, past the reward cap and past everything else).
  const { data: code } = await supabase.rpc("my_referral_code");

  const { count } = await supabase
    .from("referral_conversions")
    .select("id", { count: "exact", head: true })
    .eq("referrer_id", auth.user.id)
    .not("verified_at", "is", null);

  const { NEXT_PUBLIC_SITE_URL } = parseClientEnv(process.env);
  const joined = count ?? 0;

  return (
    <main id="main">
      <h1 className="text-h2">{DRAFT_COPY.app.inviteHeading}</h1>

      {/* §3.4, verbatim. */}
      <p className="mt-5 text-[13.4px] leading-[1.7] text-ink-2">{COPY.referral.shareLine}</p>

      <InviteLink url={`${NEXT_PUBLIC_SITE_URL}/i/${code}`} />

      {/* §6.5 — the counter keeps counting past the reward cap. The number is
          the point for most people, and stopping it at ten would say otherwise. */}
      {joined > 0 ? (
        <p className="mt-10 border-t border-line pt-6 text-[13px]">
          {COPY.referral.counter(joined)}
        </p>
      ) : null}
    </main>
  );
}
