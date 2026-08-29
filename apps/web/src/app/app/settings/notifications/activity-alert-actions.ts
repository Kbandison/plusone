"use server";

import { revalidatePath } from "next/cache";

import { RADIUS } from "@plusone/config";

import { getServerSupabase } from "@/lib/supabase";

/**
 * The member's own alert (server 18c) — created, changed and deleted by them.
 *
 * `notified_at` is not in this payload and cannot be: the table's update grant
 * lists `radius_mi` and `enabled` only, so a member who forged a call here
 * still could not clear their own cooldown. The cooldown is what keeps a paid
 * feature from becoming the nightly nag §3.3 refuses, and it is not the
 * member's to reset.
 *
 * Premium is deliberately NOT checked here. It is checked when the alert FIRES
 * (`claim_activity_alerts` calls `is_premium`), which means a member whose
 * subscription lapses and comes back keeps the radius they chose instead of
 * finding their settings quietly deleted. Saving a row that will not fire yet
 * costs nothing.
 */
export async function saveActivityAlert(
  radiusMi: number,
  enabled: boolean,
): Promise<{ ok: boolean }> {
  // Bounded here as well as in the CHECK constraint. The constraint is the
  // wall; this stops a malformed call spending a round trip to be refused.
  if (!Number.isInteger(radiusMi)) return { ok: false };
  if (radiusMi < RADIUS.minMi || radiusMi > RADIUS.maxMi) return { ok: false };

  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false };

  // upsert rather than insert-or-update: the row is keyed on user_id and RLS
  // already refuses anybody else's, so there is one row and this is its shape.
  const { error } = await supabase
    .from("activity_alerts")
    .upsert({ user_id: auth.user.id, radius_mi: radiusMi, enabled }, { onConflict: "user_id" });

  if (error) return { ok: false };

  revalidatePath("/app/settings/notifications");
  return { ok: true };
}
